"use client";

// Legenda ao vivo, centralizada embaixo: a fala do agente aparecendo no ritmo da voz.
// O que já foi falado fica claro; o resto, apagado. Falas longas andam em blocos de até ~2 linhas.
import { AnimatePresence, motion } from "motion/react";
import type { FalaNaTela } from "@/lib/sessao/cliente";

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

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
      <AnimatePresence mode="wait">
        {fala && bloco && (
          <motion.p
            key={`${fala.texto}-${indice}`}
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="max-w-[640px] rounded-[14px] bg-vidro-escuro px-4 py-2.5 text-center text-[15px] leading-snug text-texto-claro shadow-flutuante backdrop-blur-xl"
          >
            <span className="transition-colors duration-150">{falado}</span>
            <span className="text-texto-claro/35">{resto}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
