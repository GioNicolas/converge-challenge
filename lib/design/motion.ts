// Tokens de movimento para uso no `motion` (JS). Espelham docs/design.md §6
// e as variáveis de app/globals.css. Mudou aqui? Mude lá também.

export const curvaSuave = [0.32, 0.72, 0, 1] as const;
export const curvaSaida = [0.22, 1, 0.36, 1] as const;

// Em segundos (padrão do `motion`).
export const duracaoRapida = 0.16;
export const duracao = 0.28;
export const duracaoLenta = 0.48;

// Arrastar e soltar a janela, encaixar no canto.
export const mola = { type: "spring", stiffness: 400, damping: 32 } as const;

// Entrada padrão: fade + subida curta + leve escala. Só transform e opacity.
export const entrada = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.98 },
  transition: { duration: duracao, ease: curvaSuave },
} as const;
