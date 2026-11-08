"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { PREFIXO_TESTE_MUDANCA as PREFIXO_MUDANCA, type RunResult } from "@/lib/contracts";

export type RunState =
  | { status: "idle" }
  | { status: "running"; loadingPyodide: boolean; feitos: number; passaram: number }
  | { status: "done"; result: RunResult };

/** Área de testes e resultados, encaixada embaixo do editor: passou/falhou por caso, saída, erro e tempo. */
export default function RunResults({ state, total }: { state: RunState; total: number }) {
  const [aberto, setAberto] = useState(true);
  const feito = state.status === "done" ? state.result : null;
  const ok = !!feito && feito.total > 0 && feito.passed === feito.total;
  const temCorpo = !feito || !!feito.stderr || !!feito.stdout || feito.passed < feito.cases.length || feito.cases.length < feito.total;
  const rodando = state.status === "running" ? state : null;
  // contador ao vivo: "2/3" enquanto roda, "3/3" no fim
  const feitos = rodando ? rodando.feitos : (feito?.cases.length ?? 0);
  const passaram = rodando ? rodando.passaram : (feito?.passed ?? 0);
  const falhou = feitos > passaram;

  return (
    <section
      aria-label="Testes e resultados"
      aria-live="polite"
      className="mt-2 flex shrink-0 flex-col overflow-hidden rounded-padrao border border-borda bg-superficie-2/60"
    >
      <header className="flex h-10 items-center gap-3 px-4">
        <h2 className="titulo text-corpo">Testes</h2>
        {(rodando || feito) && (
          <span
            className={`numero inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-mini font-medium transition-colors duration-rapida ease-suave ${
              ok ? "bg-sucesso/15 text-sucesso" : falhou ? "bg-perigo/15 text-perigo" : "bg-superficie-2 text-texto-suave"
            }`}
          >
            {rodando && <Loader2 size={12} strokeWidth={2} className="animate-spin" />}
            {passaram}/{feito ? feito.total : total}{feito ? " testes passaram" : ""}
          </span>
        )}
        {feito && <span className="label-pequena numero">{feito.durationMs} ms</span>}
        {temCorpo && <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-label={aberto ? "Recolher resultados" : "Expandir resultados"}
          aria-expanded={aberto}
          className="ml-auto rounded-full p-1.5 text-texto-suave transition-colors duration-rapida ease-suave hover:bg-superficie-2"
        >
          {aberto ? <ChevronDown size={16} strokeWidth={1.75} /> : <ChevronUp size={16} strokeWidth={1.75} />}
        </button>}
      </header>

      {(aberto || rodando) && temCorpo && (
        <div className="max-h-[180px] overflow-y-auto border-t border-borda px-4 py-3 text-corpo">
          {state.status === "idle" && (
            <p className="label-pequena">Rode o código para ver os testes aqui.</p>
          )}
          {rodando && <Testando rodando={rodando} total={total} />}
          {feito && <Done result={feito} />}
        </div>
      )}
    </section>
  );
}

function Done({ result }: { result: RunResult }) {
  return (
    <div className="space-y-3">
      {result.stderr && (
        <pre className="whitespace-pre-wrap rounded-controle bg-superficie p-3 font-mono text-mini text-perigo">
          {result.stderr}
        </pre>
      )}

      <ul className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
        {result.cases.filter((c) => !c.passed).map((c) => (
          <li key={c.name} className="flex gap-2">
            {c.passed ? (
              <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sucesso" />
            ) : (
              <X size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-perigo" />
            )}
            <div className="min-w-0">
              <p className="font-medium">
                {c.name.startsWith(PREFIXO_MUDANCA) ? (
                  <>
                    <span className="mr-1.5 rounded-full bg-alerta/15 px-1.5 py-0.5 text-mini font-medium text-alerta">
                      Mudança
                    </span>
                    {c.name.slice(PREFIXO_MUDANCA.length)}
                  </>
                ) : (
                  c.name
                )}
              </p>
              {!c.passed && (
                <p className="font-mono text-mini text-texto-suave">
                  {c.error ?? `esperado ${c.expected}, obtido ${c.got}`}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {result.stdout && (
        <div>
          <p className="label-pequena">Saída</p>
          <pre className="whitespace-pre-wrap font-mono text-mini">{result.stdout}</pre>
        </div>
      )}
    </div>
  );
}

/** Aviso bem visível de que a solução está sendo testada: barra de progresso e a contagem de casos. */
function Testando({ rodando, total }: { rodando: Extract<RunState, { status: "running" }>; total: number }) {
  const indeterminado = rodando.loadingPyodide || rodando.feitos === 0 || total === 0;
  const pct = indeterminado ? 100 : Math.min(100, Math.round((rodando.feitos / total) * 100));
  return (
    <div role="status" className="space-y-2.5 py-1">
      <p className="flex items-center gap-2 text-corpo font-medium">
        <Loader2 size={16} strokeWidth={2} className="animate-spin text-marca" aria-hidden />
        {rodando.loadingPyodide
          ? "Preparando o Python… (só na primeira vez)"
          : `Testando sua solução… ${rodando.feitos} de ${total} casos`}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-superficie-2" aria-hidden>
        <div
          className={`h-full rounded-full bg-marca transition-[width] duration-rapida ease-suave ${indeterminado ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
