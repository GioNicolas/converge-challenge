// Compila e roda C/C++ com o clang/gcc LOCAL (sem enviar código para fora).
// Só para demo local: executa código do candidato na máquina do servidor.
// Em produção fica desligado, a menos que ENABLE_NATIVE_RUN=1.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import type { RunResult } from "@/lib/contracts";
import { buildDriver, type NativeLanguage } from "@/lib/drivers";
import { problems } from "@/lib/problems";

export const dynamic = "force-dynamic";

const exec = promisify(execFile);
const COMPILE_TIMEOUT_MS = 20_000;
const RUN_TIMEOUT_MS = 5_000;
const MAX_CODE_CHARS = 20_000;

const TOOLS: Record<NativeLanguage, { cc: string; file: string; flags: string[] }> = {
  c: { cc: "cc", file: "main.c", flags: ["-std=c11", "-O1"] },
  cpp: { cc: "c++", file: "main.cpp", flags: ["-std=c++17", "-O1"] },
};

const fail = (msg: string, ms: number, total: number): RunResult => ({
  passed: 0,
  total,
  cases: [],
  stdout: "",
  stderr: msg,
  durationMs: ms,
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_NATIVE_RUN !== "1") {
    return NextResponse.json({ error: "Execução de C/C++ desligada neste ambiente." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    language?: string;
    code?: string;
    problemId?: string;
  } | null;
  const lang = body?.language as NativeLanguage | undefined;
  const problem = body?.problemId ? problems[body.problemId] : undefined;
  if (!body?.code || !lang || !(lang in TOOLS) || !problem) {
    return NextResponse.json({ error: "requisição inválida" }, { status: 400 });
  }
  if (body.code.length > MAX_CODE_CHARS) {
    return NextResponse.json({ error: "código grande demais" }, { status: 413 });
  }

  const started = Date.now();
  const total = problem.visibleTests.length;
  const tool = TOOLS[lang];
  const dir = await mkdtemp(join(tmpdir(), "converge-run-"));
  try {
    await writeFile(join(dir, tool.file), buildDriver(lang, problem, body.code));
    const bin = join(dir, "prog");

    try {
      await exec(tool.cc, [...tool.flags, tool.file, "-o", bin], { cwd: dir, timeout: COMPILE_TIMEOUT_MS });
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      const msg = (err.stderr || err.message || "erro de compilação").replaceAll(dir + "/", "");
      return NextResponse.json(fail(`Erro de compilação:\n${msg.slice(0, 2000)}`, Date.now() - started, total));
    }

    let stdout = "";
    let note = "";
    try {
      const r = await exec(bin, [], { cwd: dir, timeout: RUN_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 1 << 20 });
      stdout = r.stdout;
    } catch (e) {
      const err = e as { stdout?: string; killed?: boolean; signal?: string; code?: number };
      stdout = err.stdout ?? "";
      note = err.killed
        ? `Tempo esgotado (${RUN_TIMEOUT_MS / 1000}s). Possível loop infinito.`
        : `O programa terminou com erro (${err.signal ?? `código ${err.code}`}).`;
    }

    const byIdx = new Map<number, { ok: boolean; got: string }>();
    const user: string[] = [];
    for (const line of stdout.split("\n")) {
      const m = /^@@(\d+)\|([01])\|(.*)$/.exec(line);
      if (m) byIdx.set(Number(m[1]), { ok: m[2] === "1", got: m[3] });
      else if (line) user.push(line);
    }
    const cases = problem.visibleTests.map((t, i) => {
      const r = byIdx.get(i);
      return {
        name: t.name,
        passed: r?.ok ?? false,
        input: JSON.stringify(t.args),
        expected: JSON.stringify(t.expected),
        got: r?.got,
        error: r ? undefined : "o programa terminou antes deste caso (crash ou timeout)",
      };
    });
    const result: RunResult = {
      passed: cases.filter((c) => c.passed).length,
      total,
      cases,
      stdout: user.join("\n"),
      stderr: note,
      durationMs: Date.now() - started,
    };
    return NextResponse.json(result);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
