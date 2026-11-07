"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, FileText } from "lucide-react";
import { entrada } from "@/lib/design/motion";
import type { PublicProblem } from "@/lib/problems";
import { formatMs } from "@/lib/format";

/** Fase da entrevista, derivada do tempo decorrido (só rótulo visual). */
export function fase(elapsedMs: number, durationMs: number): string {
  const f = durationMs > 0 ? elapsedMs / durationMs : 0;
  if (f < 0.15) return "Entendimento";
  if (f < 0.8) return "Implementação";
  return "Revisão";
}

/** Texto com `código` entre crases em <code> e **destaque** em <strong>. */
function Texto({ children }: { children: string }) {
  return children.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("`") ? (
      <code key={i} className="rounded-controle bg-superficie-2 px-1 font-mono text-codigo">
        {p.slice(1, -1)}
      </code>
    ) : p.startsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      p
    ),
  );
}

const DIFICULDADE = { facil: "Fácil", medio: "Médio" } as const;

type Props = {
  problem: PublicProblem;
  elapsedMs: number;
  durationMs: number;
  aberto: boolean;
  onToggle: (aberto: boolean) => void;
};

/**
 * Painel do problema (design §8.1): card de vidro no canto superior esquerdo
 * que recolhe para uma pílula. Só a parte pública do problema.
 * Animação só com opacity/transform (entrada de lib/design/motion).
 */
export default function ProblemPanel({ problem, elapsedMs, durationMs, aberto, onToggle }: Props) {
  const tempo = `${formatMs(elapsedMs)} / ${formatMs(durationMs)}`;
  const chip = fase(elapsedMs, durationMs);

  return (
    <div className="origin-top-left">
      <AnimatePresence mode="popLayout" initial={false}>
        {aberto ? (
          <motion.section
            key="card"
            {...entrada}
            style={{ transformOrigin: "top left" }}
            aria-label="Problema"
            className="vidro flex max-h-[calc(100vh-10rem)] w-[360px] flex-col rounded-padrao shadow-flutuante"
          >
            <header className="flex items-start justify-between gap-3 px-4 pt-3">
              <div>
                <h1 className="titulo text-subtitulo">{problem.title}</h1>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full bg-marca-suave px-2 py-0.5 text-mini font-medium text-marca">
                    {chip}
                  </span>
                  <span className="label-pequena numero">{tempo}</span>
                </div>
                <div className="label-pequena mt-1">
                  {DIFICULDADE[problem.difficulty]} · {problem.topic}
                </div>
              </div>
              <button
                type="button"
                aria-label="Recolher painel do problema"
                onClick={() => onToggle(false)}
                className="rounded-full p-1.5 text-texto-suave transition-colors duration-rapida ease-suave hover:bg-superficie-2"
              >
                <ChevronUp size={18} strokeWidth={1.75} />
              </button>
            </header>

            <div className="space-y-4 overflow-y-auto px-4 pb-4 pt-3 text-corpo">
              <p>
                <Texto>{problem.statement}</Texto>
              </p>

              <div className="space-y-2">
                <h2 className="label-pequena">Exemplos</h2>
                {problem.examples.map((ex, i) => (
                  <div key={i} className="rounded-controle bg-superficie-2 px-3 py-2 font-mono text-codigo">
                    <div>
                      <span className="text-texto-suave">Entrada: </span>
                      {ex.input}
                    </div>
                    <div>
                      <span className="text-texto-suave">Saída: </span>
                      {ex.output}
                    </div>
                    {ex.note && <div className="text-texto-suave">{ex.note}</div>}
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <h2 className="label-pequena">Restrições</h2>
                <ul className="list-disc space-y-0.5 pl-5">
                  {problem.constraints.map((c) => (
                    <li key={c} className="font-mono text-codigo">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.button
            key="pilula"
            {...entrada}
            style={{ transformOrigin: "top left" }}
            type="button"
            aria-label="Expandir painel do problema"
            onClick={() => onToggle(true)}
            className="vidro flex items-center gap-2 rounded-full px-3 py-2 shadow-flutuante"
          >
            <FileText size={16} strokeWidth={1.75} className="text-marca" />
            <span className="titulo text-corpo">{problem.title}</span>
            <span className="label-pequena numero">{tempo}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
