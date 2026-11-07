"use client";

// O check desenhado: o círculo enche e o traço se completa (o mesmo gesto dos requisitos no quadro).
import { motion, useReducedMotion } from "motion/react";

export default function Check({ tamanho = 18 }: { tamanho?: number }) {
  const reduzido = useReducedMotion() ?? false;
  return (
    <motion.svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      aria-hidden
      initial={reduzido ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 26 }}
    >
      <circle cx="10" cy="10" r="10" fill="var(--sucesso)" />
      <motion.path
        d="M5.8 10.4 L8.7 13.2 L14.4 7.2"
        fill="none"
        stroke="var(--fundo)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduzido ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.32, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
      />
    </motion.svg>
  );
}
