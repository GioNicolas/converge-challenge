/**
 * Testes escondidos, rodados no servidor ao fim da sessão (nunca vão para o navegador).
 * Casos pequenos rodam juntos; cada caso grande roda sozinho, com tempo próprio, para um
 * timeout de desempenho não apagar o resultado dos outros.
 */
import type { RunResult } from "@/lib/contracts";
import { isNativeLanguage, runNativeTests } from "@/lib/execution/native";
import { runPythonTests } from "@/lib/execution/python";
import { runPythonTestsPyodide } from "@/lib/execution/pyodide-node";
import { problems as IDE_PROBLEMS, type PublicProblem, type PublicTest } from "@/lib/problems";
import type { Problem, ProblemTest } from "@/lib/problems/types";

// Medido no Pyodide (worker quente): os casos pequenos levam milissegundos e o grande (10^5) ~100 ms com hashmap.
// Os limites têm folga de dezenas de vezes e mantêm curto o tempo de quem tem laço infinito ou força bruta.
const SMALL_TIMEOUT_MS = 3_000;
/** Hashmap em Python resolve 10^5 em ~50 ms; força bruta leva minutos. */
const LARGE_TIMEOUT_MS = 4_000;

export interface HiddenTestCase {
  name: string;
  passed: boolean;
  large: boolean;
  /** Motivo da falha, curto ("tempo esgotado", "esperado [0,2], obteve [1,1]"). */
  detail?: string;
}

export type HiddenTestsResult =
  | { ran: true; passed: number; total: number; cases: HiddenTestCase[]; durationMs: number }
  | { ran: false; reason: string };

export function runHiddenTests(problem: Problem, code: string, language: string): Promise<HiddenTestsResult> {
  return runServerTests(problem, problem.private.hiddenTests, code, language);
}

/**
 * Roda uma lista qualquer de testes do pacote no servidor (os escondidos, ou os da mudança do empecilho).
 * `prefix` vai na frente do nome de cada caso ("Mudança: ").
 */
export async function runServerTests(
  problem: Problem,
  tests: ProblemTest[],
  code: string,
  language: string,
  prefix = "",
): Promise<HiddenTestsResult> {
  // Python roda no Pyodide (WebAssembly), então vale em produção. C/C++ precisam de compilador no servidor: só com ENABLE_NATIVE_RUN=1.
  if (isNativeLanguage(language) && process.env.NODE_ENV === "production" && process.env.ENABLE_NATIVE_RUN !== "1") {
    return { ran: false, reason: "execução de C/C++ no servidor desligada neste ambiente" };
  }
  const ide = IDE_PROBLEMS[problem.public.id];
  if (!ide) return { ran: false, reason: `problema ${problem.public.id} sem assinatura na IDE` };
  if (code.trim() === "") return { ran: false, reason: "código vazio" };
  if (tests.length === 0) return { ran: false, reason: "nenhum teste" };

  const started = Date.now();
  const small = tests.filter((t) => !t.large);
  const batches: { tests: ProblemTest[]; timeoutMs: number }[] = [
    ...(small.length > 0 ? [{ tests: small, timeoutMs: SMALL_TIMEOUT_MS }] : []),
    ...tests.filter((t) => t.large).map((t) => ({ tests: [t], timeoutMs: LARGE_TIMEOUT_MS })),
  ];

  const cases: HiddenTestCase[] = [];
  // Se os casos pequenos já estouraram o tempo (laço infinito, por exemplo), os grandes também estourariam:
  // não gasta mais segundos esperando por eles.
  let estourouNosPequenos = false;
  for (const batch of batches) {
    if (estourouNosPequenos && batch.tests.every((t) => t.large)) {
      for (const t of batch.tests) {
        cases.push({ name: `${prefix}${t.name ?? `Escondido ${cases.length + 1}`}`, passed: false, large: true, detail: "tempo esgotado" });
      }
      continue;
    }
    const publicTests = batch.tests.map((t, i) => toPublicTest(ide, t, cases.length + i, prefix));
    const result = await runBatch(ide, code, language, publicTests, batch.timeoutMs);
    if (result === undefined) return { ran: false, reason: `linguagem ${language} sem runner no servidor` };
    if (!batch.tests.some((t) => t.large) && result.stderr.startsWith("Tempo esgotado")) estourouNosPequenos = true;
    batch.tests.forEach((t, i) => {
      const c = result.cases[i];
      const timedOut = !c?.passed && result.stderr.startsWith("Tempo esgotado");
      cases.push({
        name: publicTests[i].name,
        passed: c?.passed ?? false,
        large: t.large ?? false,
        detail: c?.passed ? undefined : timedOut ? "tempo esgotado" : failureDetail(c, result.stderr),
      });
    });
  }
  return {
    ran: true,
    passed: cases.filter((c) => c.passed).length,
    total: cases.length,
    cases,
    durationMs: Date.now() - started,
  };
}

function runBatch(
  ide: PublicProblem,
  code: string,
  language: string,
  tests: PublicTest[],
  timeoutMs: number,
): Promise<RunResult> | undefined {
  // PYTHON_RUNNER=process usa o python3 local (só para depurar); o padrão é o Pyodide, igual em dev e em produção.
  if (language === "python") {
    const rodar = process.env.PYTHON_RUNNER === "process" ? runPythonTests : runPythonTestsPyodide;
    return rodar(ide, code, { tests, runTimeoutMs: timeoutMs });
  }
  if (isNativeLanguage(language)) return runNativeTests(language, ide, code, { tests, runTimeoutMs: timeoutMs });
  return undefined;
}

/** `input` do teste escondido é um objeto por nome de parâmetro; o runner quer os argumentos em ordem. */
function toPublicTest(ide: PublicProblem, test: ProblemTest, index: number, prefix: string): PublicTest {
  const input = test.input as Record<string, unknown>;
  return {
    name: `${prefix}${test.name ?? `Escondido ${index + 1}`}`,
    args: ide.native.params.map((p) => input[p.name]),
    expected: test.expected,
  };
}

function failureDetail(c: RunResult["cases"][number] | undefined, stderr: string): string {
  if (c?.got !== undefined) return `esperado ${c.expected}, obteve ${c.got}`;
  const error = c?.error ?? stderr;
  return error ? error.trim().split("\n").at(-1)!.slice(0, 160) : "falhou";
}
