import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { BlipContext } from "@/lib/contracts";
import type { LlmStatsSnapshot } from "@/lib/llm";
import type { AnalystStatus, QueuedQuestion, SessionStateView } from "@/lib/session/types";
import { getState } from "../_lib/api";
import { formatMs } from "../_lib/format";

interface StatePanelProps {
  sessionId: string | null;
  elapsedMs: number;
  blipContext: BlipContext | null;
}

interface CodeSeen {
  version: number;
  at: number;
}

const STATUS_LABELS: Record<QueuedQuestion["status"], string> = {
  queued: "na fila",
  blipped: "balão aberto",
  asked: "conversada",
  stale: "obsoleta",
  ignored: "ignorada",
};

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-neutral-800 p-3">
      <h2 className="mb-2 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-neutral-500">{label}:</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <div className="text-neutral-500">{title}</div>
      <ul className="ml-2 flex flex-col gap-1">{children}</ul>
    </div>
  );
}

/** Última análise do LLM: abordagem, complexidade, linhas suspeitas, evidências e custo. */
function AnalysisBlock({ analyst }: { analyst: AnalystStatus }) {
  const insights = analyst.insights;
  const duration = analyst.lastDurationMs === undefined ? "-" : `${analyst.lastDurationMs} ms`;
  return (
    <Block title="análise">
      {analyst.lastError !== undefined && <li className="break-words text-red-400">erro: {analyst.lastError}</li>}
      {analyst.lastOutcome !== undefined && (
        <li className="break-words text-neutral-300">
          último resultado: {analyst.lastOutcome.text} ({formatMs(analyst.lastOutcome.t)})
        </li>
      )}
      {insights === undefined ? (
        <li className="text-neutral-600">ainda sem análise</li>
      ) : (
        <>
          <li>abordagem: {insights.approach}</li>
          <li>
            tempo {insights.timeComplexity} · memória {insights.spaceComplexity} · progresso: {insights.progress}
          </li>
          {insights.suspiciousLines.map((s, i) => (
            <li key={i} className="text-neutral-400">
              linhas {s.startLine}-{s.endLine}: {s.reason}
            </li>
          ))}
          {insights.evidence.map((e, i) => (
            <li key={i} className="text-neutral-400">
              {e.criterionId}: {e.note}
            </li>
          ))}
        </>
      )}
      <li className="text-neutral-500">
        duração da última análise: {duration} · custo acumulado: US$ {analyst.costUsd.toFixed(4)}
      </li>
    </Block>
  );
}

/** Estatísticas dos LLMs: por provedor e a rota de cada papel (breaker aberto mostra até quando). */
function LlmBlock({ llm }: { llm: LlmStatsSnapshot }) {
  return (
    <Block title="LLMs">
      {Object.entries(llm.providers).map(([name, p]) => (
        <li key={name}>
          {name}: {p.calls} chamadas · {p.wins} vitórias · {p.failures} falhas · {p.lost} perdidas · média{" "}
          {p.avgMs === null ? "-" : `${p.avgMs} ms`} · US$ {p.costUsd.toFixed(4)}
        </li>
      ))}
      {Object.entries(llm.roles).map(([role, r]) => (
        <li key={role} className="text-neutral-400">
          {role}:{" "}
          {r.directUntil === undefined
            ? r.route
            : `openrouter direto até ${new Date(r.directUntil).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`}
        </li>
      ))}
    </Block>
  );
}

/** GET /api/state acrescenta o motivo da última decisão de blip (lastBlipDecision). */
type StateView = SessionStateView & { blipDecision?: string };

/** Painel de estado do agente. Faz polling de GET /api/state a cada 1 s (404 é ignorado). */
export function StatePanel({ sessionId, elapsedMs, blipContext }: StatePanelProps) {
  const [view, setView] = useState<StateView | null>(null);
  const [codeSeen, setCodeSeen] = useState<CodeSeen | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (sessionId === null) return;
    let alive = true;
    let inFlight = false;

    const poll = async (): Promise<void> => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await getState(sessionId);
        if (!alive || data === null) return;
        const at = Date.now();
        setView(data);
        setNowMs(at);
        setCodeSeen((prev) =>
          prev !== null && prev.version === data.version ? prev : { version: data.version, at },
        );
      } catch {
        // falha transitória do polling: tenta de novo no próximo tick
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const id = setInterval(() => void poll(), 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sessionId]);

  if (sessionId === null || view === null) {
    return (
      <Box title="Estado do agente">
        <p className="text-neutral-500">aguardando primeiro evento (GET /api/state responde 404 até lá)</p>
      </Box>
    );
  }

  const codeAgo = codeSeen === null ? null : Math.max(0, Math.round((nowMs - codeSeen.at) / 1000));
  const triggerAgo =
    view.analyst.lastRunAt === undefined
      ? null
      : Math.max(0, Math.round((elapsedMs - view.analyst.lastRunAt) / 1000));

  return (
    <Box title="Estado do agente">
      <div className="flex flex-col gap-1">
        <Row label="último código recebido">
          {view.version === 0
            ? "nenhum ainda"
            : `versão ${view.version}${codeAgo !== null ? `, há ${codeAgo}s` : ""}`}
        </Row>
        <Row label="analista">{view.analyst.state}</Row>
        <Row label="último gatilho">
          {view.analyst.lastTrigger ?? "-"}
          {triggerAgo !== null ? ` (há ${triggerAgo}s)` : ""}
        </Row>
        <Row label="execuções do analista">{view.analyst.runs}</Row>
        <Row label="dicas usadas">{view.hintsUsed}</Row>
        <Row label="eventos">
          {view.eventCount}
          {view.lastEvent !== undefined ? ` · último: ${view.lastEvent.type} @ ${formatMs(view.lastEvent.t)}` : ""}
        </Row>
        <Row label="pendingBlipId">{view.pendingBlipId ?? "-"}</Row>
        <Row label="encerrada">{view.ended ? "sim" : "não"}</Row>
      </div>

      <AnalysisBlock analyst={view.analyst} />

      {view.llm !== undefined && <LlmBlock llm={view.llm} />}

      <Block title={`fila de perguntas (${view.queue.length})`}>
        <li className="text-neutral-400">decisão do blip: {view.blipDecision ?? "-"}</li>
        {view.queue.length === 0 && <li className="text-neutral-600">vazia</li>}
        {view.queue.map((q) => (
          <li key={q.id}>
            <div>{q.question}</div>
            <div className="text-neutral-500">
              prio {q.priority.toFixed(2)} · {STATUS_LABELS[q.status]}
              {q.status === "queued" && q.snoozedUntil !== undefined && q.snoozedUntil > elapsedMs
                ? ` · adiada até ${formatMs(q.snoozedUntil)}`
                : ""}
              {` · tópico: ${q.followUpTopic}`}
              {q.topicLabel !== undefined ? ` · balão: ${q.topicLabel}` : ""}
              {q.highlight !== undefined ? ` · linhas ${q.highlight.startLine}-${q.highlight.endLine}` : ""}
              {q.kickoff === true ? " · abertura" : ""}
            </div>
            {q.keyMoment !== undefined && <div className="text-amber-300">⚑ momento-chave: {q.keyMoment}</div>}
          </li>
        ))}
      </Block>

      <details className="mt-3">
        <summary className="cursor-pointer text-neutral-400">evidências ({view.evidence.length})</summary>
        <ul className="mt-1 ml-2 flex flex-col gap-1">
          {view.evidence.length === 0 && <li className="text-neutral-600">nenhuma</li>}
          {view.evidence.map((e, i) => (
            <li key={i} className="break-words text-neutral-400">
              {formatMs(e.t)} · {e.criterionId} · {e.source} · {e.note}
            </li>
          ))}
        </ul>
      </details>

      <Block title={`blips (${view.blips.length})`}>
        {view.blips.length === 0 && <li className="text-neutral-600">nenhum</li>}
        {view.blips.map((b) => (
          <li key={b.id}>
            <div>{b.preview}</div>
            <div className="text-neutral-500">
              {b.id.slice(0, 8)} · prio {b.priority.toFixed(2)} · criado em {b.createdAt}
              {b.highlight !== undefined ? ` · linhas ${b.highlight.startLine}-${b.highlight.endLine}` : ""}
            </div>
          </li>
        ))}
      </Block>

      <details className="mt-3">
        <summary className="cursor-pointer text-neutral-400">contexto do blip atual (numberedCode)</summary>
        {blipContext === null ? (
          <p className="mt-1 text-neutral-600">nenhum blip aberto</p>
        ) : (
          <div className="mt-1 flex flex-col gap-1">
            <div className="text-neutral-400">{blipContext.question}</div>
            <div className="text-neutral-500">tema: {blipContext.followUpTopic}</div>
            <pre className="max-h-64 overflow-auto whitespace-pre border border-neutral-800 bg-neutral-900 p-2 text-xs">
              {blipContext.numberedCode}
            </pre>
          </div>
        )}
      </details>
    </Box>
  );
}
