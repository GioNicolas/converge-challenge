// Compila e roda C/C++ com o clang/gcc LOCAL (sem enviar código para fora).
// Só para demo local: executa código do candidato na máquina do servidor.
// O código roda isolado (lib/sandbox.ts): sem rede, sem fork, escrita só no tmp, com limites de recursos.
import { execFile, spawn } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RunResult } from "@/lib/contracts";
import { buildDriver, type NativeLanguage } from "@/lib/drivers";
import type { PublicProblem, PublicTest } from "@/lib/problems";
import { detectSandbox, wrap } from "@/lib/sandbox";

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
  opts: {
    tests?: PublicTest[];
    runTimeoutMs: number;
    /** Chamado a cada caso concluído: (feitos, passaram). */
    onProgress?: (feitos: number, passaram: number) => void;
  },
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

  const sandbox = await detectSandbox();
  if (!sandbox.available) {
    return fail("Execução de C/C++ indisponível: sem sandbox (instale bubblewrap no Linux) neste servidor.");
  }
  const tool = TOOLS[lang];
  const dir = await realpath(await mkdtemp(join(tmpdir(), "converge-run-"))); // real: o sandbox compara caminhos reais
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, TMPDIR: dir };
  try {
    await writeFile(join(dir, tool.file), buildDriver(lang, { ...problem, visibleTests: tests }, code));
    const bin = join(dir, "prog");

    try {
      const [cmd, args] = wrap(sandbox, dir, [tool.cc, ...tool.flags, tool.file, "-o", bin], { compile: true });
      await exec(cmd, args, { cwd: dir, env, timeout: COMPILE_TIMEOUT_MS });
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      const msg = (err.stderr || err.message || "erro de compilação").replaceAll(dir + "/", "");
      return fail(`Erro de compilação:\n${msg.slice(0, 2000)}`);
    }

    const byIdx = new Map<number, { ok: boolean; got: string }>();
    const user: string[] = [];
    let passou = 0;
    const onLine = (line: string) => {
      const m = /^@@(\d+)\|([01])\|(.*)$/.exec(line);
      if (m) {
        byIdx.set(Number(m[1]), { ok: m[2] === "1", got: m[3] });
        if (m[2] === "1") passou++;
        opts.onProgress?.(byIdx.size, passou);
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
      }, opts.runTimeoutMs);
      child.stdout.on("data", (d: Buffer) => {
        size += d.length;
        if (size > 1 << 20) return void child.kill("SIGKILL");
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
            ? `Tempo esgotado (${opts.runTimeoutMs / 1000}s). Possível loop infinito.`
            : code !== 0
              ? `O programa terminou com erro (${signal ?? `código ${code}`}).`
              : "",
        );
      });
    });

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
