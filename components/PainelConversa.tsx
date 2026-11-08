"use client";

// Barra lateral da conversa com o entrevistador. Abre quando o candidato clica no balão de pergunta e
// fica até um dos dois encerrar: o entrevistador ("pode seguir") ou o candidato ("Voltar a programar").
// Não é modal: o código continua visível e o editor abre espaço para ela. As conversas anteriores ficam
// no topo, apagadas, para reler.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, SendHorizontal } from "lucide-react";
import type { ConversaAnterior, Fala } from "./ide/useChat";

/** Largura da barra; o editor usa para abrir espaço. */
export const LARGURA_PAINEL = 380;

type Props = {
  aberto: boolean;
  /** Rótulo da pergunta atual ("Quero entender o loop interno"). */
  assunto?: string;
  falas: Fala[];
  anteriores: ConversaAnterior[];
  /** Entrevistador escrevendo a próxima fala. */
  digitando: boolean;
  /** Entrevistador encerrou: sem campo de resposta até a barra fechar sozinha. */
  encerrada: boolean;
  erro: string | null;
  onEnviar: (texto: string) => void;
  onTentarDeNovo: () => void;
  onVoltar: () => void;
  /** Texto do botão de sair da conversa (padrão "Voltar a programar"; no encerramento, "Encerrar agora"). */
  rotuloVoltar?: string;
  /** Conversa que o candidato puxou: ele pode escrever primeiro, antes de qualquer fala do entrevistador. */
  livre?: boolean;
  rodape?: ReactNode;
};

const CURVA = [0.32, 0.72, 0, 1] as const; // --curva-suave
const MOLA = { type: "spring", stiffness: 400, damping: 38 } as const;

function hora(ms: number) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function PainelConversa({
  aberto,
  assunto,
  falas,
  anteriores,
  digitando,
  encerrada,
  erro,
  onEnviar,
  onTentarDeNovo,
  onVoltar,
  rotuloVoltar = "Voltar a programar",
  livre = false,
  rodape,
}: Props) {
  const reduzir = useReducedMotion() ?? false;
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [rascunho, setRascunho] = useState("");

  // Rascunho é da conversa atual: abriu outra, começa vazio.
  useEffect(() => {
    if (aberto) setRascunho("");
  }, [aberto]);

  // Fala nova ou "digitando": desce até o fim.
  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduzir ? "auto" : "smooth" });
  }, [falas.length, digitando, aberto, reduzir]);

  // Quando o entrevistador termina de escrever, o foco vai para a resposta.
  const podeResponder = aberto && !digitando && !encerrada && (falas.length > 0 || livre);
  useEffect(() => {
    if (podeResponder) campo.current?.focus({ preventScroll: true });
  }, [podeResponder]);

  function enviar(e?: FormEvent) {
    e?.preventDefault();
    const texto = rascunho.trim();
    if (!texto || !podeResponder) return;
    setRascunho("");
    onEnviar(texto);
  }

  // Enter envia; Shift+Enter quebra a linha.
  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) enviar(e);
  }

  return (
    <AnimatePresence>
      {aberto && (
        <motion.aside
          key="painel"
          aria-label="Conversa com o entrevistador"
          initial={reduzir ? { opacity: 0 } : { x: "calc(100% + 24px)", opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduzir ? { opacity: 0 } : { x: "calc(100% + 24px)", opacity: 0.6 }}
          transition={reduzir ? { duration: 0 } : MOLA}
          style={{ width: `min(${LARGURA_PAINEL}px, calc(100% - 24px))` }}
          className="absolute top-3 right-3 bottom-3 z-30 flex flex-col overflow-hidden rounded-padrao border border-borda bg-superficie-2 shadow-flutuante"
        >
          <header className="flex items-center gap-3 border-b border-borda px-5 pt-4 pb-3">
            <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-agente/20">
              <span className="size-2.5 rounded-full bg-agente" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold tracking-tight text-texto">Entrevistador</h2>
              {assunto && <p className="truncate text-xs text-texto-suave">{assunto}</p>}
            </div>
          </header>

          <div ref={lista} className="flex-1 overflow-y-auto px-5 py-4">
            {anteriores.length > 0 && (
              <div className="mb-6 flex flex-col gap-5 opacity-55">
                {anteriores.map((c) => (
                  <section key={c.blipId} aria-label={`Conversa anterior: ${c.preview}`} className="flex flex-col gap-4">
                    <Divisoria texto={`${c.preview} · ${hora(c.falas[0].at)}`} />
                    {c.falas.map((f, i) => (
                      <Mensagem key={i} fala={f} />
                    ))}
                  </section>
                ))}
                <Divisoria texto="Agora" />
              </div>
            )}

            <ol className="flex flex-col gap-4" aria-live="polite">
              <AnimatePresence initial={false}>
                {falas.map((f, i) => (
                  <motion.li
                    key={i}
                    initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduzir ? { duration: 0 } : { duration: 0.32, ease: CURVA }}
                  >
                    <Mensagem fala={f} />
                  </motion.li>
                ))}
              </AnimatePresence>
              {digitando && (
                <li aria-label="Entrevistador escrevendo">
                  <Digitando />
                </li>
              )}
            </ol>

            {erro && (
              <p className="mt-4 text-sm text-perigo">
                Não consegui responder agora.{" "}
                <button type="button" onClick={onTentarDeNovo} className="font-medium underline underline-offset-2">
                  Tentar de novo
                </button>
              </p>
            )}
          </div>

          <footer className="border-t border-borda p-3">
            {rodape}
            {encerrada ? (
              <p className="px-2 py-2 text-center text-sm text-texto-suave">
                {rotuloVoltar === "Voltar a programar" ? "Voltando para o código…" : "Encerrando…"}
              </p>
            ) : (
              <>
                <form onSubmit={enviar} className="flex items-end gap-2 rounded-[18px] bg-superficie px-3 py-2">
                  <textarea
                    ref={campo}
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={aoTeclar}
                    rows={2}
                    disabled={!podeResponder}
                    placeholder={podeResponder ? (falas.length > 0 ? "Sua resposta…" : "Escreva para o entrevistador…") : "Aguarde o entrevistador…"}
                    aria-label="Sua resposta ao entrevistador"
                    className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent py-1 text-[15px] leading-relaxed text-texto outline-none placeholder:text-texto-suave disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    aria-label="Enviar resposta"
                    disabled={!podeResponder || !rascunho.trim()}
                    className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-marca text-texto-claro transition-opacity duration-150 disabled:opacity-40"
                  >
                    <SendHorizontal size={16} strokeWidth={1.75} />
                  </button>
                </form>
                <button
                  type="button"
                  onClick={onVoltar}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-controle py-1.5 text-sm font-medium text-texto-suave transition-colors duration-150 hover:text-texto"
                >
                  <ArrowLeft size={14} strokeWidth={1.75} />
                  {rotuloVoltar}
                </button>
              </>
            )}
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Mensagem({ fala }: { fala: Fala }) {
  const doAgente = fala.role === "agent";
  return (
    <article className={doAgente ? "pr-6" : "flex flex-col items-end pl-8"}>
      <p
        className={`rounded-[16px] px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
          doAgente ? "rounded-tl-[6px] bg-superficie text-texto" : "rounded-tr-[6px] bg-marca text-texto-claro"
        }`}
      >
        {fala.text}
      </p>
      <time dateTime={new Date(fala.at).toISOString()} className="mt-1 px-1 text-[11px] text-texto-suave tabular-nums">
        {doAgente ? "Entrevistador · " : ""}
        {hora(fala.at)}
      </time>
    </article>
  );
}

function Divisoria({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-medium text-texto-suave">
      <span className="h-px flex-1 bg-borda" />
      <span className="max-w-[70%] truncate">{texto}</span>
      <span className="h-px flex-1 bg-borda" />
    </div>
  );
}

/** Três pontos pulsando, no lugar da próxima fala do entrevistador. */
function Digitando() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[16px] rounded-tl-[6px] bg-superficie px-4 py-3.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-texto-suave"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}
