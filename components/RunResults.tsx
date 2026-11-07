"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { entrada } from "@/lib/design/motion";
import type { RunResult } from "@/lib/contracts";

export type RunState =
  | { status: "idle" }
  | { status: "running"; loadingPyodide: boolean }
  | { status: "done"; result: RunResult };

/** Resultado da execução (passou/falhou por caso, saída, erro, tempo). */
export default function RunResults({ state }: { state: RunState }) {
  return (
    <AnimatePresence>
      {state.status !== "idle" && (
        <motion.section
          key="resultados"
          {...entrada}
          style={{ transformOrigin: "top right" }}
          aria-label="Resultados"
          aria-live="polite"
          className="vidro absolute right-4 top-16 z-10 max-h-[60%] w-[380px] overflow-y-auto rounded-padrao p-4 text-corpo shadow-flutuante"
        >
          {state.status === "running" ? (
            <p className="label-pequena">
              {state.loadingPyodide
                ? "Rodando… a primeira execução carrega o Python."
                : "Rodando…"}
            </p>
          ) : (
            <Done result={state.result} />
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function Done({ result }: { result: RunResult }) {
  const ok = result.total > 0 && result.passed === result.total;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className={`titulo ${ok ? "text-sucesso" : "text-perigo"}`}>
          {result.passed}/{result.total} testes
        </p>
        <span className="label-pequena numero">{result.durationMs} ms</span>
      </div>

      {result.stderr && (
        <pre className="whitespace-pre-wrap rounded-controle bg-superficie-2 p-3 font-mono text-mini text-perigo">
          {result.stderr}
        </pre>
      )}

      <ul className="space-y-1.5">
        {result.cases.map((c) => (
          <li key={c.name} className="flex gap-2">
            {c.passed ? (
              <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sucesso" />
            ) : (
              <X size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-perigo" />
            )}
            <div className="min-w-0">
              <p className="font-medium">{c.name}</p>
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
