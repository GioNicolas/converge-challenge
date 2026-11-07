"use client";

// O entrevistador na tela: uma esfera de luz, clean e fluida (só CSS, sem WebGL).
// Dentro dela, manchas de cor desfocadas se movem devagar; um brilho de vidro fica por cima.
//   ouvindo  → cresce e acelera com o volume do microfone
//   falando  → pulsa no ritmo da fala
//   pensando → as cores giram mais rápido
//   duvida   → halo pulsando e o convite "Tenho uma pergunta" (o clique é o plin)
// Tudo é animado num laço só (requestAnimationFrame), mexendo em transform/opacity direto no DOM.
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type EstadoAgente = "ouvindo" | "pensando" | "falando" | "duvida";

const TAMANHO = 84;

/** Manchas de cor: tom, tamanho relativo e órbita (raio, velocidade, fase). */
const MANCHAS = [
  { cor: "#0071e3", tam: 0.95, raio: 0.18, vel: 0.35, fase: 0 },
  { cor: "#3fb6ff", tam: 0.75, raio: 0.26, vel: -0.47, fase: 2.1 },
  { cor: "#8e7bff", tam: 0.62, raio: 0.3, vel: 0.58, fase: 4.2 },
  { cor: "#7fe3ff", tam: 0.45, raio: 0.22, vel: -0.71, fase: 1.3 },
];

type Props = {
  estado: EstadoAgente;
  /** Volume do microfone (0 a 1), usado no "ouvindo". */
  volume?: number;
  onClicarDuvida?: () => void;
};

export default function AgentePresenca({ estado, volume = 0, onClicarDuvida }: Props) {
  const reduzido = useReducedMotion() ?? false;
  const corpo = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const manchas = useRef<(HTMLSpanElement | null)[]>([]);
  const estadoRef = useRef(estado);
  const volumeRef = useRef(volume);

  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    let raf = 0;
    let nivel = 0;
    let giro = 0;
    let anterior = performance.now();
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      const t = agora / 1000;

      // Nível de energia (0 a 1) que cada estado pede.
      let alvo = 0.12 + 0.05 * Math.sin(t * 1.1); // respirando
      let ritmo = 1;
      switch (estadoRef.current) {
        case "ouvindo":
          alvo = Math.max(alvo, Math.min(1, volumeRef.current * 2.2));
          break;
        case "falando":
          // Sílabas: dois senos que se cruzam dão um ritmo de fala, sem ficar mecânico.
          alvo = 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 0.7));
          ritmo = 1.8;
          break;
        case "pensando":
          alvo = 0.25;
          ritmo = 3.2;
          break;
        case "duvida":
          alvo = 0.3 + 0.2 * Math.max(0, Math.sin(t * 2.4));
          ritmo = 1.4;
          break;
      }
      if (reduzido) {
        alvo = 0.2;
        ritmo = 0;
      }
      nivel += (alvo - nivel) * Math.min(1, dt * 9);
      giro += dt * ritmo * (0.6 + nivel);

      if (corpo.current) corpo.current.style.transform = `scale(${(1 + nivel * 0.14).toFixed(4)})`;
      if (halo.current) {
        halo.current.style.opacity = (0.35 + nivel * 0.65).toFixed(3);
        halo.current.style.transform = `scale(${(1.05 + nivel * 0.35).toFixed(4)})`;
      }
      MANCHAS.forEach((m, i) => {
        const el = manchas.current[i];
        if (!el) return;
        const a = giro * m.vel * 2 + m.fase;
        const r = m.raio * TAMANHO * (1 + nivel * 0.6);
        const x = Math.cos(a) * r;
        const y = Math.sin(a * 1.3) * r;
        const s = 1 + nivel * 0.25 * Math.sin(a * 0.7 + i);
        el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(3)})`;
      });
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [reduzido]);

  const duvida = estado === "duvida";

  return (
    <button
      type="button"
      disabled={!duvida}
      onClick={duvida ? onClicarDuvida : undefined}
      aria-label={duvida ? "Ouvir a pergunta do entrevistador" : "Entrevistador"}
      className={`group relative flex flex-col items-center gap-3 ${duvida ? "cursor-pointer" : "cursor-default"}`}
    >
      <span className="relative block" style={{ width: TAMANHO, height: TAMANHO }}>
        {/* Halo de luz em volta, que cresce com a energia */}
        <div
          ref={halo}
          aria-hidden
          className="absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgba(63,182,255,.45),rgba(0,113,227,.18)_45%,transparent_70%)] blur-md"
        />

        {/* Na dúvida: anel pulsando para fora */}
        {duvida && !reduzido && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-[#3fb6ff]"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: [1, 1.55], opacity: [0.8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {/* A esfera: manchas de cor desfocadas dentro de um círculo, com brilho de vidro por cima */}
        <div
          ref={corpo}
          className="absolute inset-0 overflow-hidden rounded-full bg-[#0b3d91] shadow-[0_8px_28px_rgba(0,113,227,.45),inset_0_0_0_1px_rgba(255,255,255,.18)] transition-transform group-active:scale-95"
        >
          {MANCHAS.map((m, i) => (
            <span
              key={i}
              ref={(el) => {
                manchas.current[i] = el;
              }}
              aria-hidden
              className="absolute top-1/2 left-1/2 rounded-full blur-[14px]"
              style={{ width: TAMANHO * m.tam, height: TAMANHO * m.tam, background: m.cor, opacity: 0.9 }}
            />
          ))}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,.55),rgba(255,255,255,0)_42%)]"
          />
        </div>
      </span>

      <AnimatePresence>
        {duvida && (
          <motion.span
            initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -2, filter: "blur(4px)" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="absolute top-full mt-3 rounded-full bg-white/95 px-3 py-1 text-[12px] font-medium whitespace-nowrap text-[#0b3d91] shadow-padrao"
          >
            Tenho uma pergunta
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
