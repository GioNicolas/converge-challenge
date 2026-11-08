import type { FocoAudio } from "../audio/foco";
import type { ProvedorVoz, reproduzirFala } from "./cliente";

export type EstadoVoz = "inativa" | "preparando" | "falando" | "erro";
export type LegendaAgente = { quem: "agente"; texto: string; ate: number };

/**
 * Duas falas seguidas do agente não se encostam: a primeira termina, ele respira, e só então vem a próxima.
 * Vale também quando a fala anterior foi cortada (parar) e para a pergunta que chega logo depois de uma resposta.
 */
export const PAUSA_ENTRE_FALAS_MS = 1500;

/** O que a fila mostra na tela (no hook, os setters do React). */
export type TelaVoz = {
  estado: (e: EstadoVoz) => void;
  erro: (e: string | null) => void;
  aviso: (a: string | null) => void;
  provedor: (p: ProvedorVoz) => void;
  fala: (f: LegendaAgente | null) => void;
};

/** Uma fala pedida: tocando, com a vez ou na fila atrás da que toca. */
type Entrada = {
  controle: AbortController;
  /** Já assumiu o áudio (ou está tocando): daqui em diante termina antes da próxima, não é substituída. */
  emReproducao: boolean;
  /** Resolve quando esta fala e todas as anteriores a ela pararam (terminaram, foram cortadas ou substituídas). */
  terminou: Promise<void>;
};

/** Espera `promessa`, mas desiste (rejeita) se o sinal abortar antes. */
function esperar(promessa: Promise<unknown>, sinal: AbortSignal): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    if (sinal.aborted) { rejeitar(sinal.reason); return; }
    const abortar = () => rejeitar(sinal.reason);
    sinal.addEventListener("abort", abortar, { once: true });
    promessa.then(() => { sinal.removeEventListener("abort", abortar); resolver(); });
  });
}

function dormir(ms: number, sinal: AbortSignal): Promise<void> {
  let id: ReturnType<typeof setTimeout> | undefined;
  return esperar(new Promise<void>((r) => { id = setTimeout(r, ms); }), sinal).finally(() => clearTimeout(id));
}

/**
 * Fila das falas do agente: só uma toca por vez e entre duas há sempre PAUSA_ENTRE_FALAS_MS.
 * Uma fala nova não corta a que está tocando: o áudio dela é preparado em paralelo e toca depois que a anterior
 * termina, com a pausa. Uma fala que ainda não tinha começado a tocar (esperando a vez ou a pausa do candidato)
 * fica velha e é substituída pela nova. `parar` corta a que toca e descarta as da fila.
 */
export function criarFilaDeFalas(dependencias: {
  reproduzir: typeof reproduzirFala;
  foco: Pick<FocoAudio, "aguardarMicrofone" | "assumir">;
  tela: TelaVoz;
  pausaMs?: number;
  agora?: () => number;
}) {
  const { reproduzir, foco, tela, pausaMs = PAUSA_ENTRE_FALAS_MS, agora = Date.now } = dependencias;
  /** A fala pedida por último (tocando ou na fila). */
  let ultima: Entrada | null = null;
  /** A fala com a vez: a única que mexe na legenda e no estado. */
  let vez: Entrada | null = null;
  const vivas = new Set<AbortController>();
  /** Quando o áudio do agente parou pela última vez (fim natural ou corte). */
  let fimDaUltimaFala = Number.NEGATIVE_INFINITY;
  let liberar: (() => void) | undefined;

  function parar() {
    if (vez?.emReproducao) fimDaUltimaFala = agora();
    const controles = [...vivas];
    vivas.clear();
    ultima = null;
    vez = null;
    controles.forEach((c) => c.abort());
    liberar?.();
    liberar = undefined;
    tela.estado("inativa");
    tela.fala(null);
    tela.aviso(null);
  }

  /**
   * `antesDeTocar`: com o áudio pronto e a vez do agente, espera a pessoa fazer uma pausa; false desiste da fala.
   * Devolve true se a fala tocou até o fim (false: cancelada, substituída ou com erro).
   */
  async function falar(texto: string, opcoes?: { antesDeTocar?: () => Promise<boolean> }): Promise<boolean> {
    const anterior = ultima;
    if (anterior && !anterior.emReproducao) anterior.controle.abort();
    const controle = new AbortController();
    vivas.add(controle);
    let fimProprio!: () => void;
    const proprio = new Promise<void>((r) => { fimProprio = r; });
    const entrada: Entrada = {
      controle,
      emReproducao: false,
      terminou: Promise.all([anterior?.terminou, proprio]).then(() => {}),
    };
    ultima = entrada;
    const daVez = () => vez === entrada && !controle.signal.aborted;
    if (vez === null) { tela.erro(null); tela.estado("preparando"); }
    let liberarFoco: (() => void) | undefined;
    let tocou = false;
    let falhou = false;
    try {
      await foco.aguardarMicrofone(controle.signal);
      controle.signal.throwIfAborted();
      await reproduzir(texto, controle.signal, {
        aoIniciar: (fonte) => { if (daVez()) { tocou = true; tela.estado("falando"); tela.provedor(fonte); tela.aviso(null); } },
        aoAguardarGesto: () => { if (daVez()) tela.aviso("Toque na tela para ouvir o Totti."); },
        aoProgresso: (ate) => { if (daVez()) tela.fala({ quem: "agente", texto, ate }); },
      }, async () => {
        // A fala anterior termina e o agente respira antes desta.
        if (anterior) await esperar(anterior.terminou, controle.signal);
        const falta = fimDaUltimaFala + pausaMs - agora();
        if (falta > 0) await dormir(falta, controle.signal);
        vez = entrada;
        tela.erro(null);
        tela.estado("preparando");
        tela.fala({ quem: "agente", texto, ate: 0 });
        if (opcoes?.antesDeTocar && !(await opcoes.antesDeTocar())) return false;
        controle.signal.throwIfAborted();
        await foco.aguardarMicrofone(controle.signal);
        liberarFoco = foco.assumir("saida", parar);
        liberar = liberarFoco;
        entrada.emReproducao = true;
        return true;
      });
      return tocou && !controle.signal.aborted;
    } catch (e) {
      if (!controle.signal.aborted) {
        falhou = true;
        tela.erro(e instanceof Error ? e.message : "A voz está indisponível. A resposta continua no texto.");
        // Com outra fala tocando, ela segue: o erro desta não derruba o estado daquela.
        if (vez === null || vez === entrada) tela.estado("erro");
      }
      return false;
    } finally {
      vivas.delete(controle);
      if (tocou) fimDaUltimaFala = agora();
      liberarFoco?.();
      if (liberar === liberarFoco) liberar = undefined;
      const ultimaDaFila = ultima === null || ultima === entrada;
      if (ultima === entrada) ultima = null;
      if (vez === entrada) {
        vez = null;
        tela.fala(null);
        tela.aviso(null);
        // Com outra fala na fila, o agente segue "preparando" na pausa: ninguém toma a vez dele no meio.
        if (!ultimaDaFila) tela.estado("preparando");
        else if (!falhou) tela.estado("inativa");
      } else if (ultimaDaFila && vez === null && !falhou && !controle.signal.aborted) {
        tela.estado("inativa");
      }
      fimProprio();
    }
  }

  return { falar, parar };
}

export type FilaDeFalas = ReturnType<typeof criarFilaDeFalas>;
