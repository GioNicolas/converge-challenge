"use client";

// Enter no campo de conversa, com o ditado por voz (como no Claude): o primeiro Enter para de ouvir e deixa o texto
// transcrito no campo para revisar; o segundo Enter envia. Shift+Enter continua quebrando a linha.
// O foco volta para o campo pelo próprio BotaoDitado (prop `campo`), só quando a pessoa clica nele.
import type { KeyboardEvent } from "react";
import type { EstadoTranscricao } from "./tipos";
import type { Transcricao } from "./useTranscricao";

export const DICA_DITADO_ENTER = "Ouvindo… Enter para parar, Enter de novo para enviar.";

type AcaoDoEnter = "parar" | "esperar" | "enviar";

/** O que o Enter faz em cada estado do ditado. Enquanto conecta não há nada gravado: o Enter só espera. */
export function acaoDoEnter(estado: EstadoTranscricao): AcaoDoEnter {
  if (estado === "ouvindo") return "parar";
  if (estado === "conectando" || estado === "finalizando") return "esperar";
  return "enviar";
}

export type Tecla = { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number };

/**
 * O que fazer com uma tecla no campo, ou null para deixar o navegador seguir (outras teclas, Shift+Enter e o Enter
 * que confirma uma composição de IME; no Safari esse Enter chega com isComposing=false e keyCode 229).
 */
export function acaoDaTecla(tecla: Tecla, estado: EstadoTranscricao): AcaoDoEnter | null {
  if (tecla.key !== "Enter" || tecla.shiftKey || tecla.isComposing || tecla.keyCode === 229) return null;
  return acaoDoEnter(estado);
}

/** Devolve o onKeyDown do campo. */
export function useEnterDoDitado(ditado: Transcricao, enviar: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const acao = acaoDaTecla({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode }, ditado.estado);
    if (!acao) return;
    e.preventDefault();
    if (acao === "parar") void ditado.parar();
    else if (acao === "enviar") enviar();
  };
}
