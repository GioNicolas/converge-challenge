/** Regras de turno da conversa ao vivo, comuns ao quadro e ao live coding. */
/** Uma transcrição parcial mantém o turno aberto, mesmo durante pausas da pessoa. */
export function podeTomarTurno(opcoes: {
  agora: number;
  ultimaFalaEm: number;
  falaParcial: boolean;
  agenteFalando: boolean;
  aguardandoResposta: boolean;
}): boolean {
  return !opcoes.falaParcial && !opcoes.agenteFalando && !opcoes.aguardandoResposta
    && opcoes.agora - opcoes.ultimaFalaEm >= 900;
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
