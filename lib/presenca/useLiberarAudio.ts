"use client";

import { useEffect } from "react";
import { aquecerVozes } from "../voz/escolherVoz";
import { liberarAudio } from "./vozSincronizada";

// No WebKit (principalmente iOS), pointerdown e touchstart de toque não contam como gesto para tocar mídia:
// quem conta é touchend, pointerup e click. Os de "down" ficam para destravar o mais cedo possível no desktop.
const GESTOS = ["pointerdown", "keydown", "touchstart", "pointerup", "touchend", "click"] as const;

/**
 * Libera o áudio no primeiro gesto do usuário em qualquer tela que fale. A voz do ElevenLabs chega depois de uma
 * chamada assíncrona; sem esse destrave o navegador bloqueia o play() e a fala cai na voz do navegador.
 * Captura (antes do onClick do botão) para o elemento já estar liberado quando a primeira fala chegar.
 * Também aquece a lista de vozes do navegador, para a reserva (se precisar) já escolher a voz masculina.
 */
export function useLiberarAudio(): void {
  useEffect(() => {
    aquecerVozes();
    // liberarAudio ignora as chamadas depois de liberar; se um gesto falhar, o próximo tenta de novo.
    const liberar = () => liberarAudio();
    GESTOS.forEach((e) => window.addEventListener(e, liberar, { capture: true }));
    return () => GESTOS.forEach((e) => window.removeEventListener(e, liberar, { capture: true }));
  }, []);
}
