"use client";

import { useEffect, useState } from "react";
import type { Fase } from "@/lib/sessao/cliente";

const NOME_DA_FASE: Record<Fase, string> = {
  AGUARDANDO: "Aguardando",
  APRESENTACAO: "Apresentação",
  REQUISITOS: "Requisitos",
  ALTO_NIVEL: "Visão geral",
  APROFUNDAMENTO: "Aprofundamento",
  FECHAMENTO: "Fechamento",
  ENCERRADA: "Encerrada",
};

type Props = {
  titulo?: string;
  enunciado?: string;
  fase: Fase;
  /** Momento em que a entrevista começou (Date.now()). */
  iniciadaEm: number | null;
};

function formatarTempo(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PainelProblema({ titulo, enunciado, fase, iniciadaEm }: Props) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (iniciadaEm === null) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iniciadaEm]);

  const decorrido = iniciadaEm === null ? 0 : Math.max(0, Math.floor((agora - iniciadaEm) / 1000));

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 rounded-padrao bg-superficie p-6 shadow-padrao">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-marca-suave px-3 py-1 text-xs font-medium text-marca">
          {NOME_DA_FASE[fase]}
        </span>
        <span className="font-mono text-sm tabular-nums text-texto-suave">
          {formatarTempo(decorrido)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-texto-suave">Problema</p>
        {titulo ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
            <p className="leading-relaxed text-texto-suave">{enunciado}</p>
          </>
        ) : (
          <div className="flex flex-col gap-2" aria-label="Carregando o problema">
            <div className="h-6 w-2/3 animate-pulse rounded-pequeno bg-superficie-2" />
            <div className="h-4 w-full animate-pulse rounded-pequeno bg-superficie-2" />
            <div className="h-4 w-5/6 animate-pulse rounded-pequeno bg-superficie-2" />
          </div>
        )}
      </div>
    </aside>
  );
}
