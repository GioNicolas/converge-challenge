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

export function tocarComAlinhamento(
  audio: Blob,
  alinhamento: Alinhamento,
  opcoes: { aoProgresso?: (caracteres: number) => void; marcas?: MarcaDeFala[]; sinal?: AbortSignal },
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

    function terminar(erro?: unknown) {
      if (terminou) return;
      terminou = true;
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

    if (opcoes.sinal?.aborted) {
      cancelar();
      return;
    }
    try {
      url = URL.createObjectURL(audio);
      midia = new Audio(url);
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
      Promise.resolve(midia.play()).then(animar, () => {
        terminar(new Error("Reprodução de áudio bloqueada ou indisponível."));
      });
    } catch {
      terminar(new Error("Não foi possível iniciar a reprodução do áudio."));
    }
  });
}
