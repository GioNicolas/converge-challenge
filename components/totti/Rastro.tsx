"use client";

// O rastro do Totti: a voz da máquina. Uma linha por vez, escrita ao vivo em JetBrains Mono,
// com o cursor de bloco piscando. O que já foi feito fica apagado em cima, com ✓.
// Movimento = evento: cada linha corresponde a algo que o agente fez de verdade.
import { useEffect, useState } from "react";

/** Digita `linhas` em ciclo. `seguro` (SSR/reduzir movimento) mostra a linha inteira de uma vez. */
export function useRastro(linhas: string[], { velocidade = 2, pausa = 22, tique = 55 } = {}) {
  const [t, setT] = useState(0);
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    setReduzido(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    if (reduzido || linhas.length <= 1) return;
    const id = setInterval(() => setT((x) => x + 1), tique);
    return () => clearInterval(id);
  }, [reduzido, linhas.length, tique]);

  if (linhas.length === 0) return { feito: [] as string[], atual: "", indice: 0 };
  const duracao = linhas.map((l) => Math.ceil(l.length / velocidade) + pausa);
  const total = duracao.reduce((a, b) => a + b, 0);
  let k = t % total;
  let i = 0;
  while (k >= duracao[i]) {
    k -= duracao[i];
    i++;
  }
  const atual = reduzido ? linhas[i] : linhas[i].slice(0, Math.min(linhas[i].length, k * velocidade));
  return { feito: linhas.slice(Math.max(0, i - 2), i), atual, indice: i };
}

export function Cursor({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`ml-0.5 inline-block h-[15px] w-2 align-[-2px] bg-current anim-piscar ${className}`}
    />
  );
}

/** Cartão escuro "Rastro do Totti" (menu lateral do painel, cabeçalhos de página). */
export function RastroDoTotti({
  linhas,
  titulo = "Rastro do Totti",
  className = "",
}: {
  linhas: string[];
  titulo?: string;
  className?: string;
}) {
  const { atual } = useRastro(linhas);
  return (
    <div
      role="status"
      aria-live="off"
      className={`flex flex-col gap-2 rounded-padrao bg-[#1c1812] p-3.5 text-[#f5f0e8] ${className}`}
    >
      <span className="text-[12.5px] text-[#f5f0e8]/70">{titulo}</span>
      <span className="voz-maquina min-h-[44px] text-[12.5px] leading-[1.6]">
        › {atual}
        <Cursor />
      </span>
    </div>
  );
}
