"use client";

// Versão D, onda colorida: três ondas de luz que se somam (como a Siri), sobre uma linha fina.
// Parado, quase uma linha; falando ou ouvindo, as ondas crescem e se cruzam.
import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useLacoDeEnergia, type EstadoAgente } from "@/lib/presenca/energia";

const LARGURA = 220;
const ALTURA = 96;

const ONDAS = [
  { cor: "47,124,246", freq: 1.6, vel: 2.4, fase: 0, amp: 1 },
  { cor: "100,210,255", freq: 2.3, vel: -3.1, fase: 1.7, amp: 0.8 },
  { cor: "155,140,255", freq: 1.2, vel: 1.7, fase: 3.4, amp: 0.65 },
];

export default function OndaSiri({ estado, volume = 0 }: { estado: EstadoAgente; volume?: number }) {
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
      if (canvas.width !== LARGURA * dpr) {
        canvas.width = LARGURA * dpr;
        canvas.height = ALTURA * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LARGURA, ALTURA);
      const meio = ALTURA / 2;
      const duvida = estado === "duvida";

      // Envelope: as ondas morrem nas pontas (forma de "lente").
      const envelope = (x: number) => {
        const u = (x / LARGURA) * 2 - 1;
        return Math.pow(1 - u * u, 2.2);
      };

      ctx.globalCompositeOperation = "lighter";
      ONDAS.forEach((o, i) => {
        const amp = (4 + energia * 34) * o.amp * (duvida && i === 0 ? 1.15 : 1);
        ctx.beginPath();
        ctx.moveTo(0, meio);
        for (let x = 0; x <= LARGURA; x += 2) {
          const y = meio + Math.sin((x / LARGURA) * Math.PI * 2 * o.freq + t * o.vel + o.fase) * amp * envelope(x);
          ctx.lineTo(x, y);
        }
        for (let x = LARGURA; x >= 0; x -= 2) {
          const y = meio - Math.sin((x / LARGURA) * Math.PI * 2 * o.freq + t * o.vel + o.fase) * amp * envelope(x) * 0.35;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        const cor = duvida && i === 0 ? "10,132,255" : o.cor;
        const g = ctx.createLinearGradient(0, 0, LARGURA, 0);
        g.addColorStop(0, `rgba(${cor},0)`);
        g.addColorStop(0.5, `rgba(${cor},${0.55 + energia * 0.3})`);
        g.addColorStop(1, `rgba(${cor},0)`);
        ctx.fillStyle = g;
        ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";

      // Linha central fina
      const linha = ctx.createLinearGradient(0, 0, LARGURA, 0);
      linha.addColorStop(0, "rgba(255,255,255,0)");
      linha.addColorStop(0.5, "rgba(255,255,255,.9)");
      linha.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      for (let x = 0; x <= LARGURA; x += 2) {
        const y = meio + Math.sin((x / LARGURA) * Math.PI * 4 + t * 2) * energia * 3 * envelope(x);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = linha;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Pensando: um ponto de luz que corre pela linha
      if (estado === "pensando") {
        const x = LARGURA / 2 + Math.sin(t * 2.2) * LARGURA * 0.32;
        const g = ctx.createRadialGradient(x, meio, 0, x, meio, 18);
        g.addColorStop(0, "rgba(255,255,255,.95)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 18, meio - 18, 36, 36);
      }
    },
    reduzido,
  );

  return <canvas ref={tela} aria-hidden style={{ width: LARGURA, height: ALTURA }} />;
}
