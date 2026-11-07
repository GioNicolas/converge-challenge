import type { Caixa, Ponto } from "./tipos";

export function limitar(valor: number, minimo = 0, maximo = 1): number {
  return Number.isNaN(valor) ? minimo : Math.max(minimo, Math.min(maximo, valor));
}

/** Gerador local mulberry32; nenhuma amostra depende do relógio ou de estado global. */
export function aleatorioComSemente(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let valor = Math.imul(estado ^ (estado >>> 15), estado | 1);
    valor ^= valor + Math.imul(valor ^ (valor >>> 7), valor | 61);
    return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizarCaixa(c: Caixa): Caixa {
  return {
    x: Math.min(c.x, c.x + c.largura),
    y: Math.min(c.y, c.y + c.altura),
    largura: Math.abs(c.largura),
    altura: Math.abs(c.altura),
  };
}

export function centro(c: Caixa): Ponto {
  return { x: c.x + c.largura / 2, y: c.y + c.altura / 2 };
}

export function bezier(a: Ponto, b: Ponto, c: Ponto, d: Ponto, t: number): Ponto {
  const s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y,
  };
}
