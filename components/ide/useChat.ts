import { useCallback, useEffect, useRef, useState } from "react";
import type { Blip, ChatMessage, EditorCommand } from "@/lib/contracts";
import { postChat } from "./api";
import type { EventInput } from "./useSession";

interface ChatDeps {
  sessionId: string | null;
  sendEvent: (input: EventInput) => Promise<void>;
  applyCommands: (commands: EditorCommand[]) => void;
  onAgentReply?: (texto: string) => Promise<void>;
  onCancelReply?: () => void;
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
/** Conversa livre (fora de um balão): quantas falas recentes vão de contexto para o entrevistador. */
const MAX_FALAS_LIVRES = 8;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Conversa com o entrevistador, por voz (e texto na barra lateral).
 *
 * - Pergunta do entrevistador (balão): abre a barra e dura até um dos dois encerrar ("pode seguir" do agente
 *   ou "voltar a programar" do candidato). As conversas encerradas ficam em `previous`.
 * - Conversa livre: o microfone fica aberto e `falar` manda qualquer fala para o entrevistador (modo
 *   "candidato"), sem abrir a barra. Ele escolhe responder ou ficar quieto (`silent`).
 * - Falas que chegam com uma resposta em preparo viram UMA fala só, enviada quando ela chega.
 * `epochRef` invalida respostas que chegam depois de fechar.
 */
export function useChat({ sessionId, sendEvent, applyCommands, onAgentReply, onCancelReply }: ChatDeps) {
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
  const turnoRef = useRef(0);
  const busyRef = useRef(false);
  /** Falas ditas enquanto uma resposta estava em preparo (já juntas). */
  const pendenteRef = useRef<string | null>(null);
  /** Histórico curto da conversa livre (fora de balão). */
  const livreRef = useRef<Fala[]>([]);
  const [livreBusy, setLivreBusy] = useState(false);
  const vozRef = useRef({ onAgentReply, onCancelReply });
  vozRef.current = { onAgentReply, onCancelReply };

  useEffect(() => () => {
    epochRef.current++;
    clearTimeout(endTimerRef.current);
    vozRef.current.onCancelReply?.();
  }, []);

  const closeChat = useCallback(
    (reason: "agent" | "button") => {
      epochRef.current += 1;
      vozRef.current.onCancelReply?.();
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
      const turno = ++turnoRef.current;
      const vigente = () => epoch === epochRef.current && turno === turnoRef.current;
      vozRef.current.onCancelReply?.();
      setBusy(true);
      setError(null);
      try {
        const res = await postChat({
          sessionId,
          blipId: forBlipId,
          messages: history.map(({ role, text }) => ({ role, text })),
        });
        if (!vigente()) return;
        // Escolheu escutar: a fala do candidato fica no histórico e nada é mostrado nem falado.
        if (res.silent) {
          setMessages(history);
          setBusy(false);
          return;
        }
        // Ao encerrar, o grifo sai só quando a barra fecha, não junto com a última fala.
        applyCommands(res.end ? res.commands.filter((c) => c.type !== "clear_highlights") : res.commands);
        setMessages([...history, { role: "agent", text: res.reply, at: Date.now() }]);
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

  /** Candidato clicou no balão: abre a barra e o entrevistador faz a pergunta. */
  const openBlip = useCallback(
    async (next: Blip): Promise<void> => {
      if (sessionId === null) return;
      epochRef.current += 1;
      vozRef.current.onCancelReply?.();
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

  /** Um turno da conversa livre: a fala vai no modo "candidato", sem abrir a barra. */
  const runLivre = useCallback(
    async (texto: string): Promise<void> => {
      if (sessionId === null) return;
      const epoch = epochRef.current;
      const history: Fala[] = [...livreRef.current, { role: "candidate" as const, text: texto, at: Date.now() }].slice(-MAX_FALAS_LIVRES);
      livreRef.current = history;
      busyRef.current = true;
      setLivreBusy(true);
      try {
        const res = await postChat({ sessionId, messages: history.map(({ role, text }) => ({ role, text })) });
        if (epoch !== epochRef.current || activeBlipRef.current !== null || res.silent || !res.reply.trim()) return;
        applyCommands(res.commands);
        livreRef.current = res.end ? [] : [...history, { role: "agent" as const, text: res.reply, at: Date.now() }].slice(-MAX_FALAS_LIVRES);
        void sendEvent({ type: "speech", role: "agent", text: res.reply });
        busyRef.current = false;
        setLivreBusy(false);
        await vozRef.current.onAgentReply?.(res.reply);
      } catch (err) {
        console.warn("[conversa livre] sem resposta do entrevistador:", errorText(err));
      } finally {
        busyRef.current = false;
        setLivreBusy(false);
      }
    },
    [sessionId, applyCommands, sendEvent],
  );

  /**
   * Fala do candidato (voz). Com um balão aberto vira a resposta dele; senão, conversa livre. Se o entrevistador
   * ainda prepara a resposta anterior, junta e manda quando ela chegar.
   */
  const falar = useCallback(
    (texto: string) => {
      const limpo = texto.trim();
      if (!limpo) return;
      if (busy || busyRef.current) {
        pendenteRef.current = pendenteRef.current ? `${pendenteRef.current} ${limpo}` : limpo;
        return;
      }
      if (activeBlipRef.current !== null) {
        if (!ended) send(limpo);
        return;
      }
      void runLivre(limpo);
    },
    [busy, ended, send, runLivre],
  );

  // Fala guardada durante uma resposta: sai assim que o entrevistador libera.
  useEffect(() => {
    if (busy || livreBusy || !pendenteRef.current) return;
    const pendente = pendenteRef.current;
    pendenteRef.current = null;
    falar(pendente);
  }, [busy, livreBusy, falar]);

  /** Tenta de novo o último turno que falhou (a fala do candidato já está na lista). */
  const retry = useCallback(() => {
    const active = activeBlipRef.current;
    if (busy || active === null) return;
    void runTurn(messages, active.id);
  }, [busy, messages, runTurn]);

  return { open, blip, messages, previous, busy, livreBusy, ended, error, openBlip, send, falar, retry, close };
}
