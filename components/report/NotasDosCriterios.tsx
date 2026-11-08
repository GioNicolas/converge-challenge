"use client";

// As notas dos critérios em barras de 4 partes: dá para comparar de relance. Clicar abre as provas daquele critério.
import { ChevronRight } from "lucide-react";

export interface NotaCriterio {
  id: string;
  nome: string;
  /** 1 a 4; null = não explorado. */
  nota: number | null;
  /** Índices das provas no painel de momentos, em ordem de tempo. */
  provas: number[];
}

type Props = {
  titulo: string;
  subtitulo?: string;
  notas: NotaCriterio[];
  onAbrir?: (momento: number) => void;
};

export default function NotasDosCriterios({ titulo, subtitulo, notas, onAbrir }: Props) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="font-medium">{titulo}</h2>
        {subtitulo && <p className="text-sm text-texto-suave">{subtitulo}</p>}
      </div>
      <ul className="divide-y divide-borda">
        {notas.map((n) => {
          const abre = !!onAbrir && n.provas.length > 0;
          const conteudo = (
            <>
              <span className={`min-w-0 truncate ${n.nota === null ? "text-texto-suave" : ""}`} title={n.nome}>
                {n.nome}
              </span>
              <Barra nota={n.nota} />
              <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                {n.nota === null ? (
                  <span className="text-texto-suave">não explorado</span>
                ) : (
                  <>
                    {n.nota <= 2 && <span className="mr-2 text-xs font-medium text-perigo">atenção</span>}
                    <span className="font-medium">{n.nota}</span>
                    <span className="text-texto-suave">/4</span>
                  </>
                )}
              </span>
              <span className="hidden w-20 shrink-0 items-center justify-end gap-0.5 text-xs text-texto-suave sm:flex">
                {abre && (
                  <>
                    {n.provas.length === 1 ? "1 prova" : `${n.provas.length} provas`}
                    <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
                  </>
                )}
              </span>
            </>
          );
          const grade =
            "grid w-full grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-3 py-2.5 sm:grid-cols-[15rem_minmax(0,1fr)_auto_auto] sm:gap-5";
          return (
            <li key={n.id}>
              {abre ? (
                <button
                  type="button"
                  onClick={() => onAbrir!(n.provas[0])}
                  aria-label={`${n.nome}: ${n.nota ?? "não explorado"} de 4. Ver as provas.`}
                  className={`${grade} -mx-2 w-[calc(100%+1rem)] rounded-controle px-2 text-left outline-none transition-colors duration-150 hover:bg-superficie-2 focus-visible:ring-2 focus-visible:ring-marca`}
                >
                  {conteudo}
                </button>
              ) : (
                <div className={grade}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Barra({ nota }: { nota: number | null }) {
  return (
    <span className="flex h-2 gap-0.5" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`flex-1 first:rounded-l-full last:rounded-r-full ${
            nota !== null && i <= nota ? (nota <= 2 ? "bg-perigo" : "bg-texto") : "bg-texto/10"
          }`}
        />
      ))}
    </span>
  );
}
