/**
 * Contagem das decisões pendentes que o simulador mostra no resumo de condução.
 *
 * A decisão sai do evento `plano` que o turno registra ao aplicar o que o modelo devolveu ("decisão pendente (...):
 * o modelo devolveu ..."), e não da `fala_agente`: quando o modelo decide, a fala dita pode ser outra (a pergunta
 * seguinte ou a fala fixa de encerramento), sem o campo `decisao`.
 */
import type { EventoLog } from "@/lib/pre-entrevista/log";

interface DadosDaDecisao {
  pendente?: { tipo?: string };
  devolvida?: string;
  decisao?: unknown;
}

/**
 * Uma chave `tipo:decisão` por decisão pendente que foi ao modelo, na ordem do log. A decisão é a aplicada
 * (valor inválido vira `adiar`); `sem campo` quando o modelo não devolveu `decisao`. Função pura.
 */
export function decisoesDoModelo(logs: readonly Pick<EventoLog, "tipo" | "dados">[]): string[] {
  const chaves: string[] = [];
  for (const e of logs) {
    if (e.tipo !== "plano") continue;
    const dados = (e.dados ?? {}) as DadosDaDecisao;
    // O evento do planejamento também traz `pendente`, mas sem `decisao`; o da troca traz `decisao`, mas sem `pendente`.
    if (!dados.pendente?.tipo || typeof dados.decisao !== "string") continue;
    chaves.push(`${dados.pendente.tipo}:${dados.devolvida === undefined ? "sem campo" : dados.decisao}`);
  }
  return chaves;
}
