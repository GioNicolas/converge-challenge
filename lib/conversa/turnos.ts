/** Regras de turno da conversa ao vivo, comuns ao quadro e ao live coding. */

/**
 * Silêncio que fecha a fala da pessoa, contado depois do trecho final da transcrição. O Scribe só fecha um trecho
 * depois de ~1 s calado; somando os dois, a fala vai ao agente depois de ~3 s sem voz. Menos que isso cortava
 * quem só parou para pensar no meio da frase.
 */
export const PAUSA_FIM_DA_FALA_MS = 2000;

/** Pausa da pessoa a partir da qual o agente pode tomar a vez por iniciativa própria (pergunta, convite). */
export const PAUSA_PARA_TOMAR_A_VEZ_MS = 3000;

/** Uma transcrição parcial mantém o turno aberto, mesmo durante pausas da pessoa. */
export function podeTomarTurno(opcoes: {
  agora: number;
  ultimaFalaEm: number;
  falaParcial: boolean;
  agenteFalando: boolean;
  aguardandoResposta: boolean;
}): boolean {
  return !opcoes.falaParcial && !opcoes.agenteFalando && !opcoes.aguardandoResposta
    && opcoes.agora - opcoes.ultimaFalaEm >= PAUSA_PARA_TOMAR_A_VEZ_MS;
}

/**
 * Antes de tocar uma resposta pronta, espera a pessoa fazer uma pausa.
 * Ruído constante no microfone não pode prender a resposta: o som bruto segura no máximo 4 s,
 * e uma transcrição parcial (fala de verdade) segura no máximo 12 s.
 */
export function deveAguardarParaFalar(opcoes: {
  agora: number;
  esperandoDesde: number;
  ultimaFalaEm: number;
  falaParcial: boolean;
}): boolean {
  const esperando = opcoes.agora - opcoes.esperandoDesde;
  if (opcoes.falaParcial) return esperando < 12_000;
  return opcoes.agora - opcoes.ultimaFalaEm < 900 && esperando < 4_000;
}
