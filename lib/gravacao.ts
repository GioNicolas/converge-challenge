/**
 * Leitura da gravação da sessão no relatório (navegador): o código num minuto, o que mudou e o que foi falado.
 * Funções puras sobre o contrato `Gravacao`.
 */
import type { Gravacao } from "@/lib/contracts";

/** Janela da conversa em volta de um momento: o que levou a ele e o que veio logo depois. */
export const CONVERSA_ANTES_MS = 120_000;
export const CONVERSA_DEPOIS_MS = 60_000;

export type VersaoCodigo = Gravacao["codigo"][number];

/** A versão do código que estava na tela no instante `t` (a última salva até ali), e a anterior a ela. */
export function versaoEm(g: Gravacao, t: number): { atual?: VersaoCodigo; anterior?: VersaoCodigo } {
  let i = -1;
  for (let k = 0; k < g.codigo.length && g.codigo[k].t <= t; k++) i = k;
  return { atual: g.codigo[i], anterior: i > 0 ? g.codigo[i - 1] : undefined };
}

/**
 * Linhas de `atual` (índice a partir de 0) que não estavam em `anterior`: o que ele tinha acabado de escrever.
 * Maior subsequência comum por linha; o código de uma entrevista é pequeno, então O(n·m) basta.
 */
export function linhasNovas(anterior: string | undefined, atual: string): Set<number> {
  const b = atual.split("\n");
  if (anterior === undefined) return new Set();
  const a = anterior.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const novas = new Set<number>();
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      if (b[j].trim() !== "") novas.add(j);
      j++;
    }
  }
  return novas;
}

export type ItemConversa =
  | { tipo: "fala"; t: number; role: "candidate" | "agent"; text: string }
  | { tipo: "marco"; t: number; text: string };

/** Falas e marcos em volta de `t`, em ordem de tempo. */
export function conversaPerto(g: Gravacao, t: number): ItemConversa[] {
  const dentro = (x: number) => x >= t - CONVERSA_ANTES_MS && x <= t + CONVERSA_DEPOIS_MS;
  const itens: ItemConversa[] = [
    ...g.falas.filter((f) => dentro(f.t)).map((f) => ({ tipo: "fala" as const, ...f })),
    ...g.marcos.filter((m) => dentro(m.t)).map((m) => ({ tipo: "marco" as const, ...m })),
    ...g.execucoes
      .filter((e) => dentro(e.t))
      .map((e) => ({ tipo: "marco" as const, t: e.t, text: `Rodou o código: ${e.passed}/${e.total} testes passaram` })),
  ];
  return itens.sort((x, y) => x.t - y.t);
}

/** O item mais perto de `t`: é ele que fica em destaque. */
export function maisPerto(itens: ItemConversa[], t: number): ItemConversa | undefined {
  let melhor: ItemConversa | undefined;
  for (const item of itens) {
    if (!melhor || Math.abs(item.t - t) < Math.abs(melhor.t - t)) melhor = item;
  }
  return melhor;
}

/** A última execução até `t`. */
export function execucaoAte(g: Gravacao, t: number): Gravacao["execucoes"][number] | undefined {
  return g.execucoes.filter((e) => e.t <= t).at(-1);
}
