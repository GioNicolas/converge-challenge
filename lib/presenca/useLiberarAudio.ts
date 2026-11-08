"use client";

import { useEffect } from "react";
import { liberarAudio } from "./vozSincronizada";

const GESTOS = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * Libera o áudio no primeiro gesto do usuário em qualquer tela que fale. A voz do ElevenLabs chega depois de uma
 * chamada assíncrona; sem esse destrave o navegador bloqueia o play() e a fala cai na voz do navegador.
 * Captura (antes do onClick do botão) para o elemento já estar liberado quando a primeira fala chegar.
 */
export function useLiberarAudio(): void {
  useEffect(() => {
    // liberarAudio ignora as chamadas depois de liberar; se o primeiro gesto falhar, o próximo tenta de novo.
    const liberar = () => liberarAudio();
    GESTOS.forEach((e) => window.addEventListener(e, liberar, { capture: true }));
    return () => GESTOS.forEach((e) => window.removeEventListener(e, liberar, { capture: true }));
  }, []);
}
