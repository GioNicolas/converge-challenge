// Resumo do custo de LLM de uma simulação: por papel e por provedor, a partir de getLlmStats (lib/llm).
// Uso: scripts/custo.ts <sessaoId> | --arquivo <json>. Para diferenças de uma chamada, use instantaneo() e resumoDoCusto(antes).
import "./_gasto";
import { readFile } from "node:fs/promises";
import { getLlmStats, type LlmRole } from "../lib/llm";
import { repositorioPadrao } from "../lib/agente/armazenamento";
import { resumirUso, type EventoUso } from "../lib/custo/resumo";

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

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const indiceArquivo = argumentos.indexOf("--arquivo");
  let eventos: EventoUso[];

  if (indiceArquivo >= 0) {
    const caminho = argumentos[indiceArquivo + 1];
    if (!caminho) throw new Error("Uso: scripts/custo.ts <sessaoId> | --arquivo <json>");
    eventos = JSON.parse(await readFile(caminho, "utf8")) as EventoUso[];
  } else {
    const sessaoId = argumentos[0];
    if (!sessaoId) throw new Error("Uso: scripts/custo.ts <sessaoId> | --arquivo <json>");
    eventos = await repositorioPadrao().listarEventos(sessaoId) as EventoUso[];
    if (eventos.length === 0) {
      const { kvRemoto } = await import("../lib/storage/kv");
      const sessao = await kvRemoto()?.get<{ events?: EventoUso[] }>("sessoes-live", sessaoId);
      eventos = sessao?.events ?? [];
    }
  }

  const resumo = resumirUso(eventos);
  const tipoDoEvento = (evento: EventoUso) => evento.tipo ?? evento.type;
  const rotulos: [string, string][] = [
    ["perguntar/fala", "perguntar/fala"],
    ["análise", "análise"],
    ["scorecard/relatório", "scorecard/relatório"],
    ["filtro", "filtro"],
  ];
  for (const [chave, rotulo] of rotulos) {
    const papel = resumo.papeis[chave];
    if (!papel) {
      console.log(`${rotulo}: não registrado`);
      continue;
    }
    console.log(`${rotulo}: ${papel.chamadas} chamadas; reserva ${papel.reserva}; ${papel.modelos.join(", ")} / ${papel.provedores.join(", ")} — US$ ${papel.custo_usd.toFixed(4)}`);
  }
  const usoLlmRegistrado = eventos.some((evento) => ["llm_uso", "perguntar_uso", "analise_uso", "scorecard_uso"].includes(tipoDoEvento(evento) ?? ""));
  console.log(`OpenRouter: ${usoLlmRegistrado ? `US$ ${resumo.custoOpenRouter.toFixed(4)}` : "não registrado"}; reservas: ${usoLlmRegistrado ? resumo.reservas : "não registrado"}`);
  console.log(`Cache: ${resumo.taxaCache === null ? "não registrado" : `${(resumo.taxaCache * 100).toFixed(1)}%`}`);
  const vozRegistrada = eventos.some((evento) => tipoDoEvento(evento) === "voz_uso");
  const descarteRegistrado = eventos.some((evento) => tipoDoEvento(evento) === "voz_descartada");
  const voz = vozRegistrada ? String(resumo.caracteresVoz) : "não registrado";
  const descartados = descarteRegistrado ? String(resumo.caracteresDescartados) : "não registrado";
  console.log(`Voz: ${voz} caracteres; descartados: ${descartados}${resumo.percentualDescartado === null ? "" : ` (${(resumo.percentualDescartado * 100).toFixed(1)}%)`}`);
  const transcricaoRegistrada = eventos.some((evento) => tipoDoEvento(evento) === "transcricao_uso");
  const audio = transcricaoRegistrada ? String(resumo.audioEnviadoS) : "não registrado";
  const sessao = transcricaoRegistrada ? String(resumo.sessaoS) : "não registrado";
  console.log(`Áudio: ${audio} s / sessão ${sessao} s${resumo.proporcaoAudio === null ? "" : ` (${(resumo.proporcaoAudio * 100).toFixed(1)}%)`}`);
}

if (process.argv[1]?.endsWith("/scripts/custo.ts")) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  });
}
