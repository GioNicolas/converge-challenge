"use client";

import { motion } from "motion/react";

export type OrbState = "ocioso" | "ouvindo" | "pensando" | "falando" | "duvida";

const ROTULO: Record<OrbState, string> = {
  ocioso: "Entrevistador",
  ouvindo: "Ouvindo",
  pensando: "Pensando",
  falando: "Falando",
  duvida: "Tem uma dúvida",
};

// Escala do pulso e velocidade do giro interno (segundos por volta) por estado.
const ANIM: Record<OrbState, { scale: number[]; duration: number; giro: number }> = {
  ocioso: { scale: [1, 1.03, 1], duration: 4, giro: 14 },
  ouvindo: { scale: [1, 1.08, 1], duration: 1.6, giro: 8 },
  pensando: { scale: [0.96, 1, 0.96], duration: 1.2, giro: 3 },
  falando: { scale: [1, 1.14, 0.98, 1.08, 1], duration: 0.9, giro: 6 },
  duvida: { scale: [1, 1.06, 1], duration: 1.4, giro: 2.4 },
};

/**
 * Identidade do agente (inspirada na Siri): esfera de vidro com manchas de luz
 * em tons de azul que giram por dentro. Na dúvida, a esfera inteira gira no
 * próprio eixo, com um anel de luz e um halo que cresce.
 */
export default function Orb({ state, size = 44 }: { state: OrbState; size?: number }) {
  const a = ANIM[state];
  const duvida = state === "duvida";
  return (
    <span
      role="img"
      aria-label={ROTULO[state]}
      data-estado={state}
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      {duvida && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full bg-marca"
            animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
          <span
            className="orb-anel absolute -inset-[5px] rounded-full"
            style={{ animation: "orb-giro 1.6s linear infinite" }}
          />
        </>
      )}
      <motion.span
        key={state}
        className="absolute inset-0"
        animate={{ scale: a.scale }}
        transition={{ duration: a.duration, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Na dúvida a rodela gira no próprio eixo; nos outros estados só o interior se move */}
        <span
          className="absolute inset-0"
          style={duvida ? { animation: "orb-giro 2.4s linear infinite" } : undefined}
        >
          <span
            className="orb-esfera absolute inset-0 overflow-hidden rounded-full"
            style={{ ["--orb-giro" as string]: `${a.giro}s` }}
          >
            <span className="orb-camada">
              <span
                className="orb-mancha"
                style={{ width: "62%", height: "62%", left: "-6%", top: "8%", background: "var(--agente-claro)" }}
              />
              <span
                className="orb-mancha"
                style={{ width: "55%", height: "55%", right: "-4%", bottom: "2%", background: "var(--agente-ciano)", animationDelay: "-1.2s" }}
              />
            </span>
            <span className="orb-camada-inversa">
              <span
                className="orb-mancha"
                style={{ width: "58%", height: "58%", left: "30%", top: "-10%", background: "var(--marca)", animationDelay: "-2.2s" }}
              />
              <span
                className="orb-mancha"
                style={{ width: "40%", height: "40%", left: "4%", bottom: "-6%", background: "var(--agente-indigo)", animationDelay: "-0.6s" }}
              />
            </span>
          </span>
        </span>
        {/* O reflexo não gira: dá a ideia de vidro e de que a luz vem de cima */}
        <span className="orb-reflexo pointer-events-none absolute inset-0 rounded-full" />
      </motion.span>
    </span>
  );
}

export const orbLabel = (s: OrbState) => ROTULO[s];
