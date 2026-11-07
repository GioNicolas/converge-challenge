"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Report } from "@/lib/contracts";
import { formatMs } from "@/lib/format";

const REC = { avancar: "Avançar", talvez: "Talvez", nao_avancar: "Não avançar" } as const;

function ReportView() {
  const id = useSearchParams().get("sessionId") ?? "";
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/report?sessionId=${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Relatório indisponível (${r.status})`);
        setReport(Report.parse(await r.json()));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) return <p className="p-8 text-perigo">{error}</p>;
  if (!report) return <p className="label-pequena p-8">Gerando relatório…</p>;

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
              <span className="numero">{c.score}/4</span>
            </p>
            {c.evidence.map((e, i) => (
              <p key={i} className="text-corpo text-texto-suave">
                <span className="numero">{formatMs(e.t)}</span> — {e.text}
              </p>
            ))}
          </div>
        ))}
      </section>

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
