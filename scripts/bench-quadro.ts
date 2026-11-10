// Compara modelos para a ANÁLISE do quadro (papel "quadro": decide se e o que perguntar), só com o grafo em texto.
// Roda a simulação de scripts/simular-conducao.ts trocando só o modelo da análise; a fala segue no papel "conversa".
// Usa créditos dos provedores. Uso:
//   npx tsx --env-file-if-exists=.env.local scripts/bench-quadro.ts featherless:mistralai/Mistral-Small-3.2-24B-Instruct-2506 openrouter:google/gemini-3.7-flash@low
//   (RODADAS=3 repete a simulação; sem argumentos, a lista padrão abaixo)
import "./_gasto";
import { featherless } from "../lib/llm/featherless";
import { completeJson, getLlmStats } from "../lib/llm";
import { chatJsonVia, type LlmProviderName, type ReasoningEffort } from "../lib/llm/openaiCompat";
import { openrouter } from "../lib/llm/openrouter";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { simular } from "./simular-conducao";

const PADRAO = [
  "openrouter:google/gemini-3.7-flash@low",
  "featherless:mistralai/Mistral-Small-3.2-24B-Instruct-2506",
  "featherless:google/gemma-4-26B-A4B-it",
  "featherless:google/gemma-4-31B-it",
  "featherless:Qwen/Qwen3.6-35B-A3B",
  "featherless:zai-org/GLM-5.3-Flash@low",
];
const PROVEDORES = { featherless, openrouter } as const;

function percentil(xs: number[], p: number): number {
  const ordenado = [...xs].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))] ?? 0;
}

/** Gasto somado dos dois provedores neste processo (a conversa da simulação também passa por aqui). */
const gastoProcesso = () => Object.values(getLlmStats().providers).reduce((n, p) => n + p.costUsd, 0);

async function medir(alvo: string, rodadas: number) {
  const gastoAntes = gastoProcesso();
  const i = alvo.indexOf(":");
  const provedor = PROVEDORES[alvo.slice(0, i) as LlmProviderName];
  const [modelo, esforco] = alvo.slice(i + 1).split("@") as [string, ReasoningEffort | undefined];
  const tempos: number[] = [];
  let entrada = 0;
  let saida = 0;
  let custo = 0;
  const llm = criarClientePrincipal({
    completar: (async (c: Parameters<typeof completeJson>[0]) => {
      // Só a análise vai para o modelo medido; a fala usa o papel de sempre, para não misturar as variáveis.
      if (c.role !== "quadro") return completeJson(c);
      const r = await chatJsonVia(provedor, {
        model: modelo,
        system: c.system,
        user: c.user,
        schema: c.schema,
        maxTokens: c.maxTokens ?? 4000,
        reasoningEffort: esforco,
        temperature: 0.4,
        prioridade: "fundo",
        signal: c.signal,
        prazoAte: c.prazoMs ? Date.now() + c.prazoMs : undefined,
      });
      tempos.push(r.durationMs);
      entrada += r.promptTokens;
      saida += r.completionTokens;
      custo += r.costUsd;
      return r;
    }) as never,
  });
  let aprovadas = 0;
  let erros = 0;
  const falhas: string[] = [];
  for (let n = 0; n < rodadas; n++) {
    const r = await simular(llm, { silencioso: true });
    erros += r.erros;
    if (r.problemas.length === 0) aprovadas++;
    else falhas.push(...r.problemas);
    if (process.env.MOSTRAR) console.log(`  ${alvo} rodada ${n + 1}:\n    ${r.perguntas.join("\n    ")}`);
  }
  return {
    alvo,
    aprovadas: `${aprovadas}/${rodadas}`,
    erros,
    p50: percentil(tempos, 50),
    p90: percentil(tempos, 90),
    p95: percentil(tempos, 95),
    /** Disparos da reserva por prazo do hedge: quantas chamadas passariam de 6 s, 7 s e 8 s. */
    acimaDe6s: tempos.filter((t) => t > 6000).length,
    acimaDe7s: tempos.filter((t) => t > 7000).length,
    acimaDe8s: tempos.filter((t) => t > 8000).length,
    chamadas: tempos.length,
    tokensEntradaMedia: tempos.length ? Math.round(entrada / tempos.length) : 0,
    tokensSaidaMedia: tempos.length ? Math.round(saida / tempos.length) : 0,
    custoUsd: Number(custo.toFixed(4)),
    /** Análise do quadro mais o que o resto da simulação (conversa) gastou no processo. */
    custoTotalUsd: Number((custo + gastoProcesso() - gastoAntes).toFixed(4)),
    falhas: [...new Set(falhas)].join(" | "),
  };
}

async function main() {
  const alvos = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO;
  const rodadas = Number(process.env.RODADAS) || 2;
  const linhas = [];
  for (const alvo of alvos) {
    try {
      const r = await medir(alvo, rodadas);
      console.log(JSON.stringify(r));
      linhas.push(r);
    } catch (e) {
      console.log(JSON.stringify({ alvo, erro: e instanceof Error ? e.message.slice(0, 200) : String(e) }));
    }
  }
  console.table(linhas.map((l) => ({ ...l, falhas: l.falhas.length })));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
