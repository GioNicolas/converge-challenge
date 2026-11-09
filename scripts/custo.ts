// Resumo do custo de LLM de uma simulação: por papel e por provedor, a partir de getLlmStats (lib/llm).
// Use `instantaneo()` antes e `resumoDoCusto(antes)` depois para ter só o que aquela entrevista gastou.
import { getLlmStats, type LlmRole } from "../lib/llm";

type Uso = Record<string, Record<string, { calls: number; costUsd: number }>>;

export function instantaneo(): Uso {
  return Object.fromEntries(Object.entries(getLlmStats().roles).map(([r, s]) => [r, structuredClone(s.uso)]));
}

/** Linhas de texto com o custo de cada papel desde `antes` e o total. */
export function resumoDoCusto(antes: Uso = {}): string {
  const agora = instantaneo();
  const linhas: string[] = [];
  let total = 0;
  let totalOr = 0;
  for (const [papel, porProvedor] of Object.entries(agora) as [LlmRole, Uso[string]][]) {
    const partes: string[] = [];
    let doPapel = 0;
    for (const [prov, u] of Object.entries(porProvedor)) {
      const a = antes[papel]?.[prov] ?? { calls: 0, costUsd: 0 };
      const calls = u.calls - a.calls;
      const custo = u.costUsd - a.costUsd;
      if (calls === 0) continue;
      partes.push(`${prov} ${calls}× US$ ${custo.toFixed(4)}`);
      doPapel += custo;
      if (prov === "openrouter") totalOr += custo;
    }
    if (partes.length) linhas.push(`  ${papel.padEnd(15)} US$ ${doPapel.toFixed(4)}  (${partes.join(", ")})`);
    total += doPapel;
  }
  linhas.push(`  TOTAL           US$ ${total.toFixed(4)}  (OpenRouter US$ ${totalOr.toFixed(4)}, Featherless US$ ${(total - totalOr).toFixed(4)})`);
  return linhas.join("\n");
}
