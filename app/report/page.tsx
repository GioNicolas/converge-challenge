"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import VoltarLink from "@/components/VoltarLink";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, ChevronDown, TriangleAlert } from "lucide-react";
import { CONCEITOS_EMPECILHO, Gravacao, Report } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import type { ReportListItem } from "@/app/api/report/route";
import MomentoDaSessao, { type MomentoProva } from "@/components/report/MomentoDaSessao";
import HistoriaDaEntrevista, { duracaoCurta, type Acontecimento } from "@/components/report/HistoriaDaEntrevista";
import NotasDosCriterios, { type NotaCriterio } from "@/components/report/NotasDosCriterios";
import AprendidoComOTime from "@/components/squad/AprendidoComOTime";
import DecisaoFinal from "@/components/report/DecisaoFinal";

const REC = { avancar: "Avançar", talvez: "Talvez", nao_avancar: "Não avançar" } as const;
/** A avaliação leva de 15 s a 1 min: enquanto o servidor responde 202, consulta de novo. */
const POLL_MS = 2500;
const ORIGEM_ADAPTACAO = "Adaptação à mudança";
const ORIGEM_APRENDIZADO = "Aprendizado";
/** Origem dos acontecimentos do gráfico (travou, dica, mudança) no painel de momentos. */
const ORIGEM_HISTORIA = "Acontecimento";

type Evidencia = Report["criteria"][number]["evidence"][number];
/** Desenha uma evidência; com a gravação carregada, vira botão que abre o momento. */
type DesenharProva = (e: Evidencia, origem: string, chave: number) => ReactNode;

function ReportView() {
  const id = useSearchParams().get("sessionId");
  return id ? <SessionReport id={id} /> : <SessionList />;
}

function SessionReport({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [gravacao, setGravacao] = useState<Gravacao | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const fechar = useCallback(() => setAberto(null), []);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (first: boolean) => {
      const query = `sessionId=${encodeURIComponent(id)}${first && attempt > 0 ? "&retry=1" : ""}`;
      fetch(`/api/report?${query}`, { cache: "no-store" })
        .then(async (r) => {
          if (!alive) return;
          if (r.status === 202) {
            timer = setTimeout(() => load(false), POLL_MS);
            return;
          }
          const body: unknown = await r.json().catch(() => ({}));
          if (!r.ok) {
            const msg = (body as { error?: string }).error;
            throw new Error(msg ?? `Relatório indisponível (${r.status})`);
          }
          setReport(Report.parse(body));
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        });
    };
    load(true);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, attempt]);

  // A gravação só vem depois do relatório pronto; sem ela, as provas continuam aparecendo, só não abrem.
  const pronto = report !== null;
  useEffect(() => {
    if (!pronto) return;
    let alive = true;
    fetch(`/api/report/gravacao?sessionId=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const parsed = Gravacao.safeParse(body);
        if (alive && parsed.success) setGravacao(parsed.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, pronto]);

  // Todas as provas do relatório, em ordem de tempo: é a sequência que o painel percorre.
  const momentos = useMemo<MomentoProva[]>(() => {
    if (!report) return [];
    const doCriterio = report.criteria
      .filter((c) => c.score !== null)
      .flatMap((c) => c.evidence.map((e) => ({ t: e.t, origem: c.name, text: e.text })));
    const daAdaptacao = (report.adaptation?.evidence ?? []).map((e) => ({ t: e.t, origem: ORIGEM_ADAPTACAO, text: e.text }));
    const doAprendizado = (report.learning?.evidence ?? []).map((e) => ({ t: e.t, origem: ORIGEM_APRENDIZADO, text: e.text }));
    const daHistoria = acontecimentosDoRelatorio(report, gravacao).map((a) => ({
      t: a.t,
      origem: ORIGEM_HISTORIA,
      text: textoDoAcontecimento(a),
    }));
    return [...doCriterio, ...daAdaptacao, ...doAprendizado, ...daHistoria].sort((a, b) => a.t - b.t);
  }, [report, gravacao]);

  const desenharProva: DesenharProva = (e, origem, chave) => {
    const indice = momentos.findIndex((m) => m.t === e.t && m.origem === origem && m.text === e.text);
    if (!gravacao || indice < 0) {
      return (
        <p key={chave} className="text-corpo text-texto-suave">
          <span className="numero">{formatMs(e.t)}</span> — {e.text}
        </p>
      );
    }
    return (
      <button
        key={chave}
        type="button"
        onClick={() => setAberto(indice)}
        aria-label={`Ver o momento ${formatMs(e.t)}: código e conversa`}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-baseline gap-2 rounded-controle px-2 py-1 text-left text-corpo text-texto-suave outline-none transition-colors duration-150 hover:bg-superficie-2 hover:text-texto focus-visible:ring-2 focus-visible:ring-marca"
      >
        <span className="numero shrink-0 font-medium text-texto underline decoration-texto-suave/50 underline-offset-2 group-hover:decoration-texto">
          {formatMs(e.t)}
        </span>
        <span>{e.text}</span>
      </button>
    );
  };

  if (error) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-8">
        <VoltarLink />
        <p className="text-perigo">{error}</p>
        <button type="button" onClick={retry} className="vidro rounded-full px-4 py-2 font-medium shadow-cartao">
          Tentar de novo
        </button>
      </main>
    );
  }
  if (!report) return <p className="label-pequena p-8">Gerando relatório… isso leva até um minuto.</p>;

  const indiceDe = (e: Evidencia, origem: string) =>
    momentos.findIndex((m) => m.t === e.t && m.origem === origem && m.text === e.text);
  const provasDe = (evidencias: Evidencia[], origem: string) =>
    evidencias.map((e) => indiceDe(e, origem)).filter((i) => i >= 0);
  const notas: NotaCriterio[] = report.criteria.map((c) => ({
    id: c.id,
    nome: c.name,
    nota: c.score,
    resumo: c.evidence[0]?.text,
    provas: c.score === null ? [] : provasDe(c.evidence, c.name),
    regras: c.squadRules?.map((r) => ({ texto: r.text, efeito: r.effect })),
  }));
  const notasFora: NotaCriterio[] = [
    ...(report.adaptation
      ? [{ id: "adaptacao", nome: ORIGEM_ADAPTACAO, nota: report.adaptation.score, resumo: report.adaptation.evidence[0]?.text, provas: provasDe(report.adaptation.evidence, ORIGEM_ADAPTACAO) }]
      : []),
    ...(report.learning
      ? [{ id: "aprendizado", nome: ORIGEM_APRENDIZADO, nota: report.learning.score, resumo: report.learning.evidence[0]?.text, provas: provasDe(report.learning.evidence, ORIGEM_APRENDIZADO) }]
      : []),
  ];
  const acontecimentos = acontecimentosDoRelatorio(report, gravacao).map((ac) => ({
    ...ac,
    momento: momentos.findIndex((m) => m.t === ac.t && m.origem === ORIGEM_HISTORIA && m.text === textoDoAcontecimento(ac)),
  }));
  const a = report.adaptation;
  const s = report.signals;

  // Os números que importam, cada um com o nome em cima: dá para ler de relance, sem frase.
  const fatos: { nome: string; valor: string }[] = [
    { nome: "Testes escondidos", valor: `${s.testsPassed} de ${s.testsTotal}` },
    { nome: "Dicas", valor: s.hintsUsed === 0 ? "Nenhuma" : String(s.hintsUsed) },
    { nome: "Colagens", valor: s.pastes === 0 ? "Nenhuma" : String(s.pastes) },
    ...(a ? [{ nome: "Adaptou à mudança em", valor: a.adaptedAt === null ? "Não adaptou" : duracaoCurta(a.adaptedAt - a.announcedAt) }] : []),
    { nome: "Duração", valor: duracaoCurta(s.durationMs) },
  ];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-6">
        <VoltarLink texto="Voltar aos resultados" />

        {/* Veredito: o que o Totti recomenda, a nota geral e o porquê em duas frases */}
        <header className="flex flex-col gap-4">
          <p className="text-[13px] text-texto-suave">{report.roleTitle} · relatório da entrevista</p>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-texto-suave">O Totti recomenda</span>
              <h1 className="titulo-display text-[44px] leading-none">{REC[report.recommendation]}</h1>
            </div>
            <NotaGeral nota={report.overallScore} />
          </div>
          <p className="max-w-3xl text-[16px] leading-relaxed text-pretty">{report.summary}</p>
        </header>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-padrao border border-borda bg-borda sm:grid-cols-3 lg:grid-cols-5">
          {fatos.map((f) => (
            <div key={f.nome} className="flex flex-col gap-1 bg-superficie px-4 py-3.5 odd:last:col-span-2 lg:odd:last:col-span-1">
              <dt className="text-[12.5px] text-texto-suave">{f.nome}</dt>
              <dd className="numero text-[16px] font-medium tabular-nums">{f.valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Lista titulo="Pontos fortes" icone={<Check size={13} strokeWidth={2.5} />} itens={report.strengths} />
        <Lista titulo="Pontos de atenção" icone={<TriangleAlert size={12} strokeWidth={2.25} />} itens={report.concerns} />
      </section>

      <NotasDosCriterios
        titulo="Nota por critério"
        descricao="De 1 a 4. A nota geral é a média destes critérios."
        notas={notas}
        onAbrir={gravacao ? setAberto : undefined}
      />
      {notasFora.length > 0 && (
        <NotasDosCriterios
          titulo="Também observado"
          descricao="Como ele reagiu à mudança no problema e à ajuda. Não entra na nota geral."
          notas={notasFora}
          onAbrir={gravacao ? setAberto : undefined}
        />
      )}

      <HistoriaDaEntrevista
        duracao={gravacao?.durationMs ?? s.durationMs}
        gravacao={gravacao}
        acontecimentos={acontecimentos}
        onAbrir={setAberto}
      />

      <details className="group -mt-6 rounded-padrao border border-borda">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-medium select-none [&::-webkit-details-marker]:hidden">
          Ver todas as provas em texto
          <span className="flex items-center gap-1 text-sm font-normal text-texto-suave">
            {momentos.length} provas
            <ChevronDown size={14} strokeWidth={1.75} className="transition-transform duration-150 group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="space-y-6 border-t border-borda px-4 py-4">
          <section className="space-y-3">
            {report.criteria.map((c) => (
              <div key={c.id} className="rounded-padrao bg-superficie p-4 shadow-cartao">
                <p className="flex justify-between font-medium">
                  {c.name}
                  <span className="numero">{c.score === null ? "Não explorado" : `${c.score}/4`}</span>
                </p>
                {c.evidence.map((e, i) => (c.score === null ? (
                  <p key={i} className="text-corpo text-texto-suave">{e.text}</p>
                ) : (
                  desenharProva(e, c.name, i)
                )))}
                <div className="mt-3 empty:hidden">
                  <AprendidoComOTime regras={c.squadRules?.map((r) => ({ texto: r.text, efeito: r.effect }))} />
                </div>
              </div>
            ))}
          </section>
          {report.adaptation && <Adaptacao a={report.adaptation} desenharProva={desenharProva} />}
          {report.learning && <Aprendizado l={report.learning} desenharProva={desenharProva} />}
        </div>
      </details>

      <div className="flex flex-col gap-4">
        {report.nextSteps.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[17px] font-medium">Se avançar, explore na próxima etapa</h2>
            <ul className="flex flex-col gap-1.5 text-[14.5px] leading-snug">
              {report.nextSteps.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <ArrowRight size={14} strokeWidth={1.75} className="mt-[3px] shrink-0 text-texto-suave" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}
        <DecisaoFinal sessionId={id} />
      </div>

      {gravacao && (
        <MomentoDaSessao gravacao={gravacao} momentos={momentos} aberto={aberto} onFechar={fechar} onAbrir={setAberto} />
      )}
    </main>
  );
}

/** Nota geral: o número grande e uma barra de 0 a 4 preenchida até ele. */
function NotaGeral({ nota }: { nota: number }) {
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <span className="text-[13px] text-texto-suave">Nota geral</span>
      <span className="titulo-display text-[44px] leading-none tabular-nums">
        {nota.toFixed(1).replace(".", ",")}
        <span className="text-[24px] text-texto-suave">/4</span>
      </span>
      <span className="relative h-1.5 w-40 overflow-hidden rounded-full bg-texto/10" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-texto" style={{ width: `${(nota / 4) * 100}%` }} />
      </span>
    </div>
  );
}

/** Lista curta num cartão, com o mesmo ícone em cada item: forte ou atenção se distinguem pela forma, não pela cor. */
function Lista({ titulo, icone, itens }: { titulo: string; icone: ReactNode; itens: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-padrao bg-superficie p-5">
      <h2 className="text-[15px] font-medium">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="text-[14px] text-texto-suave">Nada a destacar.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {itens.map((i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-snug">
              <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-superficie-2 text-texto" aria-hidden>
                {icone}
              </span>
              {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function textoDoAcontecimento(a: Acontecimento): string {
  return a.detalhe ? `${a.titulo}. ${a.detalhe}` : a.titulo;
}

/** O que vai escrito no gráfico: travamentos, dicas, a mudança, quando ele se adaptou e colagens. */
function acontecimentosDoRelatorio(report: Report, gravacao: Gravacao | null): Acontecimento[] {
  const lista: Acontecimento[] = [];
  const l = report.learning;
  for (const s of l?.stuck ?? []) {
    lista.push({
      t: s.startedAt,
      fim: s.unstuckAt,
      tipo: "travou",
      titulo: s.unstuckAt === null ? "Travou e não destravou" : `Travou por ${duracaoCurta(s.unstuckAt - s.startedAt)}`,
      detalhe:
        (s.cause === "falhas_seguidas"
          ? `${s.failedRuns} execuções seguidas falhando sem passar em mais testes`
          : "Parado sem mexer no código, com ele falhando") +
        (s.hintLevels.length ? `, até a dica ${s.hintLevels.join(" e ")}.` : ", sem pedir dica."),
    });
  }
  if (l) {
    for (const h of l.hints) {
      lista.push({
        t: h.t,
        tipo: "dica",
        titulo:
          h.unstuckAt === null || h.codePassing
            ? `Dica ${h.level} de ${l.hintsAvailable}`
            : `Dica ${h.level} → destravou em ${duracaoCurta(h.unstuckAt - h.t)}`,
        detalhe: `“${h.text}”${h.unstuckAt === null && !h.codePassing ? " Não passou em mais testes depois dela." : ""}`,
      });
    }
  } else {
    for (const m of gravacao?.marcos ?? []) {
      if (m.tipo === "dica" || m.text.startsWith("Recebeu uma dica")) lista.push({ t: m.t, tipo: "dica", titulo: m.text });
    }
  }
  const a = report.adaptation;
  if (a) {
    lista.push({
      t: a.announcedAt,
      fim: a.adaptedAt,
      tipo: "mudanca",
      titulo: `Mudança: ${a.title}`,
      detalhe: `${TIPO_MUDANCA[a.kind]}. Exige ${CONCEITOS_EMPECILHO[a.concept]}.`,
    });
    if (a.adaptedAt !== null) {
      lista.push({
        t: a.adaptedAt,
        tipo: "adaptou",
        titulo: `Adaptou em ${duracaoCurta(a.adaptedAt - a.announcedAt)}`,
        detalhe: "Primeira execução com todos os testes da mudança passando, sem quebrar os antigos.",
      });
    }
  }
  for (const m of gravacao?.marcos ?? []) {
    if (m.tipo === "colagem" || m.text.startsWith("Colou")) lista.push({ t: m.t, tipo: "colagem", titulo: m.text });
  }
  return lista;
}

const TIPO_MUDANCA = { requisito: "O requisito mudou", caso_novo: "Entrou um caso novo" } as const;

/** Empecilho: a mudança que o Totti trouxe no meio e como ele se adaptou. Nota à parte, fora da geral. */
function Adaptacao({ a, desenharProva }: { a: NonNullable<Report["adaptation"]>; desenharProva: DesenharProva }) {
  const tempo = a.adaptedAt === null ? null : formatMs(a.adaptedAt - a.announcedAt);
  return (
    <section className="space-y-3">
      <h2 className="titulo">Adaptação à mudança</h2>
      <div className="rounded-padrao bg-superficie p-4 shadow-cartao">
        <p className="flex justify-between font-medium">
          {a.title}
          <span className="numero">{a.score === null ? "Sem nota" : `${a.score}/4`}</span>
        </p>
        <p className="label-pequena">
          {TIPO_MUDANCA[a.kind]} · exige {CONCEITOS_EMPECILHO[a.concept]} · fora da nota geral
        </p>
        <p className="mt-2 text-corpo">
          Veio aos <span className="numero">{formatMs(a.announcedAt)}</span> ·{" "}
          {tempo ? (
            <>
              testes da mudança passaram <span className="numero">{tempo}</span> depois
            </>
          ) : (
            "não chegou a passar nos testes da mudança"
          )}{" "}
          · código final: <span className="numero">{a.testsPassed}/{a.testsTotal}</span>
        </p>
        {a.evidence.map((e, i) => desenharProva(e, ORIGEM_ADAPTACAO, i))}
      </div>
    </section>
  );
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

interface Momento {
  t: number;
  titulo: string;
  texto: ReactNode;
}

/** Dicas, travamentos e a mudança numa linha do tempo só. Tudo medido pelos eventos da sessão. */
function momentosDoAprendizado(l: NonNullable<Report["learning"]>): Momento[] {
  const momentos: Momento[] = [];
  for (const s of l.stuck) {
    const como = s.cause === "falhas_seguidas" ? "execuções seguidas falhando sem passar em mais testes" : "parado sem mexer no código, com ele falhando";
    const ajuda = s.hintLevels.length ? `com a dica ${s.hintLevels.join(" e ")}` : "sem dica";
    momentos.push({
      t: s.startedAt,
      titulo: "Travou",
      texto: (
        <>
          {como} ·{" "}
          {s.unstuckAt === null ? (
            `não destravou até o fim (${ajuda})`
          ) : (
            <>
              destravou <span className="numero">{formatMs(s.unstuckAt - s.startedAt)}</span> depois, {ajuda}
            </>
          )}
        </>
      ),
    });
  }
  for (const h of l.hints) {
    momentos.push({
      t: h.t,
      titulo: `Dica ${h.level} de ${l.hintsAvailable}`,
      texto: (
        <>
          “{h.text}” ·{" "}
          {h.codePassing ? (
            "veio com o código já passando nos testes"
          ) : h.unstuckAt === null ? (
            "não passou em mais testes depois dela"
          ) : (
            <>
              passou em mais testes <span className="numero">{formatMs(h.unstuckAt - h.t)}</span> depois (
              {plural(h.runsAfter, "execução", "execuções")})
            </>
          )}
        </>
      ),
    });
  }
  if (l.change) {
    const c = l.change;
    momentos.push({
      t: c.announcedAt,
      titulo: "Mudança",
      texto: (
        <>
          exige {CONCEITOS_EMPECILHO[c.concept]} ·{" "}
          {c.adaptedAt === null ? (
            "não passou nos testes dela"
          ) : (
            <>
              adaptou <span className="numero">{formatMs(c.adaptedAt - c.announcedAt)}</span> depois
            </>
          )}{" "}
          · {plural(c.failedAttempts, "tentativa", "tentativas")} sem passar ·{" "}
          {c.hintsUsed === 0 ? "sem dica" : plural(c.hintsUsed, "dica", "dicas")} ·{" "}
          {c.conversationTurns === 0 ? "não falou na conversa da mudança" : `falou ${plural(c.conversationTurns, "vez", "vezes")} na conversa`}
        </>
      ),
    });
  }
  return momentos.sort((a, b) => a.t - b.t);
}

/** Como ele pensa e aprende: que dica precisou, quanto levou para destravar e como reagiu à mudança. Fora da nota geral. */
function Aprendizado({ l, desenharProva }: { l: NonNullable<Report["learning"]>; desenharProva: DesenharProva }) {
  const momentos = momentosDoAprendizado(l);
  return (
    <section className="space-y-3">
      <h2 className="titulo">Aprendizado</h2>
      <div className="rounded-padrao bg-superficie p-4 shadow-cartao">
        <p className="flex justify-between font-medium">
          Como destravou e usou a ajuda
          <span className="numero">{l.score === null ? "Sem nota" : `${l.score}/4`}</span>
        </p>
        <p className="label-pequena">
          {l.hints.length} de {plural(l.hintsAvailable, "dica permitida", "dicas permitidas")} ·{" "}
          {plural(l.stuck.length, "travamento", "travamentos")} · fora da nota geral
        </p>
        {momentos.length === 0 ? (
          <p className="mt-2 text-corpo">Não travou nem precisou de dica nesta entrevista.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-corpo">
            {momentos.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="numero shrink-0 text-texto-suave">{formatMs(m.t)}</span>
                <span>
                  <span className="font-medium">{m.titulo}</span> — {m.texto}
                </span>
              </li>
            ))}
          </ul>
        )}
        {l.evidence.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-borda pt-3">
            {l.evidence.map((e, i) => desenharProva(e, ORIGEM_APRENDIZADO, i))}
          </div>
        )}
      </div>
    </section>
  );
}

function SessionList() {
  const [items, setItems] = useState<ReportListItem[] | null>(null);

  useEffect(() => {
    fetch("/api/report", { cache: "no-store" })
      .then((r) => r.json() as Promise<ReportListItem[]>)
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (!items) return <p className="label-pequena p-8">Carregando…</p>;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="titulo text-3xl">Entrevistas</h1>
      {items.length === 0 ? (
        <p className="label-pequena">Nenhuma entrevista desde que o servidor subiu.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.sessionId}>
              <Link
                href={`/report?sessionId=${s.sessionId}`}
                className="flex items-center justify-between rounded-padrao bg-superficie p-4 shadow-cartao"
              >
                <span>
                  <span className="block font-medium">{s.roleTitle}</span>
                  <span className="label-pequena numero">
                    {new Date(s.startedAt).toLocaleString("pt-BR")} · {s.sessionId.slice(0, 8)}
                  </span>
                </span>
                <span className="label-pequena numero">
                  {!s.ended
                    ? "Em andamento"
                    : s.overallScore !== undefined
                      ? `${s.overallScore.toFixed(1)}/4`
                      : s.state === "error"
                        ? "Falhou"
                        : "Gerando…"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportView />
    </Suspense>
  );
}
