"use client";

// Legenda ao vivo, centralizada embaixo (sala do candidato): a fala aparece no ritmo da voz, com o nome
// de quem fala e as barras de voz ao lado. O que já foi falado fica claro; o resto, apagado.
// Falas longas andam em blocos de até ~2 linhas.
import { AnimatePresence, motion } from "motion/react";
import { BarrasDeVoz } from "@/components/totti/Perola";

/** Fala em andamento: `ate` = quantos caracteres já foram falados (a parte clara da legenda). */
export type FalaNaTela = { quem: "agente" | "candidato"; texto: string; ate: number };

const MAX_BLOCO = 110;

/** Divide em blocos de até MAX_BLOCO caracteres, preferindo cortar no fim de frases e nunca no meio de palavras. */
function blocos(texto: string) {
  const frases = texto.match(/[^.!?]+[.!?]*\s*/g) ?? [texto];
  const resultado: { inicio: number; fim: number }[] = [];
  let inicio = 0;
  let fim = 0;
  for (const frase of frases) {
    if (fim > inicio && fim + frase.length - inicio > MAX_BLOCO) {
      resultado.push({ inicio, fim });
      inicio = fim;
    }
    fim += frase.length;
    // Frase sozinha maior que o bloco: corta em palavras.
    while (fim - inicio > MAX_BLOCO) {
      const corte = texto.lastIndexOf(" ", inicio + MAX_BLOCO);
      const ponto = corte > inicio ? corte + 1 : inicio + MAX_BLOCO;
      resultado.push({ inicio, fim: ponto });
      inicio = ponto;
    }
  }
  if (fim > inicio) resultado.push({ inicio, fim });
  return resultado;
}

export default function Legenda({ fala }: { fala: FalaNaTela | null }) {
  const lista = fala ? blocos(fala.texto) : [];
  // O bloco onde a voz está; terminada a fala, fica o último.
  const achado = fala ? lista.findIndex((b) => fala.ate < b.fim) : 0;
  const indice = achado === -1 ? lista.length - 1 : achado;
  const bloco = lista[indice];
  const falado = fala && bloco ? fala.texto.slice(bloco.inicio, Math.max(bloco.inicio, Math.min(fala.ate, bloco.fim))) : "";
  const resto = fala && bloco ? fala.texto.slice(bloco.inicio + falado.length, bloco.fim) : "";
  const falando = !!fala && fala.ate < fala.texto.length;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-10 flex justify-center px-4">
      <AnimatePresence mode="wait">
        {fala && bloco && (
          <motion.p
            key={`${fala.texto}-${indice}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-[min(860px,100%)] items-center gap-3.5 rounded-[20px] bg-vidro-escuro px-5 py-3 text-left text-[16px] leading-[1.45] text-texto-claro shadow-flutuante backdrop-blur-xl ring-1 ring-texto-claro/10"
          >
            <BarrasDeVoz ativo={falando} n={5} altura={20} largura={3} className="shrink-0 text-texto-claro" />
            <span>
              <b className="mr-1.5">{fala.quem === "agente" ? "Totti" : "Você"}</b>
              <span className="transition-colors duration-150">{falado}</span>
              <span className="text-texto-claro/40">{resto}</span>
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
