"use client";

// Versão A, vidro líquido: uma gota de vidro transparente que muda de forma devagar,
// com luz colorida por trás (o vidro desfoca e satura o que está atrás dele), borda e reflexo.
import { useId, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useLacoDeEnergia, type EstadoAgente } from "@/lib/presenca/energia";

const LADO = 132;
const RAIO = 40;
const PONTOS = 72;

/** Contorno suave da gota: raio que varia com o ângulo e o tempo, fechado com curvas de Catmull-Rom. */
function contorno(t: number, energia: number) {
  const c = LADO / 2;
  const amp = 0.025 + energia * 0.09;
  const pts: [number, number][] = [];
  for (let i = 0; i < PONTOS; i++) {
    const a = (i / PONTOS) * Math.PI * 2;
    const r =
      RAIO *
      (1 + energia * 0.12) *
      (1 +
        amp * Math.sin(3 * a + t * 1.3) +
        amp * 0.7 * Math.sin(5 * a - t * 0.9 + 1.1) +
        amp * 0.5 * Math.sin(2 * a + t * 0.6 + 2.3));
    pts.push([c + r * Math.cos(a), c + r * Math.sin(a)]);
  }
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < PONTOS; i++) {
    const p0 = pts[(i - 1 + PONTOS) % PONTOS];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % PONTOS];
    const p3 = pts[(i + 2) % PONTOS];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0].toFixed(2)} ${c2[1].toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + " Z";
}

export default function VidroLiquido({ estado, volume = 0 }: { estado: EstadoAgente; volume?: number }) {
  const reduzido = useReducedMotion() ?? false;
  const id = useId().replace(/:/g, "");
  const vidro = useRef<HTMLDivElement>(null);
  const borda = useRef<SVGPathElement>(null);
  const preenchimento = useRef<SVGPathElement>(null);
  const luzes = useRef<(HTMLSpanElement | null)[]>([]);
  const duvida = estado === "duvida";

  useLacoDeEnergia(
    estado,
    volume,
    (energia, t) => {
      const d = contorno(t, energia);
      if (vidro.current) vidro.current.style.clipPath = `path('${d}')`;
      borda.current?.setAttribute("d", d);
      preenchimento.current?.setAttribute("d", d);
      // As luzes de trás giram devagar e se abrem com a energia: é o que o vidro "refrata".
      luzes.current.forEach((el, i) => {
        if (!el) return;
        const a = t * (0.4 + i * 0.17) + i * 2.1;
        const r = 10 + energia * 16;
        el.style.transform = `translate(-50%, -50%) translate(${(Math.cos(a) * r).toFixed(1)}px, ${(Math.sin(a * 1.2) * r).toFixed(1)}px) scale(${(0.9 + energia * 0.5).toFixed(3)})`;
      });
    },
    reduzido,
  );

  const cores = duvida ? ["#0a84ff", "#40c8ff", "#5e5ce6"] : ["#2f7cf6", "#6fd3ff", "#9b8cff"];

  return (
    <div className="relative" style={{ width: LADO, height: LADO }}>
      {/* Luzes por trás do vidro */}
      {cores.map((cor, i) => (
        <span
          key={i}
          ref={(el) => {
            luzes.current[i] = el;
          }}
          aria-hidden
          className="absolute top-1/2 left-1/2 size-[64px] rounded-full blur-[18px] transition-colors duration-500"
          style={{ background: cor, opacity: 0.85 }}
        />
      ))}

      {/* O vidro: desfoca e satura o que está atrás, recortado no contorno da gota */}
      <div
        ref={vidro}
        aria-hidden
        className="absolute inset-0 bg-white/[0.06] backdrop-blur-[10px] backdrop-saturate-[1.8]"
      />

      {/* Reflexos e borda do vidro */}
      <svg aria-hidden viewBox={`0 0 ${LADO} ${LADO}`} className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id={`p${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.04" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id={`b${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.15" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.6" />
          </linearGradient>
          <radialGradient id={`r${id}`} cx="0.36" cy="0.3" r="0.32">
            <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`c${id}`}>
            <path ref={preenchimento} />
          </clipPath>
        </defs>
        <g clipPath={`url(#c${id})`}>
          <rect width={LADO} height={LADO} fill={`url(#p${id})`} />
          <rect width={LADO} height={LADO} fill={`url(#r${id})`} />
        </g>
        <path ref={borda} fill="none" stroke={`url(#b${id})`} strokeWidth="1.2" />
      </svg>
    </div>
  );
}
