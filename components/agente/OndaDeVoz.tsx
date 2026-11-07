"use client";

// Versão B, onda de voz: um anel fino de luz que ondula com a fala.
// Pensando: um arco mais claro percorre o anel. Dúvida: o anel fica azul e um ponto pulsa no centro.
// O desenho é feito num espaço de 132×132 e escalado para o `tamanho` pedido (ex.: 30 na pílula minimizada).
import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useLacoDeEnergia, type EstadoAgente } from "@/lib/presenca/energia";

const LADO = 132;
const RAIO = 34;
const PONTOS = 180;

export default function OndaDeVoz({
  estado,
  volume = 0,
  tamanho = LADO,
}: {
  estado: EstadoAgente;
  volume?: number;
  tamanho?: number;
}) {
  const reduzido = useReducedMotion() ?? false;
  const tela = useRef<HTMLCanvasElement>(null);

  useLacoDeEnergia(
    estado,
    volume,
    (energia, t) => {
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
      const duvida = estado === "duvida";
      const cor = duvida ? "64,170,255" : "255,255,255";
      const brilho = duvida ? "rgba(10,132,255,.9)" : "rgba(120,180,255,.75)";

      // Brilho interno suave
      const g = ctx.createRadialGradient(c, c, 0, c, c, RAIO * 1.6);
      g.addColorStop(0, `rgba(${duvida ? "10,132,255" : "90,150,255"},${0.1 + energia * 0.25})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LADO, LADO);

      const anel = (fase: number, escala: number, alfa: number, largura: number) => {
        ctx.beginPath();
        for (let i = 0; i <= PONTOS; i++) {
          const a = (i / PONTOS) * Math.PI * 2;
          const onda =
            Math.sin(4 * a + t * 3.1 + fase) * 0.55 +
            Math.sin(7 * a - t * 2.3 + fase * 2) * 0.3 +
            Math.sin(11 * a + t * 4.2) * 0.15;
          const r = RAIO * escala * (1 + energia * 0.1) + onda * (1 + energia * 9);
          const x = c + r * Math.cos(a);
          const y = c + r * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${cor},${alfa})`;
        ctx.lineWidth = Math.max(largura, 1.1 / k); // pelo menos ~1px na tela, mesmo pequeno
        ctx.shadowColor = brilho;
        ctx.shadowBlur = 10 + energia * 14;
        ctx.stroke();
      };
      anel(1.7, 1.12, 0.22 + energia * 0.2, 1);
      anel(0, 1, 0.95, 1.8);

      // Pensando: um arco claro percorrendo o anel
      if (estado === "pensando") {
        const inicio = t * 3;
        ctx.beginPath();
        ctx.arc(c, c, RAIO * 1.0, inicio, inicio + 1.1);
        ctx.strokeStyle = "rgba(255,255,255,1)";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 18;
        ctx.stroke();
      }

      // Dúvida: um ponto que pulsa no centro
      if (duvida) {
        const p = 3 + 2.5 * Math.max(0, Math.sin(t * 2.4));
        ctx.beginPath();
        ctx.arc(c, c, p, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,.95)";
        ctx.shadowBlur = 16;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    },
    reduzido,
  );

  return <canvas ref={tela} aria-hidden style={{ width: tamanho, height: tamanho }} />;
}
