// Compila e roda C/C++ com o clang/gcc LOCAL (sem enviar código para fora).
// Só para demo local: executa código do candidato na máquina do servidor.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RunResult } from "@/lib/contracts";
import { buildDriver, type NativeLanguage } from "@/lib/drivers";
import type { PublicProblem, PublicTest } from "@/lib/problems";

const exec = promisify(execFile);
const COMPILE_TIMEOUT_MS = 20_000;

const TOOLS: Record<NativeLanguage, { cc: string; file: string; flags: string[] }> = {
  c: { cc: "cc", file: "main.c", flags: ["-std=c11", "-O1"] },
  cpp: { cc: "c++", file: "main.cpp", flags: ["-std=c++17", "-O1"] },
};

export function isNativeLanguage(lang: string): lang is NativeLanguage {
  return lang in TOOLS;
}

/**
 * Roda `tests` (por padrão, os públicos) contra o código. Nunca lança: erro de compilação,
 * crash ou timeout viram `stderr`, e os casos sem resposta contam como falha.
 */
export async function runNativeTests(
  lang: NativeLanguage,
  problem: PublicProblem,
  code: string,
  opts: { tests?: PublicTest[]; runTimeoutMs: number },
): Promise<RunResult> {
  const tests = opts.tests ?? problem.visibleTests;
  const started = Date.now();
  const total = tests.length;
  const fail = (msg: string): RunResult => ({
    passed: 0,
    total,
    cases: [],
    stdout: "",
    stderr: msg,
    durationMs: Date.now() - started,
  });

  const tool = TOOLS[lang];
  const dir = await mkdtemp(join(tmpdir(), "converge-run-"));
  try {
    await writeFile(join(dir, tool.file), buildDriver(lang, { ...problem, visibleTests: tests }, code));
    const bin = join(dir, "prog");

    try {
      await exec(tool.cc, [...tool.flags, tool.file, "-o", bin], { cwd: dir, timeout: COMPILE_TIMEOUT_MS });
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      const msg = (err.stderr || err.message || "erro de compilação").replaceAll(dir + "/", "");
      return fail(`Erro de compilação:\n${msg.slice(0, 2000)}`);
    }

    let stdout = "";
    let note = "";
    try {
      const r = await exec(bin, [], { cwd: dir, timeout: opts.runTimeoutMs, killSignal: "SIGKILL", maxBuffer: 1 << 20 });
      stdout = r.stdout;
    } catch (e) {
      const err = e as { stdout?: string; killed?: boolean; signal?: string; code?: number };
      stdout = err.stdout ?? "";
      note = err.killed
        ? `Tempo esgotado (${opts.runTimeoutMs / 1000}s). Possível loop infinito.`
        : `O programa terminou com erro (${err.signal ?? `código ${err.code}`}).`;
    }

    const byIdx = new Map<number, { ok: boolean; got: string }>();
    const user: string[] = [];
    for (const line of stdout.split("\n")) {
      const m = /^@@(\d+)\|([01])\|(.*)$/.exec(line);
      if (m) byIdx.set(Number(m[1]), { ok: m[2] === "1", got: m[3] });
      else if (line) user.push(line);
    }
    const cases = tests.map((t, i) => {
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
    return {
      passed: cases.filter((c) => c.passed).length,
      total,
      cases,
      stdout: user.join("\n"),
      stderr: note,
      durationMs: Date.now() - started,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
