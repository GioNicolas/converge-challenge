"use client";

// "Ver resultados": as entrevistas feitas pelo link, da melhor nota para a pior. Cada linha leva ao cartão do
// candidato ("Ver relatório"), onde se decide. Serve aos dois formatos (Live Coding e System Design).
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { andamentoDa, NOME_ANDAMENTO, type EntrevistaReal } from "@/lib/vagas/entrevistas";
import {
  NOME_RECOMENDACAO_DO_RESULTADO,
  ordenarPorNota,
  type CartaoDoResultado,
  type FormatoDaEntrevista,
} from "@/lib/vagas/cartao";

const NOME_FORMATO: Record<FormatoDaEntrevista, string> = { live_coding: "Live Coding", system_design: "System Design" };

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

function LinhaDeResultado({ e, posicao }: { e: EntrevistaReal; posicao?: number }) {
  const a = andamentoDa(e);
  const temNota = e.overallScore !== undefined;
  const nome = e.candidato ?? `Candidato ${e.sessionId.slice(0, 6)}`;
  const href = `/vagas/resultado/${e.sessionId}`;

  return (
    <li className="linha-lista mx-2 rounded-xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 px-3 py-3 transition-colors duration-150 hover:bg-superficie-2/55 @4xl:grid-cols-[24px_minmax(0,1fr)_112px_160px_88px_104px]">
        <span className="numero hidden text-[13px] text-texto-suave/70 @4xl:block" aria-hidden>
          {posicao !== undefined ? posicao : ""}
        </span>

        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14.5px] text-texto">{nome}</span>
          <span className="numero truncate text-[12.5px] text-texto-suave">
            <span className="@4xl:hidden">{NOME_FORMATO[e.formato]} · </span>
            {quando(e.startedAt)}
          </span>
        </span>

        {/* Telas estreitas: nota, situação e link empilhados à direita. */}
        <span className="flex flex-col items-end gap-0.5 @4xl:hidden">
          {temNota && (
            <span className="flex items-baseline gap-1">
              <span className="titulo-display text-[20px] text-texto">{nota1(e.overallScore!)}</span>
              <span className="numero text-[11.5px] text-texto-suave">/4</span>
            </span>
          )}
          <span className="text-[12.5px] text-texto-suave">{textoDaSituacao(e, a)}</span>
          {e.ended && (
            <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto">
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
            <Link href={href} className="inline-flex items-center gap-1 text-[13px] text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto">
              Ver relatório <ArrowRight size={13} />
            </Link>
          )}
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// O cartão enxuto da página "Ver relatório": resumo, pontos fortes e fracos, e o link para o relatório completo.
// ---------------------------------------------------------------------------

export function CartaoEnxuto({ e, cartao }: { e: EntrevistaReal; cartao: CartaoDoResultado }) {
  const [detalhes, setDetalhes] = useState(false);
  return (
    <div className="flex flex-col gap-5 text-[13.5px] leading-relaxed text-texto">
      {cartao.resumo && <p className="text-texto/90">{cartao.resumo}</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        <ListaDePontos titulo="Pontos fortes" itens={cartao.pontosFortes} vazio="Nenhum ponto forte registrado." marca="+" />
        <ListaDePontos titulo="Pontos fracos" itens={cartao.pontosFracos} vazio="Nenhum ponto fraco registrado." marca="–" />
      </div>

      {detalhes && (
        <>
          {cartao.criterios.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h3 className="rotulo text-texto-suave">Critérios e por que cada nota</h3>
              <ul className="flex flex-col gap-3.5">
                {[...cartao.criterios]
                  .sort((x, y) => (y.nota ?? -1) - (x.nota ?? -1))
                  .map((c) => (
                    <li key={c.nome} className="flex flex-col gap-1.5">
                      <div className="grid grid-cols-[minmax(0,1fr)_72px_44px] items-center gap-3">
                        <span className={`truncate font-medium ${c.nota === null ? "text-texto-suave" : ""}`} title={c.nome}>
                          {c.nome}
                        </span>
                        <BarraDaNota nota={c.nota} />
                        <span className="numero text-right text-[13px]">
                          {c.nota === null ? <span className="text-texto-suave">—</span> : <>{c.nota}<span className="text-texto-suave">/4</span></>}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-texto-suave">
                        {c.nota === null ? "Não explorado na entrevista." : c.justificativa || "Sem justificativa registrada."}
                      </p>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {cartao.proximosPassos.length > 0 && <ListaDePontos titulo="Para a próxima etapa" itens={cartao.proximosPassos} vazio="" marca="→" />}
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        <button type="button" aria-expanded={detalhes} onClick={() => setDetalhes((v) => !v)} className="text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto">
          {detalhes ? "Esconder detalhes" : "Ver detalhes das notas"}
        </button>
        <Link href={e.href} className="inline-flex items-center gap-1 text-texto-suave underline decoration-texto/25 underline-offset-4 hover:text-texto">
          Ver a entrevista ({e.formato === "system_design" ? "quadro e conversa" : "código e conversa"}) <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

/** Quatro partes, como nas notas do relatório: dá para comparar de relance. Nota baixa (até 2) vai em vermelho. */
function BarraDaNota({ nota }: { nota: number | null }) {
  return (
    <span className="flex h-2 gap-0.5" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`flex-1 first:rounded-l-full last:rounded-r-full ${nota !== null && i <= nota ? (nota <= 2 ? "bg-perigo" : "bg-texto") : "bg-texto/10"}`}
        />
      ))}
    </span>
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
  const botaoForte = "rounded-lg border border-texto bg-texto px-3 py-1.5 text-[13px] font-medium text-fundo transition-opacity hover:opacity-85 disabled:opacity-50";

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
            <button type="button" className={botaoForte} disabled={enviando} onClick={confirmar}>
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
