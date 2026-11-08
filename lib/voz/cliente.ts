import type { Alinhamento } from "../presenca/alinhamento";
import { tocarComAlinhamento } from "../presenca/vozSincronizada";
import { RespostaVoz } from "./contrato";
export type ProvedorVoz = "elevenlabs";
type EventosVoz = {
  aoIniciar: (provedor: ProvedorVoz) => void;
  aoProgresso: (caracteres: number) => void;
  /** O navegador bloqueou o áudio: a fala toca no próximo toque, clique ou tecla. */
  aoAguardarGesto?: () => void;
};

export const MENSAGEM_VOZ_INDISPONIVEL = "A voz do Totti está indisponível agora. A resposta continua no texto.";
// Uma falha passageira do servidor (rede, timeout, 5xx) ganha mais uma tentativa antes de desistir da fala.
const TENTATIVAS = 2;

// O servidor mantém o limite da Sofia; o cliente divide respostas longas sem truncar.
export function dividirFala(texto: string): { texto: string; inicio: number; fim: number }[] {
  const partes: { texto: string; inicio: number; fim: number }[] = [];
  let inicio = 0;
  while (inicio < texto.length) {
    while (/\s/u.test(texto[inicio] ?? "") && inicio < texto.length) inicio++;
    if (inicio >= texto.length) break;
    let fim = Math.min(inicio + 2000, texto.length);
    if (fim < texto.length) {
      const espaco = texto.lastIndexOf(" ", fim);
      if (espaco > inicio) fim = espaco;
      // Não separa um par UTF-16 em textos sem espaços.
      if (/[\uD800-\uDBFF]/u.test(texto[fim - 1])) fim--;
    }
    const trecho = texto.slice(inicio, fim).trimEnd();
    partes.push({ texto: trecho, inicio, fim: inicio + trecho.length });
    inicio = fim;
  }
  return partes;
}

/**
 * Serviço compartilhado que usa o contrato e o player de áudio da Sofia. O agente fala só com a voz do ElevenLabs
 * (Fernando - Casual): se ela não vier, a fala fica no texto, sem trocar para uma voz do navegador.
 */
export function criarVoz(dependencias = { fetch: globalThis.fetch, tocar: tocarComAlinhamento }) {
  let servidorDisponivel = true;
  return async (texto: string, sinal: AbortSignal, eventos: EventosVoz): Promise<void> => {
    for (const parte of dividirFala(texto)) {
      sinal.throwIfAborted();
      if (!servidorDisponivel) throw new Error(MENSAGEM_VOZ_INDISPONIVEL);
      const progresso = (n: number) => {
        if (!sinal.aborted) eventos.aoProgresso(Math.min(parte.fim, parte.inicio + n));
      };
      let iniciou = false;
      for (let tentativa = 1; ; tentativa++) {
        try {
          const resposta = await dependencias.fetch("/api/falar", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto: parte.texto }), signal: AbortSignal.any([sinal, AbortSignal.timeout(25000)]), cache: "no-store",
          });
          sinal.throwIfAborted();
          if (resposta.status === 501) servidorDisponivel = false;
          if (!resposta.ok) throw new Error(`Voz do servidor indisponível (HTTP ${resposta.status})`);
          const dados = RespostaVoz.parse(await resposta.json());
          sinal.throwIfAborted();
          const bytes = Uint8Array.from(atob(dados.audio_base64), (c) => c.charCodeAt(0));
          await dependencias.tocar(new Blob([bytes], { type: "audio/mpeg" }), dados.alinhamento as Alinhamento, {
            sinal,
            aoAguardarGesto: eventos.aoAguardarGesto,
            aoProgresso: (n) => {
              if (sinal.aborted) return;
              if (!iniciou) { iniciou = true; eventos.aoIniciar("elevenlabs"); }
              progresso(n);
            },
          });
          sinal.throwIfAborted();
          progresso(parte.texto.length);
          break;
        } catch (erro) {
          sinal.throwIfAborted();
          // Se o áudio já começou, repetir a parte faria o candidato ouvir a frase duas vezes. Dá a parte por falada.
          if (iniciou) {
            console.warn("[voz] o áudio parou no meio da fala:", erro);
            progresso(parte.texto.length);
            break;
          }
          if (!servidorDisponivel || tentativa >= TENTATIVAS) {
            console.warn("[voz] sem a voz do ElevenLabs; a fala fica só no texto:", erro);
            throw new Error(MENSAGEM_VOZ_INDISPONIVEL);
          }
          console.warn("[voz] tentando de novo a voz do ElevenLabs:", erro);
        }
      }
    }
  };
}

export const reproduzirFala = criarVoz();
