"use client";

// Aba Contratações da vaga: o ciclo dos 90 dias.
//   1. Garantia: das contratações que passaram da experiência, quantas o gestor aprovou.
//   2. Uma ficha por contratado, lado a lado: o que a entrevista disse × o que aconteceu aos 90 dias.
//      Quem fez 90 dias e não foi respondido ganha a pergunta "Como foi?": 3 toques (deu certo? em que a
//      entrevista errou? o que surpreendeu?).
//   3. "O que o Totti ajustou com isso": as regras que a resposta criou na memória da squad, já valendo
//      para a próxima entrevista.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUp, Check, Clock, RotateCcw, X } from "lucide-react";
import type { ContratacaoVista, VisaoContratacoes } from "@/lib/noventa-dias/visao";
import type { NotaDaEntrevista } from "@/lib/noventa-dias/tipos";
import { DIAS_DA_EXPERIENCIA } from "@/lib/noventa-dias/tipos";
import { useVagas, type VagaEmpresa } from "@/lib/vagas/workspace";
import { curvaSuave } from "@/lib/design/motion";

const MODO_DEV = process.env.NODE_ENV !== "production";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dataCurta = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};
const nota = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const NOME_RECOMENDACAO: Record<string, string> = { avancar: "Avançar", talvez: "Talvez", nao_avancar: "Não avançar" };

/** Sugestões para o "o que surpreendeu?". A última de "não deu certo" mostra o guarda-corpo em ação. */
const SURPRESAS: Record<"sim" | "nao", string[]> = {
  nao: [
    "Pagamento duplicado em produção: citava os casos de borda, mas não testava",
    "Travou quando o incidente apertou",
    "Muito nova para o cargo",
  ],
  sim: ["Chegou na solução certa depois de uma dica", "Explica bem as decisões para o time"],
};

export default function Contratacoes({ vaga }: { vaga: VagaEmpresa }) {
  const [visao, setVisao] = useState<VisaoContratacoes | null>(null);
  const [erro, setErro] = useState(false);
  /** Ids das contratações respondidas agora (o ajuste aparece com destaque). */
  const [agora, setAgora] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/noventa-dias?vagaId=${encodeURIComponent(vaga.id)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setVisao((await r.json()) as VisaoContratacoes);
      setErro(false);
    } catch {
      setErro(true);
    }
  }, [vaga.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !visao)
    return (
      <div className="cartao flex items-center justify-between gap-4 p-5 text-[14px] text-texto">
        Não consegui carregar as contratações.
        <button onClick={() => void carregar()} className="rounded-full bg-texto px-4 py-1.5 text-[13px] text-texto-claro">
          Tentar de novo
        </button>
      </div>
    );
  if (!visao)
    return (
      <div className="flex flex-col gap-6" aria-hidden>
        <div className="cartao h-[160px] animate-pulse" />
        <div className="cartao h-[420px] animate-pulse" />
      </div>
    );
  if (visao.contratacoes.length === 0)
    return <div className="cartao p-6 text-[14px] text-texto-suave">Ninguém desta vaga foi contratado pelo Totti ainda.</div>;

  return (
    <div className="flex flex-col gap-6">
      <Garantia visao={visao} />
      {visao.contratacoes.map((c) => (
        <Ficha
          key={c.id}
          c={c}
          destaque={agora.has(c.id)}
          onRespondeu={async (nova) => {
            setAgora((s) => new Set(s).add(nova.id));
            setVisao((v) => (v ? { ...v, contratacoes: v.contratacoes.map((x) => (x.id === nova.id ? nova : x)) } : v));
            await carregar();
          }}
          onDesfez={async () => {
            setAgora((s) => {
              const n = new Set(s);
              n.delete(c.id);
              return n;
            });
            await carregar();
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Garantia dos 90 dias
// ---------------------------------------------------------------------------

function Garantia({ visao }: { visao: VisaoContratacoes }) {
  const { garantia: g, contratacoes } = visao;
  const esperando = g.vencidas - g.respondidas;
  return (
    <section className="cartao flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-8">
      <div className="flex flex-col gap-3">
        <span className="rotulo text-texto-suave">Aprovadas aos {DIAS_DA_EXPERIENCIA} dias</span>
        <motion.p
          key={`${g.aprovadas}-${g.vencidas}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: curvaSuave }}
          className="titulo-display text-[56px] text-texto md:text-[64px]"
        >
          {g.aprovadas} <span className="text-texto-suave">de {g.vencidas}</span>
        </motion.p>
        <p className="text-[14px] text-texto-suave">
          {esperando > 0 ? (
            <>
              <span className="font-medium text-texto">
                {esperando === 1 ? "1 esperando" : `${esperando} esperando`} a sua resposta
              </span>
              {g.emExperiencia > 0 && ` · ${g.emExperiencia} em experiência`}
            </>
          ) : (
            `Todas as contratações respondidas${g.emExperiencia > 0 ? ` · ${g.emExperiencia} em experiência` : ""}`
          )}
        </p>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Contratações desta vaga">
        {contratacoes.map((c) => (
          <li key={c.id}>
            <SeloResultado c={c} comNome />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Deu certo · Não deu certo · Responder · Em experiência. Sempre com ícone e texto, nunca só cor. */
function SeloResultado({ c, comNome = false }: { c: ContratacaoVista; comNome?: boolean }) {
  const nome = comNome ? <span className="text-texto">{c.candidato.split(" ")[0]}</span> : null;
  const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]";
  if (c.resultado?.deuCerto)
    return (
      <span className={`${base} bg-sucesso/10 text-sucesso`}>
        <Check size={13} strokeWidth={2.5} />
        {nome}
        {comNome ? null : "Deu certo"}
      </span>
    );
  if (c.resultado)
    return (
      <span className={`${base} bg-perigo/10 text-perigo`}>
        <X size={13} strokeWidth={2.5} />
        {nome}
        {comNome ? null : "Não deu certo"}
      </span>
    );
  if (c.vencida)
    return (
      <span className={`${base} bg-texto text-texto-claro`}>
        <span className="size-1.5 rounded-full bg-texto-claro" />
        {comNome ? <span>{c.candidato.split(" ")[0]}</span> : "Esperando resposta"}
      </span>
    );
  return (
    <span className={`${base} bg-superficie-2 text-texto-suave`}>
      <Clock size={13} />
      {nome}
      {comNome ? null : `Faltam ${DIAS_DA_EXPERIENCIA - c.dias} dias`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 2. A ficha: entrevista × 90 dias
// ---------------------------------------------------------------------------

type Rascunho = { deuCerto: boolean | null; criterio: string | null | undefined; surpresa: string };
const RASCUNHO_VAZIO: Rascunho = { deuCerto: null, criterio: undefined, surpresa: "" };

function Ficha({
  c,
  destaque,
  onRespondeu,
  onDesfez,
}: {
  c: ContratacaoVista;
  destaque: boolean;
  onRespondeu: (c: ContratacaoVista) => Promise<void>;
  onDesfez: () => Promise<void>;
}) {
  const [rascunho, setRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);
  const pendente = c.vencida && !c.resultado;
  // O critério marcado aparece na coluna da entrevista enquanto o gestor escolhe.
  const marcado = c.resultado ? c.resultado.criterioErrado : (rascunho.criterio ?? undefined);
  const deuCerto = c.resultado ? c.resultado.deuCerto : rascunho.deuCerto;

  return (
    <motion.article
      layout
      transition={{ duration: 0.3, ease: curvaSuave }}
      className={`cartao overflow-hidden ${pendente ? "outline-2 outline-texto" : ""}`}
      aria-label={`${c.candidato}: como foi essa contratação`}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pt-6 md:px-8 md:pt-7">
        <div className="flex flex-col gap-1.5">
          {pendente && <span className="rotulo text-texto">Como foi essa contratação?</span>}
          <h2 className="titulo-display text-[26px] text-texto">{c.candidato}</h2>
          <p className="numero text-[13.5px] text-texto-suave">
            {c.cargo} · entrou em {dataCurta(c.contratadoEm)} · {c.dias} dias de casa
          </p>
        </div>
        <SeloResultado c={c} />
      </header>

      <div className="grid gap-px bg-borda md:grid-cols-2">
        <div className="flex flex-col gap-5 bg-superficie p-6 md:p-8">
          <ColunaTitulo>A entrevista disse</ColunaTitulo>
          <div className="flex items-baseline gap-3">
            <span className="titulo-display text-[30px] text-texto">{NOME_RECOMENDACAO[c.entrevista.recomendacao]}</span>
            <span className="numero text-[14px] text-texto-suave">{nota(c.entrevista.nota)} de 4</span>
          </div>
          <Notas criterios={c.entrevista.criterios} marcado={marcado} deuCerto={deuCerto} />
        </div>

        <div className="flex flex-col gap-5 bg-superficie p-6 md:p-8">
          <ColunaTitulo>Aos {DIAS_DA_EXPERIENCIA} dias</ColunaTitulo>
          {c.resultado ? (
            <Realidade c={c} />
          ) : pendente ? (
            <Pergunta c={c} rascunho={rascunho} setRascunho={setRascunho} onRespondeu={onRespondeu} />
          ) : (
            <p className="text-[14px] text-texto-suave">
              Em experiência. O Totti pergunta como foi daqui a {DIAS_DA_EXPERIENCIA - c.dias} dias.
            </p>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {c.resultado && c.ajuste && <Ajuste key="ajuste" c={c} destaque={destaque} onDesfez={onDesfez} />}
      </AnimatePresence>
    </motion.article>
  );
}

function ColunaTitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="rotulo text-texto-suave">{children}</h3>;
}

/**
 * As notas da entrevista como medidores de 4 partes (um por critério, em tinta). O critério em que a entrevista
 * errou ganha a marca: "na prática, abaixo" (não deu certo) ou "na prática, acima" (deu certo).
 */
function Notas({ criterios, marcado, deuCerto }: { criterios: NotaDaEntrevista[]; marcado?: string; deuCerto: boolean | null }) {
  return (
    <ul className="flex flex-col gap-1">
      {criterios.map((cr) => {
        const errou = cr.id === marcado;
        return (
          <li
            key={cr.id}
            className={`-mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[6px] px-2 py-1.5 transition-colors duration-300 ${
              errou ? (deuCerto ? "bg-superficie-2" : "bg-perigo/8") : ""
            }`}
          >
            <span className={`truncate text-[14px] ${errou ? "font-medium text-texto" : "text-texto"}`}>{cr.nome}</span>
            <Medidor valor={cr.nota} nome={cr.nome} />
            <AnimatePresence initial={false}>
              {errou && deuCerto !== null && (
                <motion.span
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: curvaSuave }}
                  className={`col-span-2 flex items-center gap-1 text-[12.5px] ${deuCerto ? "text-texto" : "text-perigo"}`}
                >
                  {deuCerto ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
                  {deuCerto ? "Na prática, acima da nota" : "Na prática, abaixo da nota"}
                </motion.span>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function Medidor({ valor, nome }: { valor: number | null; nome: string }) {
  if (valor === null)
    return (
      <span className="numero w-[118px] text-right text-[12.5px] text-texto-suave" aria-label={`${nome}: sem nota`}>
        sem nota
      </span>
    );
  return (
    <span className="flex items-center gap-2.5" role="img" aria-label={`${nome}: ${nota(valor)} de 4`}>
      <span className="flex gap-[2px]">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-2 w-[22px] first:rounded-l-full last:rounded-r-full ${i <= valor ? "bg-texto" : "bg-superficie-2"}`}
          />
        ))}
      </span>
      <span className="numero w-4 text-right text-[13px] text-texto">{nota(valor)}</span>
    </span>
  );
}

/** A resposta já dada. */
function Realidade({ c }: { c: ContratacaoVista }) {
  const r = c.resultado!;
  const criterio = c.entrevista.criterios.find((x) => x.id === r.criterioErrado);
  return (
    <div className="flex flex-col gap-5">
      <span className={`titulo-display flex items-center gap-2.5 text-[30px] ${r.deuCerto ? "text-sucesso" : "text-perigo"}`}>
        {r.deuCerto ? <Check size={26} strokeWidth={2.5} /> : <X size={26} strokeWidth={2.5} />}
        {r.deuCerto ? "Deu certo" : "Não deu certo"}
      </span>
      <dl className="flex flex-col gap-4 text-[14px]">
        <div className="flex flex-col gap-1">
          <dt className="text-texto-suave">A entrevista errou em</dt>
          <dd className="text-texto">
            {criterio ? (
              <>
                <span className="font-medium">{criterio.nome}</span>
                <span className="text-texto-suave">
                  {" "}
                  · deu {criterio.nota ?? "—"}, na prática {r.deuCerto ? "acima" : "abaixo"}
                </span>
              </>
            ) : (
              "Nada: acertou"
            )}
          </dd>
        </div>
        {r.surpresa && (
          <div className="flex flex-col gap-1">
            <dt className="text-texto-suave">O que surpreendeu</dt>
            <dd className="border-l-2 border-borda pl-3 text-texto">{r.surpresa}</dd>
          </div>
        )}
      </dl>
      <p className="numero mt-auto text-[12.5px] text-texto-suave">Respondido em {dataCurta(r.respondidoEm)}</p>
    </div>
  );
}

/** "Como foi?": deu certo → em que a entrevista errou → o que surpreendeu (opcional). */
function Pergunta({
  c,
  rascunho,
  setRascunho,
  onRespondeu,
}: {
  c: ContratacaoVista;
  rascunho: Rascunho;
  setRascunho: (r: Rascunho | ((r: Rascunho) => Rascunho)) => void;
  onRespondeu: (c: ContratacaoVista) => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const { deuCerto, criterio, surpresa } = rascunho;
  // Não deu certo: as notas altas primeiro (onde a entrevista foi branda). Deu certo: as baixas primeiro.
  const opcoes = useMemo(() => {
    const comNota = c.entrevista.criterios.filter((x) => x.nota !== null);
    return [...comNota].sort((a, b) => (deuCerto === false ? b.nota! - a.nota! : a.nota! - b.nota!));
  }, [c.entrevista.criterios, deuCerto]);

  async function enviar() {
    if (deuCerto === null) return;
    setEnviando(true);
    setFalha(null);
    try {
      const r = await fetch(`/api/noventa-dias/${encodeURIComponent(c.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deuCerto, criterioErrado: criterio ?? null, surpresa: surpresa.trim() || undefined }),
      });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error ?? "não deu para enviar");
      await onRespondeu(corpo as ContratacaoVista);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "não deu para enviar");
      setEnviando(false);
    }
  }

  const passo2 = deuCerto !== null;
  const passo3 = passo2 && criterio !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <Passo n={1} titulo={`${c.candidato.split(" ")[0]} deu certo?`}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Deu certo?">
          {[
            { v: true, rotulo: "Deu certo", Icone: Check },
            { v: false, rotulo: "Não deu certo", Icone: X },
          ].map(({ v, rotulo, Icone }) => {
            const ativo = deuCerto === v;
            return (
              <button
                key={rotulo}
                role="radio"
                aria-checked={ativo}
                onClick={() => setRascunho((r) => ({ ...r, deuCerto: v, criterio: undefined }))}
                className={`flex items-center justify-center gap-2 rounded-[6px] border px-4 py-3.5 text-[15px] font-medium transition-colors ${
                  ativo
                    ? v
                      ? "border-sucesso bg-sucesso text-texto-claro"
                      : "border-perigo bg-perigo text-texto-claro"
                    : "border-borda bg-superficie text-texto hover:border-texto/40"
                }`}
              >
                <Icone size={17} strokeWidth={2.5} />
                {rotulo}
              </button>
            );
          })}
        </div>
      </Passo>

      <AnimatePresence initial={false}>
        {passo2 && (
          <Revelar key="p2">
            <Passo n={2} titulo="Em que a entrevista errou?">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Em que a entrevista errou?">
                {opcoes.map((o) => (
                  <Opcao key={o.id} ativo={criterio === o.id} onClick={() => setRascunho((r) => ({ ...r, criterio: o.id }))}>
                    {o.nome}
                    <span className="numero opacity-60">{o.nota}</span>
                  </Opcao>
                ))}
                <Opcao ativo={criterio === null} onClick={() => setRascunho((r) => ({ ...r, criterio: null }))}>
                  Acertou em tudo
                </Opcao>
              </div>
            </Passo>
          </Revelar>
        )}

        {passo3 && (
          <Revelar key="p3">
            <Passo n={3} titulo="O que surpreendeu?" opcional>
              <textarea
                value={surpresa}
                onChange={(e) => setRascunho((r) => ({ ...r, surpresa: e.target.value }))}
                rows={2}
                maxLength={500}
                placeholder="Bom ou ruim, em uma frase"
                className="w-full resize-none rounded-[6px] border border-borda bg-superficie px-3.5 py-2.5 text-[14px] text-texto outline-none placeholder:text-texto-suave/70 focus:border-texto/50"
              />
              <div className="flex flex-wrap gap-1.5">
                {SURPRESAS[deuCerto ? "sim" : "nao"].map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setRascunho((r) => ({
                        ...r,
                        surpresa: r.surpresa.includes(s) ? r.surpresa : [r.surpresa.trim(), s].filter(Boolean).join("; "),
                      }))
                    }
                    className="rounded-full bg-superficie-2/70 px-3 py-1 text-left text-[12.5px] text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </Passo>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => void enviar()}
                disabled={enviando}
                className="inline-flex items-center gap-2 rounded-full bg-texto px-5 py-2.5 text-[14px] font-medium text-texto-claro transition-opacity disabled:opacity-60"
              >
                {enviando ? "O Totti está ajustando…" : "Enviar para o Totti"}
                {!enviando && <ArrowRight size={15} />}
              </button>
              {falha && <span className="text-[13px] text-perigo">Erro: {falha}</span>}
            </div>
          </Revelar>
        )}
      </AnimatePresence>
    </div>
  );
}

function Passo({ n, titulo, opcional, children }: { n: number; titulo: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 flex items-center gap-2 text-[14.5px] font-medium text-texto">
        <span className="numero grid size-5 place-items-center rounded-full bg-superficie-2 text-[11.5px] text-texto-suave">
          {n}
        </span>
        {titulo}
        {opcional && <span className="font-normal text-texto-suave">· opcional</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Opcao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
        ativo ? "border-texto bg-texto text-texto-claro" : "border-borda bg-superficie text-texto hover:border-texto/40"
      }`}
    >
      {children}
    </button>
  );
}

function Revelar({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: curvaSuave }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 3. O que o Totti ajustou com isso
// ---------------------------------------------------------------------------

function Ajuste({ c, destaque, onDesfez }: { c: ContratacaoVista; destaque: boolean; onDesfez: () => Promise<void> }) {
  const { regras, ignorados } = c.ajuste!;
  const { vagas } = useVagas();
  // A próxima vaga aberta no mesmo formato: é onde o ajuste aparece primeiro.
  const proxima = vagas?.find((v) => v.etapa !== "encerrada" && v.id !== c.vagaId && v.resumo?.formato === "live_coding");
  const [desfazendo, setDesfazendo] = useState(false);

  async function desfazer() {
    setDesfazendo(true);
    await fetch(`/api/noventa-dias/${encodeURIComponent(c.id)}`, { method: "DELETE" }).catch(() => undefined);
    await onDesfez();
    setDesfazendo(false);
  }

  return (
    <motion.section
      initial={destaque ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.45, ease: curvaSuave, delay: destaque ? 0.15 : 0 }}
      className={regras.length ? "bg-texto text-texto-claro" : "border-t border-borda"}
      aria-label="O que o Totti ajustou com isso"
    >
      <div className="flex flex-col gap-5 px-6 py-6 md:px-8 md:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`rotulo ${regras.length ? "!text-texto-claro/60" : "text-texto-suave"}`}>
            O que o Totti ajustou com isso
            {destaque && regras.length > 0 && (
              <span className="ml-2 rounded-full bg-texto-claro px-2 py-0.5 text-[11.5px] font-medium !text-texto">Agora</span>
            )}
          </span>
          {MODO_DEV && destaque && (
            <button
              onClick={() => void desfazer()}
              disabled={desfazendo}
              className={`inline-flex items-center gap-1.5 text-[12.5px] transition-opacity hover:opacity-100 ${regras.length ? "text-texto-claro opacity-60" : "text-texto-suave"}`}
            >
              <RotateCcw size={12} />
              Desfazer (ensaio)
            </button>
          )}
        </div>

        {regras.length === 0 ? (
          <p className="text-[14.5px] text-texto-suave">A entrevista acertou. Nada a ajustar.</p>
        ) : (
          <ul className="flex flex-col gap-5">
            {regras.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5">
                <p className="titulo-display flex flex-wrap items-center gap-x-3 gap-y-1 text-[26px] md:text-[30px]">
                  {r.mudanca.criterio}
                  <ArrowRight size={22} className="opacity-50" aria-hidden />
                  <span>{r.mudanca.manchete}</span>
                </p>
                <p className="text-[14.5px] text-texto-claro/75">
                  A partir da próxima entrevista, o Totti {r.mudanca.naEntrevista}.
                  {!r.ativa && <span className="ml-1 text-texto-claro/50">(desligado na memória)</span>}
                </p>
              </li>
            ))}
          </ul>
        )}

        {ignorados.length > 0 && (
          <ul className="flex flex-col gap-1">
            {ignorados.map((i) => (
              <li key={i.id} className={`text-[13px] ${regras.length ? "text-texto-claro/60" : "text-texto-suave"}`}>
                Ignorado: <span className="line-through">&ldquo;{i.trecho}&rdquo;</span> · {i.porque}
              </li>
            ))}
          </ul>
        )}

        {regras.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
            {proxima && (
              <Link
                href={`/vagas/vaga?id=${encodeURIComponent(proxima.id)}&etapa=plano`}
                className="inline-flex items-center gap-1.5 font-medium text-texto-claro underline-offset-4 hover:underline"
              >
                Ver no plano de {proxima.cargo}
                <ArrowRight size={14} />
              </Link>
            )}
            <Link
              href="/vagas/aprendizado"
              className="inline-flex items-center gap-1.5 text-texto-claro/70 underline-offset-4 hover:text-texto-claro hover:underline"
            >
              O que o Totti aprendeu
            </Link>
          </div>
        )}
      </div>
    </motion.section>
  );
}
