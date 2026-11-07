import type { RunResult } from "@/lib/contracts";

/** Último resultado de run (falso), mostrado sob o editor. */
export function RunResultView({ result }: { result: RunResult | null }) {
  if (result === null) return <div className="text-neutral-500">Nenhum run ainda.</div>;

  const allPassed = result.passed === result.total;
  return (
    <section className="border border-neutral-800 p-2">
      <div className={allPassed ? "text-green-400" : "text-red-400"}>
        Resultado: {result.passed}/{result.total} ({result.durationMs} ms)
      </div>
      <ul className="mt-1 flex flex-col gap-1">
        {result.cases.map((c) => (
          <li key={c.name} className={c.passed ? "text-neutral-300" : "text-red-300"}>
            [{c.passed ? "ok" : "falhou"}] {c.name}
            {c.input !== undefined ? ` · entrada ${c.input}` : ""}
            {c.expected !== undefined ? ` · esperado ${c.expected}` : ""}
            {c.got !== undefined ? ` · obtido ${c.got}` : ""}
            {c.error !== undefined ? ` · ${c.error}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
