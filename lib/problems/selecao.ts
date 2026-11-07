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
