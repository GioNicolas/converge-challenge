"use client";

// Enter no campo de conversa, com o ditado por voz (como no Claude): o primeiro Enter para de ouvir e deixa o texto
// transcrito no campo para revisar; o segundo Enter envia. Shift+Enter continua quebrando a linha.
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import type { EstadoTranscricao } from "./tipos";
import type { Transcricao } from "./useTranscricao";

export const DICA_DITADO_ENTER = "Ouvindo… Enter para parar, Enter de novo para enviar.";

/** O que o Enter faz em cada estado do ditado. */
export function acaoDoEnter(estado: EstadoTranscricao): "parar" | "esperar" | "enviar" {
  if (estado === "conectando" || estado === "ouvindo") return "parar";
  if (estado === "finalizando") return "esperar";
  return "enviar";
}

/**
 * Devolve o onKeyDown do campo. Também põe o foco no campo quando o ditado começa e quando termina: quem clicou no
 * microfone fica com o foco no botão, e o Enter seguinte ligaria o microfone de novo em vez de parar ou enviar.
 */
export function useEnterDoDitado(
  ditado: Transcricao,
  campo: RefObject<HTMLTextAreaElement | null>,
  enviar: () => void,
) {
  const ativa = ditado.ativa;
  const anterior = useRef(ativa);
  useEffect(() => {
    if (anterior.current === ativa) return;
    anterior.current = ativa;
    campo.current?.focus();
  }, [ativa, campo]);

  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const acao = acaoDoEnter(ditado.estado);
    if (acao === "parar") void ditado.parar();
    else if (acao === "enviar") enviar();
  };
}
