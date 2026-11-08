// Compara modelos para a fala ao vivo do Totti: tempo (p50/p95) e acerto nos casos de scripts/validar-conversa.ts.
// Usa créditos dos provedores. Uso:
//   npx tsx --env-file-if-exists=.env.local scripts/bench-conversa.ts openrouter:anthropic/claude-haiku-5.5 featherless:google/gemma-4-26B-A4B-it
//   (sem argumentos: a lista padrão abaixo; RODADAS=2 repete os casos)
import { z } from "zod";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { featherless } from "../lib/llm/featherless";
import { chatJsonVia, type LlmProviderName, type ReasoningEffort } from "../lib/llm/openaiCompat";
import { openrouter } from "../lib/llm/openrouter";
import { rodarCasos, type ResultadoCaso } from "./validar-conversa";

const PADRAO = [
  "featherless:google/gemma-4-26B-A4B-it",
  "featherless:zai-org/GLM-5.3-Flash@low",
  "openrouter:google/gemini-2.5-flash-lite",
  "openrouter:anthropic/claude-haiku-5.5",
  "openrouter:openai/gpt-4.1-mini",
  "openrouter:google/gemini-3.5-flash-lite",
];
const PROVEDORES = { featherless, openrouter } as const;

function percentil(xs: number[], p: number): number {
  const ordenado = [...xs].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))] ?? 0;
}

async function medir(alvo: string, rodadas: number) {
  const i = alvo.indexOf(":");
  const nomeProvedor = alvo.slice(0, i) as LlmProviderName;
  const resto = alvo.slice(i + 1);
  const [modelo, esforco] = resto.split("@") as [string, ReasoningEffort | undefined];
  const provedor = PROVEDORES[nomeProvedor];
  const llm = criarClientePrincipal({
    // Fala direto com um provedor e modelo, sem hedge, para medir cada um sozinho.
    completar: (async (c: { system: string; user: string; schema: z.ZodType<unknown>; signal?: AbortSignal; prazoMs?: number }) =>
      chatJsonVia(provedor, {
        model: modelo,
        system: c.system,
        user: c.user,
        schema: c.schema,
        maxTokens: esforco ? 1500 : 600,
        reasoningEffort: esforco,
        priorizarLatencia: true,
        temperature: process.env.TEMPERATURA ? Number(process.env.TEMPERATURA) : undefined,
        prioridade: "fala",
        signal: c.signal,
        prazoAte: c.prazoMs ? Date.now() + c.prazoMs : undefined,
      })) as never,
  });
  const todos: ResultadoCaso[] = [];
  for (let i = 0; i < rodadas; i++) todos.push(...(await rodarCasos(llm, { silencioso: true })));
  const ms = todos.map((r) => r.ms);
  const falhas = todos.filter((r) => !r.ok);
  return { alvo, p50: percentil(ms, 50), p95: percentil(ms, 95), acertos: `${todos.length - falhas.length}/${todos.length}`, falhas };
}

async function main() {
  const alvos = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO;
  const rodadas = Number(process.env.RODADAS) || 1;
  const linhas = [];
  for (const alvo of alvos) {
    try {
      const r = await medir(alvo, rodadas);
      linhas.push(r);
      console.log(`${r.alvo.padEnd(48)} p50 ${String(r.p50).padStart(5)} ms  p95 ${String(r.p95).padStart(5)} ms  acertos ${r.acertos}`);
      for (const f of r.falhas) console.log(`    ✗ ${f.motivo}  «${f.texto.slice(0, 140)}»`);
    } catch (erro) {
      console.log(`${alvo.padEnd(48)} erro: ${erro instanceof Error ? erro.message.slice(0, 200) : erro}`);
    }
  }
}
main();
