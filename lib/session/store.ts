/**
 * Store em memória das sessões. Fica em globalThis pra sobreviver a hot reload do Next em dev.
 */
import { DEFAULT_CONFIG } from "@/lib/config/default";
import type { InterviewConfig, SessionEvent } from "@/lib/contracts";
import type { SessionState, SessionStateView } from "@/lib/session/types";

const globalForSessions = globalThis as typeof globalThis & {
  __convergeSessions?: Map<string, SessionState>;
};
const sessions = (globalForSessions.__convergeSessions ??= new Map<string, SessionState>());

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function getOrCreateSession(sessionId: string, config: InterviewConfig = DEFAULT_CONFIG): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const session: SessionState = {
    sessionId,
    config,
    startedAt: Date.now(),
    events: [],
    codeHistory: [],
    language: config.languages[0],
    analyst: { state: "idle", runs: 0 },
    queue: [],
    blips: [],
    hintsUsed: 0,
    ended: false,
  };
  sessions.set(sessionId, session);
  return session;
}

export function appendEvent(session: SessionState, event: SessionEvent): void {
  session.events.push(event);

  switch (event.type) {
    case "session_started":
      session.language = event.language;
      break;
    case "snapshot":
      session.codeHistory.push({ t: event.t, version: event.version, language: event.language, code: event.code });
      break;
    case "language_changed":
      session.language = event.language;
      break;
    case "hint":
      session.hintsUsed += 1;
      break;
    case "session_ended":
      session.ended = true;
      break;
    case "blip_opened": {
      const question = session.queue.find((q) => q.id === event.blipId);
      if (question) question.status = "asked";
      // pendingBlipId continua até o blip_closed: nada de blip novo com a conversa aberta.
      break;
    }
    case "blip_closed":
      if (session.pendingBlipId === event.blipId) session.pendingBlipId = undefined;
      break;
    default:
      break;
  }
}

/** Código mais recente enviado pela IDE (vazio se ainda não houve snapshot). */
export function latestCode(session: SessionState): string {
  return session.codeHistory.at(-1)?.code ?? "";
}

export function toView(session: SessionState): SessionStateView {
  const lastCodeVersion = session.codeHistory.at(-1);
  const lastEvent = session.events.at(-1);
  return {
    sessionId: session.sessionId,
    configId: session.config.id,
    roleTitle: session.config.roleTitle,
    language: session.language,
    latestCode: latestCode(session),
    version: lastCodeVersion?.version ?? 0,
    eventCount: session.events.length,
    lastEvent: lastEvent ? { type: lastEvent.type, t: lastEvent.t } : undefined,
    analyst: session.analyst,
    queue: session.queue,
    blips: session.blips,
    pendingBlipId: session.pendingBlipId,
    hintsUsed: session.hintsUsed,
    ended: session.ended,
  };
}

/** Prefixa cada linha com o número, alinhado à direita. */
export function numberCode(code: string): string {
  const lines = code.split("\n");
  const width = String(lines.length).length + 2;
  return lines.map((line, i) => `${String(i + 1).padStart(width)} | ${line}`).join("\n");
}
