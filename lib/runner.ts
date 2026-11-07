import type { RunResult } from "@/lib/contracts";
import type { PublicProblem } from "@/lib/problems";

const TIMEOUT_MS = 10_000; // só conta a execução; o download do Pyodide (~10MB) não entra.
const LOAD_TIMEOUT_MS = 60_000;

let worker: Worker | null = null;
let ready: Promise<boolean> | null = null; // o Pyodide do worker atual terminou de carregar?
let seq = 0;

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker("/pyodide-worker.js");
    worker = w;
    ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
      w.addEventListener("message", function onReady(e: MessageEvent) {
        if (e.data.ready === undefined) return;
        clearTimeout(timer);
        w.removeEventListener("message", onReady);
        resolve(e.data.ready === true);
      });
    });
  }
  return worker;
}

/** Pré-carrega o Pyodide para o primeiro "Rodar" não demorar. */
export function warmUp() {
  try {
    getWorker();
  } catch {
    /* sem worker (SSR) */
  }
}

/**
 * Roda o código contra os testes públicos do problema. Nunca rejeita:
 * erro fatal (sintaxe, função inexistente, timeout) vira `stderr`.
 */
export function runCode(code: string, problem: PublicProblem, language = "python"): Promise<RunResult> {
  if (language === "c" || language === "cpp") return runNative(code, problem, language);
  const started = performance.now();
  const id = ++seq;
  const w = getWorker();
  const pronto = ready!;

  return new Promise<RunResult>((resolve) => {
    const finish = (r: Omit<RunResult, "durationMs">) =>
      resolve({ ...r, durationMs: Math.round(performance.now() - started) });
    const fail = (error: string) =>
      finish({ passed: 0, total: problem.visibleTests.length, cases: [], stdout: "", stderr: error });

    let timer: ReturnType<typeof setTimeout> | undefined;

    w.onmessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      if (!e.data.ok) return fail(e.data.error);
      const { data, stdout } = e.data;
      if (data.fatal) return fail(data.fatal);

      const cases = data.results.map(
        (r: { name: string; passed: boolean; got?: string; error?: string }, i: number) => ({
          name: r.name,
          passed: r.passed,
          input: JSON.stringify(problem.visibleTests[i].args),
          expected: JSON.stringify(problem.visibleTests[i].expected),
          got: r.got,
          error: r.error,
        }),
      );
      finish({
        passed: cases.filter((c: { passed: boolean }) => c.passed).length,
        total: cases.length,
        cases,
        stdout,
        stderr: "",
      });
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      fail(e.message || "Erro no worker do Python");
    };

    pronto.then((ok) => {
      if (!ok) return fail("Não foi possível carregar o Python. Verifique a conexão.");
      timer = setTimeout(() => {
        w.terminate();
        worker = null;
        warmUp(); // o worker novo já baixa o Pyodide enquanto o candidato edita
        fail(`Tempo esgotado (${TIMEOUT_MS / 1000}s). Possível loop infinito.`);
      }, TIMEOUT_MS);
      w.postMessage({
        id,
        code,
        fname: problem.functionName,
        tests: problem.visibleTests,
        compare: problem.compare,
      });
    });
  });
}

/** C/C++: compila e roda no servidor local (app/api/run). */
async function runNative(code: string, problem: PublicProblem, language: string): Promise<RunResult> {
  const started = performance.now();
  const fail = (stderr: string): RunResult => ({
    passed: 0,
    total: problem.visibleTests.length,
    cases: [],
    stdout: "",
    stderr,
    durationMs: Math.round(performance.now() - started),
  });
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language, code, problemId: problem.id }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return fail(j.error ?? `Falha ao executar (${res.status}).`);
    }
    return (await res.json()) as RunResult;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Falha de rede ao executar.");
  }
}
