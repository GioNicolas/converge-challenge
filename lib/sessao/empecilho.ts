// Quando o Totti pode trazer a mudança no problema (o "empecilho") no quadro.
// Lógica pura, sem React: o navegador usa para saber a hora de pedir, e o servidor repete a checagem.
// O conteúdo da mudança fica no kit, no servidor; aqui só se decide o momento.

export const REGRAS_EMPECILHO = {
  /** Visão geral: só depois dessa fração do tempo da fase (o candidato já montou uma direção). */
  fracaoMinimaAltoNivel: 0.4,
  /** Aprofundamento: só enquanto sobra pelo menos essa fração da fase (dá tempo de adaptar). */
  fracaoRestanteAprofundamento: 0.4,
  /** Sem algumas peças no quadro não há desenho para adaptar. */
  minimoComponentes: 3,
  /** Respiro depois da última fala do Totti. */
  respiroMs: 20_000,
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
};

/** Fases em que um empecilho forçado (demo) pode entrar: a entrevista precisa estar em andamento. */
export const FASES_EMPECILHO_FORCADO = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];

/** Peças desenhadas pelo candidato no grafo (formas, textos, desenhos e imagens; setas e molduras não contam). */
export function contarComponentes(grafo: string): number {
  return new Set([...grafo.matchAll(/^- \[([reltfi]\d+)\]/gm)].map((m) => m[1])).size;
}

/** Motivo para esperar, ou null quando é hora de trazer a mudança. */
export function esperaDoEmpecilho(s: SituacaoEmpecilho, regras = REGRAS_EMPECILHO): string | null {
  if (s.jaAnunciado) return "já anunciado";
  if (s.fase !== "ALTO_NIVEL" && s.fase !== "APROFUNDAMENTO") return "fora do meio da entrevista";
  if (s.respondendoPergunta) return "candidato respondendo uma pergunta";
  if (s.componentes < regras.minimoComponentes) return "pouco desenho para adaptar";
  if (s.ultimaFalaDoAgenteEm !== null && s.agora - s.ultimaFalaDoAgenteEm < regras.respiroMs) return "respiro depois da última fala";
  if (s.faseIniciadaEm !== null && s.duracaoDaFaseS) {
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
