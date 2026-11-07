"use client";

// Etapa 2: a Totti lendo a vaga. Os passos vão se marcando e, quando a classificação chega,
// o resultado aparece em chips antes de abrir a conversa.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import OndaDeVoz from "@/components/agente/OndaDeVoz";
import type { EstadoSessao } from "@/lib/pre-entrevista/sessoes";
import { curvaSuave, mola } from "@/lib/design/motion";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";
import Check from "./Check";

const PASSOS = ["Lendo a descrição", "Identificando o formato", "Estimando a senioridade", "Escolhendo o foco"];

type Props = { cargo: string; estado: EstadoSessao | null; onPronto: () => void };

export default function LeituraDaVaga({ cargo, estado, onPronto }: Props) {
  const [feitos, setFeitos] = useState(0);

  // Os três primeiros passos andam sozinhos; o último espera a classificação chegar.
  useEffect(() => {
    if (feitos >= PASSOS.length - 1 && !estado) return;
    if (feitos >= PASSOS.length) return;
    const t = setTimeout(() => setFeitos((n) => n + 1), feitos === 0 ? 500 : 650);
    return () => clearTimeout(t);
  }, [feitos, estado]);

  const terminou = feitos >= PASSOS.length && !!estado;
  useEffect(() => {
    if (!terminou) return;
    const t = setTimeout(onPronto, 1600);
    return () => clearTimeout(t);
  }, [terminou, onPronto]);

  const c = estado?.classificacao;
  const chips = c
    ? [
        NOME_FORMATO[c.mode.value],
        NOME_SENIORIDADE[c.seniority.value],
        `Foco em ${NOME_AREA[[...c.focus].sort((a, b) => b.weight - a.weight)[0].area].toLowerCase()}`,
      ]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.36, ease: curvaSuave }}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-6 text-center"
    >
      <OndaDeVoz estado={terminou ? "falando" : "pensando"} tamanho={132} />

      <div className="flex flex-col gap-1">
        <h1 className="titulo text-2xl text-texto">A Totti está lendo a vaga</h1>
        <p className="text-corpo-grande text-texto-suave">{cargo}</p>
      </div>

      <ul className="flex w-full flex-col gap-2.5 text-left">
        {PASSOS.map((passo, i) => {
          const feito = i < feitos;
          const atual = i === feitos;
          return (
            <li key={passo} className="flex items-center gap-3">
              <span className="flex size-5 items-center justify-center">
                {feito ? (
                  <Check tamanho={20} />
                ) : (
                  <span className={`size-2 rounded-full ${atual ? "animate-pulse bg-marca" : "bg-texto-suave/30"}`} />
                )}
              </span>
              <span
                className={`text-corpo-grande transition-colors duration-normal ease-suave ${
                  feito ? "text-texto" : atual ? "text-texto-suave" : "text-texto-suave/50"
                }`}
              >
                {passo}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex min-h-9 flex-wrap justify-center gap-2">
        <AnimatePresence>
          {terminou &&
            chips.map((chip, i) => (
              <motion.span
                key={chip}
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...mola, delay: i * 0.12 }}
                className="rounded-full bg-marca-suave px-3.5 py-1.5 text-corpo font-medium text-texto"
              >
                {chip}
              </motion.span>
            ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
