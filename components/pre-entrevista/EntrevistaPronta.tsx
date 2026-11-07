"use client";

// Etapa final: a entrevista está criada. Resumo e o link para mandar ao candidato.
import { useState } from "react";
import { motion } from "motion/react";
import { Check as IconeCheck, Code2, Copy, PenTool } from "lucide-react";
import type { InterviewConfig } from "@/lib/contracts";
import { curvaSuave, mola } from "@/lib/design/motion";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";
import Check from "./Check";

type Props = { config: InterviewConfig; onNova: () => void };

export default function EntrevistaPronta({ config, onNova }: Props) {
  const [copiado, setCopiado] = useState(false);
  const rota = config.mode === "system_design" ? "/entrevista/system-design" : "/entrevista";
  const link = `${typeof window === "undefined" ? "" : window.location.origin}${rota}?config=${encodeURIComponent(config.id)}`;
  const IconeFormato = config.mode === "system_design" ? PenTool : Code2;
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, ease: curvaSuave }}
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center"
    >
      <Check tamanho={56} />
      <div className="flex flex-col gap-1.5">
        <h1 className="titulo text-3xl text-texto">Entrevista pronta</h1>
        <p className="text-corpo-grande text-texto-suave">Mande o link para o candidato. O entrevistador já sabe o que avaliar.</p>
      </div>

      <div className="vidro flex w-full flex-col gap-4 rounded-padrao p-5 text-left shadow-cartao">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-controle bg-marca-suave text-marca">
            <IconeFormato size={20} strokeWidth={1.75} />
          </span>
          <div className="flex flex-col">
            <span className="text-subtitulo font-medium text-texto">{config.roleTitle}</span>
            <span className="text-corpo text-texto-suave">
              {NOME_FORMATO[config.mode]} · {NOME_SENIORIDADE[config.seniority]} · {config.durationMin} min ·{" "}
              {config.criteria.length} critérios
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {foco.map((f) => (
            <span key={f.area} className="rounded-full bg-superficie-2 px-3 py-1 text-corpo text-texto">
              {NOME_AREA[f.area]} <span className="numero text-texto-suave">{Math.round(f.weight * 100)}%</span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-controle border border-borda bg-superficie-2/60 py-1.5 pr-1.5 pl-3">
          <span className="flex-1 truncate font-mono text-codigo text-texto-suave">{link}</span>
          <motion.button
            onClick={copiar}
            whileTap={{ scale: 0.95 }}
            transition={mola}
            className="flex items-center gap-1.5 rounded-full bg-marca px-3.5 py-1.5 text-corpo font-medium text-texto-claro"
          >
            {copiado ? <IconeCheck size={15} /> : <Copy size={15} />}
            {copiado ? "Copiado" : "Copiar link"}
          </motion.button>
        </div>
      </div>

      <div className="flex gap-3">
        <a
          href={rota}
          className="rounded-full bg-superficie-2 px-4 py-2.5 text-corpo-grande font-medium text-texto transition-colors duration-rapida hover:bg-borda"
        >
          Ver como o candidato vê
        </a>
        <button
          onClick={onNova}
          className="rounded-full px-4 py-2.5 text-corpo-grande font-medium text-texto-suave transition-colors duration-rapida hover:text-texto"
        >
          Nova entrevista
        </button>
      </div>
    </motion.div>
  );
}
