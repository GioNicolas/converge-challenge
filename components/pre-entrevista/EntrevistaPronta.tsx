"use client";

// Etapa final: a entrevista está criada. Resumo e o link para mandar ao candidato.
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import type { InterviewConfig } from "@/lib/contracts";
import { curvaSuave } from "@/lib/design/motion";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";

type Props = { config: InterviewConfig; onNova: () => void };

export default function EntrevistaPronta({ config, onNova }: Props) {
  const [copiado, setCopiado] = useState(false);
  const rota = config.mode === "system_design" ? "/entrevista/system-design" : "/entrevista";
  const link = `${typeof window === "undefined" ? "" : window.location.origin}${rota}?config=${encodeURIComponent(config.id)}`;
  const foco = [...config.focus].sort((a, b) => b.weight - a.weight);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sem permissão para a área de transferência: o link continua visível para copiar à mão.
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: curvaSuave }}
      className="mx-auto flex w-full max-w-2xl flex-col gap-8"
    >
      <div className="flex flex-col gap-3">
        <span className="rotulo rotulo-destaque self-start">Entrevista criada</span>
        <h1 className="text-[44px] leading-[1.05] font-normal tracking-[-0.025em] text-texto">Pronto. É só mandar o link.</h1>
        <p className="text-[17px] leading-relaxed text-texto-suave">O entrevistador já sabe o que avaliar e como conduzir.</p>
      </div>

      <section className="flex flex-col rounded-padrao bg-superficie">
        <div className="flex flex-col gap-1 px-6 py-5">
          <span className="rotulo text-texto-suave">Vaga</span>
          <span className="text-[22px] leading-tight tracking-[-0.015em] text-texto">{config.roleTitle}</span>
        </div>
        <dl className="grid grid-cols-3 border-t border-borda">
          {[
            ["Formato", NOME_FORMATO[config.mode]],
            ["Senioridade", NOME_SENIORIDADE[config.seniority]],
            ["Duração", `${config.durationMin} min`],
          ].map(([rotulo, valor], i) => (
            <div key={rotulo} className={`flex flex-col gap-1 px-6 py-4 ${i > 0 ? "border-l border-borda" : ""}`}>
              <dt className="rotulo text-texto-suave">{rotulo}</dt>
              <dd className="text-[15px] text-texto">{valor}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-2 border-t border-borda px-6 py-4">
          <span className="rotulo text-texto-suave">Foco · {config.criteria.length} critérios</span>
          <p className="text-[15px] text-texto">
            {foco.map((f) => `${NOME_AREA[f.area]} ${Math.round(f.weight * 100)}%`).join("  ·  ")}
          </p>
        </div>
        <div className="flex items-center gap-2 border-t border-borda px-3 py-3">
          <span className="flex-1 truncate px-3 font-mono text-[13px] text-texto-suave">{link}</span>
          <button
            onClick={copiar}
            className="shrink-0 rounded-controle bg-[var(--destaque)] px-4 py-2.5 text-[14px] font-medium text-texto transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98]"
          >
            {copiado ? "Copiado" : "Copiar link"}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          href={rota}
          className="flex items-center gap-1.5 rounded-controle bg-texto px-5 py-3 text-[15px] text-superficie transition-opacity hover:opacity-90"
        >
          Ver como o candidato vê <ArrowUpRight size={16} strokeWidth={1.75} />
        </a>
        <button
          onClick={onNova}
          className="rounded-controle bg-superficie px-5 py-3 text-[15px] text-texto transition-colors hover:bg-superficie-2"
        >
          Nova entrevista
        </button>
      </div>
    </motion.div>
  );
}
