import { useCallback, useRef, useState } from "react";
import type { BlipContext, ChatMessage, EditorCommand } from "@/lib/contracts";
import { getBlipContext, postChat } from "./api";
import type { EventInput } from "./useSession";

interface ChatDeps {
  sessionId: string | null;
  sendEvent: (input: EventInput) => Promise<void>;
  applyCommands: (commands: EditorCommand[]) => void;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Painel de conversa por texto. `epochRef` invalida respostas que chegam depois de fechar o chat.
 */
export function useChat({ sessionId, sendEvent, applyCommands }: ChatDeps) {
  const [open, setOpen] = useState(false);
  const [blipId, setBlipId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blipContext, setBlipContext] = useState<BlipContext | null>(null);

  const activeBlipRef = useRef<string | undefined>(undefined);
  const epochRef = useRef(0);

  const closeChat = useCallback(
    (reason: "agent" | "button") => {
      epochRef.current += 1;
      const id = activeBlipRef.current;
      activeBlipRef.current = undefined;
      if (id !== undefined) void sendEvent({ type: "blip_closed", blipId: id, reason });
      setOpen(false);
      setBlipId(undefined);
      setMessages([]);
      setBlipContext(null);
      setError(null);
      setBusy(false);
    },
    [sendEvent],
  );

  const close = useCallback(() => closeChat("button"), [closeChat]);

  /** Chama POST /api/chat com o histórico e aplica a resposta. */
  const runTurn = useCallback(
    async (history: ChatMessage[], forBlipId: string | undefined): Promise<void> => {
      if (sessionId === null) return;
      const epoch = epochRef.current;
      setBusy(true);
      setError(null);
      try {
        const res = await postChat({ sessionId, blipId: forBlipId, messages: history });
        applyCommands(res.commands);
        if (epoch !== epochRef.current) return;
        setMessages([...history, { role: "agent", text: res.reply }]);
        void sendEvent({ type: "speech", role: "agent", text: res.reply, blipId: forBlipId });
        if (res.end) closeChat("agent");
      } catch (err) {
        if (epoch === epochRef.current) setError(errorText(err));
      } finally {
        if (epoch === epochRef.current) setBusy(false);
      }
    },
    [sessionId, applyCommands, sendEvent, closeChat],
  );

  const openBlip = useCallback(
    async (id: string): Promise<void> => {
      if (sessionId === null) return;
      epochRef.current += 1;
      const epoch = epochRef.current;
      activeBlipRef.current = id;
      setOpen(true);
      setBlipId(id);
      setMessages([]);
      setBlipContext(null);
      setError(null);
      void sendEvent({ type: "blip_opened", blipId: id });
      try {
        const ctx = await getBlipContext(id, sessionId);
        if (epoch === epochRef.current) setBlipContext(ctx);
      } catch (err) {
        console.error("GET contexto do blip falhou", err);
      }
      if (epoch !== epochRef.current) return;
      await runTurn([], id);
    },
    [sessionId, sendEvent, runTurn],
  );

  /** Abre o chat sem blip (botão "Chamar entrevistador"). */
  const openFree = useCallback(() => {
    epochRef.current += 1;
    activeBlipRef.current = undefined;
    setOpen(true);
    setBlipId(undefined);
    setMessages([]);
    setBlipContext(null);
    setError(null);
  }, []);

  const send = useCallback(
    (text: string) => {
      if (!open || busy) return;
      const next: ChatMessage[] = [...messages, { role: "candidate", text }];
      const id = activeBlipRef.current;
      setMessages(next);
      void sendEvent({ type: "speech", role: "candidate", text, blipId: id });
      void runTurn(next, id);
    },
    [open, busy, messages, sendEvent, runTurn],
  );

  return {
    open,
    blipId,
    messages,
    busy,
    error,
    blipContext,
    openBlip,
    openFree,
    send,
    close,
  };
}
