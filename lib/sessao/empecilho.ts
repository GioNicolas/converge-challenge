// Quando o Totti pode trazer a mudança no problema (o "empecilho") no quadro.
// Lógica pura, sem React: o navegador usa para saber a hora de pedir, e o servidor repete a checagem.
// O conteúdo da mudança fica no problema (kit ou gerado) no servidor; aqui só se decide o momento.
import { RITMO, RITMO_QUADRO } from "../interrupcao/politica";

export const REGRAS_EMPECILHO = {
  /** Visão geral: só depois dessa fração do tempo da fase (o candidato já montou uma direção). */
  fracaoMinimaAltoNivel: 0.4,
  /** Aprofundamento: só enquanto sobra pelo menos essa fração da fase (dá tempo de adaptar). */
  fracaoRestanteAprofundamento: 0.4,
  /** Sem algumas peças no quadro não há desenho para adaptar. */
  minimoComponentes: 3,
  /** Respiro depois da última fala do Totti. */
  respiroMs: 20_000,
  /**
   * Garantia (#129, decisão G): se até essa fração do tempo TOTAL da entrevista a mudança não saiu, os requisitos
   * relaxam: basta não haver pergunta ativa, uma pausa curta e pelo menos uma peça no quadro (a fração da fase e o
   * mínimo de peças deixam de valer). O piso entre perguntas continua valendo.
   */
  GARANTIA_A_PARTIR_DA_FRACAO: 0.6,
} as const;

export type SituacaoEmpecilho = {
  agora: number;
  fase: string;
  faseIniciadaEm: number | null;
  /** Duração da fase atual em segundos (ausente: fase sem limite). */
  duracaoDaFaseS?: number;
  jaAnunciado: boolean;
  /** O candidato está respondendo uma pergunta do Totti: não se corta a resposta. */
  respondendoPergunta: boolean;
  componentes: number;
  ultimaFalaDoAgenteEm: number | null;
  /** Quando a entrevista começou (ms). Com a duração total, dá a fração do tempo da garantia. Ausente/null: sem garantia. */
  iniciadaEm?: number | null;
  /** Duração total da entrevista em segundos. Ausente: sem garantia. */
  duracaoTotalS?: number;
  /** Quando a última pergunta do Totti saiu. Ausente/null: o piso entre perguntas não é checado. */
  ultimaPerguntaEm?: number | null;
  /**
   * Ele disse que terminou há pouco (ver `concluiuHaPouco`). Com a mudança ainda não anunciada, a conclusão conta como
   * brecha para ela: relaxa como a garantia dos 60% (#129, decisão F). O piso entre perguntas continua valendo.
   */
  conclusaoRecente?: boolean;
};

/** Ele disse que terminou no marco de conclusão (RITMO.marcoDeConclusaoMs): a hora natural para trazer a mudança. */
export function concluiuHaPouco(ultimaConclusaoEm: number | null | undefined, agora: number): boolean {
  return ultimaConclusaoEm != null && agora - ultimaConclusaoEm < RITMO.marcoDeConclusaoMs;
}

/**
 * O laço do navegador relaxa as pré-checagens da mudança (pausa com marco, nenhuma pergunta ativa) quando vale a
 * garantia dos 60% ou quando ele acabou de dizer que terminou (#129, decisão F). Nenhuma das duas: a regra de antes.
 */
export function relaxaPreChecagens(s: { garantia: boolean; ultimaConclusaoEm?: number | null; agora: number }): boolean {
  return s.garantia || concluiuHaPouco(s.ultimaConclusaoEm, s.agora);
}

/** Fases em que um empecilho forçado (demo) pode entrar: a entrevista precisa estar em andamento. */
export const FASES_EMPECILHO_FORCADO = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];

/** Peças desenhadas pelo candidato no grafo (formas, textos, desenhos e imagens; setas e molduras não contam). */
export function contarComponentes(grafo: string): number {
  return new Set([...grafo.matchAll(/^- \[([reltfi]\d+)\]/gm)].map((m) => m[1])).size;
}

/** Já passou da fração do tempo total em que a mudança passa a ser garantida (ver `GARANTIA_A_PARTIR_DA_FRACAO`). */
export function emGarantiaDoEmpecilho(s: Pick<SituacaoEmpecilho, "agora" | "iniciadaEm" | "duracaoTotalS">, regras = REGRAS_EMPECILHO): boolean {
  if (s.iniciadaEm === undefined || s.iniciadaEm === null || !s.duracaoTotalS) return false;
  return (s.agora - s.iniciadaEm) / (s.duracaoTotalS * 1000) >= regras.GARANTIA_A_PARTIR_DA_FRACAO;
}

/** Motivo para esperar, ou null quando é hora de trazer a mudança. */
export function esperaDoEmpecilho(s: SituacaoEmpecilho, regras = REGRAS_EMPECILHO): string | null {
  if (s.jaAnunciado) return "já anunciado";
  if (s.fase !== "ALTO_NIVEL" && s.fase !== "APROFUNDAMENTO") return "fora do meio da entrevista";
  if (s.respondendoPergunta) return "candidato respondendo uma pergunta";
  if (s.ultimaPerguntaEm !== undefined && s.ultimaPerguntaEm !== null && s.agora - s.ultimaPerguntaEm < RITMO_QUADRO.pisoEntrePerguntasMs) {
    return "piso entre perguntas";
  }
  const garantia = emGarantiaDoEmpecilho(s, regras) || s.conclusaoRecente === true;
  if (!garantia && s.componentes < regras.minimoComponentes) return "pouco desenho para adaptar";
  if (garantia && s.componentes < 1) return "sem desenho para adaptar";
  if (s.ultimaFalaDoAgenteEm !== null && s.agora - s.ultimaFalaDoAgenteEm < regras.respiroMs) return "respiro depois da última fala";
  // Na garantia a fração da fase não vale: a mudança já está devida.
  if (!garantia && s.faseIniciadaEm !== null && s.duracaoDaFaseS) {
    const fracao = (s.agora - s.faseIniciadaEm) / (s.duracaoDaFaseS * 1000);
    if (s.fase === "ALTO_NIVEL" && fracao < regras.fracaoMinimaAltoNivel) return "cedo";
    if (s.fase === "APROFUNDAMENTO" && 1 - fracao < regras.fracaoRestanteAprofundamento) return "pouco tempo para adaptar";
  }
  return null;
}

/** Motivo para recusar um empecilho forçado (demo), ou null. Ignora o tempo, mas não repete. */
export function esperaDoEmpecilhoForcado(s: Pick<SituacaoEmpecilho, "fase" | "jaAnunciado">): string | null {
  if (s.jaAnunciado) return "já anunciado";
  if (!FASES_EMPECILHO_FORCADO.includes(s.fase)) return "entrevista fora de andamento";
  return null;
}
