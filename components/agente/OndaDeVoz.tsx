"use client";

// O entrevistador na chamada: um anel fino de luz que ondula com a voz.
//   ouvindo  → calmo e lento, branco, seguindo de leve o microfone do candidato
//   falando  → mais vivo e rápido, azul
//   pensando → branco, com um arco claro percorrendo o anel
//   duvida   → azul, calmo, chamando atenção sem agitar
// Ritmo, amplitude e cor mudam aos poucos entre um estado e outro (nada "pula").
// O desenho é feito num espaço de 132×132 e escalado para o `tamanho` pedido (ex.: 32 na pílula minimizada).
import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useLacoDeEnergia, type EstadoAgente } from "@/lib/presenca/energia";

const LADO = 132;
const RAIO = 34;
const PONTOS = 180;

type Cor = [number, number, number];
const BRANCO: Cor = [255, 255, 255];
const AZUL: Cor = [64, 156, 255];
const BRILHO_CLARO: Cor = [120, 180, 255];
const BRILHO_AZUL: Cor = [10, 132, 255];

type Jeito = Record<EstadoAgente, { velocidade: number; amplitude: number; cor: Cor; brilho: Cor }>;

/** Como cada estado se mexe: velocidade das ondas, quanto a energia abre o anel e a cor (fundo escuro). */
const JEITO: Jeito = {
  ouvindo: { velocidade: 0.45, amplitude: 0.55, cor: BRANCO, brilho: BRILHO_CLARO },
  falando: { velocidade: 1.25, amplitude: 1.15, cor: AZUL, brilho: BRILHO_AZUL },
  pensando: { velocidade: 0.7, amplitude: 0.6, cor: BRANCO, brilho: BRILHO_CLARO },
  duvida: { velocidade: 0.55, amplitude: 0.8, cor: AZUL, brilho: BRILHO_AZUL },
};

/** Fundo claro: o anel vira grafite (traço de caneta) e, falando, o azul da marca; brilho bem leve. */
const GRAFITE: Cor = [27, 29, 31];
const AZUL_CLARO: Cor = [0, 130, 243];
const JEITO_CLARO: Jeito = {
  ouvindo: { ...JEITO.ouvindo, cor: GRAFITE, brilho: [180, 180, 175] },
  falando: { ...JEITO.falando, cor: AZUL_CLARO, brilho: [120, 180, 240] },
  pensando: { ...JEITO.pensando, cor: GRAFITE, brilho: [180, 180, 175] },
  duvida: { ...JEITO.duvida, cor: AZUL_CLARO, brilho: [120, 180, 240] },
};

const mistura = (a: number, b: number, k: number) => a + (b - a) * k;
const rgb = (c: Cor) => c.map((v) => Math.round(v)).join(",");

export default function OndaDeVoz({
  estado,
  volume = 0,
  tamanho = LADO,
  fundo = "escuro",
}: {
  estado: EstadoAgente;
  volume?: number;
  tamanho?: number;
  /** Cor do fundo onde o anel aparece. */
  fundo?: "escuro" | "claro";
}) {
  const jeitos = fundo === "claro" ? JEITO_CLARO : JEITO;
  const reduzido = useReducedMotion() ?? false;
  const tela = useRef<HTMLCanvasElement>(null);
  // Valores atuais, que vão chegando aos do estado aos poucos.
  const atual = useRef({
    fase: 0,
    velocidade: jeitos.ouvindo.velocidade,
    amplitude: jeitos.ouvindo.amplitude,
    cor: [...jeitos.ouvindo.cor] as Cor,
    brilho: [...jeitos.ouvindo.brilho] as Cor,
  });

  useLacoDeEnergia(
    estado,
    volume,
    (energia, t, dt) => {
      const canvas = tela.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const k = tamanho / LADO;
      if (canvas.width !== Math.round(tamanho * dpr)) {
        canvas.width = Math.round(tamanho * dpr);
        canvas.height = Math.round(tamanho * dpr);
      }
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, LADO, LADO);
      const c = LADO / 2;

      // Transição suave entre os estados (~0,5s).
      const alvo = jeitos[estado];
      const s = atual.current;
      const passo = Math.min(1, dt * 4);
      s.velocidade = mistura(s.velocidade, alvo.velocidade, passo);
      s.amplitude = mistura(s.amplitude, alvo.amplitude, passo);
      s.cor = s.cor.map((v, i) => mistura(v, alvo.cor[i], passo)) as Cor;
      s.brilho = s.brilho.map((v, i) => mistura(v, alvo.brilho[i], passo)) as Cor;
      // O "tempo" das ondas anda na velocidade do estado: ouvindo, devagar; falando, rápido.
      s.fase += dt * s.velocidade;
      const f = reduzido ? 0 : s.fase;
      const e = energia * s.amplitude;

      // Brilho interno suave, na cor do momento.
      const g = ctx.createRadialGradient(c, c, 0, c, c, RAIO * 1.6);
      g.addColorStop(0, `rgba(${rgb(s.brilho)},${0.08 + e * 0.22})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LADO, LADO);

      const anel = (deslocamento: number, escala: number, alfa: number, largura: number) => {
        ctx.beginPath();
        for (let i = 0; i <= PONTOS; i++) {
          const a = (i / PONTOS) * Math.PI * 2;
          const onda =
            Math.sin(4 * a + f * 3.1 + deslocamento) * 0.55 +
            Math.sin(7 * a - f * 2.3 + deslocamento * 2) * 0.3 +
            Math.sin(11 * a + f * 4.2) * 0.15;
          const r = RAIO * escala * (1 + e * 0.1) + onda * (1 + e * 9);
          const x = c + r * Math.cos(a);
          const y = c + r * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${rgb(s.cor)},${alfa})`;
        ctx.lineWidth = Math.max(largura, 1.1 / k); // pelo menos ~1px na tela, mesmo pequeno
        ctx.shadowColor = `rgba(${rgb(s.brilho)},.85)`;
        ctx.shadowBlur = 10 + e * 14;
        ctx.stroke();
      };
      anel(1.7, 1.12, 0.22 + e * 0.2, 1);
      anel(0, 1, 0.95, 1.8);

      // Pensando: um arco claro percorrendo o anel.
      if (estado === "pensando") {
        const inicio = t * 3;
        ctx.beginPath();
        ctx.arc(c, c, RAIO, inicio, inicio + 1.1);
        ctx.strokeStyle = fundo === "claro" ? "rgba(27,29,31,1)" : "rgba(255,255,255,1)";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 18;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    },
    reduzido,
  );

  return <canvas ref={tela} aria-hidden style={{ width: tamanho, height: tamanho }} />;
}
