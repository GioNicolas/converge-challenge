// O silêncio do candidato no quadro: quando o navegador pede uma análise sem o candidato ter mexido no desenho nem
// falado (a análise pode quebrar o silêncio, ver o princípio 13 de lib/agente/prompts/avaliador.ts). Função pura:
// usada pelo quadro (lib/sessao/useEntrevista.ts) e pela simulação da linha do tempo (scripts/linha-do-tempo-quadro.ts),
// para que as duas falem da mesma regra.
import { SILENCIO_INICIAL_S, SILENCIO_REPETIR_S, SILENCIO_S, SILENCIO_SEM_ACAO_S } from "@/lib/contracts";

/** As fases em que o quadro força análises por silêncio (no FECHAMENTO também: a pergunta final sai por elas). */
const FASES_COM_SILENCIO = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];

export type SituacaoDoSilencio = {
  agora: number;
  fase: string;
  /** Última ação do candidato (mexeu no desenho ou falou), em ms. */
  ultimaAtividade: number;
  /** Última fala do Totti (começo ou fim), em ms; null se ainda não falou. */
  ultimaFalaDoAgente: number | null;
  /** Último pedido de tempo para pensar, em ms (conta como fala do Totti); null se não houve. */
  pedidoDeTempoEm?: number | null;
  /** Última análise forçada por silêncio, em ms (0 = nenhuma). */
  ultimoDisparo: number;
};

function maiorDe(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Hora de forçar uma análise por silêncio? Quem chama confere antes se o plin está livre.
 * - Se o Totti falou (ou o candidato pediu tempo, que conta como fala) depois da última ação do candidato, a análise só
 *   sai depois de SILENCIO_SEM_ACAO_S de silêncio total, e uma vez por período: depois dessa quebra não repete até o
 *   candidato agir.
 * - Senão, a primeira análise sai SILENCIO_S depois da última ação (SILENCIO_INICIAL_S em REQUISITOS); se o silêncio
 *   continua, volta a cada SILENCIO_REPETIR_S.
 */
export function deveForcarAnalise(s: SituacaoDoSilencio): boolean {
  if (!FASES_COM_SILENCIO.includes(s.fase)) return false;
  // O pedido de tempo conta como fala do Totti: a espera de 60 s começa nele, se for a última coisa do agente.
  const falaDoTotti = maiorDe(s.ultimaFalaDoAgente, s.pedidoDeTempoEm ?? null);
  if (falaDoTotti !== null && falaDoTotti > s.ultimaAtividade) {
    if (s.ultimoDisparo > s.ultimaAtividade) return false;
    return s.agora - falaDoTotti > SILENCIO_SEM_ACAO_S * 1000;
  }
  const referencia = Math.max(s.ultimaAtividade, s.ultimoDisparo);
  const primeiro = (s.fase === "REQUISITOS" ? SILENCIO_INICIAL_S : SILENCIO_S) * 1000;
  const limite = s.ultimoDisparo > s.ultimaAtividade ? SILENCIO_REPETIR_S * 1000 : primeiro;
  return s.agora - referencia > limite;
}
