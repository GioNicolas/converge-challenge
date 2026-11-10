// Compara modelos para a ANÁLISE do live coding (papel "codigo": lê o código e prepara as perguntas).
// Roda o Analyst de verdade (portão, prompt, guardas) em cenários fixos, trocando só o modelo do papel, e mede:
// perguntas geradas, spoilers (solução ou bug na pergunta/tema), descartes das guardas, p50/p95, custo e erros.
// Usa créditos dos provedores. Uso:
//   npx tsx --env-file-if-exists=.env.local scripts/bench-analista.ts featherless:google/gemma-4-26B-A4B-it featherless:zai-org/GLM-5.3-Flash@low
//   (RODADAS=3 repete cada cenário; MOSTRAR=1 imprime as perguntas; sem argumentos, a lista padrão abaixo)
// O sufixo @low|@medium|@high liga o reasoningEffort; sem sufixo, o modelo vai sem ele.
import "./_gasto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { runAnalyst } from "@/lib/agents/analyst";
import { SessionEvent } from "@/lib/contracts";
import { getLlmStats, type LlmProviderName } from "@/lib/llm";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";

const PADRAO = ["featherless:zai-org/GLM-5.3-Flash@low", "featherless:google/gemma-4-26B-A4B-it"];

/** Termos que entregariam a solução quando o código ainda não usa dicionário (mesmos do validar-conversa-ide). */
const SOLUCAO = /dicion[aá]rio|hash ?map|tabela hash|complemento|\bset\b|conjunto|estrutura auxiliar|ordenar|ordenando/i;
/** O bug do fixture é o j começar em 0 (soma o elemento com ele mesmo): citar esse cenário entrega o bug. */
const BUG = /mesmo (valor|elemento|[íi]ndice|n[úu]mero|lugar|posi[çc][ãa]o)|ele mesmo|\b[ij]\b (e|for|forem|igual|chega|coincid)[^?.]{0,25}\b[ij]\b|\[3, ?3\]|i ?== ?j/i;
/** Insinua erro ("você notou…", "há algum problema…"). */
const INSINUA_ERRO = /voc[eê] notou|percebeu que|algum problema|est[aá] errad|tem um erro|bug/i;
/** O prompt pede pergunta amarrada ao código ("esse loop", "o seen", "esse return"); sem nada disso, é genérica. */
const CITA_CODIGO = /\b(loop|for|if|return|retorn|dicion[aá]rio|teste|testes|run|range|lista|array|par|pares|índice|indice|complexidade|O\()/i;
function citaCodigo(pergunta: string, codigo: string): boolean {
  const nomes = new Set((codigo.match(/[A-Za-z_]\w{2,}/g) ?? []).filter((n) => !["def", "for", "return", "range", "len"].includes(n)));
  return CITA_CODIGO.test(pergunta) || (pergunta.match(/[A-Za-z_]\w*/g) ?? []).some((w) => nomes.has(w));
}

const FIXTURE: SessionEvent[] = z.array(SessionEvent).parse(JSON.parse(readFileSync("fixtures/forca-bruta.json", "utf8")));
const GATILHOS = new Set<SessionEvent["type"]>(["pause", "run", "paste", "blip_closed"]);

const HASH = `def two_sum(nums, target):
    vistos = {}
    for i, n in enumerate(nums):
        if target - n in vistos:
            return [vistos[target - n], i]
        vistos[n] = i
    return []
`;

interface Cenario {
  nome: string;
  eventos: SessionEvent[];
  /** Precisa sair pelo menos uma pergunta. */
  esperaPergunta: boolean;
  /** O código ainda não usa dicionário: citar a técnica é spoiler. */
  semSolucao: boolean;
  /** O código tem o bug do j em 0: citar o caso é spoiler. */
  comBug: boolean;
  /** Momento-chave: a primeira pergunta deveria ter priority >= 0.85. */
  chave?: boolean;
}

function corte(t: number): SessionEvent[] {
  return FIXTURE.filter((e) => e.t <= t);
}

function colagem(): SessionEvent[] {
  const id = "colou";
  return [
    { type: "session_started", sessionId: id, t: 0, configId: "default", problemId: "two-sum", language: "python" },
    { type: "snapshot", sessionId: id, t: 110_000, code: HASH, version: 1, language: "python" },
    { type: "paste", sessionId: id, t: 110_000, chars: HASH.length, lines: HASH.split("\n").length, startLine: 1 },
  ] as SessionEvent[];
}

const CENARIOS: Cenario[] = [
  { nome: "plano (loop externo)", eventos: corte(100_000), esperaPergunta: true, semSolucao: true, comBug: false },
  { nome: "bug, run vermelho", eventos: corte(270_000), esperaPergunta: true, semSolucao: true, comBug: true },
  { nome: "primeiro run verde", eventos: corte(300_000), esperaPergunta: true, semSolucao: true, comBug: false, chave: true },
  { nome: "colou a solução", eventos: colagem(), esperaPergunta: true, semSolucao: false, comBug: false, chave: true },
  { nome: "otimizado, parado", eventos: corte(720_000), esperaPergunta: true, semSolucao: false, comBug: false },
];

function codigoAtual(s: { events: SessionEvent[] }): string {
  const snap = [...s.events].reverse().find((e) => e.type === "snapshot");
  return snap?.type === "snapshot" ? snap.code : "";
}

function percentil(xs: number[], p: number): number {
  const ordenado = [...xs].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))] ?? 0;
}

/** Aponta o papel "codigo" para o alvo, pelas mesmas variáveis que o deploy usaria. */
function apontar(alvo: string): void {
  const i = alvo.indexOf(":");
  const provedor = alvo.slice(0, i) as LlmProviderName;
  const [modelo, esforco] = alvo.slice(i + 1).split("@");
  process.env.LLM_PRIMARIO_CODIGO = provedor;
  process.env[provedor === "featherless" ? "ANALISE_CODIGO_FEATHERLESS_MODEL" : "ANALISE_CODIGO_MODEL"] = modelo;
  process.env.LLM_RACIOCINIO_CODIGO = esforco ?? "nenhum";
}

async function rodarCenario(c: Cenario, n: number) {
  const id = `bench-analista-${Date.now()}-${n}`;
  const s = getOrCreateSession(id);
  for (const e of c.eventos) appendEvent(s, { ...e, sessionId: id } as SessionEvent);
  const ultimo = [...c.eventos].reverse().find((e) => GATILHOS.has(e.type));
  const t = c.eventos.at(-1)?.t ?? 0;
  const gatilho = (ultimo && ultimo.t === t ? { ...ultimo, sessionId: id } : { type: "pause", sessionId: id, t, idleMs: 10_000 }) as SessionEvent;
  await runAnalyst(s, gatilho);
  return s;
}

async function medir(alvo: string, rodadas: number) {
  apontar(alvo);
  const antes = structuredClone(getLlmStats().providers);
  const tempos: number[] = [];
  let custo = 0;
  let erros = 0;
  let perguntas = 0;
  let descartes = 0;
  let ok = 0;
  let total = 0;
  const falhas: string[] = [];
  for (let r = 0; r < rodadas; r++) {
    for (const [k, c] of CENARIOS.entries()) {
      total++;
      const s = await rodarCenario(c, r * 100 + k);
      const a = s.analyst;
      if (a.lastDurationMs !== undefined && !a.lastError) tempos.push(a.lastDurationMs);
      custo += a.costUsd;
      const problemas: string[] = [];
      if (a.lastError) {
        erros++;
        problemas.push(`erro: ${a.lastError.slice(0, 80)}`);
      }
      const qs = s.queue.filter((q) => q.status === "queued");
      perguntas += qs.length;
      const desc = /(\d+) (?:descartadas|barradas)/.exec(a.lastOutcome?.text ?? "");
      descartes += desc ? Number(desc[1]) : 0;
      if (c.esperaPergunta && qs.length === 0 && !a.lastError) problemas.push("nenhuma pergunta");
      for (const q of qs) {
        const texto = `${q.question}\n${q.followUpTopic}`;
        if (c.semSolucao && SOLUCAO.test(texto)) problemas.push(`solução: ${q.question}`);
        if (c.comBug && BUG.test(texto)) problemas.push(`bug: ${q.question}`);
        if (INSINUA_ERRO.test(q.question)) problemas.push(`insinua erro: ${q.question}`);
        // A pergunta de foco (escala, pressão, IA) pode não citar o código, por desenho.
        if (q.focusArea === undefined && !citaCodigo(q.question, codigoAtual(s))) problemas.push(`genérica: ${q.question}`);
      }
      if (c.chave && qs[0] && qs[0].priority < 0.85) problemas.push(`momento-chave com priority ${qs[0].priority}`);
      if (problemas.length === 0) ok++;
      else falhas.push(...problemas.map((p) => `[${c.nome}] ${p}`));
      if (process.env.MOSTRAR) {
        console.log(`  ${alvo} · ${c.nome} · ${a.lastDurationMs ?? "-"} ms · ${a.lastOutcome?.text ?? ""}`);
        for (const q of qs) console.log(`    - (${q.kind}, ${q.priority}) ${q.question}  [tema: ${q.followUpTopic}]`);
        for (const p of problemas) console.log(`    ✗ ${p}`);
      }
    }
  }
  const depois = getLlmStats().providers;
  const reservas = (["featherless", "openrouter"] as const)
    .filter((p) => p !== process.env.LLM_PRIMARIO_ANALYST)
    .reduce((n, p) => n + depois[p].calls - antes[p].calls, 0);
  return {
    alvo,
    acertos: `${ok}/${total}`,
    erros,
    reservas,
    perguntasPorAnalise: Number((perguntas / total).toFixed(2)),
    descartesGuarda: descartes,
    p50: percentil(tempos, 50),
    p95: percentil(tempos, 95),
    custoPorAnaliseUsd: Number((custo / total).toFixed(5)),
    falhas,
  };
}

async function main() {
  const alvos = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO;
  const rodadas = Number(process.env.RODADAS) || 2;
  const linhas = [];
  for (const alvo of alvos) {
    const r = await medir(alvo, rodadas);
    console.log(JSON.stringify(r));
    linhas.push(r);
  }
  console.table(linhas.map((l) => ({ ...l, falhas: l.falhas.length })));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
