"use client";

// "Ver resultados": as entrevistas feitas pelo link, da melhor nota para a pior. Passar o mouse numa linha abre o
// cartão completo (resumo, critérios com a justificativa de cada nota, pontos fortes e fracos); no toque, ou com o
// teclado, a linha se abre no lugar. Serve aos dois formatos (Live Coding e System Design).
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { andamentoDa, NOME_ANDAMENTO, type EntrevistaReal } from "@/lib/vagas/entrevistas";
import {
  faixaDaNota,
  NOME_RECOMENDACAO_DO_RESULTADO,
  ordenarPorNota,
  type CartaoDoResultado,
  type FormatoDaEntrevista,
} from "@/lib/vagas/cartao";

const NOME_FORMATO: Record<FormatoDaEntrevista, string> = { live_coding: "Live Coding", system_design: "System Design" };
const curvaSuave = [0.32, 0.72, 0, 1] as const;

const nota1 = (n: number) => n.toFixed(1).replace(".", ",");
const quando = (t: number) => new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const NOME_DECISAO = { avancar: "Avançar", nao_avancar: "Não avançar" } as const;
type Registro = NonNullable<EntrevistaReal["decisao"]>;
/** O que acabou de ser decidido nesta página vale até a próxima leitura da lista (o cartão flutuante desmonta e remonta). */
const decididas = new Map<string, Registro>();
const decisaoAtual = (e: EntrevistaReal): Registro | undefined => decididas.get(e.sessionId) ?? e.decisao;

/** "Avançar", ou onde a entrevista está quando ainda não há nota (com o pontinho que pulsa enquanto roda). */
function textoDaSituacao(e: EntrevistaReal, a: ReturnType<typeof andamentoDa>): React.ReactNode {
  const d = decisaoAtual(e);
  if (d) return `Decidido: ${NOME_DECISAO[d.decisao]}`;
  if (e.recommendation) return NOME_RECOMENDACAO_DO_RESULTADO[e.recommendation];
  return (
    <>
      {(a === "fazendo" || a === "gerando") && <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-sucesso align-middle" />}
      {NOME_ANDAMENTO[a]}
    </>
  );
}

export default function ResultadosDaVaga({ reais }: { reais: EntrevistaReal[] }) {
  const ordenadas = useMemo(() => ordenarPorNota(reais), [reais]);
  const comNota = ordenadas.filter((e) => e.overallScore !== undefined).length;
  // A posição só conta para quem tem nota: o resto está "a caminho".
  let posicao = 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-texto">Resultados das entrevistas</h2>
        <span className="text-[13px] text-texto-suave">
          {comNota === 0
            ? "Nenhum resultado pronto ainda"
            : `${comNota} ${comNota === 1 ? "resultado" : "resultados"} · da maior para a menor nota`}
        </span>
      </div>
      <ul className="cartao @container py-1.5">
        {ordenadas.map((e) => (
          <LinhaDeResultado key={e.sessionId} e={e} posicao={e.overallScore !== undefined ? ++posicao : undefined} />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Uma linha: posição, candidato, formato, recomendação, nota e barra
// ---------------------------------------------------------------------------

function LinhaDeResultado({ e, posicao }: { e: EntrevistaReal; posicao?: number }) {
  const reduzir = useReducedMotion();
  const a = andamentoDa(e);
  const cartao = e.cartao;
  const temNota = e.overallScore !== undefined;
  const nome = e.candidato ?? `Candidato ${e.sessionId.slice(0, 6)}`;

  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const fechar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abrir = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pararTimers = useCallback(() => {
    clearTimeout(fechar.current);
    clearTimeout(abrir.current);
  }, []);
  useEffect(() => pararTimers, [pararTimers]);

  // O cartão flutuante só onde há mouse e espaço: no toque, a linha abre no lugar.
  const podeFlutuar = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (min-width: 768px)").matches;
  const mostrar = () => {
    if (!cartao || aberto || !podeFlutuar()) return;
    clearTimeout(fechar.current);
    clearTimeout(abrir.current);
    abrir.current = setTimeout(() => {
      if (botao.current) setAncora(botao.current.closest("li")!.getBoundingClientRect());
    }, 110);
  };
  const esconder = () => {
    clearTimeout(abrir.current);
    clearTimeout(fechar.current);
    fechar.current = setTimeout(() => setAncora(null), 170);
  };
  const manter = () => clearTimeout(fechar.current);

  // Rolar a página com o cartão aberto desancora: fecha em vez de ficar solto.
  useEffect(() => {
    if (!ancora) return;
    const f = () => setAncora(null);
    window.addEventListener("scroll", f, { passive: true, capture: true });
    window.addEventListener("resize", f);
    return () => {
      window.removeEventListener("scroll", f, true);
      window.removeEventListener("resize", f);
    };
  }, [ancora]);

  return (
    <li className="linha-lista mx-2 rounded-xl" onPointerEnter={(ev) => ev.pointerType === "mouse" && mostrar()} onPointerLeave={(ev) => ev.pointerType === "mouse" && esconder()}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 px-3 py-3 transition-colors duration-150 hover:bg-superficie-2/55 @4xl:grid-cols-[24px_minmax(0,1fr)_112px_160px_88px_104px]">
        <span className="numero hidden text-[13px] text-texto-suave/70 @4xl:block" aria-hidden>
          {posicao !== undefined ? posicao : ""}
        </span>

        <button
          ref={botao}
          type="button"
          disabled={!cartao}
          aria-expanded={cartao ? aberto : undefined}
          onClick={() => {
            setAncora(null);
            setAberto((v) => !v);
          }}
          onFocus={mostrar}
          onBlur={esconder}
          className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:cursor-default"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14.5px] text-texto">
              {nome}
              {a === "pronto" && !aberto && <span className="rotulo rotulo-destaque ml-2">Novo</span>}
            </span>
            <span className="numero truncate text-[12.5px] text-texto-suave">
              <span className="@4xl:hidden">{NOME_FORMATO[e.formato]} · </span>
              {quando(e.startedAt)}
            </span>
          </span>
          {cartao && (
            <ChevronDown
              size={15}
              strokeWidth={1.75}
              aria-hidden
              className={`shrink-0 text-texto-suave/60 transition-transform duration-200 ${aberto ? "rotate-180" : ""}`}
            />
          )}
        </button>

        {/* Telas mais estreitas: nota, recomendação e link empilhados à direita. */}
        <span className="flex flex-col items-end gap-0.5 @4xl:hidden">
          {temNota && (
            <span className="flex items-baseline gap-1">
              <span className="titulo-display text-[20px] text-texto">{nota1(e.overallScore!)}</span>
              <span className="numero text-[11.5px] text-texto-suave">/4</span>
            </span>
          )}
          <span className="text-[12.5px] text-texto-suave">{textoDaSituacao(e, a)}</span>
          {e.ended && (
            <Link href={`/vagas/resultado/${e.sessionId}`} className="inline-flex items-center gap-1 text-[12.5px] text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto">
              Ver relatório <ArrowRight size={12} />
            </Link>
          )}
        </span>

        {/* Telas largas: uma coluna para cada coisa. */}
        <span className="hidden @4xl:block">
          <span className="rotulo rotulo-neutro">{NOME_FORMATO[e.formato]}</span>
        </span>

        <span className={`hidden text-[13px] @4xl:block ${temNota ? "text-texto" : "text-texto-suave"}`}>{textoDaSituacao(e, a)}</span>

        <span className="hidden items-baseline gap-1.5 @4xl:flex">
          {temNota ? (
            <>
              <span className="titulo-display text-[22px] text-texto">{nota1(e.overallScore!)}</span>
              <span className="numero text-[12px] text-texto-suave">/4</span>
            </>
          ) : (
            <span className="text-texto-suave/40">—</span>
          )}
        </span>

        <span className="hidden text-right @4xl:block">
          {e.ended && (
            <Link
              href={`/vagas/resultado/${e.sessionId}`}
              className="inline-flex items-center gap-1 text-[13px] text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto"
            >
              Ver relatório <ArrowRight size={13} />
            </Link>
          )}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {aberto && cartao && (
          <motion.div
            key="detalhe"
            initial={reduzir ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduzir ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: curvaSuave }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-4 pt-1">
              <CartaoCompleto e={e} cartao={cartao} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {ancora && cartao && !aberto && (
        <CartaoFlutuante ancora={ancora} aoEntrar={manter} aoSair={esconder}>
          <CartaoCompleto e={e} cartao={cartao} flutuante />
        </CartaoFlutuante>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// O cartão que flutua junto da linha (portal, para não ser cortado pelo cartão da lista)
// ---------------------------------------------------------------------------

const LARGURA = 480;
const MARGEM = 12;

function CartaoFlutuante({
  ancora,
  aoEntrar,
  aoSair,
  children,
}: {
  ancora: DOMRect;
  aoEntrar: () => void;
  aoSair: () => void;
  children: React.ReactNode;
}) {
  const reduzir = useReducedMotion();
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Mede o cartão e o encaixa: embaixo da linha, alinhado à direita; sem espaço embaixo, vai para cima.
  useLayoutEffect(() => {
    const alt = caixa.current?.offsetHeight ?? 0;
    const larg = Math.min(LARGURA, window.innerWidth - MARGEM * 2);
    const left = Math.min(Math.max(MARGEM, ancora.right - larg - 12), window.innerWidth - larg - MARGEM);
    const abaixo = ancora.bottom + 6;
    const acima = ancora.top - alt - 6;
    let top = abaixo + alt + MARGEM <= window.innerHeight ? abaixo : acima >= MARGEM ? acima : Math.max(MARGEM, window.innerHeight - alt - MARGEM);
    top = Math.max(MARGEM, top);
    setPos({ top, left });
  }, [ancora]);

  if (typeof document === "undefined") return null;
  return createPortal(
    // O tema do recrutador define as cores por classe: o portal sai dele, então reaplica (display: contents não desenha caixa).
    <div className="tema-recrutador contents">
      <motion.div
        ref={caixa}
        role="region"
        aria-label="Resultado completo"
        onPointerEnter={aoEntrar}
        onPointerLeave={aoSair}
        initial={reduzir ? false : { opacity: 0, y: 6, scale: 0.985 }}
        animate={{ opacity: pos ? 1 : 0, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: curvaSuave }}
        style={{
          position: "fixed",
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width: Math.min(LARGURA, typeof window === "undefined" ? LARGURA : window.innerWidth - MARGEM * 2),
          maxHeight: `calc(100dvh - ${MARGEM * 2}px)`,
          zIndex: 60,
        }}
        className="cartao overflow-y-auto p-5 shadow-[var(--sombra-flutuante)]"
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// O conteúdo do cartão (o mesmo no flutuante e na linha aberta)
// ---------------------------------------------------------------------------

export function CartaoCompleto({
  e,
  cartao,
  flutuante = false,
  comDecisao = false,
}: {
  e: EntrevistaReal;
  cartao: CartaoDoResultado;
  flutuante?: boolean;
  comDecisao?: boolean;
}) {
  const nome = e.candidato ?? `Candidato ${e.sessionId.slice(0, 6)}`;
  return (
    <div className="flex flex-col gap-5 text-[13.5px] leading-relaxed text-texto">
      {flutuante && (
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="truncate text-[15px] font-semibold tracking-[-0.015em]">{nome}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rotulo rotulo-neutro">{NOME_FORMATO[e.formato]}</span>
              {e.recommendation && <span className="rotulo rotulo-destaque">{NOME_RECOMENDACAO_DO_RESULTADO[e.recommendation]}</span>}
            </span>
          </div>
          {e.overallScore !== undefined && (
            <div className="flex shrink-0 items-baseline gap-1">
              <span className="titulo-display text-[34px]">{nota1(e.overallScore)}</span>
              <span className="numero text-[13px] text-texto-suave">/4</span>
            </div>
          )}
        </header>
      )}

      {cartao.resumo && (
        <section className="flex flex-col gap-1.5">
          <h3 className="rotulo text-texto-suave">Resumo</h3>
          <p className="text-texto/90">{cartao.resumo}</p>
        </section>
      )}

      {cartao.criterios.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h3 className="rotulo text-texto-suave">Critérios e por que cada nota</h3>
          <ul className="flex flex-col gap-3.5">
            {[...cartao.criterios]
              .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1))
              .map((c) => (
                <li key={c.nome} className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_72px_44px] items-center gap-3">
                    <span className={`truncate text-[13.5px] font-medium ${c.nota === null ? "text-texto-suave" : ""}`} title={c.nome}>
                      {c.nome}
                    </span>
                    <BarraDaNota nota={c.nota} />
                    <span className="numero text-right text-[13px]">
                      {c.nota === null ? <span className="text-texto-suave">—</span> : (
                        <>
                          {c.nota}
                          <span className="text-texto-suave">/4</span>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-texto-suave">
                    {c.nota === null ? "Não explorado na entrevista." : c.justificativa || "Sem justificativa registrada."}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <ListaDePontos titulo="Pontos fortes" itens={cartao.pontosFortes} vazio="Nenhum ponto forte registrado." marca="+" />
        <ListaDePontos titulo="Pontos fracos" itens={cartao.pontosFracos} vazio="Nenhum ponto fraco registrado." marca="–" />
      </div>

      {cartao.proximosPassos.length > 0 && (
        <ListaDePontos titulo="Para a próxima etapa" itens={cartao.proximosPassos} vazio="" marca="→" />
      )}

      {comDecisao && <BlocoDeDecisao e={e} />}

      <footer className="flex items-center justify-between border-t border-borda pt-3">
        <span className="numero text-[12px] text-texto-suave">{quando(e.startedAt)}</span>
        <Link
          href={e.href}
          className="inline-flex items-center gap-1 text-[13px] text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto"
        >
          Abrir o relatório completo <ArrowRight size={13} />
        </Link>
      </footer>
    </div>
  );
}

function ListaDePontos({ titulo, itens, vazio, marca }: { titulo: string; itens: string[]; vazio: string; marca: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="rotulo text-texto-suave">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-[12.5px] text-texto-suave/70">{vazio}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {itens.map((t, i) => (
            <li key={i} className="grid grid-cols-[14px_minmax(0,1fr)] gap-1.5 text-[13px] leading-snug">
              <span className="numero text-texto-suave" aria-hidden>
                {marca}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quatro partes, como nas notas do relatório: dá para comparar de relance. Nota baixa (até 2) vai em vermelho. */
function BarraDaNota({ nota }: { nota: number | null }) {
  const faixa = faixaDaNota(nota);
  return (
    <span className="flex h-2 gap-0.5" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`flex-1 first:rounded-l-full last:rounded-r-full ${
            nota !== null && i <= nota ? (faixa === "fraca" || nota <= 2 ? "bg-perigo" : "bg-texto") : "bg-texto/10"
          }`}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Decisão da recrutadora: Avançar / Não avançar. O candidato recebe o feedback por e-mail (depois de confirmar).
// ---------------------------------------------------------------------------

const TEXTO_DO_EMAIL: Record<Registro["email"], string> = {
  enviado: "E-mail de feedback enviado ao candidato.",
  simulado: "Decisão registrada. Nenhum e-mail saiu (candidato de demonstração ou envio desligado).",
  sem_candidato: "Decisão registrada. Esta entrevista não veio de um convite, então não há e-mail para avisar.",
  falhou: "Decisão registrada, mas o e-mail de feedback falhou.",
};

export function BlocoDeDecisao({ e }: { e: EntrevistaReal }) {
  const [registro, setRegistro] = useState<Registro | undefined>(() => decisaoAtual(e));
  const [escolha, setEscolha] = useState<"avancar" | "nao_avancar" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);

  if (!e.ended || e.state !== "done") return null;

  const confirmar = async () => {
    if (!escolha) return;
    setEnviando(true);
    setErro(false);
    try {
      const r = await fetch("/api/decisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: e.sessionId, decisao: escolha }),
      });
      if (!r.ok) throw new Error();
      const novo = (await r.json()) as Registro;
      decididas.set(e.sessionId, novo);
      setRegistro(novo);
      setEscolha(null);
    } catch {
      setErro(true);
    } finally {
      setEnviando(false);
    }
  };

  const botao = "rounded-lg border border-borda px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-superficie-2 disabled:opacity-50";

  return (
    <section className="flex flex-col gap-2 border-t border-borda pt-3" aria-label="Decisão sobre o candidato">
      <h3 className="rotulo text-texto-suave">Decisão</h3>
      {registro ? (
        <p className="text-[13px]">
          <strong className="font-semibold">{NOME_DECISAO[registro.decisao]}</strong>
          <span className="text-texto-suave"> · {TEXTO_DO_EMAIL[registro.email]}</span>
        </p>
      ) : escolha ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px]">
            {escolha === "avancar" ? "Avançar" : "Não avançar"} com {e.candidato ?? "este candidato"}? O candidato recebe o feedback por e-mail.
          </p>
          <div className="flex gap-2">
            <button type="button" className={`${botao} bg-texto text-fundo`} disabled={enviando} onClick={confirmar}>
              {enviando ? "Enviando…" : "Confirmar e avisar"}
            </button>
            <button type="button" className={botao} disabled={enviando} onClick={() => setEscolha(null)}>
              Voltar
            </button>
          </div>
          {erro && <p className="text-[12.5px] text-perigo">Não consegui registrar. Tente de novo.</p>}
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className={botao} onClick={() => setEscolha("avancar")}>
            Avançar
          </button>
          <button type="button" className={botao} onClick={() => setEscolha("nao_avancar")}>
            Não avançar
          </button>
        </div>
      )}
    </section>
  );
}
