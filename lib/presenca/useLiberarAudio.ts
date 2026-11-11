"use client";

import { useEffect } from "react";
import { GESTOS_DE_ATIVACAO, liberarAudio, manterSaidaAcordada } from "./vozSincronizada";

/**
 * Libera o áudio no primeiro gesto do usuário em qualquer tela que fale. A voz do ElevenLabs chega depois de uma
 * chamada assíncrona; sem esse destrave o navegador bloqueia o play() e a fala esperaria o próximo toque.
 * Captura (antes do onClick do botão) para o elemento já estar liberado quando a primeira fala chegar.
 * Enquanto montado, mantém a saída de som acordada (ver manterSaidaAcordada): a primeira sílaba não some.
 */
export function useLiberarAudio(): void {
  useEffect(() => {
    // liberarAudio ignora as chamadas depois de liberar; se um gesto falhar, o próximo tenta de novo.
    // Cada gesto também retoma a saída acordada, se o navegador a suspendeu.
    const liberar = () => liberarAudio();
    const soltarSaida = manterSaidaAcordada();
    GESTOS_DE_ATIVACAO.forEach((e) => window.addEventListener(e, liberar, { capture: true }));
    return () => {
      GESTOS_DE_ATIVACAO.forEach((e) => window.removeEventListener(e, liberar, { capture: true }));
      soltarSaida();
    };
  }, []);
}
