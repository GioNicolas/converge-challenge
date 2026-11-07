"use client";

// Etapa intermediária: o Totti lendo a vaga. Os passos se marcam um a um e, quando a classificação
// chega, o resultado aparece com marca-texto antes de abrir a conversa.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import OndaDeVoz from "@/components/agente/OndaDeVoz";
import type { EstadoSessao } from "@/lib/pre-entrevista/sessoes";
import { curvaSuave } from "@/lib/design/motion";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";
import Check from "./Check";

const PASSOS = ["Lendo a descrição", "Identificando o formato", "Estimando a senioridade", "Escolhendo o foco"];

type Props = { cargo: string; estado: EstadoSessao | null; onPronto: () => void };

export default function LeituraDaVaga({ cargo, estado, onPronto }: Props) {
  const [feitos, setFeitos] = useState(0);

  // Os três primeiros passos andam sozinhos; o último espera a classificação chegar.
  useEffect(() => {
    if (feitos >= PASSOS.length || (feitos >= PASSOS.length - 1 && !estado)) return;
    const t = setTimeout(() => setFeitos((n) => n + 1), feitos === 0 ? 500 : 650);
    return () => clearTimeout(t);
  }, [feitos, estado]);

  const terminou = feitos >= PASSOS.length && !!estado;
  useEffect(() => {
    if (!terminou) return;
    const t = setTimeout(onPronto, 1700);
    return () => clearTimeout(t);
  }, [terminou, onPronto]);

  const c = estado?.classificacao;
  const resultado = c
    ? [
        NOME_FORMATO[c.mode.value],
        NOME_SENIORIDADE[c.seniority.value],
        `Foco: ${NOME_AREA[[...c.focus].sort((a, b) => b.weight - a.weight)[0].area]}`,
      ]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.36, ease: curvaSuave }}
      className="mx-auto flex w-full max-w-lg flex-col gap-8"
    >
      <div className="flex items-center gap-4">
        <OndaDeVoz estado={terminou ? "falando" : "pensando"} tamanho={72} fundo="claro" />
        <div className="flex flex-col gap-1">
          <span className="rotulo text-texto-suave">Totti · lendo a vaga</span>
          <h1 className="text-[28px] leading-tight font-normal tracking-[-0.02em] text-texto">{cargo}</h1>
        </div>
      </div>

      <ol className="flex flex-col rounded-padrao bg-superficie">
        {PASSOS.map((passo, i) => {
          const feito = i < feitos;
          const atual = i === feitos && !terminou;
          return (
            <li key={passo} className="flex items-center gap-4 border-b border-borda px-5 py-3.5 last:border-b-0">
              <span className="rotulo w-6 text-texto-suave">{String(i + 1).padStart(2, "0")}</span>
              <span
                className={`flex-1 text-[15px] transition-colors duration-200 ${
                  feito ? "text-texto" : atual ? "text-texto" : "text-texto-suave/60"
                }`}
              >
                {passo}
                {atual && <span className="ml-0.5 inline-block w-2 animate-pulse">▍</span>}
              </span>
              {feito && <Check />}
            </li>
          );
        })}
      </ol>

      <div className="flex min-h-7 flex-wrap gap-2">
        <AnimatePresence>
          {terminou &&
            resultado.map((r, i) => (
              <motion.span
                key={r}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: i * 0.12, ease: curvaSuave }}
                className="rotulo rotulo-destaque"
              >
                {r}
              </motion.span>
            ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
