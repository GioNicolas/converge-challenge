"use client";

// "Contar": nota e progresso sobem do zero quando chegam (900ms, ease-out forte).
// Movimento = evento: só roda quando o valor muda de verdade. Com "reduzir movimento", vai direto ao valor.
import { useEffect, useRef, useState } from "react";

export function useContar(alvo: number, duracaoMs = 900): number {
  const [valor, setValor] = useState(alvo);
  const de = useRef(0);
  const primeira = useRef(true);
  useEffect(() => {
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduz) {
      de.current = alvo;
      setValor(alvo);
      return;
    }
    // Na primeira vez sobe do zero; depois, de onde estava.
    const inicio = primeira.current ? 0 : de.current;
    primeira.current = false;
    const t0 = performance.now();
    let raf = 0;
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - t0) / duracaoMs);
      const e = 1 - Math.pow(1 - p, 4);
      const v = inicio + (alvo - inicio) * e;
      de.current = v;
      setValor(v);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, duracaoMs]);
  return valor;
}
