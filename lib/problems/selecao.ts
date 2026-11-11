/**
 * Escolha da questão a partir da config da vaga (o que a recrutadora estipulou na pré-entrevista).
 *
 * 1. Nível: `difficulty` da config, ou o da senioridade (júnior = fácil; pleno e sênior = médio).
 * 2. Afinidade: cada questão serve melhor a certos focos (ex.: escala → as que pedem pensar em custo).
 *    Soma-se o peso dos focos da vaga que a questão atende; vence quem somar mais.
 * 3. Empate: no plano, desempata por um hash estável do cargo; na entrevista, sorteia entre as empatadas
 *    a cada candidato (`sortearProblema`).
 *
 * Só usa o banco público (`lib/problems.ts`), então roda no servidor e no navegador.
 */
import type { FocusArea } from "@/lib/contracts";
import { difficultyForSeniority, problemsByDifficulty, type Difficulty, type PublicProblem } from "@/lib/problems";

/** Que focos cada questão do banco ajuda a medir. */
export const AFINIDADE: Record<string, FocusArea[]> = {
  "two-sum": ["tecnico", "escala_produto", "uso_ia"],
  "best-time-stock": ["tecnico", "pressao"],
  "valid-parentheses": ["tecnico", "pressao", "uso_ia"],
  "binary-search": ["tecnico", "pressao"],
  "climbing-stairs": ["tecnico", "uso_ia"],
  "top-k-frequent": ["escala_produto", "tecnico", "uso_ia"],
  "maximum-subarray": ["tecnico", "escala_produto", "uso_ia"],
  "daily-temperatures": ["escala_produto", "tecnico"],
  "longest-substring-no-repeat": ["escala_produto", "tecnico", "pressao"],
  "search-rotated": ["tecnico", "pressao"],
};

export interface CriterioSelecao {
  seniority: "junior" | "pleno" | "senior";
  focus: { area: FocusArea; weight: number }[];
  difficulty?: Difficulty;
  /** Qualquer texto estável da vaga (cargo), só para desempatar. */
  semente?: string;
}

function hash(texto: string): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Pontuação de uma questão para os focos da vaga. */
export function pontuar(problemId: string, focus: CriterioSelecao["focus"]): number {
  const areas = AFINIDADE[problemId] ?? [];
  return focus.reduce((soma, f) => soma + (areas.includes(f.area) ? f.weight : 0), 0);
}

/** As questões do nível que mais servem aos focos da vaga (empatadas na pontuação máxima). */
export function questoesDaVaga(c: Omit<CriterioSelecao, "semente">): PublicProblem[] {
  const nivel = c.difficulty ?? difficultyForSeniority(c.seniority);
  const candidatas = problemsByDifficulty[nivel];
  const pontos = candidatas.map((p) => pontuar(p.id, c.focus));
  const melhor = Math.max(...pontos);
  return candidatas.filter((_, i) => Math.abs(pontos[i] - melhor) < 1e-9);
}

/** Escolha estável: a mesma vaga cai sempre na mesma questão (usada para o plano da pré-entrevista). */
export function selecionarProblema(c: CriterioSelecao): PublicProblem {
  const empatadas = questoesDaVaga(c);
  return empatadas[hash(c.semente ?? "") % empatadas.length];
}

/**
 * Sorteio por entrevista: cada candidato da vaga recebe uma das questões que servem à vaga, ao acaso.
 * Evita que a questão vaze entre candidatos sem fugir do nível e do foco combinados.
 */
export function sortearProblema(c: Omit<CriterioSelecao, "semente">, aleatorio: () => number = Math.random): PublicProblem {
  const empatadas = questoesDaVaga(c);
  return empatadas[Math.floor(aleatorio() * empatadas.length)];
}

// ---------------------------------------------------------------------------
// Questão pedida pela recrutadora
// ---------------------------------------------------------------------------

/**
 * Outros nomes de cada questão do banco, além do id e do título: o nome em inglês (como aparece no LeetCode) e o
 * jeito como se fala em português. Escritos sem acento e em minúsculas, como `normalizarPedido` deixa o texto.
 */
export const APELIDOS: Record<string, string[]> = {
  "two-sum": ["two sum", "twosum", "2 sum", "soma de dois", "soma de dois numeros", "soma dois", "dois numeros que somam"],
  "best-time-stock": ["best time to buy and sell stock", "best time to buy and sell", "comprar e vender acoes", "compra e venda de acoes", "melhor momento para comprar e vender"],
  "valid-parentheses": ["valid parentheses", "parenteses validos", "parenteses", "parenteses balanceados", "balanceamento de parenteses"],
  "binary-search": ["binary search", "busca binaria", "pesquisa binaria"],
  "climbing-stairs": ["climbing stairs", "subindo escadas", "subir escadas", "escada", "escadas"],
  "top-k-frequent": ["top k frequent", "top k frequent elements", "top k", "k mais frequentes", "k elementos mais frequentes", "elementos mais frequentes"],
  "maximum-subarray": ["maximum subarray", "max subarray", "subarray de soma maxima", "soma maxima", "kadane"],
  "daily-temperatures": ["daily temperatures", "temperaturas diarias", "temperatura diaria"],
  "longest-substring-no-repeat": ["longest substring without repeating characters", "longest substring", "maior substring sem repeticao", "substring sem repeticao", "maior substring"],
  "search-rotated": ["search in rotated sorted array", "rotated sorted array", "busca em array rotacionado", "array rotacionado", "vetor rotacionado"],
};

/** Minúsculas, sem acento, sem pontuação e com espaços simples. "Parênteses válidos!" vira "parenteses validos". */
export function normalizarPedido(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Os nomes de uma questão (id, título e apelidos), já normalizados, do mais longo ao mais curto. */
function nomesDa(p: PublicProblem): string[] {
  return [...new Set([p.id, p.title, ...(APELIDOS[p.id] ?? [])].map(normalizarPedido))].sort((a, b) => b.length - a.length);
}

/** Onde um nome aparece no texto, como palavra inteira, ou -1. */
function posicaoDoNome(texto: string, nome: string): number {
  return ` ${texto} `.indexOf(` ${nome} `);
}

/**
 * A questão do banco que um texto nomeia, ou undefined. Casa id, título em português e apelidos (em inglês e em
 * português), sem acento e sem caixa: "Two sum", "two-sum", "soma de dois", "parênteses válidos". Se o texto nomeia
 * mais de uma, vence o nome mais longo (o mais específico). Função pura.
 */
export function resolverProblemaPedido(texto: string | undefined): PublicProblem | undefined {
  if (!texto) return undefined;
  const t = normalizarPedido(texto);
  if (!t) return undefined;
  let melhor: { p: PublicProblem; tamanho: number } | undefined;
  for (const nivel of Object.values(problemsByDifficulty)) {
    for (const p of nivel) {
      const nome = nomesDa(p).find((n) => posicaoDoNome(t, n) >= 0);
      if (nome && (!melhor || nome.length > melhor.tamanho)) melhor = { p, tamanho: nome.length };
    }
  }
  return melhor?.p;
}

/** Os títulos do banco com o id, para o extrator escolher um id que existe ("two-sum: Two Sum"). */
export function titulosDoBanco(): string[] {
  return Object.values(problemsByDifficulty)
    .flat()
    .map((p) => `${p.id}: ${p.title}`);
}

/**
 * Questões para oferecer quando a pedida não existe: as do nível da vaga, das que mais servem ao foco para as que
 * menos servem, com desempate estável pelo título. Função pura.
 */
export function alternativasDoNivel(c: Omit<CriterioSelecao, "semente">, quantas = 3): PublicProblem[] {
  const nivel = c.difficulty ?? difficultyForSeniority(c.seniority);
  return [...problemsByDifficulty[nivel]]
    .sort((a, b) => pontuar(b.id, c.focus) - pontuar(a.id, c.focus) || a.title.localeCompare(b.title))
    .slice(0, quantas);
}
