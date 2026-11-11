import type { Alinhamento } from "../presenca/alinhamento";
import { tocarComAlinhamento } from "../presenca/vozSincronizada";
import { RespostaVoz } from "./contrato";
import { comFolga } from "./folga";
type DadosVoz = import("zod").infer<typeof RespostaVoz>;
export type ProvedorVoz = "elevenlabs";
type MetaSessaoVoz = { sessao_id: string; contexto: "quadro" | "coding" | "pre" };
let sessaoDaVoz: MetaSessaoVoz | null = null;
export function definirSessaoDaVoz(meta: MetaSessaoVoz | null): void { sessaoDaVoz = meta; }
export function obterSessaoDaVoz(): MetaSessaoVoz | null { return sessaoDaVoz; }
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
 * `antesDeTocar` (opcional) é chamado uma vez, com o áudio já pronto, logo antes de começar a tocar: quem chama
 * espera ali a vez de falar (a pessoa fazer uma pausa). Devolver false desiste da fala sem erro.
 */
export function criarVoz(dependencias: {
  fetch?: typeof globalThis.fetch; tocar?: typeof tocarComAlinhamento;
  metadados?: () => { sessao_id: string; contexto: "quadro" | "coding" | "pre"; fala_id?: string } | null;
} = {}) {
  // O fetch do navegador precisa ser chamado com this = window: `dependencias.fetch(...)` com o fetch nativo guardado
  // no objeto dá "Illegal invocation" e a voz nunca sai do navegador. Por isso o padrão é um wrapper.
  const buscar = dependencias.fetch ?? ((entrada: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(entrada, init));
  const metadadosAtuais = () => dependencias.metadados?.() ?? sessaoDaVoz;
  const tocar = dependencias.tocar ?? tocarComAlinhamento;
  let servidorDisponivel = true;
  // Falas curtas e repetidas ("Uhum.", "Certo.") ficam guardadas: tocam na hora, sem esperar o ElevenLabs.
  const guardadas = new Map<string, Promise<DadosVoz>>();
  const sintetizar = async (texto: string, sinal: AbortSignal): Promise<DadosVoz> => {
    const metadados = metadadosAtuais();
    const resposta = await buscar("/api/falar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, ...(metadados ?? {}) }), signal: AbortSignal.any([sinal, AbortSignal.timeout(25000)]), cache: "no-store",
    });
    sinal.throwIfAborted();
    if (resposta.status === 501) servidorDisponivel = false;
    if (!resposta.ok) throw new Error(`Voz do servidor indisponível (HTTP ${resposta.status})`);
    return RespostaVoz.parse(await resposta.json());
  };
  const audioDe = (texto: string, sinal: AbortSignal): Promise<DadosVoz> => {
    if (texto.length > MAX_CHARS_GUARDADA) return sintetizar(texto, sinal);
    let guardada = guardadas.get(texto);
    if (!guardada) {
      guardada = sintetizar(texto, new AbortController().signal);
      guardadas.set(texto, guardada);
      guardada.catch(() => guardadas.delete(texto));
    }
    return guardada;
  };
  const falar = async (texto: string, sinal: AbortSignal, eventos: EventosVoz, antesDeTocar?: () => Promise<boolean>): Promise<void> => {
    let liberada = !antesDeTocar;
    const aguardarVez = async () => {
      if (!liberada) liberada = await antesDeTocar!();
      sinal.throwIfAborted();
      return liberada;
    };
    for (const parte of dividirFala(texto)) {
      sinal.throwIfAborted();
      if (!servidorDisponivel) throw new Error(MENSAGEM_VOZ_INDISPONIVEL);
      const progresso = (n: number) => {
        if (!sinal.aborted) eventos.aoProgresso(Math.min(parte.fim, parte.inicio + n));
      };
      let iniciou = false;
      for (let tentativa = 1; ; tentativa++) {
        let audioObtido = false;
        const sintetizadaNestaFala = parte.texto.length > MAX_CHARS_GUARDADA || !guardadas.has(parte.texto);
        try {
          const dados = await audioDe(parte.texto, sinal);
          audioObtido = true;
          sinal.throwIfAborted();
          // Silêncio nas duas pontas: sem ele, a saída de som engolia a primeira sílaba e às vezes o finalzinho.
          const { bytes, alinhamento } = comFolga(Uint8Array.from(atob(dados.audio_base64), (c) => c.charCodeAt(0)), dados.alinhamento as Alinhamento);
          if (!(await aguardarVez())) {
            const meta = metadadosAtuais();
            if (sintetizadaNestaFala && meta) avisarDescartada({ contexto: meta.contexto, caracteres: parte.texto.length, motivo: "cancelada" });
            return;
          }
          await tocar(new Blob([bytes as BlobPart], { type: "audio/mpeg" }), alinhamento, {
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
          if (sinal.aborted) {
            const meta = metadadosAtuais();
            if (audioObtido && !iniciou && sintetizadaNestaFala && meta) avisarDescartada({ contexto: meta.contexto, caracteres: parte.texto.length, motivo: "substituida" });
            sinal.throwIfAborted();
          }
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
  /** Sintetiza já (em segundo plano) falas curtas que vão tocar depois, para saírem sem espera. */
  const preparar = (textos: string[]) => {
    for (const texto of textos) if (servidorDisponivel) void audioDe(texto, new AbortController().signal).catch(() => {});
  };
  const avisarDescartada = (dados: { contexto: "quadro" | "coding" | "pre"; caracteres: number; fala_id?: string; motivo: "substituida" | "cancelada" }) => {
    const metadados = metadadosAtuais();
    if (!metadados) return;
    void buscar("/api/uso", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessao_id: metadados.sessao_id, contexto: dados.contexto, tipo: "voz_descartada", dados }), keepalive: true }).catch(() => {});
  };
  return Object.assign(falar, { preparar, avisarDescartada });
}

/** Falas até esse tamanho ficam guardadas depois da primeira síntese. */
const MAX_CHARS_GUARDADA = 40;

export const reproduzirFala = criarVoz();
/** Toca uma fala (o que a fila de falas do agente usa). */
export type ReproduzirFala = (texto: string, sinal: AbortSignal, eventos: EventosVoz, antesDeTocar?: () => Promise<boolean>) => Promise<void>;
