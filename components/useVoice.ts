"use client";

import { useCallback, useRef, useState } from "react";
import { Conversation, type VoiceConversation } from "@elevenlabs/client";
import { EditorCommand, type BlipContext } from "@/lib/contracts";

export const VOICE_AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "";
export const VOICE_AVAILABLE = VOICE_AGENT_ID !== "";

type Deps = {
  /** Código atual numerado (client tool get_current_code). */
  getNumberedCode: () => string;
  execute: (cmd: EditorCommand) => void;
  onTranscript: (role: "candidate" | "agent", text: string) => void;
};

export type VoiceStatus = "off" | "connecting" | "on" | "error";

/**
 * Voz com ElevenLabs Agents. Se algo falhar, `status` vira "error" e o chat
 * por texto continua funcionando (plano B).
 */
export function useVoice({ getNumberedCode, execute, onTranscript }: Deps) {
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const [error, setError] = useState<string | null>(null);
  const convRef = useRef<VoiceConversation | null>(null);

  const run = useCallback(
    (raw: unknown): string => {
      const parsed = EditorCommand.safeParse(raw);
      if (!parsed.success) return "parâmetros inválidos";
      execute(parsed.data);
      return "ok";
    },
    [execute],
  );

  const start = useCallback(
    async (ctx?: BlipContext | null) => {
      if (!VOICE_AVAILABLE || convRef.current) return;
      setStatus("connecting");
      setError(null);
      try {
        const conv = await Conversation.startSession({
          agentId: VOICE_AGENT_ID,
          connectionType: "webrtc",
          textOnly: false,
          dynamicVariables: {
            question: ctx?.question ?? "",
            follow_up_topic: ctx?.followUpTopic ?? "",
            summary: ctx?.summary ?? "",
            numbered_code: ctx?.numberedCode ?? getNumberedCode(),
          },
          clientTools: {
            highlight_range: (p: Record<string, unknown>) => run({ type: "highlight_range", ...p }),
            add_inline_note: (p: Record<string, unknown>) => run({ type: "add_inline_note", ...p }),
            clear_highlights: () => run({ type: "clear_highlights" }),
            get_current_code: () => getNumberedCode(),
          },
          onStatusChange: ({ status: s }) => {
            if (s === "connected") setStatus("on");
            if (s === "disconnected") {
              convRef.current = null;
              setStatus((prev) => (prev === "error" ? prev : "off"));
            }
          },
          onModeChange: ({ mode: m }) => setMode(m),
          onMessage: (m) => onTranscript(m.source === "user" ? "candidate" : "agent", m.message),
          onError: (msg) => {
            setError(String(msg));
            setStatus("error");
          },
        } as Parameters<typeof Conversation.startSession>[0]);
        convRef.current = conv as VoiceConversation;
      } catch (err) {
        convRef.current = null;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    },
    [getNumberedCode, run, onTranscript],
  );

  const stop = useCallback(async () => {
    const c = convRef.current;
    convRef.current = null;
    setStatus("off");
    await c?.endSession().catch(() => {});
  }, []);

  return { status, mode, error, start, stop };
}
