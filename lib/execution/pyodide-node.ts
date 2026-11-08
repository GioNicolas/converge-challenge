// Roda Python dentro do servidor com Pyodide (Python em WebAssembly), para os testes escondidos
// (que não podem ir para o navegador). Funciona na Vercel, onde não há python3 instalado, e o código do
// candidato roda dentro do WebAssembly: sem arquivos nem rede.
//
// Um único worker (worker_thread) fica quente e é reaproveitado entre as chamadas. Estourou o tempo:
// manda uma interrupção ao Python (KeyboardInterrupt), sem perder o worker; se o código do candidato
// engolir a interrupção, o worker é encerrado e recriado na próxima chamada.
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { RunResult } from "@/lib/contracts";
import type { PublicProblem, PublicTest } from "@/lib/problems";

/** Tempo máximo para o Pyodide terminar de carregar (a primeira chamada paga isso; as seguintes não). */
const PRAZO_CARGA_MS = 30_000;
/** Depois de interromper, quanto esperar o Python devolver antes de matar o worker. */
const CARENCIA_APOS_INTERRUPCAO_MS = 1_500;

// Mesmo harness do pyodide-worker do navegador, mas emite um evento por caso: se um caso estourar o
// tempo, os anteriores já saíram. KeyboardInterrupt (a interrupção do timeout) encerra o lote.
const HARNESS = `
import json, traceback
def _run():
    ns = {"__name__": "__candidate__"}
    try:
        exec(compile(USER_CODE, "<solucao>", "exec"), ns)
        fn = ns[FNAME]
    except KeyError:
        EMIT(json.dumps({"fatal": "Função '%s' não encontrada. Mantenha a assinatura inicial." % FNAME}))
        return
    except KeyboardInterrupt:
        EMIT(json.dumps({"timeout": True}))
        return
    except BaseException:
        EMIT(json.dumps({"fatal": traceback.format_exc(limit=3)}))
        return
    for i, t in enumerate(json.loads(TESTS_JSON)):
        try:
            got = fn(*t["args"])
            if COMPARE == "sorted":
                ok = sorted(got) == sorted(t["expected"])
            else:
                ok = got == t["expected"]
            EMIT(json.dumps({"i": i, "passed": bool(ok), "got": repr(got)[:200]}))
        except KeyboardInterrupt:
            EMIT(json.dumps({"timeout": True}))
            return
        except BaseException:
            EMIT(json.dumps({"i": i, "passed": False, "error": traceback.format_exc(limit=2)}))
_run()
`;

// Código do worker (CommonJS, em string): evita depender de caminho de arquivo no bundle do Next.
const CODIGO_DO_WORKER = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const path = require("node:path");
const { loadPyodide } = require(workerData.pyodidePath);
const interrupcao = new Uint8Array(workerData.sab);
let py;
const pronto = (async () => {
  py = await loadPyodide({ indexURL: path.dirname(workerData.pyodidePath) });
  py.setInterruptBuffer(interrupcao);
})();
pronto.then(
  () => parentPort.postMessage({ tipo: "pronto" }),
  (e) => parentPort.postMessage({ tipo: "erro-carga", erro: String((e && e.stack) || e) }),
);
parentPort.on("message", async (m) => {
  if (m.tipo !== "rodar") return;
  const saida = [];
  try {
    await pronto;
    Atomics.store(interrupcao, 0, 0);
    py.setStdout({ batched: (s) => saida.push(s) });
    py.setStderr({ batched: (s) => saida.push(s) });
    py.globals.set("USER_CODE", m.codigo);
    py.globals.set("FNAME", m.fname);
    py.globals.set("TESTS_JSON", JSON.stringify(m.tests));
    py.globals.set("COMPARE", m.compare);
    py.globals.set("EMIT", (s) => parentPort.postMessage({ tipo: "caso", id: m.id, dados: JSON.parse(s) }));
    await py.runPythonAsync(workerData.harness);
    parentPort.postMessage({ tipo: "fim", id: m.id, stdout: saida.join("\n") });
  } catch (e) {
    parentPort.postMessage({ tipo: "fim", id: m.id, erro: String((e && e.message) || e), stdout: saida.join("\n") });
  }
});
`;

type MensagemDoWorker =
  | { tipo: "pronto" }
  | { tipo: "erro-carga"; erro: string }
  | { tipo: "caso"; id: number; dados: DadosDoCaso }
  | { tipo: "fim"; id: number; stdout: string; erro?: string };

type DadosDoCaso = { i?: number; passed?: boolean; got?: string; error?: string; fatal?: string; timeout?: boolean };

type Motor = {
  worker: Worker;
  interrupcao: Uint8Array;
  pronto: Promise<void>;
  morto: boolean;
};

const global = globalThis as typeof globalThis & { __pyodideNode?: { motor: Motor | null; fila: Promise<unknown>; proximoId: number } };
const estado = (global.__pyodideNode ??= { motor: null, fila: Promise.resolve(), proximoId: 1 });

function criarMotor(): Motor {
  const sab = new SharedArrayBuffer(1);
  const interrupcao = new Uint8Array(sab);
  // Caminho direto (e não `require.resolve`): o bundler não tenta resolver e o rastreio do deploy inclui esta pasta.
  const pyodidePath = join(process.cwd(), "node_modules", "pyodide", "pyodide.js");
  const worker = new Worker(CODIGO_DO_WORKER, { eval: true, workerData: { sab, pyodidePath, harness: HARNESS } });
  const motor: Motor = { worker, interrupcao, morto: false, pronto: Promise.resolve() };
  motor.pronto = new Promise<void>((resolve, reject) => {
    const aoMensagem = (m: MensagemDoWorker) => {
      if (m.tipo === "pronto") {
        worker.off("message", aoMensagem);
        resolve();
      } else if (m.tipo === "erro-carga") {
        worker.off("message", aoMensagem);
        reject(new Error(m.erro));
      }
    };
    worker.on("message", aoMensagem);
    worker.once("error", (e) => {
      motor.morto = true;
      reject(e);
    });
    worker.once("exit", () => {
      motor.morto = true;
      reject(new Error("o worker do Python terminou"));
    });
  });
  // Quem não espera a carga (prewarm) não pode derrubar o processo com uma rejeição solta.
  motor.pronto.catch(() => {});
  return motor;
}

function motorVivo(): Motor {
  if (!estado.motor || estado.motor.morto) estado.motor = criarMotor();
  return estado.motor;
}

/** Começa a carregar o Pyodide agora (chamar no início da sessão: quando os testes rodarem, já está pronto). */
export function prewarmPyodide(): void {
  try {
    motorVivo();
  } catch {
    // Sem Pyodide disponível: a primeira execução devolve o erro de forma amigável.
  }
}

function esperar<T>(promessa: Promise<T>, ms: number, mensagem: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(mensagem)), ms);
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function resumir(args: unknown[]): string {
  const json = JSON.stringify(args);
  return json.length > 300 ? `${json.slice(0, 120)}… (${json.length} caracteres)` : json;
}

/** Roda `tests` contra o código. Nunca lança: erro fatal ou timeout viram `stderr`. */
export function runPythonTestsPyodide(
  problem: PublicProblem,
  code: string,
  opts: { tests: PublicTest[]; runTimeoutMs: number },
): Promise<RunResult> {
  // Uma execução por vez: o worker é único.
  const execucao = estado.fila.then(() => rodar(problem, code, opts));
  estado.fila = execucao.catch(() => undefined);
  return execucao;
}

async function rodar(
  problem: PublicProblem,
  code: string,
  opts: { tests: PublicTest[]; runTimeoutMs: number },
): Promise<RunResult> {
  const { tests, runTimeoutMs } = opts;
  const inicio = Date.now();
  const falha = (stderr: string): RunResult => ({
    passed: 0,
    total: tests.length,
    cases: tests.map((t) => ({ name: t.name, passed: false, input: resumir(t.args), expected: JSON.stringify(t.expected), error: stderr })),
    stdout: "",
    stderr,
    durationMs: Date.now() - inicio,
  });

  let motor: Motor;
  try {
    motor = motorVivo();
    await esperar(motor.pronto, PRAZO_CARGA_MS, "o Python demorou demais para carregar");
  } catch (e) {
    if (estado.motor) {
      estado.motor.morto = true;
      void estado.motor.worker.terminate();
      estado.motor = null;
    }
    return falha(`Não foi possível iniciar o Python: ${e instanceof Error ? e.message : String(e)}`);
  }

  const id = estado.proximoId++;
  const porIndice = new Map<number, { passed: boolean; got?: string; error?: string }>();
  let fatal: string | undefined;
  let estourou = false;
  let stdout = "";
  let erroDoWorker: string | undefined;

  await new Promise<void>((resolve) => {
    let encerrado = false;
    let timerCarencia: ReturnType<typeof setTimeout> | undefined;
    const terminar = () => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timerPrazo);
      if (timerCarencia) clearTimeout(timerCarencia);
      motor.worker.off("message", aoMensagem);
      motor.worker.off("exit", aoSair);
      resolve();
    };
    const aoMensagem = (m: MensagemDoWorker) => {
      if (m.tipo === "caso" && m.id === id) {
        const d = m.dados;
        if (d.timeout) estourou = true;
        else if (d.fatal !== undefined) fatal = d.fatal;
        else if (d.i !== undefined) porIndice.set(d.i, { passed: d.passed ?? false, got: d.got, error: d.error });
      } else if (m.tipo === "fim" && m.id === id) {
        stdout = m.stdout;
        erroDoWorker = m.erro;
        terminar();
      }
    };
    const aoSair = () => {
      erroDoWorker = "o Python terminou de forma inesperada";
      terminar();
    };
    const timerPrazo = setTimeout(() => {
      estourou = true;
      // Interrompe o Python em vez de matar o worker: ele continua quente para o próximo lote.
      Atomics.store(motor.interrupcao, 0, 2);
      timerCarencia = setTimeout(() => {
        // O código engoliu a interrupção (ex.: `except:` num laço): sem outro jeito, mata e recria depois.
        motor.morto = true;
        void motor.worker.terminate();
        if (estado.motor === motor) estado.motor = null;
        terminar();
      }, CARENCIA_APOS_INTERRUPCAO_MS);
    }, runTimeoutMs);
    motor.worker.on("message", aoMensagem);
    motor.worker.once("exit", aoSair);
    motor.worker.postMessage({
      tipo: "rodar",
      id,
      codigo: code,
      fname: problem.functionName,
      tests: tests.map((t) => ({ name: t.name, args: t.args, expected: t.expected })),
      compare: problem.compare,
    });
  });

  const cases = tests.map((t, i) => {
    const r = porIndice.get(i);
    return {
      name: t.name,
      passed: r?.passed ?? false,
      input: resumir(t.args),
      expected: JSON.stringify(t.expected),
      got: r?.got,
      error: r ? r.error : (fatal ?? "o programa terminou antes deste caso (crash ou timeout)"),
    };
  });
  const nota = estourou ? `Tempo esgotado (${runTimeoutMs / 1000}s).` : (erroDoWorker ?? "");
  return {
    passed: cases.filter((c) => c.passed).length,
    total: tests.length,
    cases,
    stdout: stdout.slice(0, 4000),
    stderr: fatal ?? nota,
    durationMs: Date.now() - inicio,
  };
}

/** Só para testes: encerra o worker e zera o estado. */
export async function encerrarPyodideParaTestes(): Promise<void> {
  const motor = estado.motor;
  estado.motor = null;
  if (motor) {
    motor.morto = true;
    await motor.worker.terminate();
  }
}
