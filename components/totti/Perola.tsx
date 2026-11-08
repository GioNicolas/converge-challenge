"use client";

// O corpo do Totti em qualquer tela: o anel de voz (versão B da vitrine em /dev/agente, components/agente/OndaDeVoz).
// O nome "Perola" ficou do primeiro desenho; a API é a mesma: `estado` e `tamanho` (o diâmetro do anel, em px).
//   ocioso   anel calmo, quase parado
//   ouvindo  ondula de leve com o microfone
//   pensando um arco claro percorre o anel
//   falando  ondas mais vivas, ainda devagar
//   duvida   chama atenção sem agitar
// A cor segue o chão: tinta no papel, pérola na noite (lido do --fundo de onde ele está).
import { useEffect, useRef, useState } from "react";
import OndaDeVoz from "@/components/agente/OndaDeVoz";
import type { EstadoAgente } from "@/lib/presenca/energia";

export type EstadoPerola = "ocioso" | "ouvindo" | "pensando" | "falando" | "duvida";

const ROTULO: Record<EstadoPerola, string> = {
  ocioso: "Totti",
  ouvindo: "Totti ouvindo",
  pensando: "Totti pensando",
  falando: "Totti falando",
  duvida: "Totti tem uma dúvida",
};

/** O anel ocupa ~52% do canvas do OndaDeVoz (raio 34 em 132): o canvas é maior e transborda a caixa. */
const ESCALA_CANVAS = 132 / 68;

type Props = {
  estado?: EstadoPerola;
  /** Diâmetro do anel em px. */
  tamanho?: number;
  /** Volume do microfone ou da voz (0 a 1), quando houver. */
  volume?: number;
  /** Mantido por compatibilidade: o anel já tem brilho próprio no escuro. */
  brilho?: boolean;
  className?: string;
};

export default function Perola({ estado = "ocioso", tamanho = 44, volume = 0, className = "" }: Props) {
  const caixa = useRef<HTMLSpanElement>(null);
  const [fundo, setFundo] = useState<"claro" | "escuro">("escuro");
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const cor = getComputedStyle(el).getPropertyValue("--fundo").trim().toLowerCase();
    setFundo(cor.startsWith("#f") || cor.startsWith("#e") ? "claro" : "escuro");
  }, []);
  const estadoAnel: EstadoAgente = estado === "ocioso" ? "ouvindo" : estado;
  const canvas = Math.round(tamanho * ESCALA_CANVAS);
  return (
    <span
      ref={caixa}
      role="img"
      aria-label={ROTULO[estado]}
      data-estado={estado}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: tamanho, height: tamanho }}
    >
      <span className="pointer-events-none absolute" style={{ width: canvas, height: canvas }}>
        <OndaDeVoz estado={estadoAnel} volume={estado === "ocioso" ? 0 : volume} tamanho={canvas} fundo={fundo} />
      </span>
    </span>
  );
}

/** As barras de voz (legenda, cartões ao vivo): bem devagar, só transform anima. Usam a cor do texto onde estão. */
export function BarrasDeVoz({
  ativo = true,
  n = 7,
  altura = 20,
  largura = 3,
  className = "",
}: {
  ativo?: boolean;
  n?: number;
  altura?: number;
  largura?: number;
  className?: string;
}) {
  return (
    <span aria-hidden className={`flex items-center ${className}`} style={{ gap: largura + 1, height: altura }}>
      {Array.from({ length: n }, (_, j) => (
        <span
          key={j}
          className="rounded-full"
          style={{
            width: largura,
            height: altura,
            background: ativo ? "currentColor" : "color-mix(in srgb, currentColor 25%, transparent)",
            // 3,6s a 5,4s por ciclo, defasadas: um respiro lento, não um equalizador.
            animation: ativo ? `barra ${(3.6 + ((j * 37) % 7) * 0.3).toFixed(2)}s ease-in-out ${((j * 0.53) % 2.4).toFixed(2)}s infinite` : undefined,
            transform: ativo ? undefined : "scaleY(.3)",
          }}
        />
      ))}
    </span>
  );
}
