"use client";

// Fim da resposta por silêncio (10.6 b): o candidato falou e depois ficou calado por um tempo.
// Só conta depois que o agente parou de falar, e só depois de o candidato ter falado de verdade
// (uma pausa para pensar no começo não encerra a resposta). O botão "Terminei" continua valendo.
import { useEffect, useRef } from "react";

const LIMIAR = 0.08; // volume (0 a 1) acima do qual conta como fala
const FALA_MINIMA_MS = 1200; // quanto o candidato precisa ter falado
const SILENCIO_MS = 2600; // quanto silêncio encerra a resposta

export function useFimPorSilencio(opcoes: {
  ativo: boolean;
  agenteFalando: boolean;
  volume: number;
  aoTerminar: () => void;
}) {
  const { ativo, agenteFalando, volume, aoTerminar } = opcoes;
  const falou = useRef(0);
  const ultimaFala = useRef<number | null>(null);
  const ultimoQuadro = useRef<number | null>(null);
  const terminar = useRef(aoTerminar);

  useEffect(() => {
    terminar.current = aoTerminar;
  }, [aoTerminar]);

  // Recomeça a contagem a cada pergunta e enquanto o agente fala.
  useEffect(() => {
    if (!ativo || agenteFalando) {
      falou.current = 0;
      ultimaFala.current = null;
      ultimoQuadro.current = null;
    }
  }, [ativo, agenteFalando]);

  useEffect(() => {
    if (!ativo || agenteFalando) return;
    const agora = performance.now();
    const passo = ultimoQuadro.current === null ? 0 : Math.min(200, agora - ultimoQuadro.current);
    ultimoQuadro.current = agora;
    if (volume > LIMIAR) {
      falou.current += passo;
      ultimaFala.current = agora;
    }
  }, [volume, ativo, agenteFalando]);

  // Confere o silêncio num relógio próprio (o volume pode parar de mudar quando está tudo quieto).
  useEffect(() => {
    if (!ativo || agenteFalando) return;
    const id = setInterval(() => {
      const ultima = ultimaFala.current;
      if (falou.current >= FALA_MINIMA_MS && ultima !== null && performance.now() - ultima > SILENCIO_MS) {
        falou.current = 0;
        ultimaFala.current = null;
        terminar.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, [ativo, agenteFalando]);
}
