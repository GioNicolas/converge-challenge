"use client";

// Revelar ao rolar: o bloco sobe 14px e aparece quando entra na tela (480ms, "entrar na tela").
// `atraso` em segundos faz a cascata (60ms entre itens). Com "reduzir movimento", aparece direto.
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Revelar({
  children,
  atraso = 0,
  className = "",
  como: Tag = "div",
}: {
  children: ReactNode;
  atraso?: number;
  className?: string;
  como?: "div" | "section" | "li" | "ul";
}) {
  const ref = useRef<HTMLElement>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      setVisto(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisto(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        opacity: visto ? 1 : 0,
        transform: visto ? "none" : "translateY(14px)",
        transition: `opacity 480ms var(--curva-saida) ${atraso}s, transform 600ms var(--curva-saida) ${atraso}s`,
      }}
    >
      {children}
    </Tag>
  );
}
