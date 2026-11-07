"use client";

// Janela de chamada (estilo Meet, no canto da tela): ao vivo, tempo, fase, o plin e "Encerrar".
// A versão completa (orb, câmera local, mic, minimizar em pílula, arrastar) vem no bloco das 13h.
import { useEffect, useState } from "react";
import type { Fase } from "@/lib/sessao/cliente";
import type { EstadoEntrevista } from "@/lib/sessao/estados";

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
  estado: EstadoEntrevista;
  /** Momento em que a entrevista começou (Date.now()). */
  iniciadaEm: number | null;
  onClicarPlin: () => void;
  onTerminarResposta: () => void;
  onEncerrar: () => void;
};

export default function JanelaChamada({
  estado,
  iniciadaEm,
  onClicarPlin,
  onTerminarResposta,
  onEncerrar,
}: Props) {
  const [agora, setAgora] = useState(() => Date.now());
  const ativa = iniciadaEm !== null && estado.fase !== "ENCERRADA";

  useEffect(() => {
    if (!ativa) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ativa]);

  const decorrido = iniciadaEm === null ? 0 : Math.max(0, Math.floor((agora - iniciadaEm) / 1000));

  return (
    <div className="pointer-events-auto flex w-[300px] flex-col overflow-hidden rounded-padrao bg-vidro-escuro text-texto-claro shadow-flutuante backdrop-blur-xl">
      <div className="flex items-center gap-2 px-4 pt-3 text-xs">
        <span
          className={`size-2 rounded-full ${ativa ? "bg-sucesso" : "bg-texto-claro/30"}`}
          aria-hidden
        />
        <span className="font-medium tabular-nums">{formatarTempo(decorrido)}</span>
        <span className="text-texto-claro/50">·</span>
        <span className="text-texto-claro/70">{NOME_DA_FASE[estado.fase]}</span>
        <span className="ml-auto text-texto-claro/50">
          {estado.perguntasFeitas > 0 && `${estado.perguntasFeitas} pergunta(s)`}
        </span>
      </div>

      <div className="flex h-[120px] items-center justify-center text-sm text-texto-claro/50">
        Entrevistador
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3">
        {estado.plin === "PLIN_PENDENTE" && (
          <button
            onClick={onClicarPlin}
            className="animate-pulse rounded-full bg-agente px-4 py-2 text-sm font-medium text-white transition-transform duration-150 ease-suave active:scale-95"
          >
            O entrevistador tem uma pergunta
          </button>
        )}
        {estado.plin === "PERGUNTA_ATIVA" && (
          <>
            <p className="px-1 text-sm leading-snug text-texto-claro/90">
              {estado.perguntaAtiva?.pergunta}
            </p>
            <button
              onClick={onTerminarResposta}
              className="rounded-full bg-texto-claro/15 px-4 py-2 text-sm font-medium transition-colors duration-150 ease-suave hover:bg-texto-claro/25"
            >
              Terminei de responder
            </button>
          </>
        )}
        {ativa && (
          <button
            onClick={onEncerrar}
            className="self-end rounded-full bg-perigo px-4 py-1.5 text-xs font-medium text-white transition-opacity duration-150 ease-suave hover:opacity-85"
          >
            Encerrar
          </button>
        )}
      </div>
    </div>
  );
}
