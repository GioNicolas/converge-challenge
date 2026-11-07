"use client";

// O entrevistador na tela: a bolha de vidro (lib/presenca/bolha) num Shadow DOM.
// ouvindo → barras seguindo o microfone; pensando → bolinhas orbitando;
// falando → onda azul; duvida → a pílula pulsa com o convite (o clique é o plin).
import { useEffect, useRef } from "react";
import type { Bolha, EstadoBolha } from "@/lib/presenca/bolha/bubble";

export type EstadoOrb = "ouvindo" | "pensando" | "falando" | "duvida";

const PARA_BOLHA: Record<EstadoOrb, EstadoBolha> = {
  ouvindo: "listening",
  pensando: "thinking",
  falando: "falando",
  duvida: "duvida",
};

type Props = {
  estado: EstadoOrb;
  /** 0 a 1: microfone (ouvindo) ou voz do agente (falando). */
  volume?: number;
  textoDuvida?: string;
  onClicarDuvida?: () => void;
  className?: string;
};

export default function Orb({ estado, volume, textoDuvida, onClicarDuvida, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bolhaRef = useRef<Bolha | null>(null);
  const cliqueRef = useRef(onClicarDuvida);

  useEffect(() => {
    cliqueRef.current = onClicarDuvida;
  }, [onClicarDuvida]);

  // Monta uma vez. A bolha usa document/window, então carrega só no navegador.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let ativa = true;
    import("@/lib/presenca/bolha/bubble.js").then(({ mountBubble }) => {
      if (!ativa) return;
      const sombra = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      bolhaRef.current = mountBubble(sombra, { embutida: true });
      bolhaRef.current.mostrar(PARA_BOLHA[estado], dadosDe(estado));
    });
    return () => {
      ativa = false;
      bolhaRef.current?.destroy();
      bolhaRef.current = null;
    };
    // O estado inicial entra pelo mostrar() acima; as trocas, pelo efeito de baixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dadosDe(e: EstadoOrb) {
    return e === "duvida" ? { texto: textoDuvida, onClick: () => cliqueRef.current?.() } : {};
  }

  useEffect(() => {
    bolhaRef.current?.mostrar(PARA_BOLHA[estado], dadosDe(estado));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, textoDuvida]);

  useEffect(() => {
    if (volume != null) bolhaRef.current?.setVolume(volume);
  }, [volume]);

  return <div ref={hostRef} className={`relative ${className ?? ""}`} />;
}
