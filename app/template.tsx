"use client";

import { useState } from "react";

// Entre páginas, o conteúdo chega subindo um pouco (480ms, "entrar na tela"). O template remonta a cada
// navegação, então a animação roda sempre. Ao terminar, a classe sai: sem transform residual que quebraria
// `position: fixed` nos filhos. O estado final da animação já é o do elemento sem ela.
export default function Template({ children }: { children: React.ReactNode }) {
  const [animando, setAnimando] = useState(true);
  return (
    <div
      className={animando ? "anim-subir" : undefined}
      style={animando ? { animationDuration: "0.5s" } : undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setAnimando(false);
      }}
    >
      {children}
    </div>
  );
}
