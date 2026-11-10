// Repete uma entrevista de live coding gravada (GET /api/report/gravacao) com a análise e a política de verdade
// (LLM real; usa créditos) e mostra que pergunta o Totti faria em cada momento. Serve para medir a qualidade e o
// momento das perguntas antes e depois de mexer no analista ou na política.
//
//   npx tsx --env-file-if-exists=.env.local scripts/simular-live-coding.ts <gravacao.json> [config-id]
//
// As falas do candidato entram como falas livres; cada pergunta que vira balão é dada como feita (aberta e
// fechada 15 s depois), já que a resposta real foi a outra pergunta.
import "./_gasto";
import { readFileSync } from "node:fs";
import { runAnalyst } from "@/lib/agents/analyst";
import { faseDaEntrevista } from "@/lib/agents/fase";
import { decideBlip, enqueueCola, enqueueKickoff } from "@/lib/agents/policy";
import { resolveConfig } from "@/lib/config/store";
import type { RunResult, SessionEvent } from "@/lib/contracts";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";

type Gravacao = {
  codigo: { t: number; language: string; code: string }[];
  falas: { t: number; role: "agent" | "candidate"; text: string; blipId?: string }[];
  execucoes: { t: number; passed: number; total: number }[];
};

const PAUSA_MS = 8000;

async function main() {
  const [arquivo, configId = "config-frontend-junior"] = process.argv.slice(2);
  if (!arquivo) throw new Error("uso: simular-live-coding.ts <gravacao.json> [config-id]");
  const g = JSON.parse(readFileSync(arquivo, "utf8")) as Gravacao;
  const config = await resolveConfig(configId);
  const id = `simulacao-${Date.now()}`;
  let agora = 0;
  const session = getOrCreateSession(id, config);
  session.clock = () => agora;

  // A linha do tempo da gravação, sem repetidos, com as pausas que a IDE mandaria (8 s sem mexer no código).
  const vistos = new Set<string>();
  const unico = (k: string) => (vistos.has(k) ? false : (vistos.add(k), true));
  type Item = { t: number; evento: Omit<SessionEvent, "sessionId"> };
  const itens: Item[] = [];
  g.codigo.forEach((c, i) => {
    if (!unico(`c${c.t}`)) return;
    itens.push({ t: c.t, evento: { type: "snapshot", t: c.t, code: c.code, version: i + 1, language: c.language } as never });
    // Bloco grande de uma vez: a IDE manda uma colagem junto (components/ide/useCodeCapture.ts).
    const antes = g.codigo.filter((d) => d.t < c.t).at(-1)?.code ?? "";
    const novas = c.code.split("\n").length - antes.split("\n").length;
    if (novas >= 6) itens.push({ t: c.t + 1, evento: { type: "paste", t: c.t + 1, chars: c.code.length - antes.length, lines: novas, startLine: 1 } as never });
    const proximo = g.codigo.find((d) => d.t > c.t)?.t ?? Number.POSITIVE_INFINITY;
    if (proximo - c.t > PAUSA_MS) itens.push({ t: c.t + PAUSA_MS, evento: { type: "pause", t: c.t + PAUSA_MS, idleMs: PAUSA_MS } as never });
  });
  for (const f of g.falas) {
    if (f.role !== "candidate" || !unico(`f${f.t}${f.text}`)) continue;
    itens.push({ t: f.t, evento: { type: "speech", t: f.t, role: "candidate", text: f.text } as never });
  }
  for (const r of g.execucoes) {
    if (!unico(`r${r.t}${r.passed}`)) continue;
    const result: RunResult = {
      passed: r.passed,
      total: r.total,
      cases: Array.from({ length: r.total }, (_, i) => ({ name: `caso ${i + 1}`, passed: i < r.passed, ...(i < r.passed ? {} : { error: "NameError" }) })),
      stdout: "",
      stderr: r.passed === r.total ? "" : "NameError: name is not defined",
      durationMs: 20,
    };
    itens.push({ t: r.t, evento: { type: "run", t: r.t, result } as never });
  }
  itens.sort((a, b) => a.t - b.t);

  const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  appendEvent(session, { type: "session_started", sessionId: id, t: 0, configId: config.id, problemId: config.problemId, language: "python" });
  enqueueKickoff(session, 0);
  const fecharEm: { t: number; blipId: string }[] = [];
  const perguntas: string[] = [];

  const passo = async (t: number, evento?: Omit<SessionEvent, "sessionId">) => {
    agora = t;
    for (const f of fecharEm.splice(0).filter((x) => x.t <= t)) appendEvent(session, { type: "blip_closed", sessionId: id, t: f.t, blipId: f.blipId, reason: "agent" });
    if (evento) {
      const e = { ...evento, sessionId: id } as SessionEvent;
      appendEvent(session, e);
      if (e.type === "speech") console.log(`${fmt(t)}  VOCÊ: ${e.text.slice(0, 110)}`);
      else if (e.type === "run") console.log(`${fmt(t)}  · rodou ${e.result.passed}/${e.result.total}`);
      else if (e.type === "snapshot") console.log(`${fmt(t)}  · código com ${e.code.split("\n").length} linhas`);
      const analisa = ["pause", "run", "paste"].includes(e.type) || (e.type === "speech" && e.text.split(/\s+/).length >= 12);
      if (e.type === "paste") enqueueCola(session, e);
      if (analisa) await runAnalyst(session, e).catch((err) => console.error("análise falhou:", err));
    }
    const { blip } = decideBlip(session, t);
    if (blip) {
      const q = session.queue.find((x) => x.id === blip.id)!;
      const rotulo = [q.kind ?? (q.kickoff ? "abertura" : "?"), q.criterionId, q.focusArea && `foco:${q.focusArea}`, `p${q.priority.toFixed(2)}`].filter(Boolean).join(" · ");
      console.log(`${fmt(t)}  TOTTI [${faseDaEntrevista(session)} | ${rotulo}]${q.highlight ? ` (grifo ${q.highlight.startLine}-${q.highlight.endLine})` : ""}: ${q.question}`);
      perguntas.push(q.question);
      appendEvent(session, { type: "blip_opened", sessionId: id, t, blipId: blip.id });
      fecharEm.push({ t: t + 15_000, blipId: blip.id });
    }
  };

  for (const item of itens) {
    // A política também decide no polling (a cada 3 s), não só nos eventos.
    for (let t = agora + 3000; t < item.t; t += 3000) await passo(t);
    await passo(item.t, item.evento);
  }
  for (let t = agora + 3000; t <= agora + 30_000; t += 3000) await passo(t);
  console.log(`\n${perguntas.length} perguntas. Fila: ${session.queue.map((q) => `${q.id}:${q.status}${q.focusArea ? `(${q.focusArea})` : ""}`).join(" ")}`);
  console.log(`custo da análise: $${session.analyst.costUsd.toFixed(4)}`);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));
