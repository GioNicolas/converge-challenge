"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CONCEITOS_EMPECILHO, Report } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import type { ReportListItem } from "@/app/api/report/route";

const REC = { avancar: "Avançar", talvez: "Talvez", nao_avancar: "Não avançar" } as const;
/** A avaliação leva de 15 s a 1 min: enquanto o servidor responde 202, consulta de novo. */
const POLL_MS = 2500;

function ReportView() {
  const id = useSearchParams().get("sessionId");
  return id ? <SessionReport id={id} /> : <SessionList />;
}

function SessionReport({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
        <h2 className="titulo">Critérios</h2>
        {report.criteria.map((c) => (
          <div key={c.id} className="rounded-padrao bg-superficie p-4 shadow-cartao">
            <p className="flex justify-between font-medium">
              {c.name}
              <span className="numero">{c.score === null ? "Não explorado" : `${c.score}/4`}</span>
            </p>
            {c.evidence.map((e, i) => (
              <p key={i} className="text-corpo text-texto-suave">
                <span className="numero">{formatMs(e.t)}</span> — {e.text}
              </p>
            ))}
          </div>
        ))}
      </section>

      {report.adaptation && <Adaptacao a={report.adaptation} />}

      <section className="grid gap-4 sm:grid-cols-3">
        <List title="Pontos fortes" items={report.strengths} />
        <List title="Atenção" items={report.concerns} />
        <List title="Próximos passos" items={report.nextSteps} />
      </section>

      <p className="label-pequena numero">
        {report.signals.testsPassed}/{report.signals.testsTotal} testes · {report.signals.hintsUsed} dicas ·{" "}
        {report.signals.pastes} colagens · {formatMs(report.signals.durationMs)}
      </p>
    </main>
  );
}

const TIPO_MUDANCA = { requisito: "O requisito mudou", caso_novo: "Entrou um caso novo" } as const;

/** Empecilho: a mudança que o Totti trouxe no meio e como ele se adaptou. Nota à parte, fora da geral. */
function Adaptacao({ a }: { a: NonNullable<Report["adaptation"]> }) {
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
        {a.evidence.map((e, i) => (
          <p key={i} className="text-corpo text-texto-suave">
            <span className="numero">{formatMs(e.t)}</span> — {e.text}
          </p>
        ))}
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
