import { useCallback, useEffect, useRef, useState } from "react";
import type { BlipContext, ChatMessage, EditorCommand } from "@/lib/contracts";
import { getBlipContext, postChat } from "./api";
import type { EventInput } from "./useSession";

interface ChatDeps {
  sessionId: string | null;
  sendEvent: (input: EventInput) => Promise<void>;
  applyCommands: (commands: EditorCommand[]) => void;
  onAgentReply?: (texto: string) => Promise<void>;
  onCancelReply?: () => void;
}

/** Quanto tempo a última fala do entrevistador fica na tela antes do painel fechar. */
const END_DELAY_MS = 2500;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Painel de conversa por texto. `epochRef` invalida respostas que chegam depois de fechar o chat.
 */
export function useChat({ sessionId, sendEvent, applyCommands, onAgentReply, onCancelReply }: ChatDeps) {
  const [open, setOpen] = useState(false);
  const [blipId, setBlipId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blipContext, setBlipContext] = useState<BlipContext | null>(null);
  /** O entrevistador encerrou: a última fala fica visível, sem input, até o painel fechar sozinho. */
  const [ended, setEnded] = useState(false);

  const activeBlipRef = useRef<string | undefined>(undefined);
  const epochRef = useRef(0);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnoRef = useRef(0);
  const vozRef = useRef({ onAgentReply, onCancelReply });
  vozRef.current = { onAgentReply, onCancelReply };

  useEffect(() => () => { epochRef.current++; clearTimeout(endTimerRef.current); vozRef.current.onCancelReply?.(); }, []);

  const closeChat = useCallback(
    (reason: "agent" | "button") => {
      epochRef.current += 1;
      vozRef.current.onCancelReply?.();
      clearTimeout(endTimerRef.current);
      endTimerRef.current = undefined;
      const id = activeBlipRef.current;
      activeBlipRef.current = undefined;
      if (id !== undefined) void sendEvent({ type: "blip_closed", blipId: id, reason });
      // Fechou a conversa, os grifos da pergunta saem junto (qualquer motivo).
      applyCommands([{ type: "clear_highlights" }]);
      setOpen(false);
      setBlipId(undefined);
      setMessages([]);
      setBlipContext(null);
      setError(null);
      setBusy(false);
      setEnded(false);
    },
    [sendEvent, applyCommands],
  );

  const close = useCallback(() => closeChat("button"), [closeChat]);

  /** Chama POST /api/chat com o histórico e aplica a resposta. */
  const runTurn = useCallback(
    async (history: ChatMessage[], forBlipId: string | undefined): Promise<void> => {
      if (sessionId === null) return;
      const epoch = epochRef.current;
      const turno = ++turnoRef.current;
      const vigente = () => epoch === epochRef.current && turno === turnoRef.current;
      vozRef.current.onCancelReply?.();
      setBusy(true);
      setError(null);
      try {
        const res = await postChat({ sessionId, blipId: forBlipId, messages: history });
        if (!vigente()) return;
        // Ao encerrar, o grifo sai só quando o painel fecha, não junto com a última fala.
        applyCommands(res.end ? res.commands.filter((c) => c.type !== "clear_highlights") : res.commands);
        setMessages([...history, { role: "agent", text: res.reply }]);
        void sendEvent({ type: "speech", role: "agent", text: res.reply, blipId: forBlipId });
        if (res.end) {
          setEnded(true);
        }
        setBusy(false);
        await vozRef.current.onAgentReply?.(res.reply);
        if (vigente() && res.end) {
          endTimerRef.current = setTimeout(() => closeChat("agent"), END_DELAY_MS);
        }
      } catch (err) {
        if (vigente()) setError(errorText(err));
      } finally {
        if (vigente()) setBusy(false);
      }
    },
    [sessionId, applyCommands, sendEvent, closeChat],
  );

  const openBlip = useCallback(
    async (id: string): Promise<void> => {
      if (sessionId === null) return;
      epochRef.current += 1;
      clearTimeout(endTimerRef.current);
      const epoch = epochRef.current;
      activeBlipRef.current = id;
      setOpen(true);
      setBlipId(id);
      setMessages([]);
      setBlipContext(null);
      setError(null);
      setEnded(false);
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
    clearTimeout(endTimerRef.current);
    activeBlipRef.current = undefined;
    setOpen(true);
    setBlipId(undefined);
    setMessages([]);
    setBlipContext(null);
    setError(null);
    setEnded(false);
  }, []);

  const send = useCallback(
    (text: string) => {
      if (!open || busy || ended) return;
      const next: ChatMessage[] = [...messages, { role: "candidate", text }];
      const id = activeBlipRef.current;
      setMessages(next);
      void sendEvent({ type: "speech", role: "candidate", text, blipId: id });
      void runTurn(next, id);
    },
    [open, busy, ended, messages, sendEvent, runTurn],
  );

  return {
    open,
    blipId,
    messages,
    busy,
    ended,
    error,
    blipContext,
    openBlip,
    openFree,
    send,
    close,
  };
}
