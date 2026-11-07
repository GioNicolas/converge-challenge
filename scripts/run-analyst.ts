/**
 * Roda o Analyst sobre um fixture de sessão, sem a IDE.
 * Uso: npx tsx scripts/run-analyst.ts fixtures/forca-bruta.json --at 03:10
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { runAnalyst } from "@/lib/agents/analyst";
import { SessionEvent } from "@/lib/contracts";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";

const TRIGGERS = new Set<SessionEvent["type"]>(["pause", "run", "paste", "blip_closed"]);
const USAGE = "uso: npx tsx scripts/run-analyst.ts <fixture.json> [--at mm:ss]";

function parseArgs(argv: string[]): { file: string; at?: number } {
  let file: string | undefined;
  let at: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--at") {
      at = parseMmSs(argv[++i] ?? "");
    } else if (file === undefined) {
      file = arg;
    } else {
      throw new Error(USAGE);
    }
  }
  if (file === undefined) throw new Error(USAGE);
  return { file, at };
}

/** "03:10" → 190000 ms. */
function parseMmSs(value: string): number {
  const match = /^(\d+):(\d{1,2})$/.exec(value);
  if (!match) throw new Error(`--at precisa ser mm:ss, recebi "${value}"`);
  return (Number(match[1]) * 60 + Number(match[2])) * 1000;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // sem .env.local: usa as variáveis do ambiente
  }

  const { file, at } = parseArgs(process.argv.slice(2));
  const events = z.array(SessionEvent).parse(JSON.parse(readFileSync(resolve(file), "utf8")));
  const first = events[0];
  if (first === undefined) throw new Error("fixture sem eventos");

  const cutoff = at ?? events.at(-1)?.t ?? 0;
  const visible = events.filter((e) => e.t <= cutoff);
  const session = getOrCreateSession(first.sessionId);
  for (const event of visible) appendEvent(session, event);

  const found = [...visible].reverse().find((e) => TRIGGERS.has(e.type));
  const trigger: SessionEvent = found ?? { sessionId: first.sessionId, t: cutoff, type: "pause", idleMs: 0 };

  await runAnalyst(session, trigger);

  const { analyst, queue } = session;
  console.log(`gatilho: ${trigger.type} em ${formatElapsed(trigger.t)} (${visible.length} eventos até aqui)`);
  console.log("insights:");
  console.log(analyst.insights ? JSON.stringify(analyst.insights, null, 2) : "(nenhum)");
  console.log(`perguntas na fila (${queue.length}):`);
  if (queue.length === 0) console.log("(nenhuma)");
  for (const q of queue) {
    const lines = q.highlight ? `${q.highlight.startLine}-${q.highlight.endLine}` : "-";
    console.log(`- ${q.question}\n  tópico: ${q.followUpTopic}\n  prioridade: ${q.priority}\n  linhas: ${lines}`);
  }
  if (analyst.lastError !== undefined) console.log(`erro: ${analyst.lastError}`);
  console.log(`duração: ${analyst.lastDurationMs ?? "-"} ms · custo: US$ ${analyst.costUsd.toFixed(4)}`);
  if (analyst.lastError !== undefined) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
