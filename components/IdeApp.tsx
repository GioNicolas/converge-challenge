"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Play } from "lucide-react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { EditorCommand, InterviewConfig } from "@/lib/contracts";
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
import { postEncerramento } from "./ide/api";
import { useChat } from "./ide/useChat";
import { useCodeCapture } from "./ide/useCodeCapture";
import { useSession } from "./ide/useSession";

/** Margem esquerda do editor: o painel do problema (360) mais o respiro. */
const MARGEM_PROBLEMA = 392;

/**
 * A IDE não tem inteligência: mostra, captura e obedece (docs/contexto-pessoa-a-ide.md).
 * Eventos vão para /api/events; a conversa com o agente é só por texto, na barra lateral aberta pelo balão.
 */
/** `vaga`: o que a IDE usa da config da vaga (padrão: DEFAULT_CONFIG). */
export type VagaIDE = Pick<InterviewConfig, "id" | "durationMin" | "languages" | "problemId" | "difficulty">;

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
  // Microfone só estético por enquanto: mexe a onda da pílula, nada é transcrito nem analisado.
  const midia = useMidiaLocal();

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
  });

  useEffect(() => warmUp(), []);
  const pedirMidia = midia.pedir;
  useEffect(() => {
    void pedirMidia();
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
    const result = await runCode(capture.code, problem, capture.language, (feitos, passaram) =>
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
              onChange={capture.onCodeChange}
              onPaste={capture.onPaste}
              onReady={(editor: MonacoEditor.IStandaloneCodeEditor, monaco) => {
                editorRef.current = editor;
                executorRef.current = createAnimatedExecutor(editor, createExecutor(editor, monaco));
              }}
            />
          </div>
          <RunResults state={run} total={problem.visibleTests.length} />
        </div>

        {/* Coluna da questão: o painel do problema e, logo abaixo dele, os botões */}
        <div className="absolute top-4 left-4 z-10 flex w-[360px] flex-col gap-3">
          <ProblemPanel
            problem={problem}
            elapsedMs={session.elapsedMs}
            durationMs={DURATION_MS}
            aberto={problemaAberto}
            onToggle={setProblemaAberto}
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
              onClick={rodar}
              disabled={run.status === "running" || session.ended}
              className="flex items-center gap-2 rounded-full bg-marca px-4 py-2 font-medium text-texto-claro shadow-cartao disabled:opacity-60"
            >
              <Play size={16} strokeWidth={1.75} />
              {run.status === "running" ? "Rodando…" : "Rodar"}
            </button>
          </div>
        </div>

        <FakeCursor ref={cursorRef} />

        <JanelaChamada
          pergunta={chat.open ? null : (session.incomingBlip?.preview ?? null)}
          oculta={chat.open}
          encerrada={session.ended}
          iniciadaEm={session.startedAtRef.current || null}
          midia={midia}
          agenteFalando={false}
          onClicarPlin={abrirConversa}
          onAdiar={adiarPergunta}
        />

        <PainelConversa
          aberto={chat.open}
          assunto={chat.blip?.preview}
          falas={chat.messages}
          anteriores={chat.previous}
          digitando={chat.busy}
          encerrada={chat.ended}
          erro={chat.error}
          onEnviar={chat.send}
          onTentarDeNovo={chat.retry}
          onVoltar={chat.close}
          rotuloVoltar={finalizando ? "Encerrar agora" : undefined}
        />

        <ConfirmarEncerrar
          aberto={confirmandoFim}
          onCancelar={() => setConfirmandoFim(false)}
          onConfirmar={() => void finalizar()}
        />


        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            onClick={() => {
              applyCommands([
                { type: "highlight_range", startLine: 2, endLine: 3, note: "Debug: grifo" },
                { type: "add_inline_note", line: 3, text: "nota de teste" },
              ]);
            }}
            className="label-pequena absolute bottom-3 left-4 rounded-controle bg-superficie-2 px-2 py-1"
          >
            Testar grifo
          </button>
        )}
        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            onClick={() => applyCommands([{ type: "clear_highlights" }])}
            className="label-pequena absolute bottom-3 left-28 rounded-controle bg-superficie-2 px-2 py-1"
          >
            Limpar grifos
          </button>
        )}
      </section>
    </main>
  );
}
