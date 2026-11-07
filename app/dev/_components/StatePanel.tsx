import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { BlipContext } from "@/lib/contracts";
import type { SessionStateView } from "@/lib/session/types";
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

/** Painel de estado do agente. Faz polling de GET /api/state a cada 1 s (404 é ignorado). */
export function StatePanel({ sessionId, elapsedMs, blipContext }: StatePanelProps) {
  const [view, setView] = useState<SessionStateView | null>(null);
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

      <Block title={`fila de perguntas (${view.queue.length})`}>
        {view.queue.length === 0 && <li className="text-neutral-600">vazia</li>}
        {view.queue.map((q) => (
          <li key={q.id}>
            <div>{q.question}</div>
            <div className="text-neutral-500">
              prio {q.priority.toFixed(2)} · {q.status} · tópico: {q.followUpTopic}
              {q.highlight !== undefined ? ` · linhas ${q.highlight.startLine}-${q.highlight.endLine}` : ""}
            </div>
          </li>
        ))}
      </Block>

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
