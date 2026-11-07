"use client";

// Check de caixa marcada: o quadrado enche e o traço se completa, como uma caneta.
import { motion, useReducedMotion } from "motion/react";

export default function Check({ tamanho = 16, marcado = true }: { tamanho?: number; marcado?: boolean }) {
  const reduzido = useReducedMotion() ?? false;
  if (!marcado) {
    return (
      <span
        aria-hidden
        className="block rounded-[3px] border-[1.5px] border-texto/25"
        style={{ width: tamanho, height: tamanho }}
      />
    );
  }
  return (
    <motion.svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 16 16"
      aria-hidden
      initial={reduzido ? false : { scale: 0.7 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 26 }}
    >
      <rect width="16" height="16" rx="3" fill="var(--texto)" />
      <motion.path
        d="M4.2 8.3 L6.9 10.9 L11.9 5.4"
        fill="none"
        stroke="var(--superficie)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduzido ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.08, ease: [0.32, 0.72, 0, 1] }}
      />
    </motion.svg>
  );
}
