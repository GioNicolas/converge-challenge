"use client";

// Identidade do agente: a pérola (ver components/totti/Perola.tsx). Este arquivo só mantém o
// contrato antigo (`OrbState`, `orbLabel`) para quem ainda importa daqui.
import Perola, { type EstadoPerola } from "@/components/totti/Perola";

export type OrbState = EstadoPerola;

const ROTULO: Record<OrbState, string> = {
  ocioso: "Totti",
  ouvindo: "Ouvindo",
  pensando: "Pensando",
  falando: "Falando",
  duvida: "Tem uma dúvida",
};

export default function Orb({ state, size = 44 }: { state: OrbState; size?: number }) {
  return <Perola estado={state} tamanho={size} />;
}

export const orbLabel = (s: OrbState) => ROTULO[s];
