"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Download, Flag, MessageSquare, Mic, MicOff, Play } from "lucide-react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { EditorCommand, InterviewConfig } from "@/lib/contracts";
import { entrada } from "@/lib/design/motion";
import { createExecutor, type CommandExecutor } from "@/lib/editorCommands";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { numberCode } from "@/lib/format";
import { LANGUAGE_LABELS } from "@/lib/ide-constants";
import { getProblem, resolveProblem } from "@/lib/problems";
import { runCode, warmUp } from "@/lib/runner";
import Composer from "./Composer";
import FakeCursor, { measureLines, type FakeCursorHandle } from "./FakeCursor";
import CodeEditor from "./CodeEditor";
import ConfirmarEncerrar from "./ConfirmarEncerrar";
import JanelaChamada from "./JanelaChamada";
import Legenda, { type FalaNaTela } from "./Legenda";
import PainelConversa, { type MensagemConversa } from "./PainelConversa";
import ProblemPanel from "./ProblemPanel";
import RunResults, { type RunState } from "./RunResults";
import { useMidiaLocal } from "@/lib/presenca/useMidiaLocal";
import { useChat } from "./ide/useChat";
import { useCodeCapture } from "./ide/useCodeCapture";
import { useSession } from "./ide/useSession";
import { VOICE_AVAILABLE, useVoice } from "./useVoice";

const CAPTION_MS = 8000;
const CHARS_POR_SEGUNDO = 18; // ritmo da legenda quando a voz não informa o progresso

/** Legenda palavra a palavra: revela o texto no ritmo de fala e some depois de um tempo. */
function useFalaProgressiva(texto: string | null): FalaNaTela | null {
  const [progresso, setProgresso] = useState({ texto, ate: 0 });
  useEffect(() => {
    if (!texto) return;
    let ate = 0;
    const id = setInterval(() => {
      ate = Math.min(texto.length, ate + 2);
      setProgresso({ texto, ate });
      if (ate >= texto.length) clearInterval(id);
    }, 2000 / CHARS_POR_SEGUNDO);
    return () => clearInterval(id);
  }, [texto]);
  return texto ? { quem: "agente", texto, ate: progresso.texto === texto ? progresso.ate : 0 } : null;
}

/**
 * A IDE não tem inteligência: mostra, captura e obedece (docs/contexto-pessoa-a-ide.md).
 * Eventos vão para /api/events; comandos do agente chegam pelo chat ou pela voz.
 */
/** `vaga`: o que a IDE usa da config da vaga (padrão: DEFAULT_CONFIG). */
export type VagaIDE = Pick<InterviewConfig, "id" | "durationMin" | "languages" | "problemId" | "difficulty">;

export default function IdeApp({ problemId, vaga = DEFAULT_CONFIG }: { problemId?: string; vaga?: VagaIDE }) {
  const DURATION_MS = vaga.durationMin * 60_000;
  const router = useRouter();
  // A questão vem da config da vaga (nível definido pelo agente); `problemId` só sobrescreve em testes.
  const problem = problemId ? getProblem(problemId) : resolveProblem(vaga);
  const session = useSession(problem.id, vaga.id, vaga.durationMin);
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
  const [confirmandoFim, setConfirmandoFim] = useState(false);
  const midia = useMidiaLocal();

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
  // Microfone da chamada (a câmera do candidato não é usada).
  const pedirMidia = midia.pedir;
  useEffect(() => {
    void pedirMidia();
  }, [pedirMidia]);

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

  const falando = voice.status === "on" && voice.mode === "speaking";
  const fala = useFalaProgressiva(caption);

  // Horário de cada fala (o chat não guarda): marcado quando a mensagem chega.
  const [horarios, setHorarios] = useState<number[]>([]);
  const total = chat.messages.length;
  useEffect(() => {
    setHorarios((h) => (total <= h.length ? h.slice(0, total) : [...h, ...Array<number>(total - h.length).fill(Date.now())]));
  }, [total]);
  const mensagens: MensagemConversa[] = chat.messages.map((m, i) => ({
    id: String(i),
    quem: m.role === "agent" ? "agente" : "candidato",
    texto: m.text,
    horario: horarios[i] ?? horarios.at(-1) ?? 0,
  }));

  const remaining = Math.max(0, DURATION_MS - session.elapsedMs);

  return (
    <main className="h-screen p-3">
      <section ref={sectionRef} className="relative h-full overflow-hidden rounded-padrao bg-superficie shadow-cartao">
        {/* O editor começa depois do painel do problema, para não ficar escondido */}
        {/* Coluna do editor: editor, testes e campo de conversa. Recolhido, o painel do problema vira uma
            pílula na coluna da esquerda; o editor fica fixo, não se move ao recolher/expandir. */}
        <div
          className="flex h-full flex-col pr-3 pb-3"
          style={{ marginLeft: 392 }}
        >
          <div className="min-h-0 flex-1">
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
          <RunResults state={run} total={problem.visibleTests.length} />
          <Composer busy={chat.busy} disabled={session.ended} onSend={chat.send} />
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
            {VOICE_AVAILABLE && (
              <button
                type="button"
                onClick={() => (voice.status === "on" ? void voice.stop() : void voice.start(chat.blipContext))}
                disabled={voice.status === "connecting" || session.ended}
                aria-label={voice.status === "on" ? "Desligar voz" : "Ligar voz"}
                className="vidro rounded-full p-2 shadow-cartao disabled:opacity-50"
              >
                {voice.status === "on" ? (
                  <Mic size={16} strokeWidth={1.75} className="text-sucesso" />
                ) : (
                  <MicOff size={16} strokeWidth={1.75} className="text-texto-suave" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={chat.open ? fecharConversa : abrirConversa}
              aria-label="Abrir conversa"
              aria-haspopup="dialog"
              aria-expanded={chat.open}
              className="vidro flex items-center gap-2 rounded-full px-4 py-2 font-medium shadow-cartao transition-transform duration-rapida ease-suave active:scale-95"
            >
              <MessageSquare size={16} strokeWidth={1.75} />
              Conversa
            </button>
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
        </div>

        <FakeCursor ref={cursorRef} />

        <JanelaChamada
          duvidaPendente={!!session.incomingBlip}
          encerrada={session.ended}
          iniciadaEm={session.startedAtRef.current || null}
          midia={midia}
          agenteFalando={falando}
          onClicarPlin={abrirConversa}
        />

        <Legenda fala={fala} />
        <PainelConversa
          aberto={chat.open}
          onFechar={fecharConversa}
          mensagens={mensagens}
          rodape={
            <>
              {chat.busy && <p className="text-texto-suave">Pensando…</p>}
              {chat.error && <p className="text-perigo">{chat.error}</p>}
              {voice.error && <p className="text-alerta">Voz indisponível ({voice.error}). Continue por texto.</p>}
            </>
          }
        />

        <ConfirmarEncerrar
          aberto={confirmandoFim}
          onCancelar={() => setConfirmandoFim(false)}
          onConfirmar={() => {
            setConfirmandoFim(false);
            session.endSession("button");
          }}
        />

        {/* "Agora não": adia a pergunta do entrevistador sem abrir a conversa. */}
        <div className="absolute bottom-24 right-4 z-20">
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
        </div>

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
