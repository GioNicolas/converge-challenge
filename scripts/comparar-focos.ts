/**
 * Testa se as perguntas do Analyst mudam com a config da vaga: roda o MESMO código e o MESMO momento
 * da sessão sob focos diferentes e imprime as perguntas lado a lado.
 *
 * Precisa de FEATHERLESS_API_KEY (ou OPENROUTER_API_KEY) em .env.local.
 * Uso: npx tsx scripts/comparar-focos.ts [fixtures/forca-bruta.json] [--at 03:10] [--rodadas 2]
 */
import "./_gasto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { runAnalyst } from "@/lib/agents/analyst";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { InterviewConfig, SessionEvent, type FocusArea } from "@/lib/contracts";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";

const TRIGGERS = new Set<SessionEvent["type"]>(["pause", "run", "paste", "blip_closed"]);

const VARIANTES: { nome: string; seniority: InterviewConfig["seniority"]; area: FocusArea; notas: string }[] = [
  { nome: "técnico", seniority: "pleno", area: "tecnico", notas: "" },
  { nome: "escala", seniority: "pleno", area: "escala_produto", notas: "Produto com milhões de usuários; precisa pensar em escala." },
  { nome: "pressão", seniority: "pleno", area: "pressao", notas: "Time de plantão; como a pessoa reage sob tempo curto é decisivo." },
  { nome: "uso de IA", seniority: "pleno", area: "uso_ia", notas: "Time usa assistentes de código no dia a dia." },
];

function parseMmSs(v: string): number {
  const m = /^(\d+):(\d{1,2})$/.exec(v);
  if (!m) throw new Error(`--at precisa ser mm:ss, recebi "${v}"`);
  return (Number(m[1]) * 60 + Number(m[2])) * 1000;
}

function variante(v: (typeof VARIANTES)[number]): InterviewConfig {
  return InterviewConfig.parse({
    ...DEFAULT_CONFIG,
    id: `cmp-${v.area}`,
    roleTitle: `Dev Backend (${v.nome})`,
    seniority: v.seniority,
    focus: [{ area: v.area, weight: 1 }],
    recruiterNotes: v.notas,
    criteria: DEFAULT_CONFIG.criteria.map((c) => ({ ...c, focus: v.area })),
  });
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // sem .env.local: usa o ambiente
  }
  const args = process.argv.slice(2);
  let file = "fixtures/forca-bruta.json";
  let at: number | undefined;
  let rodadas = 1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--at") at = parseMmSs(args[++i] ?? "");
    else if (args[i] === "--rodadas") rodadas = Number(args[++i] ?? "1");
    else file = args[i];
  }
  if (!process.env.FEATHERLESS_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Sem FEATHERLESS_API_KEY nem OPENROUTER_API_KEY: coloque a chave em .env.local (veja .env.example).");
  }

  const events = z.array(SessionEvent).parse(JSON.parse(readFileSync(resolve(file), "utf8")));
  const cutoff = at ?? events.at(-1)?.t ?? 0;
  const visible = events.filter((e) => e.t <= cutoff);
  const found = [...visible].reverse().find((e) => TRIGGERS.has(e.type));

  for (let r = 1; r <= rodadas; r++) {
    console.log(`\n===== rodada ${r}/${rodadas} (código e momento idênticos; só a config muda) =====`);
    for (const v of VARIANTES) {
      const session = getOrCreateSession(`cmp-${v.area}-${r}`, variante(v));
      for (const e of visible) appendEvent(session, { ...e, sessionId: session.sessionId });
      const trigger: SessionEvent = found
        ? { ...found, sessionId: session.sessionId }
        : { sessionId: session.sessionId, t: cutoff, type: "pause", idleMs: 0 };
      await runAnalyst(session, trigger);
      console.log(`\n--- foco: ${v.nome} ---`);
      if (session.analyst.lastError) console.log(`erro: ${session.analyst.lastError}`);
      if (session.queue.length === 0) console.log("(nenhuma pergunta)");
      for (const q of session.queue) console.log(`${q.focusArea ? "★ [foco]" : "•"} ${q.question}   [tema: ${q.followUpTopic}; prioridade ${q.priority}]`);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
