import type { Alinhamento } from "../presenca/alinhamento";
import { tocarComAlinhamento } from "../presenca/vozSincronizada";
import { RespostaVoz } from "./contrato";
import { escolherVozPt } from "./escolherVoz";
export type ProvedorVoz = "elevenlabs" | "navegador";
type EventosVoz = { aoIniciar: (provedor: ProvedorVoz) => void; aoProgresso: (caracteres: number) => void };

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

export function falarNoNavegador(texto: string, sinal: AbortSignal, eventos: EventosVoz): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sinal.aborted) { reject(sinal.reason); return; }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(new Error("A voz está indisponível neste navegador. A resposta continua no texto."));
      return;
    }
    let terminou = false;
    let fala: SpeechSynthesisUtterance | undefined;
    let estimativa: ReturnType<typeof setInterval> | undefined;
    let prazo: ReturnType<typeof setTimeout> | undefined;
    let inicio: number | undefined;
    let temMarcas = false;
    const limpar = () => {
      terminou = true;
      clearInterval(estimativa);
      clearTimeout(prazo);
      sinal.removeEventListener("abort", cancelar);
      if (fala) fala.onstart = fala.onend = fala.onerror = fala.onboundary = null;
    };
    const cancelar = () => {
      if (terminou) return;
      limpar();
      try { window.speechSynthesis.cancel(); } catch {}
      reject(sinal.reason);
    };
    const falhar = () => {
      if (terminou) return;
      limpar();
      try { window.speechSynthesis.cancel(); } catch {}
      reject(new Error("Não consegui reproduzir a voz. Toque em ouvir resposta para tentar novamente."));
    };
    try {
      fala = new SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR";
      fala.rate = 1.05;
      const voz = escolherVozPt(window.speechSynthesis.getVoices());
      if (voz) fala.voice = voz;
      fala.onstart = () => {
        if (terminou) return;
        inicio = performance.now();
        eventos.aoIniciar("navegador");
      };
      fala.onboundary = (e) => {
        if (terminou) return;
        temMarcas = true;
        const fim = texto.indexOf(" ", e.charIndex + 1);
        eventos.aoProgresso(fim < 0 ? texto.length : fim);
      };
      fala.onend = () => {
        if (terminou) return;
        limpar();
        eventos.aoProgresso(texto.length);
        resolve();
      };
      fala.onerror = falhar;
      estimativa = setInterval(() => {
        if (!temMarcas && inicio !== undefined) eventos.aoProgresso(Math.min(texto.length, Math.floor((performance.now() - inicio) / 1000 * 15)));
      }, 80);
      prazo = setTimeout(falhar, Math.max(15000, texto.length / 10 * 1000 + 10000));
      sinal.addEventListener("abort", cancelar, { once: true });
      window.speechSynthesis.speak(fala);
    } catch { falhar(); }
  });
}

/** Serviço compartilhado que usa o contrato e o player de áudio da Sofia. */
export function criarVoz(dependencias = { fetch: globalThis.fetch, tocar: tocarComAlinhamento, navegador: falarNoNavegador }) {
  let servidorDisponivel = true;
  return async (texto: string, sinal: AbortSignal, eventos: EventosVoz): Promise<void> => {
    for (const parte of dividirFala(texto)) {
      sinal.throwIfAborted();
      const progresso = (n: number) => {
        if (!sinal.aborted) eventos.aoProgresso(Math.min(parte.fim, parte.inicio + n));
      };
      if (servidorDisponivel) {
        try {
          const resposta = await dependencias.fetch("/api/falar", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto: parte.texto }), signal: AbortSignal.any([sinal, AbortSignal.timeout(25000)]), cache: "no-store",
          });
          sinal.throwIfAborted();
          if (resposta.status === 501) servidorDisponivel = false;
          if (!resposta.ok) throw new Error("Voz do servidor indisponível");
          const dados = RespostaVoz.parse(await resposta.json());
          sinal.throwIfAborted();
          const bytes = Uint8Array.from(atob(dados.audio_base64), (c) => c.charCodeAt(0));
          let iniciou = false;
          await dependencias.tocar(new Blob([bytes], { type: "audio/mpeg" }), dados.alinhamento as Alinhamento, {
            sinal,
            aoProgresso: (n) => {
              if (sinal.aborted) return;
              if (!iniciou) { iniciou = true; eventos.aoIniciar("elevenlabs"); }
              progresso(n);
            },
          });
          sinal.throwIfAborted();
          progresso(parte.texto.length);
          continue;
        } catch (erro) {
          sinal.throwIfAborted();
          console.warn("[voz] usando síntese do navegador:", erro);
        }
      }
      await dependencias.navegador(parte.texto, sinal, { aoIniciar: eventos.aoIniciar, aoProgresso: progresso });
    }
  };
}

export const reproduzirFala = criarVoz();
