"use client";

// Legenda ao vivo, centralizada embaixo: o que o agente está falando (e, depois, a transcrição do candidato).
import { AnimatePresence, motion } from "motion/react";
import type { FalaRecente } from "@/lib/sessao/cliente";

export default function Legenda({ fala }: { fala: FalaRecente | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
      <AnimatePresence mode="wait">
        {fala && (
          <motion.p
            key={fala.texto}
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className={`line-clamp-2 max-w-[640px] rounded-[14px] bg-vidro-escuro px-4 py-2.5 text-center text-[15px] leading-snug shadow-flutuante backdrop-blur-xl ${
              fala.quem === "agente" ? "text-texto-claro" : "text-texto-claro/70"
            }`}
          >
            {fala.texto}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
