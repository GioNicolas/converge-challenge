import { useEffect, useRef } from "react";
import type { LogEntry } from "../_lib/useSession";
import { formatMs } from "../_lib/format";

/** Lista de eventos enviados (tipo + t em mm:ss), com rolagem automática pro fim. */
export function EventLog({ entries }: { entries: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <section className="border border-neutral-800">
      <div className="border-b border-neutral-800 px-2 py-1 text-neutral-500">Eventos enviados</div>
      <div ref={ref} className="h-36 overflow-y-auto px-2 py-1">
        {entries.map((e) => (
          <div key={e.id} className={e.failed ? "text-red-400" : ""}>
            {e.label} @ {formatMs(e.t)}
          </div>
        ))}
      </div>
    </section>
  );
}
