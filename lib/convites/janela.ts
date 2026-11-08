/**
 * Quando a sala da entrevista fica aberta para quem marcou horário: um pouco antes do horário (para
 * testar microfone e entrar com calma) até um tempo depois do fim previsto. Fora disso, quem chega pelo
 * link do convite vê a tela de espera (ou de horário passado) em vez da entrevista.
 * Funções puras: recebem o "agora" para serem testáveis. Serve ao servidor e à página de agendamento.
 */

const MINUTO_MS = 60 * 1000;
/** A sala abre este tanto antes do horário marcado. Cobre os horários de teste (+3 e +5 min), que abrem a sala direto. */
export const ABRE_ANTES_MS = 10 * MINUTO_MS;
/** Depois do fim previsto (horário + duração), ainda dá para entrar por este tempo. */
export const FECHA_DEPOIS_MS = 15 * MINUTO_MS;

export type SituacaoSala = "cedo" | "aberta" | "encerrada";
export type JanelaSala = { abre: number; inicio: number; fecha: number };

export function janelaDaSala(agendadoPara: string, durationMin: number): JanelaSala {
  const inicio = Date.parse(agendadoPara);
  return { abre: inicio - ABRE_ANTES_MS, inicio, fecha: inicio + durationMin * MINUTO_MS + FECHA_DEPOIS_MS };
}

export function situacaoDaSala(janela: JanelaSala, agora: number = Date.now()): SituacaoSala {
  if (agora < janela.abre) return "cedo";
  if (agora > janela.fecha) return "encerrada";
  return "aberta";
}
