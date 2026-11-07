"use client";

// Janela de chamada (estilo Meet, no canto da tela): ao vivo, tempo e fase.
// A versão completa (câmera local, mic, minimizar em pílula, arrastar) vem no bloco das 13h.
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

function formatarTempo(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Props = {
  fase: Fase;
  /** Momento em que a entrevista começou (Date.now()). */
  iniciadaEm: number | null;
};

export default function JanelaChamada({ fase, iniciadaEm }: Props) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (iniciadaEm === null) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iniciadaEm]);

  const decorrido = iniciadaEm === null ? 0 : Math.max(0, Math.floor((agora - iniciadaEm) / 1000));

  return (
    <div className="pointer-events-auto flex h-[200px] w-[300px] flex-col overflow-hidden rounded-padrao bg-vidro-escuro text-texto-claro shadow-flutuante backdrop-blur-xl">
      <div className="flex items-center gap-2 px-4 pt-3 text-xs">
        <span className="size-2 rounded-full bg-sucesso" aria-hidden />
        <span className="font-medium tabular-nums">{formatarTempo(decorrido)}</span>
        <span className="text-texto-claro/50">·</span>
        <span className="text-texto-claro/70">{NOME_DA_FASE[fase]}</span>
      </div>
      <div className="flex flex-1 items-center justify-center text-sm text-texto-claro/50">
        Entrevistador
      </div>
    </div>
  );
}
