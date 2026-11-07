// Sorteio determinístico para os dados de demonstração: a mesma semente gera sempre os mesmos
// números, então a vaga com 70 mil inscritos é igual em toda visita sem guardar nada no navegador.

/** Número de 32 bits a partir de um texto (FNV-1a). */
export function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gerador mulberry32: devolve uma função que sorteia números em [0, 1). */
export function sorteador(s: number) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const escolher = <T,>(r: () => number, lista: readonly T[]): T => lista[Math.floor(r() * lista.length)];
export const entre = (r: () => number, min: number, max: number) => Math.floor(min + r() * (max - min + 1));
