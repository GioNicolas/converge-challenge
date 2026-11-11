// Mede modelos para o FILTRO DE SPOILER do live coding (papel "filtro", lib/agents/spoilerFilter.ts).
// Roda checkQuestion e checkReply de verdade (prompt, pedido e parse de produção) nos casos fixos de
// lib/agents/__tests__/casos-filtro.ts, trocando só o modelo do papel, e mostra: acertos, INSEGUROS QUE PASSARAM
// (o erro grave), seguros barrados, vereditos instáveis entre rodadas, p50/p95, tokens e custo por conferência.
// Usa créditos dos provedores. Uso:
//   npx tsx --env-file-if-exists=.env.local scripts/bench-filtro.ts --pago openrouter:google/gemini-3.5-flash-lite openrouter:google/gemini-2.5-flash-lite
//   (RODADAS=2 repete os casos; SO=pergunta|fala roda só uma das conferências; MOSTRAR=1 imprime todos os vereditos;
//    VALIDACAO=1 roda os casos de validação, que ficam fora do ajuste do prompt; INEDITOS=1, os escritos depois da validação; JSON=caminho grava o resultado; sem argumentos, a lista padrão abaixo)
// Cada alvo fala só com o provedor dele (sem hedge nem reserva), para medir o modelo sozinho.
import "./_gasto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CASOS_FILTRO, CASOS_FILTRO_INEDITOS, CASOS_FILTRO_VALIDACAO, type CasoFiltro } from "../lib/agents/__tests__/casos-filtro";
import { checkQuestion, checkReply, type VereditoDoFiltro } from "../lib/agents/spoilerFilter";

const PADRAO = ["openrouter:google/gemini-3.5-flash-lite", "openrouter:google/gemini-2.5-flash-lite"];

/** O prazo do filtro na fala ao vivo (PRAZO_FILTRO_MS em lib/agents/interviewer.ts). */
const PRAZO_FALA_MS = 1_800;

const CHAVES = { featherless: process.env.FEATHERLESS_API_KEY, openrouter: process.env.OPENROUTER_API_KEY };

interface Medida {
  caso: CasoFiltro;
  rodada: number;
  safe: boolean;
  reason: string;
  ms: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  erro: boolean;
}

function percentil(xs: number[], p: number): number {
  const ordenado = [...xs].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))] ?? 0;
}

/** Aponta o papel "filtro" para um provedor e modelo só. */
function apontar(alvo: string): void {
  const i = alvo.indexOf(":");
  const provedor = alvo.slice(0, i);
  const modelo = alvo.slice(i + 1);
  if (provedor !== "openrouter" && provedor !== "featherless") throw new Error(`provedor desconhecido em ${alvo}`);
  const chave = CHAVES[provedor];
  if (!chave) {
    throw new Error(provedor === "openrouter" ? "sem OPENROUTER_API_KEY (rode com --pago)" : "sem FEATHERLESS_API_KEY");
  }
  // completeJson usa só o provedor que tem chave: o outro sai do ambiente durante a medição.
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.FEATHERLESS_API_KEY;
  if (provedor === "openrouter") {
    process.env.OPENROUTER_API_KEY = chave;
    process.env.FILTRO_MODEL = modelo;
  } else {
    process.env.FEATHERLESS_API_KEY = chave;
    process.env.FILTRO_RESERVA_MODEL = modelo;
  }
}

async function conferir(caso: CasoFiltro): Promise<VereditoDoFiltro> {
  return caso.tipo === "pergunta"
    ? checkQuestion(caso.pergunta, caso.tema, caso.kind, { code: caso.codigo, candidateSaid: caso.falas })
    : checkReply(caso.fala, caso.falas, caso.dica, caso.codigo);
}

/** Roda as tarefas com no máximo `n` ao mesmo tempo, na ordem. */
async function emParalelo<T>(tarefas: Array<() => Promise<T>>, n: number): Promise<T[]> {
  const saida: T[] = new Array(tarefas.length);
  let proxima = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tarefas.length) }, async () => {
      while (proxima < tarefas.length) {
        const i = proxima++;
        saida[i] = await tarefas[i]();
      }
    }),
  );
  return saida;
}

async function medir(alvo: string, casos: CasoFiltro[], rodadas: number): Promise<Medida[]> {
  apontar(alvo);
  const medidas: Medida[] = [];
  for (let rodada = 1; rodada <= rodadas; rodada++) {
    const tarefas = casos.map((caso) => async (): Promise<Medida> => {
      const inicio = Date.now();
      const v = await conferir(caso);
      return {
        caso,
        rodada,
        safe: v.safe,
        reason: v.reason,
        ms: Date.now() - inicio,
        costUsd: v.costUsd,
        promptTokens: v.promptTokens ?? 0,
        completionTokens: v.completionTokens ?? 0,
        // O filtro deixa passar quando o modelo falha: aqui isso conta como erro, não como "seguro".
        erro: v.reason === "filtro indisponível" || v.reason === "filtro de fala indisponível",
      };
    });
    medidas.push(...(await emParalelo(tarefas, Number(process.env.CONCORRENCIA) || 3)));
  }
  return medidas;
}

const usd = (v: number) => `US$ ${v.toFixed(5)}`;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function resumir(alvo: string, medidas: Medida[], rodadas: number) {
  const validas = medidas.filter((m) => !m.erro);
  const acertos = validas.filter((m) => (m.caso.esperado === "seguro") === m.safe);
  const inseguroPassou = validas.filter((m) => m.caso.esperado === "inseguro" && m.safe);
  const seguroBarrado = validas.filter((m) => m.caso.esperado === "seguro" && !m.safe);
  const porCaso = new Map<string, Set<boolean>>();
  for (const m of validas) porCaso.set(m.caso.id, (porCaso.get(m.caso.id) ?? new Set()).add(m.safe));
  const instaveis = [...porCaso].filter(([, s]) => s.size > 1).map(([id]) => id);
  const ms = validas.map((m) => m.ms);
  const custo = validas.map((m) => m.costUsd);
  const r = {
    alvo,
    rodadas,
    conferencias: medidas.length,
    erros: medidas.length - validas.length,
    acertos: acertos.length,
    inseguroPassou: [...new Set(inseguroPassou.map((m) => m.caso.id))],
    seguroBarrado: [...new Set(seguroBarrado.map((m) => m.caso.id))],
    instaveis,
    p50: percentil(ms, 50),
    p95: percentil(ms, 95),
    acimaDoPrazo: ms.filter((x) => x > PRAZO_FALA_MS).length,
    custoMedio: media(custo),
    custoTotal: custo.reduce((a, b) => a + b, 0),
    entradaMedia: Math.round(media(validas.map((m) => m.promptTokens))),
    saidaMedia: Math.round(media(validas.map((m) => m.completionTokens))),
    porTipo: (["pergunta", "fala"] as const).map((tipo) => {
      const doTipo = validas.filter((m) => m.caso.tipo === tipo);
      return { tipo, n: doTipo.length, custoMedio: media(doTipo.map((m) => m.costUsd)), entrada: Math.round(media(doTipo.map((m) => m.promptTokens))) };
    }),
  };
  console.log(`\n${alvo}  (${rodadas} rodada(s), ${r.conferencias} conferências, ${r.erros} erro(s))`);
  console.log(`  acertos ${r.acertos}/${validas.length}   inseguros que passaram ${inseguroPassou.length}   seguros barrados ${seguroBarrado.length}   instáveis ${instaveis.length}`);
  console.log(`  p50 ${r.p50} ms   p95 ${r.p95} ms   acima de ${PRAZO_FALA_MS} ms: ${r.acimaDoPrazo}`);
  console.log(`  custo por conferência ${usd(r.custoMedio)}   total ${usd(r.custoTotal)}   tokens entrada ${r.entradaMedia} saída ${r.saidaMedia}`);
  for (const t of r.porTipo) console.log(`    ${t.tipo.padEnd(8)} n=${t.n}  ${usd(t.custoMedio)}  entrada ${t.entrada}`);
  for (const m of inseguroPassou) console.log(`    ✗ INSEGURO PASSOU [${m.caso.id}] r${m.rodada}: ${m.reason}`);
  for (const m of seguroBarrado) console.log(`    ✗ seguro barrado [${m.caso.id}] r${m.rodada}: ${m.reason}`);
  for (const m of medidas.filter((x) => x.erro)) console.log(`    ! erro [${m.caso.id}] r${m.rodada}`);
  if (process.env.MOSTRAR) {
    for (const m of medidas) console.log(`    ${m.safe ? "seguro  " : "inseguro"} ${m.ms}ms [${m.caso.id}] ${m.reason}`);
  }
  return r;
}

async function main() {
  const alvos = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO;
  const rodadas = Number(process.env.RODADAS) || 1;
  const so = process.env.SO;
  const base = process.env.INEDITOS ? CASOS_FILTRO_INEDITOS : process.env.VALIDACAO ? CASOS_FILTRO_VALIDACAO : CASOS_FILTRO;
  const casos = so ? base.filter((c) => c.tipo === so) : base;
  // O cliente loga cada chamada; aqui só interessa o resumo.
  const log = console.log;
  const avisos = console.warn;
  const resultados = [];
  for (const alvo of alvos) {
    console.log = () => {};
    console.warn = () => {};
    try {
      const medidas = await medir(alvo, casos, rodadas);
      console.log = log;
      console.warn = avisos;
      resultados.push(resumir(alvo, medidas, rodadas));
    } catch (erro) {
      console.log = log;
      console.warn = avisos;
      console.log(`${alvo}: erro: ${erro instanceof Error ? erro.message.slice(0, 200) : erro}`);
    }
  }
  if (process.env.JSON) {
    mkdirSync(dirname(process.env.JSON), { recursive: true });
    writeFileSync(process.env.JSON, JSON.stringify(resultados, null, 2));
  }
}

main();
