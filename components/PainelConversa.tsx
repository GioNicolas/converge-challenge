"use client";

// Histórico da conversa numa folha lateral à direita: perguntas do agente e falas do candidato,
// para o candidato reler uma pergunta. Lista simples, sem balões: nome pequeno em cima, texto embaixo.
// Fecha com Esc, clique fora ou o botão de fechar.
import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type MensagemConversa = {
  id: string;
  quem: "agente" | "candidato";
  texto: string;
  /** Fala ainda em andamento (a transcrição pode mudar). */
  parcial?: boolean;
  /** Momento da fala, em milissegundos (Date.now()). */
  horario: number;
};

type Props = {
  aberto: boolean;
  onFechar: () => void;
  mensagens: MensagemConversa[];
  /** Mostra "ver no quadro" nas falas do agente. */
  onVerNoQuadro?: (id: string) => void;
};

const CURVA = [0.32, 0.72, 0, 1] as const; // --curva-suave
const MOLA = { type: "spring", stiffness: 400, damping: 36 } as const;

function hora(ms: number) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function PainelConversa({ aberto, onFechar, mensagens, onVerNoQuadro }: Props) {
  const reduzir = useReducedMotion() ?? false;
  const titulo = useId();
  const fechar = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const colado = useRef(true); // a lista está no fim? então acompanha as falas novas
  const aoFechar = useRef(onFechar);
  useEffect(() => {
    aoFechar.current = onFechar;
  }, [onFechar]);

  // Esc fecha. Ao abrir, o foco vai para o painel; ao fechar, volta para quem abriu.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    fechar.current?.focus({ preventScroll: true });
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        aoFechar.current();
      }
    };
    addEventListener("keydown", aoTeclar, true);
    return () => {
      removeEventListener("keydown", aoTeclar, true);
      anterior?.focus?.({ preventScroll: true });
    };
  }, [aberto]);

  // Ao abrir, começa no fim (a fala mais recente).
  useEffect(() => {
    if (!aberto || !lista.current) return;
    lista.current.scrollTop = lista.current.scrollHeight;
    colado.current = true;
  }, [aberto]);

  // Fala nova ou parcial crescendo: desce junto, se o candidato não estiver relendo lá em cima.
  const ultima = mensagens.at(-1);
  useEffect(() => {
    const el = lista.current;
    if (!el || !colado.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduzir ? "auto" : "smooth" });
  }, [mensagens.length, ultima?.texto, reduzir]);

  function aoRolar() {
    const el = lista.current;
    if (!el) return;
    colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  return (
    <AnimatePresence>
      {aberto && (
        <>
          {/* Clique fora fecha. Sem escurecer: o quadro continua visível. */}
          <motion.div
            key="fora"
            aria-hidden
            onPointerDown={onFechar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduzir ? 0 : 0.28 }}
            className="fixed inset-0 z-30 bg-fundo/10"
          />
          <motion.aside
            key="painel"
            role="dialog"
            aria-labelledby={titulo}
            initial={reduzir ? { opacity: 0 } : { x: "calc(100% + 24px)", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduzir ? { opacity: 0 } : { x: "calc(100% + 24px)", opacity: 0.6 }}
            transition={reduzir ? { duration: 0 } : MOLA}
            className="fixed top-3 right-3 bottom-3 z-40 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-padrao border border-borda bg-vidro shadow-flutuante backdrop-blur-2xl"
          >
            <header className="flex items-center gap-3 border-b border-borda px-5 pt-4 pb-3">
              <div className="flex-1">
                <h2 id={titulo} className="text-[15px] font-semibold tracking-tight text-texto">
                  Conversa
                </h2>
                <p className="text-xs text-texto-suave tabular-nums">
                  {mensagens.length === 0
                    ? "Nada ainda"
                    : mensagens.length === 1
                      ? "1 fala"
                      : `${mensagens.length} falas`}
                </p>
              </div>
              <button
                ref={fechar}
                type="button"
                onClick={onFechar}
                aria-label="Fechar conversa"
                className="flex size-8 items-center justify-center rounded-full bg-superficie-2 text-texto-suave transition-[color,transform] duration-150 ease-suave outline-none hover:text-texto focus-visible:ring-2 focus-visible:ring-marca active:scale-95"
              >
                <svg
                  viewBox="0 0 16 16"
                  width={14}
                  height={14}
                  aria-hidden
                  className="fill-none stroke-current"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </header>

            <div ref={lista} onScroll={aoRolar} className="flex-1 overflow-y-auto px-5 py-4">
              {mensagens.length === 0 ? (
                <p className="pt-8 text-center text-sm leading-relaxed text-texto-suave">
                  As perguntas do entrevistador e as suas respostas aparecem aqui.
                </p>
              ) : (
                <ol className="flex flex-col gap-5" aria-live="polite">
                  <AnimatePresence initial={false}>
                    {mensagens.map((m) => (
                      <motion.li
                        key={m.id}
                        initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduzir ? { duration: 0 } : { duration: 0.32, ease: CURVA }}
                      >
                        <Fala mensagem={m} onVerNoQuadro={onVerNoQuadro} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Fala({
  mensagem: m,
  onVerNoQuadro,
}: {
  mensagem: MensagemConversa;
  onVerNoQuadro?: (id: string) => void;
}) {
  const doAgente = m.quem === "agente";
  return (
    <article>
      <header className="mb-1 flex items-center gap-1.5 text-xs font-medium text-texto-suave">
        {doAgente && <span aria-hidden className="size-1.5 rounded-full bg-agente" />}
        <span>{doAgente ? "Entrevistador" : "Você"}</span>
        <span aria-hidden>·</span>
        <time dateTime={new Date(m.horario).toISOString()} className="font-normal tabular-nums">
          {hora(m.horario)}
        </time>
      </header>
      <p
        className={`text-[15px] leading-relaxed transition-colors duration-300 ease-suave ${
          m.parcial ? "text-texto-suave/60" : "text-texto"
        }`}
      >
        {m.texto}
        {m.parcial && <span className="sr-only"> (falando)</span>}
      </p>
      {doAgente && onVerNoQuadro && (
        <button
          type="button"
          onClick={() => onVerNoQuadro(m.id)}
          aria-label={`Ver no quadro: ${m.texto}`}
          className="mt-1.5 -ml-1 rounded-pequeno px-1 text-xs font-medium text-marca transition-opacity duration-150 ease-suave outline-none hover:opacity-75 focus-visible:ring-2 focus-visible:ring-marca"
        >
          ver no quadro
        </button>
      )}
    </article>
  );
}
