"use client";

// A "mão do agente": um cursor com o nome dele, como um colaborador no Figma.
// Camada HTML por cima da página. A coreografia move o cursor direto no DOM, sem re-render.
import { useEffect, useRef } from "react";
import type { Ponto } from "@/lib/presenca";

export type ControleCursor = {
  /** Posição em pixels da tela. */
  mover(p: Ponto): void;
  posicao(): Ponto | null;
  mostrar(): void;
  esconder(): void;
};

export default function CursorAgente({ onPronto }: { onPronto: (c: ControleCursor) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const posicao = useRef<Ponto | null>(null);
  const pronto = useRef(onPronto);

  useEffect(() => {
    pronto.current = onPronto;
  }, [onPronto]);

  useEffect(() => {
    const cursor = el.current;
    if (!cursor) return;
    pronto.current({
      mover(p) {
        posicao.current = p;
        cursor.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      },
      posicao: () => posicao.current,
      mostrar() {
        cursor.style.opacity = "1";
      },
      esconder() {
        cursor.style.opacity = "0";
      },
    });
  }, []);

  return (
    <div
      ref={el}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-30 opacity-0 transition-opacity duration-300 ease-suave will-change-transform"
    >
      {/* A ponta da seta fica exatamente no ponto (0, 0). */}
      <svg width="22" height="22" viewBox="0 0 22 22" className="drop-shadow-[0_2px_4px_rgba(0,0,0,.25)]">
        <path
          d="M2 2 L2 17.5 L6.4 13.4 L9.3 20 L12.2 18.7 L9.4 12.3 L15.5 12.3 Z"
          fill="var(--agente)"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="absolute top-[18px] left-[14px] rounded-full bg-agente px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow-padrao">
        Entrevistador
      </span>
    </div>
  );
}
