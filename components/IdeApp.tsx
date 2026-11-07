"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Download, Flag, Play } from "lucide-react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { EditorCommand } from "@/lib/contracts";
import { entrada } from "@/lib/design/motion";
import { createExecutor, type CommandExecutor } from "@/lib/editorCommands";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { numberCode } from "@/lib/format";
import { LANGUAGE_LABELS } from "@/lib/ide-constants";
import { getProblem, resolveProblem } from "@/lib/problems";
import { runCode, warmUp } from "@/lib/runner";
import Caption from "./Caption";
import Composer from "./Composer";
import FakeCursor, { measureLines, type FakeCursorHandle } from "./FakeCursor";
import CodeEditor from "./CodeEditor";
import ConversationPanel from "./ConversationPanel";
import Orb, { orbLabel, type OrbState } from "./Orb";
import ProblemPanel from "./ProblemPanel";
import RunResults, { type RunState } from "./RunResults";
import { useChat } from "./ide/useChat";
import { useCodeCapture } from "./ide/useCodeCapture";
import { useSession } from "./ide/useSession";
import { VOICE_AVAILABLE, useVoice } from "./useVoice";

const DURATION_MS = DEFAULT_CONFIG.durationMin * 60_000;
const CAPTION_MS = 8000;

/**
 * A IDE não tem inteligência: mostra, captura e obedece (docs/contexto-pessoa-a-ide.md).
 * Eventos vão para /api/events; comandos do agente chegam pelo chat ou pela voz.
 */
export default function IdeApp({ problemId }: { problemId?: string }) {
  const router = useRouter();
  // A questão vem da config da vaga (nível definido pelo agente); `problemId` só sobrescreve em testes.
  const problem = problemId ? getProblem(problemId) : resolveProblem(DEFAULT_CONFIG);
  const session = useSession(problem.id);
  const capture = useCodeCapture({
    sendEvent: session.sendEvent,
    nowT: session.nowT,
    endedRef: session.endedRef,
    starters: problem.starters,
  });

  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [firstRun, setFirstRun] = useState(true);
  const [problemaAberto, setProblemaAberto] = useState(true);
  const [caption, setCaption] = useState<string | null>(null);

  const executorRef = useRef<CommandExecutor | null>(null);
  const cursorRef = useRef<FakeCursorHandle>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const codesRef = useRef<Record<string, string>>({}); // um buffer de código por linguagem
  const codeRef = useRef(capture.code);
  codeRef.current = capture.code;

  const applyCommands = useCallback((cmds: EditorCommand[]) => {
    cmds.forEach((c) => executorRef.current?.(c));
  }, []);

  const chat = useChat({
    sessionId: session.sessionId,
    sendEvent: session.sendEvent,
    applyCommands,
  });

  const voice = useVoice({
    getNumberedCode: () => numberCode(codeRef.current),
    execute: (c) => executorRef.current?.(c),
    onTranscript: chat.pushMessage,
  });

  useEffect(() => warmUp(), []);

  // Legenda: a última fala do agente, por alguns segundos.
  const last = chat.messages.at(-1);
  useEffect(() => {
    if (last?.role !== "agent") return;
    setCaption(last.text);
    const id = setTimeout(() => setCaption(null), CAPTION_MS);
    return () => clearTimeout(id);
  }, [last]);

  // Fim da sessão (botão ou tempo): solta a voz e vai para o agradecimento. O relatório é só da recrutadora.
  useEffect(() => {
    if (!session.ended || !session.sessionId) return;
    void voice.stop();
    const id = setTimeout(() => router.push("/obrigado"), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ended, session.sessionId, router]);

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
    setRun({ status: "running", loadingPyodide: firstRun });
    const result = await runCode(capture.code, problem, capture.language);
    setFirstRun(false);
    setRun({ status: "done", result });
    void capture.runWithResult(result);
  }

  function baixarSessao() {
    const data = {
      sessionId: session.sessionId,
      problemId: problem.id,
      startedAt: new Date(session.startedAtRef.current).toISOString(),
      durationMs: session.elapsedMs,
      finalCode: capture.code,
      timeline: session.eventsRef.current,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sessao-${session.sessionId?.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function abrirConversa() {
    const blip = session.incomingBlip;
    if (blip) {
      session.setIncomingBlip(null);
      void chat.openBlip(blip.id);
    } else if (!chat.open) {
      chat.openFree();
    }
  }

  /** "Agora não": tira a pergunta da tela; o servidor decide quando ela volta. */
  function adiarPergunta() {
    const blip = session.incomingBlip;
    if (!blip) return;
    session.setIncomingBlip(null);
    void session.sendEvent({ type: "blip_snoozed", blipId: blip.id });
  }

  function fecharConversa() {
    void voice.stop();
    chat.close();
  }

  const orb: OrbState =
    voice.status === "on" && voice.mode === "speaking"
      ? "falando"
      : voice.status === "on"
        ? "ouvindo"
        : chat.busy || voice.status === "connecting"
          ? "pensando"
          : session.incomingBlip
            ? "duvida"
            : "ocioso";

  const remaining = Math.max(0, DURATION_MS - session.elapsedMs);

  return (
    <main className="h-screen p-3">
      <section ref={sectionRef} className="relative h-full overflow-hidden rounded-padrao bg-superficie shadow-cartao">
        {/* O editor começa depois do painel do problema, para não ficar escondido */}
        <div className="h-full" style={{ marginLeft: problemaAberto ? 392 : 0 }}>
          <CodeEditor
            value={capture.code}
            language={capture.language}
            readOnly={session.ended}
            onChange={capture.onCodeChange}
            onPaste={capture.onPaste}
            onReady={(editor: MonacoEditor.IStandaloneCodeEditor, monaco) => {
              executorRef.current = createAnimatedExecutor(editor, createExecutor(editor, monaco));
            }}
          />
        </div>

        <ProblemPanel
          problem={problem}
          elapsedMs={session.elapsedMs}
          durationMs={DURATION_MS}
          aberto={problemaAberto}
          onToggle={setProblemaAberto}
        />

        <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
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
            {DEFAULT_CONFIG.languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l] ?? l}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={baixarSessao}
            aria-label="Baixar sessão em JSON"
            className="vidro rounded-full p-2 shadow-cartao"
          >
            <Download size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => session.endSession("button")}
            disabled={session.ended}
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

        <FakeCursor ref={cursorRef} />

        <RunResults state={run} />

        {chat.open && (
          <ConversationPanel
            messages={chat.messages}
            busy={chat.busy}
            error={chat.error}
            voiceAvailable={VOICE_AVAILABLE}
            voiceStatus={voice.status}
            voiceError={voice.error}
            onToggleVoice={() => (voice.status === "on" ? void voice.stop() : void voice.start(chat.blipContext))}
            onClose={fecharConversa}
          />
        )}

        {/* O agente "ao vivo": sempre no canto inferior direito. Com dúvida, a rodela gira e mostra a pergunta. */}
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
          <AnimatePresence initial={false}>
            {session.incomingBlip && !chat.open && (
              <motion.button
                key="agora-nao"
                {...entrada}
                type="button"
                onClick={adiarPergunta}
                className="vidro rounded-full px-3 py-2 font-medium text-texto-suave shadow-cartao"
              >
                Agora não
              </motion.button>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={chat.open ? fecharConversa : abrirConversa}
            aria-label={chat.open ? "Fechar conversa" : "Chamar o entrevistador"}
            className="vidro-escuro flex max-w-[300px] items-center gap-3 rounded-full py-2 pl-2 pr-4 text-left shadow-flutuante transition-transform duration-normal ease-suave hover:scale-[1.02]"
          >
            <Orb state={orb} size={48} />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 text-mini font-medium text-texto-suave">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sucesso opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-sucesso" />
                </span>
                Ao vivo
              </span>
              <span className="truncate text-corpo font-semibold titulo">
                {session.incomingBlip ? session.incomingBlip.preview : orbLabel(orb)}
              </span>
            </span>
          </button>
        </div>

        <Caption text={caption} />
        <Composer busy={chat.busy} disabled={session.ended || chat.ended} onSend={chat.send} />

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
