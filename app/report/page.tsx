"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CONCEITOS_EMPECILHO, Gravacao, Report } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import type { ReportListItem } from "@/app/api/report/route";
import MomentoDaSessao, { type MomentoProva } from "@/components/report/MomentoDaSessao";

const REC = { avancar: "Avançar", talvez: "Talvez", nao_avancar: "Não avançar" } as const;
/** A avaliação leva de 15 s a 1 min: enquanto o servidor responde 202, consulta de novo. */
const POLL_MS = 2500;
const ORIGEM_ADAPTACAO = "Adaptação à mudança";

type Evidencia = Report["criteria"][number]["evidence"][number];
/** Desenha uma evidência; com a gravação carregada, vira botão que abre o momento. */
type DesenharProva = (e: Evidencia, origem: string, chave: number) => React.ReactNode;

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
    return [...doCriterio, ...daAdaptacao].sort((a, b) => a.t - b.t);
  }, [report]);

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
        <p className="text-perigo">{error}</p>
        <button type="button" onClick={retry} className="vidro rounded-full px-4 py-2 font-medium shadow-cartao">
          Tentar de novo
        </button>
      </main>
    );
  }
  if (!report) return <p className="label-pequena p-8">Gerando relatório… isso leva até um minuto.</p>;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="label-pequena">{report.roleTitle}</p>
        <h1 className="titulo text-3xl">
          {REC[report.recommendation]} · <span className="numero">{report.overallScore.toFixed(1)}</span>/4
        </h1>
        <p className="mt-2">{report.summary}</p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="titulo">Critérios</h2>
          {gravacao && momentos.length > 0 && (
            <p className="label-pequena">Clique no minuto de uma prova para ver o código e a conversa daquele momento.</p>
          )}
        </div>
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
          </div>
        ))}
      </section>

      {report.adaptation && <Adaptacao a={report.adaptation} desenharProva={desenharProva} />}

      <section className="grid gap-4 sm:grid-cols-3">
        <List title="Pontos fortes" items={report.strengths} />
        <List title="Atenção" items={report.concerns} />
        <List title="Próximos passos" items={report.nextSteps} />
      </section>

      <p className="label-pequena numero">
        {report.signals.testsPassed}/{report.signals.testsTotal} testes · {report.signals.hintsUsed} dicas ·{" "}
        {report.signals.pastes} colagens · {formatMs(report.signals.durationMs)}
      </p>

      {gravacao && (
        <MomentoDaSessao gravacao={gravacao} momentos={momentos} aberto={aberto} onFechar={fechar} onAbrir={setAberto} />
      )}
    </main>
  );
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

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h2 className="titulo mb-1">{title}</h2>
      {items.length === 0 ? (
        <p className="label-pequena">—</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-corpo">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportView />
    </Suspense>
  );
}
