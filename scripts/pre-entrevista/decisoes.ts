/**
 * Contagem das decisões pendentes que o simulador mostra no resumo de condução.
 *
 * Cada turno com decisão pendente grava uma `fala_agente` com `pendente`, a `decisao` devolvida pelo modelo e a
 * `leituraDaDecisao` (ver `LeituraDaDecisao` em `lib/pre-entrevista/turno.ts`): o que o turno fez com ela. A fala dita
 * pode ser outra (a pergunta seguinte ou a fala fixa de encerramento), por isso a contagem não olha o texto.
 */
import type { EventoLog } from "@/lib/pre-entrevista/log";
import type { LeituraDaDecisao } from "@/lib/pre-entrevista/turno";

interface DadosDaFala {
  pendente?: { tipo?: string };
  decisao?: string;
  leituraDaDecisao?: LeituraDaDecisao;
}

/** O rótulo de uma decisão pendente: a aplicada, ou por que nada foi aplicado. */
function rotulo(devolvida: string | undefined, leitura: LeituraDaDecisao | undefined): string {
  if (!leitura) return devolvida === undefined ? "sem campo" : devolvida;
  if (leitura.tipo === "falhou") return "falhou";
  if (leitura.tipo === "nao_lida") return `não lida (${leitura.movimento})`;
  if (devolvida === undefined) return "sem campo";
  return leitura.valida ? leitura.decisao : `${leitura.decisao} (inválida: ${devolvida})`;
}

/**
 * Uma chave `tipo:rótulo` por turno em que uma decisão pendente foi ao modelo, na ordem do log. O rótulo é a decisão
 * aplicada; `sem campo` quando o modelo não devolveu `decisao`; `adiar (inválida: ...)` com valor que não existe;
 * `falhou` quando o modelo não respondeu; `não lida (...)` quando ele repetiu ou esclareceu. Função pura.
 */
export function decisoesDoModelo(logs: readonly Pick<EventoLog, "tipo" | "dados">[]): string[] {
  const chaves: string[] = [];
  for (const e of logs) {
    if (e.tipo !== "fala_agente") continue;
    const dados = (e.dados ?? {}) as DadosDaFala;
    if (!dados.pendente?.tipo) continue;
    chaves.push(`${dados.pendente.tipo}:${rotulo(dados.decisao, dados.leituraDaDecisao)}`);
  }
  return chaves;
}
