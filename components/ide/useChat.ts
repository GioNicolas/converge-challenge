import { useCallback, useEffect, useRef, useState } from "react";
import type { Blip, ChatMessage, EditorCommand } from "@/lib/contracts";
import { postChat } from "./api";
import type { EventInput } from "./useSession";

interface ChatDeps {
  sessionId: string | null;
  sendEvent: (input: EventInput) => Promise<void>;
  applyCommands: (commands: EditorCommand[]) => void;
  onAgentReply?: (texto: string) => Promise<unknown>;
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
/** Falas fora das conversas de balão que vão como contexto para o entrevistador (as mais recentes). */
const MAX_FALAS_LIVRES = 12;
/** Assunto de uma conversa que o candidato puxou (sem balão). */
export const ASSUNTO_LIVRE = "Você chamou o entrevistador";

/**
 * Conversa em andamento. `blip` null: conversa livre, puxada pelo candidato fora de um balão.
 * `visivel` false: o candidato falou sozinho e o entrevistador ainda não respondeu; a barra só abre se ele responder.
 */
interface Ativa {
  id: string;
  blip: Blip | null;
  visivel: boolean;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Conversa por texto na barra lateral. Abre por um balão do entrevistador, quando o candidato fala com ele
 * (a fala solta só abre a barra se o entrevistador decidir responder) ou pelo botão de chamar. Dura até um dos
 * dois encerrar ("pode seguir" do agente ou "voltar a programar" do candidato). As conversas encerradas ficam
 * em `previous`. `epochRef` invalida respostas que chegam depois de fechar.
 */
export function useChat({ sessionId, sendEvent, applyCommands, onAgentReply, onCancelReply }: ChatDeps) {
  const [open, setOpen] = useState(false);
  const [blip, setBlip] = useState<Blip | null>(null);
  /** Há uma conversa em andamento, visível ou não (a fala solta esperando a decisão do entrevistador). */
  const [emConversa, setEmConversa] = useState(false);
  const [livre, setLivre] = useState(false);
  const [messages, setMessages] = useState<Fala[]>([]);
  const [previous, setPrevious] = useState<ConversaAnterior[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** O entrevistador encerrou: a última fala fica visível, sem campo de resposta, até a barra fechar sozinha. */
  const [ended, setEnded] = useState(false);

  const ativaRef = useRef<Ativa | null>(null);
  const messagesRef = useRef<Fala[]>([]);
  messagesRef.current = messages;
  /** Falas fora dos balões (as do candidato, as respostas e a saudação): contexto das conversas livres. */
  const livresRef = useRef<Fala[]>([]);
  const contadorLivreRef = useRef(0);
  const epochRef = useRef(0);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnoRef = useRef(0);
  const vozRef = useRef({ onAgentReply, onCancelReply });
  vozRef.current = { onAgentReply, onCancelReply };

  useEffect(() => () => {
    epochRef.current++;
    clearTimeout(endTimerRef.current);
    vozRef.current.onCancelReply?.();
  }, []);

  const definirAtiva = useCallback((ativa: Ativa | null) => {
    ativaRef.current = ativa;
    setEmConversa(ativa !== null);
    setLivre(ativa !== null && ativa.blip === null);
  }, []);

  const guardarLivres = useCallback((falas: Fala[]) => {
    livresRef.current = [...livresRef.current, ...falas].slice(-MAX_FALAS_LIVRES);
  }, []);

  /** Fala do agente fora de uma conversa (a saudação): entra no contexto das conversas livres. */
  const lembrar = useCallback((fala: ChatMessage) => guardarLivres([{ ...fala, at: Date.now() }]), [guardarLivres]);

  /** O entrevistador só ouviu a fala solta: a conversa invisível acaba sem abrir a barra nem calar a voz. */
  const descartarOculta = useCallback(() => {
    const ativa = ativaRef.current;
    if (!ativa || ativa.visivel) return;
    guardarLivres(messagesRef.current);
    epochRef.current += 1;
    definirAtiva(null);
    setMessages([]);
    setBusy(false);
    setError(null);
    setEnded(false);
  }, [guardarLivres, definirAtiva]);

  const closeChat = useCallback(
    (reason: "agent" | "button") => {
      epochRef.current += 1;
      vozRef.current.onCancelReply?.();
      clearTimeout(endTimerRef.current);
      endTimerRef.current = undefined;
      const active = ativaRef.current;
      definirAtiva(null);
      if (active !== null) {
        if (active.blip) void sendEvent({ type: "blip_closed", blipId: active.blip.id, reason });
        const falas = messagesRef.current;
        if (!active.blip) guardarLivres(falas);
        const preview = active.blip?.preview ?? ASSUNTO_LIVRE;
        if (falas.length > 0) setPrevious((prev) => [...prev, { blipId: active.id, preview, falas }]);
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
    [sendEvent, applyCommands, definirAtiva, guardarLivres],
  );

  /** Candidato volta a programar sem esperar o entrevistador fechar. */
  const close = useCallback(() => closeChat("button"), [closeChat]);

  /**
   * Chama POST /api/chat com o histórico e aplica a resposta. Se o entrevistador só está ouvindo (o candidato
   * pensa em voz alta ou continua explicando), nada é dito e a conversa segue esperando a próxima fala.
   * A fala que estava esperando a vez de tocar não é cortada aqui: uma resposta nova a substitui.
   */
  const runTurn = useCallback(
    async (history: Fala[], ativa: Ativa): Promise<void> => {
      if (sessionId === null) return;
      const epoch = epochRef.current;
      const turno = ++turnoRef.current;
      const vigente = () => epoch === epochRef.current && turno === turnoRef.current;
      setBusy(true);
      setError(null);
      try {
        const contexto = ativa.blip ? [] : livresRef.current;
        const res = await postChat({
          sessionId,
          blipId: ativa.blip?.id,
          messages: [...contexto, ...history].map(({ role, text }) => ({ role, text })),
        });
        if (!vigente()) return;
        if (res.listening || !res.reply.trim()) {
          if (!ativa.visivel) descartarOculta();
          else setBusy(false);
          return;
        }
        if (!ativa.visivel) {
          ativa.visivel = true;
          setOpen(true);
        }
        // Ao encerrar, o grifo sai só quando a barra fecha, não junto com a última fala.
        applyCommands(res.end ? res.commands.filter((c) => c.type !== "clear_highlights") : res.commands);
        setMessages([...history, { role: "agent", text: res.reply, at: Date.now() }]);
        void sendEvent({ type: "speech", role: "agent", text: res.reply, blipId: ativa.blip?.id });
        if (res.end) {
          setEnded(true);
        }
        setBusy(false);
        await vozRef.current.onAgentReply?.(res.reply);
        if (vigente() && res.end) {
          endTimerRef.current = setTimeout(() => closeChat("agent"), END_DELAY_MS);
        }
      } catch (err) {
        if (!vigente()) return;
        // Fala solta que não chegou ao entrevistador: segue sem abrir a barra só para mostrar o erro.
        if (!ativa.visivel) descartarOculta();
        else setError(errorText(err));
      } finally {
        if (vigente()) setBusy(false);
      }
    },
    [sessionId, applyCommands, sendEvent, closeChat, descartarOculta],
  );

  /** O entrevistador abre a conversa de um balão (sozinho, numa pausa, ou pelo clique) e faz a pergunta. */
  const openBlip = useCallback(
    async (next: Blip): Promise<void> => {
      if (sessionId === null) return;
      // Uma fala solta ainda sem resposta perde a vez para a pergunta, mas fica no contexto.
      const anterior = ativaRef.current;
      if (anterior && !anterior.visivel) guardarLivres(messagesRef.current);
      epochRef.current += 1;
      vozRef.current.onCancelReply?.();
      clearTimeout(endTimerRef.current);
      const ativa: Ativa = { id: next.id, blip: next, visivel: true };
      definirAtiva(ativa);
      setOpen(true);
      setBlip(next);
      setMessages([]);
      setError(null);
      setEnded(false);
      void sendEvent({ type: "blip_opened", blipId: next.id });
      await runTurn([], ativa);
    },
    [sessionId, sendEvent, runTurn, definirAtiva, guardarLivres],
  );

  /**
   * Fala do candidato fora de uma conversa (em voz alta, enquanto programa). Vai para o entrevistador, que decide
   * pela intenção se responde (dúvida, pedido de feedback, etapa concluída) ou só ouve (pensando em voz alta).
   * `registrar` false: murmúrio solto, que não entra na linha do tempo.
   */
  const ouvir = useCallback(
    (text: string, registrar = true) => {
      if (sessionId === null || ativaRef.current !== null) return;
      const ativa: Ativa = { id: `livre-${++contadorLivreRef.current}`, blip: null, visivel: false };
      definirAtiva(ativa);
      const fala: Fala = { role: "candidate", text, at: Date.now() };
      setMessages([fala]);
      setError(null);
      setEnded(false);
      if (registrar) void sendEvent({ type: "speech", role: "candidate", text });
      void runTurn([fala], ativa);
    },
    [sessionId, sendEvent, runTurn, definirAtiva],
  );

  /** Botão de chamar o entrevistador: abre a barra vazia para o candidato escrever (ou falar). */
  const abrirLivre = useCallback(() => {
    if (sessionId === null || ativaRef.current !== null) return;
    epochRef.current += 1;
    clearTimeout(endTimerRef.current);
    definirAtiva({ id: `livre-${++contadorLivreRef.current}`, blip: null, visivel: true });
    setOpen(true);
    setBlip(null);
    setMessages([]);
    setError(null);
    setEnded(false);
  }, [sessionId, definirAtiva]);

  const send = useCallback(
    (text: string) => {
      const active = ativaRef.current;
      if (busy || ended || active === null) return;
      const next: Fala[] = [...messages, { role: "candidate", text, at: Date.now() }];
      setMessages(next);
      void sendEvent({ type: "speech", role: "candidate", text, blipId: active.blip?.id });
      void runTurn(next, active);
    },
    [busy, ended, messages, sendEvent, runTurn],
  );

  /** Tenta de novo o último turno que falhou (a fala do candidato já está na lista). */
  const retry = useCallback(() => {
    const active = ativaRef.current;
    if (busy || active === null) return;
    void runTurn(messages, active);
  }, [busy, messages, runTurn]);

  return {
    open, blip, livre, emConversa, messages, previous, busy, ended, error,
    openBlip, ouvir, abrirLivre, lembrar, send, retry, close,
  };
}
