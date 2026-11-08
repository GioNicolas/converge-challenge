"use client";

import { useCallback, useState } from "react";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import type { EditorCommand, RunResult } from "@/lib/contracts";
import { BlipBalloon } from "./_components/BlipBalloon";
import { ChatPanel } from "./_components/ChatPanel";
import { CodeArea } from "./_components/CodeArea";
import { EventLog } from "./_components/EventLog";
import { RunResultView } from "./_components/RunResultView";
import { StatePanel } from "./_components/StatePanel";
import { formatMs } from "./_lib/format";
import { EMPTY_DECOR, applyEditorCommands } from "./_lib/editorState";
import type { EditorDecor } from "./_lib/editorState";
import { LANGUAGE_LABELS, PROBLEM, fakeRunResult } from "./_lib/problem";
import type { FakeRunKind } from "./_lib/problem";
import { useChat } from "./_lib/useChat";
import { useCodeCapture } from "./_lib/useCodeCapture";
import { useSession } from "./_lib/useSession";
import { useVozAgente } from "@/lib/voz/useVozAgente";
import ControleVoz from "@/components/voz/ControleVoz";

const DURATION_MS = DEFAULT_CONFIG.durationMin * 60_000;
const WARNING_MS = 5 * 60_000;
const BTN = "border border-neutral-600 bg-neutral-800 px-3 py-1 hover:bg-neutral-700 disabled:opacity-40";

/** Página de debug: o desenvolvedor joga de candidato e acompanha o estado do agente. */
export default function DevPage() {
  const session = useSession();
  const voz = useVozAgente({ bloqueada: session.ended });
  const capture = useCodeCapture({
    sendEvent: session.sendEvent,
    nowT: session.nowT,
    endedRef: session.endedRef,
  });

  const [decor, setDecor] = useState<EditorDecor>(EMPTY_DECOR);
  const [scrollTo, setScrollTo] = useState<{ line: number; nonce: number } | null>(null);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const applyCommands = useCallback((commands: EditorCommand[]) => {
    setDecor((prev) => applyEditorCommands(prev, commands));
    const first = commands.find((c) => c.type === "highlight_range");
    if (first !== undefined && first.type === "highlight_range") {
      setScrollTo({ line: first.startLine, nonce: Date.now() });
    }
  }, []);

  const chat = useChat({
    sessionId: session.sessionId,
    sendEvent: session.sendEvent,
    applyCommands,
    onAgentReply: voz.falar,
    onCancelReply: voz.parar,
  });

  const remainingMs = Math.max(0, DURATION_MS - session.elapsedMs);
  const warning = remainingMs <= WARNING_MS && !session.ended;

  const openFromBalloon = () => {
    const blip = session.incomingBlip;
    if (blip === null) return;
    session.setIncomingBlip(null);
    void chat.openBlip(blip.id);
  };

  const snoozeFromBalloon = () => {
    const blip = session.incomingBlip;
    if (blip === null) return;
    session.setIncomingBlip(null);
    void session.sendEvent({ type: "blip_snoozed", blipId: blip.id });
  };

  const run = (kind: FakeRunKind) => {
    const result = fakeRunResult(kind);
    setLastRun(result);
    void capture.runWithResult(result);
  };

  return (
    <div className="min-h-screen bg-neutral-950 font-mono text-[13px] text-neutral-200">
      <header className="flex flex-wrap items-center gap-4 border-b border-neutral-800 px-3 py-2">
        <ControleVoz voz={voz} texto={chat.messages.at(-1)?.role === "agent" ? chat.messages.at(-1)?.text : undefined} disabled={session.ended || chat.busy || chat.ended} />
        <span className="font-bold">DEV · fake IDE</span>
        <span className="text-neutral-500">sessão {session.sessionId?.slice(0, 8) ?? "..."}</span>
        <span className={warning ? "font-bold text-yellow-300" : ""}>
          restante {formatMs(remainingMs)}
          {warning ? " · pouco tempo" : ""}
        </span>
        <label className="flex items-center gap-2">
          linguagem
          <select
            value={capture.language}
            disabled={session.ended}
            onChange={(e) => capture.changeLanguage(e.target.value)}
            className="border border-neutral-700 bg-neutral-900 px-1 py-0.5"
          >
            {DEFAULT_CONFIG.languages.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGE_LABELS[lang] ?? lang}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => session.endSession("button")}
          disabled={session.ended}
          className={BTN}
        >
          Finalizar
        </button>
        {session.ended && <span className="text-red-400">sessão encerrada</span>}
      </header>

      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_420px]">
        <main className="flex min-w-0 flex-col gap-3">
          <section className="border border-neutral-800 p-3">
            <h1 className="mb-1 text-base font-bold">{PROBLEM.title}</h1>
            <p className="mb-2 whitespace-pre-line text-neutral-300">{PROBLEM.statement}</p>
            <pre className="whitespace-pre-wrap text-xs text-neutral-400">{PROBLEM.example}</pre>
          </section>

          <div className="relative">
            <CodeArea
              value={capture.code}
              disabled={session.ended}
              highlights={decor.highlights}
              notes={decor.notes}
              scrollTo={scrollTo}
              onChange={capture.onCodeChange}
              onPaste={capture.onPaste}
            />
            {session.incomingBlip !== null && (
              <BlipBalloon blip={session.incomingBlip} onOpen={openFromBalloon} onSnooze={snoozeFromBalloon} />
            )}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => run("passou")} disabled={session.ended} className={BTN}>
              Rodar (passou)
            </button>
            <button type="button" onClick={() => run("falhou")} disabled={session.ended} className={BTN}>
              Rodar (falhou)
            </button>
          </div>

          <RunResultView result={lastRun} />
          <EventLog entries={session.log} />
        </main>

        <aside className="flex min-w-0 flex-col gap-3">
          <StatePanel
            sessionId={session.sessionId}
            elapsedMs={session.elapsedMs}
            blipContext={chat.blipContext}
          />
          <ChatPanel
            open={chat.open}
            blipId={chat.blipId}
            messages={chat.messages}
            busy={chat.busy}
            ended={chat.ended}
            error={chat.error}
            disabled={session.ended}
            onSend={chat.send}
            onClose={chat.close}
            onOpenFree={chat.openFree}
          />
        </aside>
      </div>
    </div>
  );
}
