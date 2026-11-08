/**
 * Memória Viva da Squad: o que o Totti aprendeu com as decisões do Tech Lead (F4) e com o resultado
 * das contratações aos 90 dias (F5). Formato combinado entre as duas frentes: não mude sem avisar.
 */

/** De onde veio a regra: qual decisão, de qual candidato e vaga. Toda regra tem origem rastreável. */
export type OrigemRegra =
  | { tipo: "reprovacao" | "aprovacao"; candidato: string; vagaId: string }
  | { tipo: "ajuste_plano"; vagaId: string }
  | { tipo: "resultado_90_dias"; candidato: string; vagaId: string; deuCerto: boolean };

export type EfeitoRegra = "valoriza" | "penaliza";

export interface RegraSquad {
  id: string;
  /** A empresa (ver `empresaAtual`). */
  empresaId: string;
  /** Frase curta e técnica: "Penaliza over-engineering: reprovou quem propôs Kafka para volume baixo". */
  texto: string;
  efeito: EfeitoRegra;
  /** Id do critério do scorecard que ela afeta (ex.: "comunicacao", "complexidade", "trade_offs"). */
  criterio: string;
  origem: OrigemRegra;
  ativa: boolean;
  /** ISO. */
  criadaEm: string;
}

export type NovaRegra = Omit<RegraSquad, "id" | "ativa" | "criadaEm"> & Partial<Pick<RegraSquad, "id" | "ativa" | "criadaEm">>;

export type RecomendacaoTotti = "avancar" | "talvez" | "nao_avancar";
export type DecisaoTechLead = "aprovado" | "reprovado";

/** Uma decisão do Tech Lead sobre um candidato, guardada para medir a concordância com o Totti. */
export interface DecisaoRegistrada {
  id: string;
  empresaId: string;
  vagaId: string;
  /** Nome do cargo, para o gráfico ("Backend Pleno"). Sem valor: usa o vagaId. */
  vagaTitulo?: string;
  candidato: string;
  recomendacaoTotti: RecomendacaoTotti;
  decisaoTechLead: DecisaoTechLead;
  /** Motivo que o Tech Lead escreveu (opcional no Aprovar e no Reprovar). */
  motivo?: string;
  /** ISO. */
  decididaEm: string;
}

export interface NovaDecisao {
  empresaId: string;
  vagaId: string;
  candidato: string;
  recomendacaoTotti: RecomendacaoTotti;
  decisaoTechLead: DecisaoTechLead;
  vagaTitulo?: string;
  motivo?: string;
  decididaEm?: string;
}

/** Concordância de uma vaga ou da empresa inteira. "Talvez" não é posição: fica fora da conta. */
export interface FatiaConcordancia {
  concordou: number;
  /** Decisões em que o Totti tomou posição (avancar ou nao_avancar). */
  total: number;
  /** Decisões em que o Totti disse "talvez". */
  semPosicao: number;
  /** 0 a 100, arredondado. null quando não há decisão com posição. */
  pct: number | null;
}

export interface ConcordanciaVaga extends FatiaConcordancia {
  vagaId: string;
  vagaTitulo: string;
  /** ISO da primeira decisão da vaga: ordena a série no tempo. */
  inicio: string;
}

export interface Concordancia {
  geral: FatiaConcordancia;
  /** Uma entrada por vaga, da mais antiga para a mais recente. */
  porVaga: ConcordanciaVaga[];
}

/** Motivo que o guarda-corpo descartou (não técnico). Fica visível para o Tech Lead, nunca vira regra. */
export interface MotivoIgnorado {
  id: string;
  empresaId: string;
  /** O trecho que foi ignorado, como o Tech Lead escreveu. */
  trecho: string;
  /** Por que não virou regra ("idade não é critério técnico"). */
  porque: string;
  origem: OrigemRegra;
  /** ISO. */
  criadoEm: string;
}
