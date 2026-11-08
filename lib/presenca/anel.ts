// A forma do anel do Totti: um "círculo" desenhado à mão, com as mesmas imperfeições em todo lugar
// (a onda de voz da chamada, o arco do "pensando" e o carregando). Mudou aqui, muda em todos.

/** Tamanhos padrão do Totti, em px. Use o nome em vez do número para manter tudo igual pelo app. */
export const TAMANHOS_TOTTI = {
  /** Dentro de texto ou de botão (no lugar de um spinner). */
  xs: 16,
  /** Ao lado de um rótulo, em linha de lista, chip. */
  sm: 24,
  /** Avatar: pílula minimizada da chamada, bolha de conversa. */
  md: 32,
  /** Destaque numa página ou num cartão vazio ("lendo a vaga…"). */
  lg: 72,
  /** Quadro principal da chamada. */
  xl: 124,
} as const;

export type TamanhoTotti = keyof typeof TAMANHOS_TOTTI;

/** Aceita o nome do tamanho ("md") ou um número em px. */
export function emPixels(tamanho: TamanhoTotti | number): number {
  return typeof tamanho === "number" ? tamanho : TAMANHOS_TOTTI[tamanho];
}

/**
 * Quanto o anel sai do círculo no ângulo `a` (de -1 a 1).
 * `fase` faz as ondas andarem com o tempo; `deslocamento` gera um anel "irmão" com a mesma família de forma.
 * Só usa frequências inteiras, então dá a volta fechada e vale para qualquer ângulo (inclusive > 2π).
 */
export function ondulacao(a: number, fase: number, deslocamento = 0): number {
  return (
    Math.sin(4 * a + fase * 3.1 + deslocamento) * 0.55 +
    Math.sin(7 * a - fase * 2.3 + deslocamento * 2) * 0.3 +
    Math.sin(11 * a + fase * 4.2) * 0.15
  );
}

/** Traça (sem pintar) o anel de `inicio` a `fim`, com o raio de cada ângulo dado por `raio(a)`. */
export function tracarAnel(
  ctx: CanvasRenderingContext2D,
  centro: number,
  raio: (a: number) => number,
  inicio = 0,
  fim = Math.PI * 2,
) {
  // ~29 pontos por radiano: a volta inteira dá os mesmos 180 pontos de antes.
  const pontos = Math.max(8, Math.ceil((Math.abs(fim - inicio) * 180) / (Math.PI * 2)));
  ctx.beginPath();
  for (let i = 0; i <= pontos; i++) {
    const a = inicio + ((fim - inicio) * i) / pontos;
    const r = raio(a);
    const x = centro + r * Math.cos(a);
    const y = centro + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}
