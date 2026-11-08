"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Play, Mic, MicOff, MessageCircle } from "lucide-react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { EditorCommand, EmpecilhoPublico, InterviewConfig } from "@/lib/contracts";
import { createExecutor, type CommandExecutor } from "@/lib/editorCommands";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { LANGUAGE_LABELS } from "@/lib/ide-constants";
import { getProblem, resolveProblem } from "@/lib/problems";
import { runCode, warmUp } from "@/lib/runner";
import FakeCursor, { measureLines, type FakeCursorHandle } from "./FakeCursor";
import CodeEditor from "./CodeEditor";
import ConfirmarEncerrar from "./ConfirmarEncerrar";
import JanelaChamada from "./JanelaChamada";
import PainelConversa, { LARGURA_PAINEL } from "./PainelConversa";
import ProblemPanel from "./ProblemPanel";
import RunResults, { type RunState } from "./RunResults";
import { useMidiaLocal } from "@/lib/presenca/useMidiaLocal";
import { useTranscricao } from "@/lib/presenca/useTranscricao";
import { comoFuncionaLiveCoding } from "@/lib/conversa/instrucoes";
import { deveAguardarParaFalar, podeTomarTurno } from "@/lib/conversa/turnos";
import { useVozAgente } from "@/lib/voz/useVozAgente";
import ControleVoz from "./voz/ControleVoz";
import Legenda from "./Legenda";
import { postEncerramento, postForcarEmpecilho } from "./ide/api";
import { ASSUNTO_LIVRE, useChat } from "./ide/useChat";
import { useCodeCapture } from "./ide/useCodeCapture";
import { useSession } from "./ide/useSession";

/** Margem esquerda do editor: o painel do problema (360) mais o respiro. */
const MARGEM_PROBLEMA = 392;

/**
 * A IDE não tem inteligência: mostra, captura e obedece (docs/contexto-pessoa-a-ide.md).
 * Eventos vão para /api/events; a conversa com o agente aparece na barra lateral, que abre quando o agente pergunta
 * (sozinho, numa pausa do candidato) ou responde a uma fala solta dele (dúvida, feedback, etapa concluída).
 */
/** `vaga`: o que a IDE usa da config da vaga (padrão: DEFAULT_CONFIG). */
export type VagaIDE = Pick<InterviewConfig, "id" | "durationMin" | "languages" | "problemId" | "difficulty">;

/** Fora da conversa, frases finais com menos palavras que isso não entram na linha do tempo (o agente ainda ouve). */
const MIN_PALAVRAS_FALA = 2;
/** Logo no começo o agente se apresenta, diz quanto tempo dura e como funciona (lib/conversa/instrucoes.ts). */
/** Espera depois de a sessão começar, para a saudação não atropelar o carregamento da tela. */
const ATRASO_SAUDACAO_MS = 1500;
/** Digitou há menos que isso: o agente não abre uma pergunta no meio da digitação. */
const PAUSA_DIGITACAO_MS = 2000;
/** Volume do microfone acima disso conta como alguém falando (segura a vez do agente). */
const VOLUME_DE_FALA = 0.08;
/** Sem voz (desligada ou bloqueada pelo navegador), a fala do agente fica na legenda por esse tempo. */
const LEGENDA_SEM_VOZ_MS = 9000;

/** `convite`: id do link do e-mail; liga esta sessão ao candidato no painel da vaga. */
export default function IdeApp({ problemId, vaga = DEFAULT_CONFIG, convite }: { problemId?: string; vaga?: VagaIDE; convite?: string }) {
  const DURATION_MS = vaga.durationMin * 60_000;
  const router = useRouter();
  // A questão vem da config da vaga (nível definido pelo agente); `problemId` só sobrescreve em testes.
  const problem = problemId ? getProblem(problemId) : resolveProblem(vaga);
  // Abre na primeira linguagem da vaga que a questão tem (a recrutadora pode ter restringido, ex.: só C++).
  const initialLanguage = vaga.languages.find((l) => l in problem.starters) ?? vaga.languages[0];
  const session = useSession(problem.id, vaga.id, vaga.durationMin, initialLanguage);
  // Avisa uma vez de quem é a sessão. Best-effort: se falhar, a entrevista segue e só aparece sem nome.
  const vinculadaRef = useRef<string | null>(null);
  useEffect(() => {
    const sessionId = session.sessionId;
    if (!convite || !sessionId || vinculadaRef.current === sessionId) return;
    vinculadaRef.current = sessionId;
    void fetch("/api/convites/sessao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convite, sessionId }),
    }).catch(() => {});
  }, [convite, session.sessionId]);
  const capture = useCodeCapture({
    sendEvent: session.sendEvent,
    nowT: session.nowT,
    endedRef: session.endedRef,
    starters: problem.starters,
    initialLanguage,
  });

  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [firstRun, setFirstRun] = useState(true);
  const [problemaAberto, setProblemaAberto] = useState(true);
  const [confirmandoFim, setConfirmandoFim] = useState(false);
  /** Pediu para finalizar e o agente abriu a última conversa: a sessão encerra quando ela fechar. */
  const [finalizando, setFinalizando] = useState(false);
  const encerramentoAbertoRef = useRef(false);
  /** Mudança no problema que o Totti trouxe (empecilho): entra no painel e os testes dela rodam junto. */
  const [mudanca, setMudanca] = useState<EmpecilhoPublico | null>(null);
  const problemaRodado = mudanca ? { ...problem, visibleTests: [...problem.visibleTests, ...mudanca.tests.map(({ name, args, expected }) => ({ name, args, expected }))] } : problem;
  // O microfone mexe a onda da pílula e alimenta a transcrição da fala (useTranscricao, abaixo).
  const midia = useMidiaLocal();
  const voz = useVozAgente({ bloqueada: session.ended });
  const [parcial, setParcial] = useState("");

  // Turnos (as mesmas regras do quadro, lib/sessao/turnos.ts): o agente fala sem pedir licença, mas só numa
  // pausa de quem está falando. Uma transcrição parcial ou som no microfone seguram a vez dele.
  const ultimaFalaEmRef = useRef(0);
  const falaParcialRef = useRef(false);
  const ultimaDigitacaoEmRef = useRef(0);
  const vozFalar = voz.falar;
  /** Fala do agente: sintetiza já, com a escuta ligada, e só toca quando o candidato faz uma pausa. */
  const falarNaVez = useCallback((texto: string) => vozFalar(texto, {
    antesDeTocar: async () => {
      const esperandoDesde = Date.now();
      while (deveAguardarParaFalar({ agora: Date.now(), esperandoDesde, ultimaFalaEm: ultimaFalaEmRef.current, falaParcial: falaParcialRef.current })) {
        await new Promise<void>((resolver) => setTimeout(resolver, 100));
      }
      return true;
    },
  }), [vozFalar]);
  const receberParcial = useCallback((texto: string) => {
    setParcial(texto);
    falaParcialRef.current = !!texto.trim();
    if (texto.trim()) ultimaFalaEmRef.current = Date.now();
  }, []);
  // Som no microfone (fala que a transcrição ainda não devolveu) também conta, mas não a voz do próprio agente.
  useEffect(() => {
    if (midia.microfoneLigado && midia.volume > VOLUME_DE_FALA && voz.estado !== "falando") ultimaFalaEmRef.current = Date.now();
  }, [midia.microfoneLigado, midia.volume, voz.estado]);
  // Com a voz do agente tocando a escuta para, e uma parcial que ficou aberta não pode segurar a vez para sempre.
  useEffect(() => {
    if (voz.estado === "falando") falaParcialRef.current = false;
  }, [voz.estado]);
  /** Fala do agente sem voz (desligada ou bloqueada): fica um tempo na legenda. */
  const [legendaSemVoz, setLegendaSemVoz] = useState<{ quem: "agente"; texto: string; ate: number } | null>(null);
  useEffect(() => {
    if (!legendaSemVoz) return;
    const id = setTimeout(() => setLegendaSemVoz(null), LEGENDA_SEM_VOZ_MS);
    return () => clearTimeout(id);
  }, [legendaSemVoz]);

  const executorRef = useRef<CommandExecutor | null>(null);
  const cursorRef = useRef<FakeCursorHandle>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const codesRef = useRef<Record<string, string>>({}); // um buffer de código por linguagem
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const applyCommands = useCallback((cmds: EditorCommand[]) => {
    cmds.forEach((c) => executorRef.current?.(c));
  }, []);

  const chat = useChat({
    sessionId: session.sessionId,
    sendEvent: session.sendEvent,
    applyCommands,
    onAgentReply: falarNaVez,
    onCancelReply: voz.parar,
  });

  // Fala do candidato (Scribe, ou o navegador como reserva): numa conversa vira a resposta dele; fora dela vai
  // para o entrevistador, que decide pela intenção se responde (dúvida, feedback, etapa concluída) ou só ouve.
  const falaRef = useRef<(texto: string) => void>(() => {});
  /** Fala dita enquanto o agente ainda respondia (ou a barra fechava): vai assim que o chat liberar. */
  const falaPendenteRef = useRef<string | null>(null);
  const ouvirSolta = (texto: string) => {
    // Murmúrio solto ("hum", "é") não vira evento na linha do tempo, mas o agente ouve (pode ser um "terminei").
    chat.ouvir(texto, texto.split(/\s+/).filter(Boolean).length >= MIN_PALAVRAS_FALA);
  };
  falaRef.current = (texto) => {
    const limpo = texto.trim();
    if (!limpo || session.ended) return;
    if (chat.emConversa && !chat.ended && !chat.busy) {
      // Dentro da conversa qualquer resposta vale, até "sim" ou "não".
      chat.send(limpo);
      return;
    }
    if (chat.emConversa) {
      falaPendenteRef.current = [falaPendenteRef.current, limpo].filter(Boolean).join(" ");
      return;
    }
    ouvirSolta(limpo);
  };
  useEffect(() => {
    const pendente = falaPendenteRef.current;
    if (!pendente || chat.busy) return;
    if (chat.emConversa && !chat.ended) {
      falaPendenteRef.current = null;
      chat.send(pendente);
    } else if (!chat.emConversa) {
      falaPendenteRef.current = null;
      ouvirSolta(pendente);
    }
  });
  const aoFalar = useCallback((texto: string) => falaRef.current(texto), []);
  const escuta = useTranscricao({
    stream: midia.stream,
    // A escuta só para enquanto a voz do agente toca (preparando, ela ainda ouve: o candidato pode continuar falando).
    ativo: midia.microfoneLigado && !session.ended && (!finalizando || chat.open) && voz.estado !== "falando",
    sessaoId: session.sessionId,
    aoParcial: receberParcial,
    aoFinal: aoFalar,
  });

  // Estado do turno lido pelos intervalos abaixo (sem recriá-los a cada render).
  const estadoTurnoRef = useRef({ agenteFalando: false, aguardandoResposta: false, emConversa: false });
  estadoTurnoRef.current = { agenteFalando: voz.ativa, aguardandoResposta: chat.busy, emConversa: chat.emConversa };

  // Logo no começo, o agente se apresenta e avisa que dá para pedir feedback ao fim de cada etapa.
  // Se uma conversa já abriu antes (o agente já falou), a saudação não vem mais.
  const saudacaoFeitaRef = useRef(false);
  const lembrarFala = chat.lembrar;
  const registrarEvento = session.sendEvent;
  const duracaoMin = vaga.durationMin;
  useEffect(() => {
    if (chat.open) saudacaoFeitaRef.current = true;
  }, [chat.open]);
  useEffect(() => {
    if (!session.sessionId || session.ended || saudacaoFeitaRef.current) return;
    const desde = Date.now();
    const id = setInterval(() => {
      const agora = Date.now();
      const { emConversa, ...turno } = estadoTurnoRef.current;
      if (saudacaoFeitaRef.current || agora - desde < ATRASO_SAUDACAO_MS || emConversa) return;
      if (!podeTomarTurno({ agora, ultimaFalaEm: ultimaFalaEmRef.current, falaParcial: falaParcialRef.current, ...turno })) return;
      saudacaoFeitaRef.current = true;
      clearInterval(id);
      const saudacao = comoFuncionaLiveCoding(duracaoMin);
      lembrarFala({ role: "agent", text: saudacao });
      void registrarEvento({ type: "speech", role: "agent", text: saudacao }).catch(() => {});
      void falarNaVez(saudacao).then((falou) => {
        if (!falou) setLegendaSemVoz({ quem: "agente", texto: saudacao, ate: saudacao.length });
      });
    }, 200);
    return () => clearInterval(id);
  }, [session.sessionId, session.ended, lembrarFala, registrarEvento, falarNaVez, duracaoMin]);

  useEffect(() => warmUp(), []);
  const pedirMidia = midia.pedir;
  useEffect(() => {
    void pedirMidia().catch(() => {});
  }, [pedirMidia]);

  // Fim da sessão (botão ou tempo): vai para o agradecimento. O relatório é só da recrutadora.
  useEffect(() => {
    if (!session.ended || !session.sessionId) return;
    const id = setTimeout(() => router.push("/obrigado"), 400);
    return () => clearTimeout(id);
  }, [session.ended, session.sessionId, router]);

  // A conversa fechou (por qualquer lado): o foco volta para o código, ou, se era a do encerramento, a sessão acaba.
  const conversaAberta = chat.open;
  const encerrar = session.endSession;
  useEffect(() => {
    if (conversaAberta) {
      if (finalizando) encerramentoAbertoRef.current = true;
      return;
    }
    if (finalizando && encerramentoAbertoRef.current) encerrar("button");
    else editorRef.current?.focus();
  }, [conversaAberta, finalizando, encerrar]);

  // Empecilho: não é pergunta que dá para adiar. A conversa abre sozinha, o Totti anuncia a mudança e o painel
  // do problema abre com ela em destaque.
  const balao = session.incomingBlip;
  const abrirBalao = chat.openBlip;
  const tirarBalao = session.setIncomingBlip;
  useEffect(() => {
    const empecilho = balao?.empecilho;
    if (!balao || !empecilho || conversaAberta || finalizando || session.ended) return;
    tirarBalao(null);
    setMudanca(empecilho);
    setProblemaAberto(true);
    void abrirBalao(balao);
  }, [balao, conversaAberta, finalizando, session.ended, tirarBalao, abrirBalao]);

  // O agente não espera clique para perguntar: com uma pergunta pendente, abre a conversa sozinho na primeira
  // pausa do candidato (sem fala, sem transcrição parcial, sem digitar). O balão continua clicável enquanto isso.
  const abrirNaPausaRef = useRef<() => void>(() => {});
  abrirNaPausaRef.current = () => abrirConversa();
  const perguntaNaTela = balao && !balao.empecilho ? balao : null;
  const emConversa = chat.emConversa;
  useEffect(() => {
    if (!perguntaNaTela || conversaAberta || emConversa || finalizando || session.ended) return;
    const id = setInterval(() => {
      const agora = Date.now();
      const { emConversa: ocupado, ...turno } = estadoTurnoRef.current;
      if (ocupado || agora - ultimaDigitacaoEmRef.current < PAUSA_DIGITACAO_MS) return;
      if (!podeTomarTurno({ agora, ultimaFalaEm: ultimaFalaEmRef.current, falaParcial: falaParcialRef.current, ...turno })) return;
      clearInterval(id);
      abrirNaPausaRef.current();
    }, 150);
    return () => clearInterval(id);
  }, [perguntaNaTela, conversaAberta, emConversa, finalizando, session.ended]);

  /** Dev: solta o empecilho agora, sem esperar as regras de tempo. */
  async function forcarEmpecilho() {
    if (session.sessionId === null) return;
    try {
      const res = await postForcarEmpecilho(session.sessionId);
      console.info("[dev] empecilho:", res.reason);
      session.applyResponse(res);
    } catch (err) {
      console.error("POST /api/dev/empecilho falhou", err);
    }
  }

  /** Confirmou que quer finalizar: se o agente ainda tem o que perguntar, abre a última conversa antes. */
  async function finalizar() {
    setConfirmandoFim(false);
    if (session.sessionId === null || finalizando) return;
    setFinalizando(true);
    session.setIncomingBlip(null);
    try {
      const res = await postEncerramento(session.sessionId);
      if (res.blip) {
        void chat.openBlip(res.blip);
        return;
      }
    } catch (err) {
      console.error("POST /api/encerramento falhou", err);
    }
    session.endSession("button");
  }

  /**
   * Envolve o executor: grifos e notas passam pelo mouse falso (em fila, na
   * ordem em que chegam) antes de entrar no editor. Limpar é imediato.
   */
  function createAnimatedExecutor(
    editor: MonacoEditor.IStandaloneCodeEditor,
    exec: CommandExecutor,
  ): CommandExecutor {
    return (cmd) => {
      queueRef.current = queueRef.current
        .then(async () => {
          const section = sectionRef.current;
          const lineCount = editor.getModel()?.getLineCount() ?? 1;
          const clamp = (n: number) => Math.min(Math.max(1, Math.round(n)), lineCount);
          if (!section || cmd.type === "clear_highlights") return exec(cmd);

          const start = cmd.type === "highlight_range" ? clamp(Math.min(cmd.startLine, cmd.endLine)) : clamp(cmd.line);
          const end = cmd.type === "highlight_range" ? clamp(Math.max(cmd.startLine, cmd.endLine)) : start;
          editor.revealLinesInCenterIfOutsideViewport(start, end);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const rects = measureLines(editor, section, start, end);

          if (!rects.length) return exec(cmd);
          if (cmd.type === "highlight_range") await cursorRef.current?.select(rects, () => exec(cmd));
          else await cursorRef.current?.click(rects[0], () => exec(cmd));
        })
        .catch(() => exec(cmd)); // a animação nunca pode impedir o grifo
    };
  }

  function trocarLinguagem(next: string) {
    if (next === capture.language || session.ended) return;
    codesRef.current[capture.language] = capture.code;
    capture.changeLanguage(next);
    capture.onCodeChange(codesRef.current[next] ?? problem.starters[next] ?? "");
    setRun({ status: "idle" });
  }

  async function rodar() {
    if (session.ended) return;
    setRun({ status: "running", loadingPyodide: firstRun, feitos: 0, passaram: 0 });
    const result = await runCode(capture.code, problemaRodado, capture.language, (feitos, passaram) =>
      setRun((r) => (r.status === "running" ? { ...r, feitos, passaram } : r)),
    );
    setFirstRun(false);
    setRun({ status: "done", result });
    void capture.runWithResult(result);
  }

  function abrirConversa() {
    const blip = session.incomingBlip;
    if (!blip || chat.open) return;
    session.setIncomingBlip(null);
    void chat.openBlip(blip);
  }

  /** "Agora não": tira a pergunta da tela; o servidor decide quando ela volta. */
  function adiarPergunta() {
    const blip = session.incomingBlip;
    if (!blip) return;
    session.setIncomingBlip(null);
    void session.sendEvent({ type: "blip_snoozed", blipId: blip.id });
  }

  const remaining = Math.max(0, DURATION_MS - session.elapsedMs);

  return (
    <main className="h-screen p-3">
      <section ref={sectionRef} className="relative h-full overflow-hidden rounded-padrao bg-superficie shadow-cartao">
        {/* O editor começa depois do painel do problema, para não ficar escondido */}
        {/* Coluna do editor: editor e testes. Com a conversa aberta, abre espaço à direita para a barra lateral. */}
        <div
          className="flex h-full flex-col pr-3 pb-3 transition-[margin] duration-300 ease-suave"
          style={{ marginLeft: MARGEM_PROBLEMA, marginRight: chat.open ? LARGURA_PAINEL + 12 : 0 }}
        >
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={capture.code}
              language={capture.language}
              readOnly={session.ended}
              onChange={(codigo: string) => {
                ultimaDigitacaoEmRef.current = Date.now();
                capture.onCodeChange(codigo);
              }}
              onPaste={capture.onPaste}
              onReady={(editor: MonacoEditor.IStandaloneCodeEditor, monaco) => {
                editorRef.current = editor;
                executorRef.current = createAnimatedExecutor(editor, createExecutor(editor, monaco));
              }}
            />
          </div>
          <RunResults state={run} total={problemaRodado.visibleTests.length} />
        </div>

        {/* Coluna da questão: o painel do problema e, logo abaixo dele, os botões */}
        <div className="absolute top-4 left-4 z-10 flex w-[360px] flex-col gap-3">
          <ProblemPanel
            problem={problem}
            elapsedMs={session.elapsedMs}
            durationMs={DURATION_MS}
            aberto={problemaAberto}
            onToggle={setProblemaAberto}
            mudanca={mudanca}
          />
          <div className="flex flex-wrap items-center gap-2">
            {remaining <= 5 * 60_000 && !session.ended && (
              <span className="label-pequena numero text-alerta">Pouco tempo</span>
            )}
            <select
              value={capture.language}
              onChange={(e) => trocarLinguagem(e.target.value)}
              disabled={session.ended}
              aria-label="Linguagem"
              className="vidro rounded-full px-3 py-2 font-medium shadow-cartao outline-none"
            >
              {vaga.languages.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l] ?? l}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setConfirmandoFim(true)}
              disabled={session.ended || chat.open || finalizando}
              className="vidro flex items-center gap-2 rounded-full px-4 py-2 font-medium shadow-cartao disabled:opacity-50"
            >
              <Flag size={16} strokeWidth={1.75} />
              Finalizar
            </button>
            <button
              type="button"
              onClick={chat.abrirLivre}
              disabled={session.ended || chat.emConversa || finalizando}
              title="Tirar uma dúvida ou pedir um feedback"
              className="vidro flex items-center gap-2 rounded-full px-4 py-2 font-medium shadow-cartao disabled:opacity-50"
            >
              <MessageCircle size={16} strokeWidth={1.75} />
              Chamar o Totti
            </button>
            <button
              type="button"
              onClick={rodar}
              disabled={run.status === "running" || session.ended}
              className="flex items-center gap-2 rounded-full bg-marca px-4 py-2 font-medium text-sobre-marca shadow-cartao disabled:opacity-60"
            >
              <Play size={16} strokeWidth={1.75} />
              {run.status === "running" ? "Rodando…" : "Rodar"}
            </button>
          </div>
          {/* Atalhos de desenvolvimento: no fluxo da coluna, nunca por cima dos botões */}
          {process.env.NODE_ENV !== "production" && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  applyCommands([
                    { type: "highlight_range", startLine: 2, endLine: 3, note: "Debug: grifo" },
                    { type: "add_inline_note", line: 3, text: "nota de teste" },
                  ])
                }
                className="label-pequena rounded-full bg-superficie-2 px-2.5 py-1"
              >
                Testar grifo
              </button>
              <button
                type="button"
                onClick={() => applyCommands([{ type: "clear_highlights" }])}
                className="label-pequena rounded-full bg-superficie-2 px-2.5 py-1"
              >
                Limpar grifos
              </button>
              <button
                type="button"
                onClick={() => void forcarEmpecilho()}
                disabled={mudanca !== null || chat.open}
                className="label-pequena rounded-full bg-superficie-2 px-2.5 py-1 disabled:opacity-50"
              >
                Forçar empecilho
              </button>
            </div>
          )}
        </div>

        <FakeCursor ref={cursorRef} />

        <JanelaChamada
          pergunta={chat.open ? null : (session.incomingBlip?.preview ?? null)}
          oculta={chat.open}
          encerrada={session.ended}
          iniciadaEm={session.startedAtRef.current || null}
          midia={midia}
          agenteFalando={voz.estado === "falando"}
          agentePensando={chat.busy || voz.estado === "preparando"}
          onClicarPlin={abrirConversa}
          onAdiar={adiarPergunta}
        />

        <Legenda fala={voz.fala ?? legendaSemVoz} />
        <PainelConversa
          aberto={chat.open}
          assunto={chat.blip?.preview ?? (chat.livre ? ASSUNTO_LIVRE : undefined)}
          livre={chat.livre}
          falas={chat.messages}
          anteriores={chat.previous}
          digitando={chat.busy}
          encerrada={chat.ended}
          erro={chat.error}
          onEnviar={chat.send}
          onTentarDeNovo={chat.retry}
          onVoltar={chat.close}
          rotuloVoltar={finalizando ? "Encerrar agora" : undefined}
          rodape={
            <div className="flex flex-col gap-1 px-4 py-2 text-texto-suave">
              <div className="flex items-center justify-between gap-2">
                <ControleVoz voz={voz} texto={chat.messages.at(-1)?.role === "agent" ? chat.messages.at(-1)?.text : undefined} disabled={chat.busy || chat.ended || session.ended} />
                <button type="button" onClick={midia.alternarMicrofone} disabled={!midia.stream || session.ended}
                  aria-label={midia.microfoneLigado ? "Desligar microfone" : "Ligar microfone"}
                  aria-pressed={midia.microfoneLigado} className="rounded-full p-2 disabled:opacity-40">
                  {midia.microfoneLigado ? <Mic size={16} /> : <MicOff size={16} />}
                </button>
              </div>
              {parcial && <p role="status" className="text-[13px] italic">{parcial}</p>}
              {escuta.erro && <p role="status" className="text-[12px]">{escuta.erro}</p>}
            </div>
          }
        />

        <ConfirmarEncerrar
          aberto={confirmandoFim}
          onCancelar={() => setConfirmandoFim(false)}
          onConfirmar={() => void finalizar()}
        />


      </section>
    </main>
  );
}
