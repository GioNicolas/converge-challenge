"use client";

// Versão C, avatar de chamada: como um participante de câmera desligada no Meet.
// Um círculo com a marca do agente; anéis suaves se abrem quando ele fala ou ouve;
// na dúvida, um selo de notificação aparece no canto.
import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLacoDeEnergia, type EstadoAgente } from "@/lib/presenca/energia";

const LADO = 76;

export default function AvatarChamada({ estado, volume = 0 }: { estado: EstadoAgente; volume?: number }) {
  const reduzido = useReducedMotion() ?? false;
  const aneis = useRef<(HTMLSpanElement | null)[]>([]);
  const marca = useRef<HTMLSpanElement>(null);
  const duvida = estado === "duvida";

  useLacoDeEnergia(
    estado,
    volume,
    (energia, t) => {
      aneis.current.forEach((el, i) => {
        if (!el) return;
        const escala = 1 + energia * (0.22 + i * 0.2);
        el.style.transform = `scale(${escala.toFixed(3)})`;
        el.style.opacity = Math.min(0.9, energia * (1.2 - i * 0.35)).toFixed(3);
      });
      if (marca.current) {
        const giro = estado === "pensando" ? t * 90 : 0;
        marca.current.style.transform = `rotate(${giro.toFixed(1)}deg) scale(${(1 + energia * 0.04).toFixed(3)})`;
      }
    },
    reduzido,
  );

  return (
    <div className="relative flex items-center justify-center" style={{ width: LADO + 56, height: LADO + 56 }}>
      {[0, 1].map((i) => (
        <span
          key={i}
          ref={(el) => {
            aneis.current[i] = el;
          }}
          aria-hidden
          className="absolute rounded-full border-[1.5px] border-[#5aa9ff]"
          style={{ width: LADO, height: LADO, opacity: 0 }}
        />
      ))}

      <span
        className="relative flex items-center justify-center rounded-full bg-[linear-gradient(145deg,#3d8bff,#1d4fd8_55%,#5b3fd6)] shadow-[0_6px_20px_rgba(29,79,216,.45),inset_0_1px_0_rgba(255,255,255,.35)]"
        style={{ width: LADO, height: LADO }}
      >
        {/* A marca: uma estrela de quatro pontas (o "brilho" de IA), desenhada à mão em SVG */}
        <span ref={marca} className="block">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 2.5c.6 4.9 2.3 7.4 9.5 9.5-7.2 2.1-8.9 4.6-9.5 9.5-.6-4.9-2.3-7.4-9.5-9.5 7.2-2.1 8.9-4.6 9.5-9.5Z"
              fill="white"
            />
          </svg>
        </span>

        <AnimatePresence>
          {duvida && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="absolute -top-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#1d4fd8] shadow-padrao"
            >
              ?
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </div>
  );
}
