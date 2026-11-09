/**
 * Política comum de interrupção dos dois agentes (quadro e live coding): QUANDO o agente pode tomar a vez sem ser
 * chamado. O QUE perguntar é do LLM; aqui só regras determinísticas, as mesmas constantes nos dois, escaladas pela
 * duração da entrevista. Medido com scripts/linha-do-tempo-quadro.ts e scripts/simulate.ts --linha-do-tempo.
 *
 * Dois portões:
 * - ritmo (`motivoDoRitmo`): orçamento da entrevista, cota proporcional ao tempo e intervalo entre interrupções.
 *   Abertura, encerramento e a mudança no problema ficam fora (`extra`).
 * - momento (`motivoDoMomento`): só numa pausa real (mãos paradas e uma brecha na fala), nunca no meio de uma
 *   fala, digitação ou desenho.
 * Um marco (run verde, voltou a falhar, colagem, retorno de desafio, etapa concluída, começo do aprofundamento)
 * encurta o intervalo e a pausa: é a hora natural de falar.
 */

export const RITMO = {
  /** Em média, uma interrupção a cada tantos minutos de entrevista. */
  minutosPorInterrupcao: 3,
  orcamentoMinimo: 3,
  orcamentoMaximo: 12,
  /** Intervalo mínimo entre duas interrupções comuns, como fração do ritmo médio (~1,5 min). */
  fracaoDoRitmoEntreInterrupcoes: 0.5,
  /** Respiro mínimo desde o começo e o fim da última conversa (a última fala de qualquer um dos dois). */
  respiroMs: 45_000,
  /** Depois de um marco (primeiro run verde, colagem, começo de fase), a hora passa rápido: respiro curto. */
  respiroDeMarcoMs: 15_000,
  /** A cota pode estar adiantada em até tantas interrupções em relação ao tempo decorrido. */
  folgaDaCota: 1,
  /** Pausa real: tanto tempo sem digitar nem desenhar (mãos paradas)... */
  pausaRealMs: 8_000,
  /** ...e essa brecha na fala. Silêncio total longo é raro numa conversa por voz: quem fala muito nunca teria vez. */
  brechaNaFalaMs: 1_500,
  /** Depois de um marco (ou quando a pergunta já esperou demais), basta não estar no meio de uma ação. */
  pausaCurtaMs: 2_000,
  /**
   * Paciência: a pergunta que já espera há tanto tempo (ou a interrupção atrasada) se contenta com a pausa curta.
   * Sem isso, quem digita ou desenha sem parar nunca recebia pergunta.
   */
  pacienciaMs: 20_000,
  /** Mesmo sem nenhuma pausa, a análise roda pelo menos uma vez nesse tempo de trabalho contínuo. */
  analiseMaximaSemPausaMs: 45_000,
  /** Mexendo numa melhoria que ele mesmo começou: só uma pausa longa. */
  pausaFocadoMs: 30_000,
  /** Uma dúvida pendente mais velha que isso cai quando o candidato volta a falar (ficou para trás). */
  pendenteValidaMs: 45_000,
  /** Sem interrupção há tantos ritmos (e com cota livre): a interrupção está atrasada. */
  atrasoEmRitmos: 1.5,
  /** Um marco de fase (começo do aprofundamento, do fechamento) vale por esse tempo. */
  marcoDeFaseMs: 20_000,
} as const;

/** Interrupções que a entrevista comporta (fora abertura, encerramento e mudança no problema). */
export function orcamentoDeInterrupcoes(duracaoMin: number): number {
  const n = Math.round(Math.max(0, duracaoMin) / RITMO.minutosPorInterrupcao);
  return Math.min(RITMO.orcamentoMaximo, Math.max(RITMO.orcamentoMinimo, n));
}

/** Tempo médio entre interrupções (ms). */
export function ritmoMs(duracaoMin: number): number {
  return (duracaoMin * 60_000) / orcamentoDeInterrupcoes(duracaoMin);
}

export function intervaloMinimoMs(duracaoMin: number): number {
  return Math.round(ritmoMs(duracaoMin) * RITMO.fracaoDoRitmoEntreInterrupcoes);
}

/** Quantas interrupções já podem ter acontecido nesta fração (0..1) da entrevista. */
export function cotaAte(fracao: number, orcamento: number): number {
  const f = Math.min(1, Math.max(0, fracao));
  return Math.min(orcamento, Math.floor(orcamento * f) + RITMO.folgaDaCota);
}

export type Ritmo = {
  agora: number;
  /** Quando a entrevista começou. */
  inicioEm: number;
  duracaoMin: number;
  /** Interrupções que contam no orçamento (sem abertura, encerramento e mudança no problema). */
  feitas: number;
  /** Começo da última interrupção (de qualquer tipo), se houve. */
  ultimaEm: number | null;
  /** Fim da última conversa que o agente puxou, se houve. */
  ultimaConversaFimEm?: number | null;
  marco?: boolean;
};

export type MotivoRitmo = { codigo: "orcamento" | "cota" | "respiro" | "intervalo"; texto: string };

/** Por que o ritmo ainda não deixa interromper (null = deixa). */
export function motivoDoRitmo(r: Ritmo): MotivoRitmo | null {
  const orcamento = orcamentoDeInterrupcoes(r.duracaoMin);
  if (r.feitas >= orcamento) return { codigo: "orcamento", texto: `orçamento de ${orcamento} interrupções usado` };
  const fracao = (r.agora - r.inicioEm) / (r.duracaoMin * 60_000);
  const cota = cotaAte(fracao, orcamento);
  if (r.feitas >= cota) return { codigo: "cota", texto: `cota do tempo: ${r.feitas} de ${cota} até aqui` };
  const desdeConversa = r.ultimaConversaFimEm == null ? Infinity : r.agora - r.ultimaConversaFimEm;
  const desdeUltima = r.ultimaEm === null ? Infinity : r.agora - r.ultimaEm;
  const respiro = Math.min(desdeConversa, desdeUltima);
  const respiroMinimo = r.marco ? RITMO.respiroDeMarcoMs : RITMO.respiroMs;
  if (respiro < respiroMinimo) {
    return { codigo: "respiro", texto: `respiro: ${Math.floor(respiro / 1000)} s desde a última conversa (mín. ${respiroMinimo / 1000} s)` };
  }
  const intervalo = intervaloMinimoMs(r.duracaoMin);
  if (!r.marco && desdeUltima < intervalo) {
    return { codigo: "intervalo", texto: `intervalo: ${Math.floor(desdeUltima / 1000)} s desde a última interrupção (mín. ${Math.round(intervalo / 1000)} s)` };
  }
  return null;
}

export type Momento = {
  /** Tempo sem digitar nem desenhar. */
  maosParadasHaMs: number;
  /** Tempo desde a última fala do candidato (Infinity se ele não falou). */
  falaHaMs: number;
  marco?: boolean;
  /** Mexendo numa melhoria que ele mesmo começou (live coding: otimizando). */
  focado?: boolean;
  /** Há quanto tempo a pergunta espera a vez. */
  esperandoHaMs?: number;
  /** A interrupção está atrasada (ver `interrupcaoAtrasada`). */
  atrasada?: boolean;
};

/** Pausa necessária para tomar a vez agora. */
export function pausaNecessariaMs(m: Pick<Momento, "marco" | "focado" | "esperandoHaMs" | "atrasada">): number {
  if (m.marco || m.atrasada || (m.esperandoHaMs ?? 0) >= RITMO.pacienciaMs) return RITMO.pausaCurtaMs;
  return m.focado ? RITMO.pausaFocadoMs : RITMO.pausaRealMs;
}

/** Por que agora não é um bom momento para tomar a vez (null = é). */
export function motivoDoMomento(m: Momento): string | null {
  if (m.falaHaMs < RITMO.brechaNaFalaMs) return "candidato falando";
  const pausa = pausaNecessariaMs(m);
  if (m.maosParadasHaMs < pausa) {
    return `${pausa === RITMO.pausaFocadoMs ? "mexendo numa melhoria" : "candidato ativo"} (${Math.floor(m.maosParadasHaMs / 1000)} s sem mexer, mín. ${pausa / 1000} s)`;
  }
  return null;
}

/**
 * A interrupção está atrasada: faz `atrasoEmRitmos` ritmos sem nenhuma e o ritmo deixaria. Os agentes usam isso
 * para não ficar calados demais (o live coding baixa o limiar da pergunta; o quadro avisa o modelo no prompt).
 */
export function interrupcaoAtrasada(r: Ritmo): boolean {
  if (motivoDoRitmo({ ...r, marco: true }) !== null) return false;
  const desde = r.agora - (r.ultimaEm ?? r.inicioEm);
  return desde >= RITMO.atrasoEmRitmos * ritmoMs(r.duracaoMin);
}
