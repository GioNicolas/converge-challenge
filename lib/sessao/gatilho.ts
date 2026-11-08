// Gatilho da análise: decide QUANDO mandar o desenho para o /analisar.
//
// - Pausa: o candidato ficou `pausaMs` sem mexer → dispara.
// - Fim de uma resposta: `dispararAgora()` analisa na hora, mesmo sem mudança no desenho.
// - Só uma análise por vez. Se o gatilho disparar com uma em andamento, guarda só o pedido
//   mais recente ("o último vence"): nada se acumula.
// - Análise que passa de `limiteMs` é ignorada; tenta de novo no próximo gatilho.
//
// O gatilho não decide se a resposta vira plin: isso é da máquina de estados.
import type { PedidoAnalise, RespostaAnalise } from "@/lib/sessao/cliente";

export type OpcoesGatilho = {
  pausaMs?: number;
  limiteMs?: number;
  /** A sessão está numa fase que analisa? */
  podeAnalisar: () => boolean;
  /**
   * Monta o pedido com o desenho atual. Devolve null se nada relevante mudou desde a última
   * análise (exceto quando `forcar` é true, como no fim de uma resposta).
   */
  montarPedido: (forcar: boolean) => PedidoAnalise | null;
  analisar: (pedido: PedidoAnalise, sinal: AbortSignal) => Promise<RespostaAnalise>;
  aoResultado: (resposta: RespostaAnalise, pedido: PedidoAnalise) => void;
  aoErro?: (erro: unknown) => void;
};

export type Gatilho = {
  /** Avisar a cada mudança do desenho do candidato: reinicia a contagem da pausa. */
  mudou(): void;
  /** Analisar agora (fim de uma resposta). */
  dispararAgora(): void;
  parar(): void;
};

export const PAUSA_PADRAO_MS = 3_500;
export const LIMITE_PADRAO_MS = 8_000;
const REAGENDAR_MS = 1_000;

export function criarGatilho(opcoes: OpcoesGatilho): Gatilho {
  const pausaMs = opcoes.pausaMs ?? PAUSA_PADRAO_MS;
  const limiteMs = opcoes.limiteMs ?? LIMITE_PADRAO_MS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let rodando = false;
  /** null = nada esperando; true/false = há um pedido esperando (e se ele é forçado). */
  let esperando: boolean | null = null;
  let parado = false;

  function limparTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  async function disparar(forcar: boolean) {
    if (parado) return;
    if (!opcoes.podeAnalisar()) {
      // Candidato falando (ou agente ocupado): não descarta, tenta de novo daqui a pouco.
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          void disparar(forcar);
        }, REAGENDAR_MS);
      }
      return;
    }
    if (rodando) {
      // O último vence: só guarda que há um pedido novo (o desenho é lido na hora de mandar).
      esperando = (esperando ?? false) || forcar;
      return;
    }

    const pedido = opcoes.montarPedido(forcar);
    if (!pedido) return;

    rodando = true;
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), limiteMs);
    try {
      const resposta = await Promise.race([
        opcoes.analisar(pedido, controle.signal),
        new Promise<never>((_, rejeitar) =>
          controle.signal.addEventListener("abort", () =>
            rejeitar(new Error(`Análise passou de ${limiteMs}ms`)),
          ),
        ),
      ]);
      if (!parado) opcoes.aoResultado(resposta, pedido);
    } catch (erro) {
      opcoes.aoErro?.(erro);
    } finally {
      clearTimeout(prazo);
      rodando = false;
      if (esperando !== null && !parado) {
        const forcarProximo = esperando;
        esperando = null;
        void disparar(forcarProximo);
      }
    }
  }

  return {
    mudou() {
      if (parado) return;
      limparTimer();
      timer = setTimeout(() => {
        timer = null;
        void disparar(false);
      }, pausaMs);
    },
    dispararAgora() {
      limparTimer();
      void disparar(true);
    },
    parar() {
      parado = true;
      limparTimer();
      esperando = null;
    },
  };
}
