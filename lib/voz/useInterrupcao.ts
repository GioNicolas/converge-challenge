"use client";

/**
 * Interromper o Totti nas salas (#97), igual no quadro e no live coding: falar por cima (a escuta mede o microfone
 * enquanto ele fala, lib/presenca/useTranscricao.ts), clicar no botão da chamada ou apertar Esc. A sala diz se dá
 * para interromper agora (`permitida`: a despedida não é interrompível) e o que fazer (`aoInterromper`: calar a voz e
 * guardar no histórico só o que foi ouvido, lib/totti/interrupcao.ts). Espaço não interrompe aqui: no quadro ele
 * arrasta a tela, e no código é digitação.
 */
import { useCallback, useEffect, useRef } from "react";

export function useInterrupcao({ falando, permitida, aoInterromper }: {
  /** A voz do Totti está saindo agora. */
  falando: boolean;
  permitida: boolean;
  aoInterromper: (como: "voz" | "manual") => void;
}) {
  const ao = useRef(aoInterromper);
  ao.current = aoInterromper;
  const pode = falando && permitida;
  const podeRef = useRef(pode);
  podeRef.current = pode;

  /** Só dispara com a voz saindo: um clique atrasado, com ele já calado, não corta nada. */
  const interromper = useCallback((como: "voz" | "manual" = "manual") => {
    if (!podeRef.current) return;
    podeRef.current = false;
    ao.current(como);
  }, []);

  useEffect(() => {
    if (!pode) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      interromper("manual");
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pode, interromper]);

  /** Para a escuta: com o Totti falando, a vigília dela dispara a interrupção pela voz. */
  const escuta = { ativa: pode, aoInterromper: () => interromper("voz") };
  return { podeInterromper: pode, interromper, escuta };
}
