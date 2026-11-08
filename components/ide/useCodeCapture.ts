import { useCallback, useRef, useState } from "react";
import type { RunResult } from "@/lib/contracts";
import { INITIAL_LANGUAGE } from "@/lib/ide-constants";
import type { EventInput } from "./useSession";

const SNAPSHOT_DEBOUNCE_MS = 1500;
const SNAPSHOT_THROTTLE_MS = 5000;
const PAUSE_MS = 8000;
const PASTE_MIN_CHARS = 40;

interface CaptureDeps {
  sendEvent: (input: EventInput) => Promise<void>;
  nowT: () => number;
  endedRef: { current: boolean };
  /** Código inicial por linguagem do problema atual. */
  starters: Record<string, string>;
  /** Linguagem com que a IDE abre (a primeira da vaga). */
  initialLanguage?: string;
}

/**
 * Captura de código: snapshot (debounce + throttle), pause, paste, language e run.
 */
export function useCodeCapture({ sendEvent, nowT, endedRef, starters: STARTERS, initialLanguage = INITIAL_LANGUAGE }: CaptureDeps) {
  const [language, setLanguage] = useState<string>(initialLanguage);
  const [code, setCode] = useState<string>(STARTERS[initialLanguage] ?? "");

  const codeRef = useRef(code);
  const langRef = useRef(language);
  const versionRef = useRef(0);
  const lastSentCodeRef = useRef<string | null>(null);
  const lastSnapshotAtRef = useRef(0);
  const lastTypedAtRef = useRef(0);
  const pausedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSnapshot = useCallback(async (): Promise<void> => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (endedRef.current) return;
    const current = codeRef.current;
    if (current === lastSentCodeRef.current) return;
    lastSentCodeRef.current = current;
    lastSnapshotAtRef.current = nowT();
    versionRef.current += 1;
    await sendEvent({
      type: "snapshot",
      code: current,
      version: versionRef.current,
      language: langRef.current,
    });
  }, [endedRef, nowT, sendEvent]);

  const onCodeChange = useCallback(
    (next: string) => {
      if (endedRef.current) return;
      codeRef.current = next;
      setCode(next);

      const now = nowT();
      lastTypedAtRef.current = now;
      pausedRef.current = false;

      // Throttle: enquanto digita sem parar, manda no máximo a cada 5 s.
      if (now - lastSnapshotAtRef.current >= SNAPSHOT_THROTTLE_MS) {
        void flushSnapshot();
      }
      // Debounce: manda 1,5 s depois de parar de digitar.
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushSnapshot();
      }, SNAPSHOT_DEBOUNCE_MS);

      // Pause: uma vez por período ocioso, depois de 8 s sem digitar.
      if (idleRef.current !== null) clearTimeout(idleRef.current);
      idleRef.current = setTimeout(() => {
        idleRef.current = null;
        if (endedRef.current || pausedRef.current) return;
        pausedRef.current = true;
        void sendEvent({ type: "pause", idleMs: nowT() - lastTypedAtRef.current });
      }, PAUSE_MS);
    },
    [endedRef, flushSnapshot, nowT, sendEvent],
  );

  /**
   * Colar: manda `paste` se tiver 2+ linhas ou 40+ caracteres. O snapshot com o código colado
   * vai antes, senão o agente analisaria a colagem olhando o código antigo.
   */
  const onPaste = useCallback(
    (text: string, startLine: number) => {
      if (endedRef.current) return;
      const lines = text.split("\n").length;
      if (lines < 2 && text.length < PASTE_MIN_CHARS) return;
      // setTimeout: o onPaste dispara antes do onChange que atualiza codeRef.
      setTimeout(() => {
        void flushSnapshot().then(() => sendEvent({ type: "paste", chars: text.length, lines, startLine }));
      }, 0);
    },
    [endedRef, flushSnapshot, sendEvent],
  );

  const changeLanguage = useCallback(
    (next: string) => {
      if (endedRef.current) return;
      const prev = langRef.current;
      if (next === prev) return;
      langRef.current = next;
      setLanguage(next);
      // Se o código ainda é o starter da linguagem anterior, troca pelo starter novo.
      if (codeRef.current === (STARTERS[prev] ?? "")) {
        onCodeChange(STARTERS[next] ?? "");
      }
      void sendEvent({ type: "language_changed", language: next });
    },
    [endedRef, onCodeChange, sendEvent, STARTERS],
  );

  /** Antes de cada run, manda um snapshot imediato (se o código mudou). */
  const runWithResult = useCallback(
    async (result: RunResult): Promise<void> => {
      await flushSnapshot();
      await sendEvent({ type: "run", result });
    },
    [flushSnapshot, sendEvent],
  );

  /** Código e linguagem de agora (o que está no editor, mesmo antes do snapshot sair). */
  const getLiveCode = useCallback(() => ({ code: codeRef.current, language: langRef.current }), []);

  return {
    code,
    language,
    flushSnapshot,
    getLiveCode,
    onCodeChange,
    onPaste,
    changeLanguage,
    runWithResult,
  };
}
