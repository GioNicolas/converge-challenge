// Roda Python com o python3 LOCAL, para os testes escondidos (que não podem ir para o navegador).
// Só para demo local: executa código do candidato na máquina do servidor.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunResult } from "@/lib/contracts";
import type { PublicProblem, PublicTest } from "@/lib/problems";

const PYTHON = process.env.PYTHON_BIN || "python3";
const MAX_OUTPUT = 1 << 20;

// Mesmo harness do pyodide-worker, mas imprime uma linha por caso: se um caso estourar o tempo,
// os anteriores já saíram.
const HARNESS = `
import json, sys, traceback
req = json.loads(sys.stdin.read())
ns = {"__name__": "__candidate__"}
try:
    exec(compile(req["code"], "<solucao>", "exec"), ns)
    fn = ns[req["fname"]]
except KeyError:
    print("@@" + json.dumps({"fatal": "Função '%s' não encontrada." % req["fname"]}), flush=True)
    sys.exit(0)
except BaseException:
    print("@@" + json.dumps({"fatal": traceback.format_exc(limit=3)}), flush=True)
    sys.exit(0)
for i, t in enumerate(req["tests"]):
    try:
        got = fn(*t["args"])
        if req["compare"] == "sorted":
            ok = sorted(got) == sorted(t["expected"])
        else:
            ok = got == t["expected"]
        print("@@" + json.dumps({"i": i, "passed": bool(ok), "got": repr(got)[:200]}), flush=True)
    except BaseException:
        print("@@" + json.dumps({"i": i, "passed": False, "error": traceback.format_exc(limit=2)}), flush=True)
`;

/** Roda `tests` contra o código. Nunca lança: erro fatal ou timeout viram `stderr`. */
export async function runPythonTests(
  problem: PublicProblem,
  code: string,
  opts: { tests: PublicTest[]; runTimeoutMs: number },
): Promise<RunResult> {
  const { tests } = opts;
  const started = Date.now();
  const dir = await mkdtemp(join(tmpdir(), "converge-py-"));
  try {
    const harness = join(dir, "harness.py");
    await writeFile(harness, HARNESS);
    const { stdout, note } = await runProcess(
      [harness],
      JSON.stringify({ code, fname: problem.functionName, tests, compare: problem.compare }),
      dir,
      opts.runTimeoutMs,
    );

    const byIdx = new Map<number, { passed: boolean; got?: string; error?: string }>();
    const user: string[] = [];
    let fatal: string | undefined;
    for (const line of stdout.split("\n")) {
      if (!line.startsWith("@@")) {
        if (line) user.push(line);
        continue;
      }
      try {
        const r = JSON.parse(line.slice(2)) as { i?: number; fatal?: string; passed?: boolean; got?: string; error?: string };
        if (r.fatal !== undefined) fatal = r.fatal;
        else if (r.i !== undefined) byIdx.set(r.i, { passed: r.passed ?? false, got: r.got, error: r.error });
      } catch {
        user.push(line);
      }
    }
    const cases = tests.map((t, i) => {
      const r = byIdx.get(i);
      return {
        name: t.name,
        passed: r?.passed ?? false,
        input: summarize(t.args),
        expected: JSON.stringify(t.expected),
        got: r?.got,
        error: r ? r.error : (fatal ?? "o programa terminou antes deste caso (crash ou timeout)"),
      };
    });
    return {
      passed: cases.filter((c) => c.passed).length,
      total: tests.length,
      cases,
      stdout: user.join("\n").slice(0, 4000),
      stderr: fatal ?? note,
      durationMs: Date.now() - started,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Entrada para o relatório: casos grandes viram um resumo em vez de 100 mil números. */
function summarize(args: unknown[]): string {
  const json = JSON.stringify(args);
  return json.length > 300 ? `${json.slice(0, 120)}… (${json.length} caracteres)` : json;
}

function runProcess(
  args: string[],
  stdin: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; note: string }> {
  return new Promise((resolve) => {
    // -I: isolado (ignora PYTHON* do ambiente e não importa nada da pasta do script).
    const child = spawn(PYTHON, ["-I", ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, note: `Não foi possível rodar o ${PYTHON}: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const note = killed
        ? `Tempo esgotado (${timeoutMs / 1000}s).`
        : code !== 0
          ? `O programa terminou com erro (código ${code}). ${stderr.slice(0, 500)}`
          : "";
      resolve({ stdout, note });
    });
    child.stdin.on("error", () => {
      // o processo pode morrer antes de ler tudo (timeout): o close resolve
    });
    child.stdin.end(stdin);
  });
}
