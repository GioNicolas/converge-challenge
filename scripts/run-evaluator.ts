/**
 * Roda o Evaluator sobre uma sessão gravada, sem a IDE.
 * Aceita a lista de eventos (fixtures/forca-bruta.json) ou o JSON baixado pela IDE (fixtures/session.json).
 * Uso: npx tsx scripts/run-evaluator.ts fixtures/forca-bruta.json [--json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { startEvaluation, waitForEvaluation } from "@/lib/agents/evaluator";
import { SessionEvent } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";

const USAGE = "uso: npx tsx scripts/run-evaluator.ts <fixture.json> [--json]";
const Fixture = z.union([z.array(SessionEvent), z.object({ timeline: z.array(SessionEvent) })]);

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // sem .env.local: usa as variáveis do ambiente
  }

  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (file === undefined) throw new Error(USAGE);
  const parsed = Fixture.parse(JSON.parse(readFileSync(resolve(file), "utf8")));
  const events = Array.isArray(parsed) ? parsed : parsed.timeline;
  const first = events[0];
  if (first === undefined) throw new Error("fixture sem eventos");

  const session = getOrCreateSession(first.sessionId);
  for (const event of events) appendEvent(session, event);
  if (!session.ended) {
    const t = events.at(-1)!.t;
    appendEvent(session, { sessionId: first.sessionId, t, type: "session_ended", reason: "button" });
  }

  startEvaluation(session);
  const status = await waitForEvaluation(session);
  if (!status?.report) throw new Error(`avaliação falhou: ${status?.error ?? "sem estado"}`);

  const { report, hiddenTests } = status;
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const rec = { avancar: "Avançar", talvez: "Talvez", nao_avancar: "Não avançar" }[report.recommendation];
  console.log(`${rec} · ${report.overallScore.toFixed(1)}/4`);
  console.log(report.summary);
  if (hiddenTests?.ran) {
    console.log(`\ntestes escondidos: ${hiddenTests.passed}/${hiddenTests.total}`);
    for (const c of hiddenTests.cases) console.log(`  ${c.passed ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  } else if (hiddenTests) {
    console.log(`\ntestes escondidos não rodaram: ${hiddenTests.reason}`);
  }
  console.log("\ncritérios:");
  for (const c of report.criteria) {
    console.log(`- ${c.name}: ${c.score}/4`);
    for (const e of c.evidence) console.log(`    [${formatMs(e.t)}] ${e.text}`);
  }
  console.log(`\npontos fortes: ${report.strengths.join(" | ") || "—"}`);
  console.log(`atenção: ${report.concerns.join(" | ") || "—"}`);
  console.log(`próximos passos: ${report.nextSteps.join(" | ") || "—"}`);
  console.log(`\nduração: ${status.durationMs} ms · custo: US$ ${status.costUsd.toFixed(4)}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
