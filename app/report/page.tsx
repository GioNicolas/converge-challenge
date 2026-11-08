"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
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
      {report.learning && <Aprendizado l={report.learning} />}

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
function Aprendizado({ l }: { l: NonNullable<Report["learning"]> }) {
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
            {l.evidence.map((e, i) => (
              <p key={i} className="text-corpo text-texto-suave">
                <span className="numero">{formatMs(e.t)}</span> — {e.text}
              </p>
            ))}
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
