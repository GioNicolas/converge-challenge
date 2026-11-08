import { momentoDoTrecho, textoFaladoAte, type Alinhamento } from "./alinhamento";

export type MarcaDeFala = { trecho: string; aoChegar: () => void };

/** Parte pura: horários ordenados, com índices estáveis para marcas simultâneas. */
export function agendaDasMarcas(alinhamento: Alinhamento, trechos: readonly string[]): { indice: number; tempo: number }[] {
  return trechos.map((trecho, indice) => ({ indice, tempo: momentoDoTrecho(alinhamento, trecho) ?? 0 }))
    .sort((a, b) => a.tempo - b.tempo || a.indice - b.indice);
}

/** Quantidade em unidades UTF-16, como String.length e o recorte da legenda. */
export function progressoDaFala(alinhamento: Alinhamento, tempo: number): number {
  return textoFaladoAte(alinhamento, tempo).length;
}

// Safari (e Chrome em alguns casos) só deixa tocar áudio que começou num gesto do usuário. A voz chega depois de
// uma chamada assíncrona, então o play() seria bloqueado e a fala cairia na voz do navegador. Um elemento tocado
// uma vez num clique fica "liberado" e é reaproveitado nas falas seguintes.
const WAV_SILENCIO = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let elementoLiberado: HTMLAudioElement | null = null;

// No WebKit (principalmente iOS), pointerdown e touchstart de toque não contam como gesto para tocar mídia:
// quem conta é touchend, pointerup e click. Os de "down" ficam para destravar o mais cedo possível no desktop.
export const GESTOS_DE_ATIVACAO = ["pointerdown", "keydown", "touchstart", "pointerup", "touchend", "click"] as const;

/**
 * Chame dentro de um gesto do usuário (clique ou tecla). Depois disso, as falas tocam sem bloqueio.
 * Cada gesto tenta de novo enquanto nenhum deu certo, mesmo com uma tentativa anterior pendente: um pointerdown
 * sem ativação (Safari) não pode tirar a vez do click que vem logo depois.
 */
export function liberarAudio(): void {
  if (elementoLiberado || typeof Audio === "undefined") return;
  try {
    const elemento = new Audio(WAV_SILENCIO);
    Promise.resolve(elemento.play()).then(
      () => {
        elemento.pause();
        elementoLiberado ??= elemento;
      },
      () => {},
    );
  } catch {}
}

export function tocarComAlinhamento(
  audio: Blob,
  alinhamento: Alinhamento,
  opcoes: {
    aoProgresso?: (caracteres: number) => void;
    marcas?: MarcaDeFala[];
    sinal?: AbortSignal;
    /** O navegador bloqueou o play(): o áudio toca no próximo gesto do usuário (toque, clique ou tecla). */
    aoAguardarGesto?: () => void;
  },
): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const marcas = opcoes.marcas ?? [];
    const agenda = agendaDasMarcas(alinhamento, marcas.map((m) => m.trecho));
    let proximaMarca = 0;
    let ultimoProgresso = -1;
    let midia: HTMLAudioElement | null = null;
    let url: string | null = null;
    let quadro: number | null = null;
    let terminou = false;
    let pararDeEsperarGesto: (() => void) | null = null;

    function terminar(erro?: unknown) {
      if (terminou) return;
      terminou = true;
      pararDeEsperarGesto?.();
      if (quadro !== null) cancelAnimationFrame(quadro);
      opcoes.sinal?.removeEventListener("abort", cancelar);
      if (midia) {
        midia.onended = null;
        midia.onerror = null;
        try {
          midia.pause();
          midia.removeAttribute("src");
        } catch {}
      }
      if (url !== null) URL.revokeObjectURL(url);
      if (erro !== undefined) rejeitar(erro);
      else resolver();
    }

    function cancelar() {
      terminar(opcoes.sinal?.reason ?? new DOMException("Reprodução cancelada.", "AbortError"));
    }

    function atualizar(tempo: number) {
      const progresso = progressoDaFala(alinhamento, tempo);
      if (progresso !== ultimoProgresso) {
        ultimoProgresso = progresso;
        opcoes.aoProgresso?.(progresso);
      }
      while (!terminou && proximaMarca < agenda.length && agenda[proximaMarca].tempo <= tempo) {
        const marca = agenda[proximaMarca++];
        marcas[marca.indice].aoChegar();
      }
    }

    function animar() {
      if (terminou || !midia) return;
      try {
        atualizar(midia.currentTime);
        if (!terminou) quadro = requestAnimationFrame(animar);
      } catch (erro) {
        terminar(erro);
      }
    }

    // Bloqueio de autoplay: em vez de trocar de voz, espera o próximo gesto e toca o mesmo áudio dentro dele.
    function esperarGesto() {
      const tentar = () => {
        const elemento = midia;
        if (terminou || !elemento) return;
        Promise.resolve(elemento.play()).then(() => {
          if (terminou) return;
          pararDeEsperarGesto?.();
          elementoLiberado ??= elemento;
          animar();
        }, () => {});
      };
      GESTOS_DE_ATIVACAO.forEach((e) => window.addEventListener(e, tentar, { capture: true }));
      pararDeEsperarGesto = () => {
        GESTOS_DE_ATIVACAO.forEach((e) => window.removeEventListener(e, tentar, { capture: true }));
        pararDeEsperarGesto = null;
      };
      opcoes.aoAguardarGesto?.();
    }

    if (opcoes.sinal?.aborted) {
      cancelar();
      return;
    }
    try {
      url = URL.createObjectURL(audio);
      if (elementoLiberado) {
        midia = elementoLiberado;
        midia.src = url;
      } else midia = new Audio(url);
      midia.preload = "auto";
      midia.onended = () => {
        try {
          atualizar(Infinity);
          terminar();
        } catch (erro) {
          terminar(erro);
        }
      };
      midia.onerror = () => terminar(new Error("Não foi possível reproduzir o áudio da fala."));
      opcoes.sinal?.addEventListener("abort", cancelar, { once: true });
      Promise.resolve(midia.play()).then(animar, (erro: unknown) => {
        if (terminou) return;
        if (erro instanceof DOMException && erro.name === "NotAllowedError") esperarGesto();
        else terminar(new Error("Reprodução de áudio indisponível."));
      });
    } catch {
      terminar(new Error("Não foi possível iniciar a reprodução do áudio."));
    }
  });
}
