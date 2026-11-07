// Compila e roda C/C++ com o clang/gcc LOCAL (sem enviar código para fora).
// O código roda isolado (lib/sandbox.ts): sem rede, sem fork, escrita só no tmp, com limites de recursos.
// Sem sandbox disponível a rota recusa, a menos que ALLOW_UNSANDBOXED_RUN=1 (só dev).
import { execFile, spawn } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import type { RunResult } from "@/lib/contracts";
import { buildDriver, type NativeLanguage } from "@/lib/drivers";
import { problems } from "@/lib/problems";
import { detectSandbox, wrap } from "@/lib/sandbox";

export const dynamic = "force-dynamic";

const exec = promisify(execFile);
const COMPILE_TIMEOUT_MS = 20_000;
const RUN_TIMEOUT_MS = 1_000; // padrão LeetCode: ~1 s por execução (C/C++)
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
  const sandbox = await detectSandbox();
  if (!sandbox.available) {
    return NextResponse.json(
      { error: "Execução de C/C++ indisponível: sem sandbox (instale bubblewrap no Linux) neste servidor." },
      { status: 503 },
    );
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
  const dir = await realpath(await mkdtemp(join(tmpdir(), "converge-run-"))); // real: o sandbox compara caminhos reais
  const env = { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, TMPDIR: dir };

  // Resposta em NDJSON: {progress:[feitos,passaram]} a cada caso e, no fim, {result}.
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        await writeFile(join(dir, tool.file), buildDriver(lang, problem, body.code!));
        const bin = join(dir, "prog");

        try {
          const [cmd, args] = wrap(sandbox, dir, [tool.cc, ...tool.flags, tool.file, "-o", bin], { compile: true });
          await exec(cmd, args, { cwd: dir, env, timeout: COMPILE_TIMEOUT_MS });
        } catch (e) {
          const err = e as { stderr?: string; message?: string };
          const msg = (err.stderr || err.message || "erro de compilação").replaceAll(dir + "/", "");
          send({ result: fail(`Erro de compilação:\n${msg.slice(0, 2000)}`, Date.now() - started, total) });
          return;
        }

        const byIdx = new Map<number, { ok: boolean; got: string }>();
        const user: string[] = [];
        let passed = 0;
        const onLine = (line: string) => {
          const m = /^@@(\d+)\|([01])\|(.*)$/.exec(line);
          if (m) {
            byIdx.set(Number(m[1]), { ok: m[2] === "1", got: m[3] });
            if (m[2] === "1") passed++;
            send({ progress: [byIdx.size, passed] });
          } else if (line) user.push(line);
        };

        const note = await new Promise<string>((resolve) => {
          const [cmd, args] = wrap(sandbox, dir, [bin]);
          const child = spawn(cmd, args, { cwd: dir, env });
          let buf = "";
          let size = 0;
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, RUN_TIMEOUT_MS);
          child.stdout.on("data", (d: Buffer) => {
            size += d.length;
            if (size > 1 << 20) return child.kill("SIGKILL");
            buf += d.toString();
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            lines.forEach(onLine);
          });
          child.on("error", () => resolve("Falha ao iniciar o programa."));
          child.on("close", (code, signal) => {
            clearTimeout(timer);
            if (buf) onLine(buf);
            resolve(
              timedOut
                ? `Tempo esgotado (${RUN_TIMEOUT_MS / 1000}s). Possível loop infinito.`
                : code !== 0
                  ? `O programa terminou com erro (${signal ?? `código ${code}`}).`
                  : "",
            );
          });
        });

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
        send({ result });
      } catch (e) {
        send({ result: fail(e instanceof Error ? e.message : "Falha ao executar.", Date.now() - started, total) });
      } finally {
        await rm(dir, { recursive: true, force: true });
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
