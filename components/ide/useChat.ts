import { useCallback, useEffect, useRef, useState } from "react";
import type { Blip, ChatMessage, EditorCommand } from "@/lib/contracts";
import { postChat } from "./api";
import type { EventInput } from "./useSession";

interface ChatDeps {
  sessionId: string | null;
  sendEvent: (input: EventInput) => Promise<void>;
  applyCommands: (commands: EditorCommand[]) => void;
}

/** Fala na tela: a mensagem do contrato mais o horário em que apareceu (Date.now()). */
export type Fala = ChatMessage & { at: number };

/** Conversa já encerrada, guardada para o candidato reler na barra lateral. */
export interface ConversaAnterior {
  blipId: string;
  preview: string;
  falas: Fala[];
}

/** Quanto tempo a última fala do entrevistador fica na tela antes da barra fechar. */
const END_DELAY_MS = 2500;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Conversa por texto na barra lateral. Só abre por um balão do entrevistador e dura até um dos dois
 * encerrar ("pode seguir" do agente ou "voltar a programar" do candidato). As conversas encerradas
 * ficam em `previous`. `epochRef` invalida respostas que chegam depois de fechar.
 */
export function useChat({ sessionId, sendEvent, applyCommands }: ChatDeps) {
  const [open, setOpen] = useState(false);
  const [blip, setBlip] = useState<Blip | null>(null);
  const [messages, setMessages] = useState<Fala[]>([]);
  const [previous, setPrevious] = useState<ConversaAnterior[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** O entrevistador encerrou: a última fala fica visível, sem campo de resposta, até a barra fechar sozinha. */
  const [ended, setEnded] = useState(false);

  const activeBlipRef = useRef<Blip | null>(null);
  const messagesRef = useRef<Fala[]>([]);
  messagesRef.current = messages;
  const epochRef = useRef(0);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(endTimerRef.current), []);

  const closeChat = useCallback(
    (reason: "agent" | "button") => {
      epochRef.current += 1;
      clearTimeout(endTimerRef.current);
      endTimerRef.current = undefined;
      const active = activeBlipRef.current;
      activeBlipRef.current = null;
      if (active !== null) {
        void sendEvent({ type: "blip_closed", blipId: active.id, reason });
        const falas = messagesRef.current;
        if (falas.length > 0) setPrevious((prev) => [...prev, { blipId: active.id, preview: active.preview, falas }]);
      }
      // Fechou a conversa, os grifos da pergunta saem junto (qualquer motivo).
      applyCommands([{ type: "clear_highlights" }]);
      setOpen(false);
      setBlip(null);
      setMessages([]);
      setError(null);
      setBusy(false);
      setEnded(false);
    },
    [sendEvent, applyCommands],
  );

  /** Candidato volta a programar sem esperar o entrevistador fechar. */
  const close = useCallback(() => closeChat("button"), [closeChat]);

  /** Chama POST /api/chat com o histórico e aplica a resposta. */
  const runTurn = useCallback(
    async (history: Fala[], forBlipId: string): Promise<void> => {
      if (sessionId === null) return;
      const epoch = epochRef.current;
      setBusy(true);
      setError(null);
      try {
        const res = await postChat({
          sessionId,
          blipId: forBlipId,
          messages: history.map(({ role, text }) => ({ role, text })),
        });
        if (epoch !== epochRef.current) return;
        // Ao encerrar, o grifo sai só quando a barra fecha, não junto com a última fala.
        applyCommands(res.end ? res.commands.filter((c) => c.type !== "clear_highlights") : res.commands);
        setMessages([...history, { role: "agent", text: res.reply, at: Date.now() }]);
        void sendEvent({ type: "speech", role: "agent", text: res.reply, blipId: forBlipId });
        if (res.end) {
          setEnded(true);
          endTimerRef.current = setTimeout(() => closeChat("agent"), END_DELAY_MS);
        }
      } catch (err) {
        if (epoch === epochRef.current) setError(errorText(err));
      } finally {
        if (epoch === epochRef.current) setBusy(false);
      }
    },
    [sessionId, applyCommands, sendEvent, closeChat],
  );

  /** Candidato clicou no balão: abre a barra e o entrevistador faz a pergunta. */
  const openBlip = useCallback(
    async (next: Blip): Promise<void> => {
      if (sessionId === null) return;
      epochRef.current += 1;
      clearTimeout(endTimerRef.current);
      activeBlipRef.current = next;
      setOpen(true);
      setBlip(next);
      setMessages([]);
      setError(null);
      setEnded(false);
      void sendEvent({ type: "blip_opened", blipId: next.id });
      await runTurn([], next.id);
    },
    [sessionId, sendEvent, runTurn],
  );

  const send = useCallback(
    (text: string) => {
      const active = activeBlipRef.current;
      if (busy || ended || active === null) return;
      const next: Fala[] = [...messages, { role: "candidate", text, at: Date.now() }];
      setMessages(next);
      void sendEvent({ type: "speech", role: "candidate", text, blipId: active.id });
      void runTurn(next, active.id);
    },
    [busy, ended, messages, sendEvent, runTurn],
  );

  /** Tenta de novo o último turno que falhou (a fala do candidato já está na lista). */
  const retry = useCallback(() => {
    const active = activeBlipRef.current;
    if (busy || active === null) return;
    void runTurn(messages, active.id);
  }, [busy, messages, runTurn]);

  return { open, blip, messages, previous, busy, ended, error, openBlip, send, retry, close };
}
