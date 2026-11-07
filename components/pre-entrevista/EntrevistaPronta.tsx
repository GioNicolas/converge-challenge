"use client";

// Etapa final: a entrevista está criada. O que importa agora é o link, então ele vem logo abaixo
// do título; o resumo do que foi combinado fica embaixo, para conferência.
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { InterviewConfig } from "@/lib/contracts";
import { curvaSuave } from "@/lib/design/motion";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";
import Passos from "./Passos";

type Props = { config: InterviewConfig; onNova: () => void; rotuloNova?: string };

export default function EntrevistaPronta({ config, onNova, rotuloNova = "Nova entrevista" }: Props) {
  const [copiado, setCopiado] = useState(false);
  // O candidato entra pela tela "Antes de começar", que mostra a vaga e leva à entrevista com a mesma config.
  const rota = `/?config=${encodeURIComponent(config.id)}`;
  const link = `${typeof window === "undefined" ? "" : window.location.origin}${rota}`;
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
      className="mx-auto flex w-full max-w-2xl flex-col gap-10"
    >
      <div className="flex flex-col gap-5">
        <Passos atual={4} />
        <div className="flex flex-col gap-3">
          <h1 className="titulo-display text-[48px] text-texto">Pronto. É só mandar o link.</h1>
          <p className="text-[16px] leading-relaxed text-texto-suave">
            {config.roleTitle} já está na sua lista de vagas. O entrevistador sabe o que avaliar e como conduzir.
          </p>
        </div>
      </div>

      {/* 1º: o link */}
      <div className="cartao flex flex-col gap-3 p-5">
        <span className="text-[15px] font-semibold tracking-[-0.015em] text-texto">Link para os candidatos</span>
        <div className="flex items-center gap-3 rounded-2xl bg-superficie-2/60 py-1.5 pr-1.5 pl-4">
          <span className="flex-1 truncate font-mono text-[12.5px] text-texto">{link}</span>
          <button
            onClick={copiar}
            className="shrink-0 rounded-full bg-texto px-4 py-2 text-[13.5px] font-medium text-texto-claro transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.98]"
          >
            {copiado ? "Copiado" : "Copiar link"}
          </button>
        </div>
        <a href={rota} className="flex items-center gap-1 self-start text-[13px] text-texto-suave transition-colors hover:text-texto">
          Ver como o candidato vê <ArrowUpRight size={13} />
        </a>
      </div>

      {/* 2º: o que foi combinado */}
      <section className="flex flex-col gap-3">
        <span className="rotulo text-texto-suave">O que ficou combinado</span>
        <dl className="grid grid-cols-3 gap-3">
          {[
            ["Formato", NOME_FORMATO[config.mode]],
            ["Senioridade", NOME_SENIORIDADE[config.seniority]],
            ["Duração", `${config.durationMin} min`],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="cartao flex flex-col gap-1.5 p-4">
              <dt className="rotulo text-texto-suave">{rotulo}</dt>
              <dd className="text-[16px] font-medium tracking-[-0.015em] text-texto">{valor}</dd>
            </div>
          ))}
        </dl>
        <div className="cartao flex flex-col gap-1.5 p-4">
          <span className="rotulo text-texto-suave">Foco · {config.criteria.length} critérios</span>
          <p className="text-[15px] text-texto">
            {foco.map((f) => `${NOME_AREA[f.area]} ${Math.round(f.weight * 100)}%`).join("  ·  ")}
          </p>
        </div>
      </section>

      <button
        onClick={onNova}
        className="group flex h-11 items-center gap-2 self-start rounded-full bg-texto px-5 text-[14px] font-medium text-texto-claro transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.98]"
      >
        {rotuloNova}
        <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </motion.div>
  );
}
