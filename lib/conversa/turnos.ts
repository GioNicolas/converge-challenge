/** Regras de turno da conversa ao vivo, comuns ao quadro e ao live coding. */
import { devolveAVez } from "../agente/guardas";

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

/**
 * Depois de responder ao candidato, o quadro analisa o desenho na hora para o Totti seguir a conversa. Mas uma
 * fala que já devolveu a vez (numa pergunta ou num convite como "Pode seguir com o desenho.") deixa a bola com
 * ele: analisar logo em seguida soltava outra pergunta poucos segundos depois, e ele recebia duas seguidas.
 * Nesse caso a análise espera a pausa de sempre (ou o fim da próxima resposta dele).
 */
export function deveAnalisarLogoAposResposta(texto: string, concluiu?: boolean): boolean {
  return !concluiu && texto.trim() !== "" && !devolveAVez(texto);
}

/**
 * O fim da resposta do candidato a uma pergunta do agente: ele ficou quieto por `limiteMs`. Conta como atividade a voz
 * dele, a fala do agente (depois de uma pergunta ele precisa de tempo) e o desenho/digitação (`ultimaAtividade`):
 * quem responde desenhando em silêncio ainda está respondendo. Fala parcial, pedido em andamento ou agente falando
 * seguram o fim da resposta.
 */
export function respostaTerminouPorSilencio(opcoes: {
  agora: number;
  ultimaFalaEm: number;
  ultimaFalaDoAgenteEm: number | null;
  ultimaAtividade: number;
  limiteMs: number;
  falaParcial: boolean;
  pedidosEmAndamento: number;
  agenteFalando: boolean;
}): boolean {
  if (opcoes.falaParcial || opcoes.pedidosEmAndamento > 0 || opcoes.agenteFalando) return false;
  const ultima = Math.max(opcoes.ultimaFalaEm, opcoes.ultimaFalaDoAgenteEm ?? 0, opcoes.ultimaAtividade);
  return opcoes.agora - ultima >= opcoes.limiteMs;
}
