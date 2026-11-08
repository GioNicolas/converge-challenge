"use client";

// Prova clicável: a recrutadora clica numa evidência do relatório e vê o código naquele minuto, o que tinha
// acabado de mudar e o que foi falado em volta. A régua embaixo deixa andar pela sessão.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Gravacao } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import { LANGUAGE_LABELS } from "@/lib/ide-constants";
import { conversaPerto, execucaoAte, linhasNovas, maisPerto, versaoEm } from "@/lib/gravacao";

const CURVA = [0.32, 0.72, 0, 1] as const;

/** Uma evidência do relatório que dá para abrir. */
export interface MomentoProva {
  t: number;
  /** De onde veio: o nome do critério, ou "Adaptação à mudança". */
  origem: string;
  text: string;
}

type Props = {
  gravacao: Gravacao;
  momentos: MomentoProva[];
  /** Índice em `momentos` aberto agora; null fecha. */
  aberto: number | null;
  onFechar: () => void;
  onAbrir: (indice: number) => void;
};

export default function MomentoDaSessao({ gravacao, momentos, aberto, onFechar, onAbrir }: Props) {
  useEffect(() => {
    if (aberto === null) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    addEventListener("keydown", aoTeclar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
    };
  }, [aberto, onFechar]);

  return (
    <AnimatePresence>
      {aberto !== null && momentos[aberto] && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onFechar}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 backdrop-blur-sm sm:items-center sm:p-6 print:hidden"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.36, ease: CURVA }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Momento ${formatMs(momentos[aberto].t)} da entrevista`}
            className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-padrao bg-superficie shadow-flutuante sm:rounded-padrao"
          >
            {/* key: cada evidência começa no próprio minuto */}
            <Conteudo
              key={aberto}
              gravacao={gravacao}
              momentos={momentos}
              indice={aberto}
              onFechar={onFechar}
              onAbrir={onAbrir}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Conteudo({
  gravacao,
  momentos,
  indice,
  onFechar,
  onAbrir,
}: {
  gravacao: Gravacao;
  momentos: MomentoProva[];
  indice: number;
  onFechar: () => void;
  onAbrir: (indice: number) => void;
}) {
  const prova = momentos[indice];
  const [t, setT] = useState(prova.t);
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    fecharRef.current?.focus();
  }, []);

  const { atual, anterior } = versaoEm(gravacao, t);
  const novas = useMemo(() => (atual ? linhasNovas(anterior?.code, atual.code) : new Set<number>()), [atual, anterior]);
  const conversa = useMemo(() => conversaPerto(gravacao, t), [gravacao, t]);
  const destaque = maisPerto(conversa, t);
  const execucao = execucaoAte(gravacao, t);
  // Conversa longa: a lista rola até o que está em destaque.
  const destaqueRef = useRef<HTMLLIElement>(null);
  // Com chaves: o scrollIntoView devolve uma Promise no Chromium, e o React tomaria isso como limpeza.
  useEffect(() => {
    destaqueRef.current?.scrollIntoView({ block: "nearest" });
  }, [destaque]);
  const duracao = Math.max(gravacao.durationMs, prova.t, 1);

  return (
    <>
      <header className="flex items-start gap-4 border-b border-borda px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-texto-suave">
            <span className="tabular-nums">{formatMs(prova.t)}</span> · {prova.origem}
          </p>
          <p className="mt-1 leading-relaxed text-pretty">{prova.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BotaoIcone
            rotulo="Prova anterior"
            onClick={() => onAbrir(indice - 1)}
            desligado={indice === 0}
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </BotaoIcone>
          <span className="w-12 text-center text-xs text-texto-suave tabular-nums">
            {indice + 1} de {momentos.length}
          </span>
          <BotaoIcone
            rotulo="Próxima prova"
            onClick={() => onAbrir(indice + 1)}
            desligado={indice === momentos.length - 1}
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </BotaoIcone>
          <BotaoIcone rotulo="Fechar" onClick={onFechar} refBotao={fecharRef}>
            <X size={16} strokeWidth={1.75} />
          </BotaoIcone>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[3fr_2fr] md:overflow-hidden">
        <section aria-label="Código naquele minuto" className="flex min-h-0 flex-col border-borda md:border-r">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 sm:px-6">
            <h2 className="text-sm font-medium text-texto-suave">Código</h2>
            <p className="text-xs text-texto-suave tabular-nums">
              {atual
                ? `${LANGUAGE_LABELS[atual.language] ?? atual.language} · como estava aos ${formatMs(atual.t)}`
                : "ainda sem código"}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-4 sm:px-6">
            {atual ? (
              <pre className="rounded-controle bg-fundo py-3 font-mono text-[12.5px] leading-[1.6]">
                {atual.code.split("\n").map((linha, i) => (
                  <div
                    key={i}
                    className={`flex pr-4 ${novas.has(i) ? "bg-marca-suave shadow-[inset_2px_0_0_var(--marca)]" : ""}`}
                  >
                    <span className="w-10 shrink-0 pr-3 text-right text-texto-suave/70 select-none tabular-nums">
                      {i + 1}
                    </span>
                    <code className="whitespace-pre">{linha || " "}</code>
                  </div>
                ))}
              </pre>
            ) : (
              <p className="text-sm text-texto-suave">O candidato ainda não tinha escrito nada neste momento.</p>
            )}
            {novas.size > 0 && (
              <p className="mt-2 flex items-center gap-2 text-xs text-texto-suave">
                <span className="inline-block h-3 w-1 bg-marca" aria-hidden />
                Linhas que ele tinha acabado de escrever
              </p>
            )}
          </div>
        </section>

        <section aria-label="O que foi falado" className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 sm:px-6">
            <h2 className="text-sm font-medium text-texto-suave">O que foi falado</h2>
            {execucao && (
              <p className="text-xs text-texto-suave tabular-nums">
                Última execução: {execucao.passed}/{execucao.total} testes
              </p>
            )}
          </div>
          <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4 sm:px-6">
            {conversa.length === 0 && (
              <li className="text-sm text-texto-suave">Nada foi falado nos dois minutos em volta deste momento.</li>
            )}
            {conversa.map((item, i) => {
              const perto = item === destaque;
              if (item.tipo === "marco") {
                return (
                  <li
                    key={i}
                    ref={perto ? destaqueRef : undefined}
                    className={`flex gap-3 text-sm ${perto ? "text-texto" : "text-texto-suave"}`}
                  >
                    <span className="w-10 shrink-0 text-xs tabular-nums">{formatMs(item.t)}</span>
                    <span className="italic">{item.text}</span>
                  </li>
                );
              }
              return (
                <li key={i} ref={perto ? destaqueRef : undefined} className="flex gap-3">
                  <span className="w-10 shrink-0 pt-0.5 text-xs text-texto-suave tabular-nums">{formatMs(item.t)}</span>
                  <div className={`min-w-0 ${perto ? "" : "opacity-60"}`}>
                    <p className="text-xs font-medium text-texto-suave">
                      {item.role === "candidate" ? "Candidato" : "Totti"}
                    </p>
                    <p className={`leading-relaxed text-pretty ${perto ? "font-medium" : ""}`}>{item.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <Regua duracao={duracao} t={t} momentos={momentos} atual={indice} onMudar={setT} />
    </>
  );
}

/** Régua da sessão: arrastar anda pelo tempo; os tracinhos são as provas do relatório. */
function Regua({
  duracao,
  t,
  momentos,
  atual,
  onMudar,
}: {
  duracao: number;
  t: number;
  momentos: MomentoProva[];
  atual: number;
  onMudar: (t: number) => void;
}) {
  const pct = (x: number) => `${Math.min(100, Math.max(0, (x / duracao) * 100))}%`;
  return (
    <footer className="flex items-center gap-4 border-t border-borda px-5 py-3 sm:px-6">
      <span className="w-12 text-sm font-medium tabular-nums">{formatMs(t)}</span>
      <div className="relative flex-1">
        <input
          type="range"
          min={0}
          max={duracao}
          step={1000}
          value={Math.min(t, duracao)}
          onChange={(e) => onMudar(Number(e.target.value))}
          aria-label="Andar pela entrevista"
          aria-valuetext={formatMs(t)}
          className="relative z-10 h-6 w-full cursor-pointer accent-[var(--marca)]"
        />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0" aria-hidden>
          {momentos.map((m, i) => (
            <span
              key={i}
              className={`absolute top-2 h-1.5 w-px ${i === atual ? "bg-texto" : "bg-texto-suave/60"}`}
              style={{ left: pct(m.t) }}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onMudar(momentos[atual].t)}
        disabled={t === momentos[atual].t}
        className="shrink-0 text-xs font-medium text-texto underline-offset-2 hover:underline disabled:invisible"
      >
        Voltar para {formatMs(momentos[atual].t)}
      </button>
      <span className="hidden text-xs text-texto-suave tabular-nums sm:inline">{formatMs(duracao)}</span>
    </footer>
  );
}

function BotaoIcone({
  rotulo,
  onClick,
  desligado = false,
  refBotao,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  desligado?: boolean;
  refBotao?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={refBotao}
      type="button"
      onClick={onClick}
      disabled={desligado}
      aria-label={rotulo}
      className="flex size-8 items-center justify-center rounded-full text-texto-suave outline-none transition-colors duration-150 hover:bg-superficie-2 hover:text-texto focus-visible:ring-2 focus-visible:ring-marca disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
