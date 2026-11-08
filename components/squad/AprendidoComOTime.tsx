// Selo do relatório: as regras da squad que pesaram neste critério ("critério aprendido com o time").
// Fica junto da nota para o Tech Lead ver de onde veio o peso, sem precisar abrir a memória.
import Link from "next/link";
import { ArrowDown, ArrowUp, Brain } from "lucide-react";

export type RegraNoCriterio = { texto: string; efeito: "valoriza" | "penaliza" };

export default function AprendidoComOTime({ regras }: { regras?: RegraNoCriterio[] }) {
  if (!regras?.length) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] bg-superficie-2/70 px-3.5 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-texto">
        <Brain size={14} strokeWidth={1.75} aria-hidden />
        Critério aprendido com o time
      </span>
      <ul className="flex flex-col gap-1">
        {regras.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-texto-suave">
            {r.efeito === "valoriza" ? (
              <ArrowUp size={13} className="mt-[3px] shrink-0" aria-label="Valoriza" />
            ) : (
              <ArrowDown size={13} className="mt-[3px] shrink-0" aria-label="Penaliza" />
            )}
            <span>{r.texto}</span>
          </li>
        ))}
      </ul>
      <Link href="/vagas/aprendizado" className="self-start text-xs text-texto-suave underline-offset-4 hover:text-texto hover:underline">
        Ver o que o Totti aprendeu
      </Link>
    </div>
  );
}
