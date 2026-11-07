import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import type { Blip, SessionEvent } from "@/lib/contracts";
import { postEvent } from "./api";
import { INITIAL_LANGUAGE } from "./problem";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Evento como a IDE monta antes de sendEvent preencher sessionId e t. */
export type EventInput = DistributiveOmit<SessionEvent, "sessionId" | "t">;

export interface LogEntry {
  id: number;
  label: string;
  t: number;
  failed: boolean;
}

const DURATION_MS = DEFAULT_CONFIG.durationMin * 60_000;
const LOG_LIMIT = 200;

/**
 * Sessão: id, relógio (t), cronômetro, fim de sessão e o único ponto de envio (sendEvent).
 */
export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [ended, setEnded] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [incomingBlip, setIncomingBlip] = useState<Blip | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const startRef = useRef<number | null>(null);
  const endedRef = useRef(false);
  const seqRef = useRef(0);

  const nowT = useCallback(
    (): number => (startRef.current === null ? 0 : Math.round(performance.now() - startRef.current)),
    [],
  );

  const pushLog = useCallback((label: string, t: number, failed: boolean) => {
    seqRef.current += 1;
    const entry: LogEntry = { id: seqRef.current, label, t, failed };
    setLog((prev) => [...prev.slice(-(LOG_LIMIT - 1)), entry]);
  }, []);

  const sendEvent = useCallback(
    async (input: EventInput): Promise<void> => {
      const id = sessionIdRef.current;
      if (id === null) return;
      const event: SessionEvent = { ...input, sessionId: id, t: nowT() };
      pushLog(event.type, event.t, false);
      try {
        const res = await postEvent(event);
        if (res.blip !== undefined) setIncomingBlip(res.blip);
      } catch (err) {
        console.error("POST /api/events falhou", event.type, err);
        pushLog(`${event.type} (falhou)`, event.t, true);
      }
    },
    [nowT, pushLog],
  );

  const endSession = useCallback(
    (reason: "timeout" | "button") => {
      if (endedRef.current) return;
      endedRef.current = true;
      setEnded(true);
      void sendEvent({ type: "session_ended", reason });
    },
    [sendEvent],
  );

  // Inicia a sessão uma vez (o ref protege contra o duplo mount do StrictMode).
  useEffect(() => {
    if (sessionIdRef.current !== null) return;
    const id = crypto.randomUUID();
    sessionIdRef.current = id;
    startRef.current = performance.now();
    setSessionId(id);
    void sendEvent({
      type: "session_started",
      configId: DEFAULT_CONFIG.id,
      problemId: DEFAULT_CONFIG.problemId,
      language: INITIAL_LANGUAGE,
    });
  }, [sendEvent]);

  // Cronômetro: atualiza o tempo decorrido e encerra por timeout.
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = nowT();
      setElapsedMs(elapsed);
      if (elapsed >= DURATION_MS) endSession("timeout");
    }, 1000);
    return () => clearInterval(id);
  }, [nowT, endSession]);

  return {
    sessionId,
    elapsedMs,
    ended,
    endedRef,
    log,
    incomingBlip,
    setIncomingBlip,
    nowT,
    sendEvent,
    endSession,
  };
}
