"use client";

// A entrevista contada em duas partes: em cima, um gráfico simples de quanto dos testes passava a cada execução,
// com um ícone no minuto de cada acontecimento; embaixo, os mesmos acontecimentos escritos, em ordem de tempo.
// Passar o mouse num deles acende o outro; clicar abre o código e a conversa daquele minuto.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, ClipboardPaste, Lightbulb, Shuffle, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Gravacao } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import { execucaoAte } from "@/lib/gravacao";

export type TipoAcontecimento = "travou" | "dica" | "mudanca" | "adaptou" | "colagem";

export interface Acontecimento {
  t: number;
  /** Trechos (travou, mudança) vão até aqui; null = até o fim da entrevista. */
  fim?: number | null;
  tipo: TipoAcontecimento;
  /** O que fica escrito: curto e com o número que importa ("Travou por 2 min"). */
  titulo: string;
  /** Explicação de uma linha, embaixo do título na lista. */
  detalhe?: string;
  /** Índice no painel de momentos; sem ele, não abre. */
  momento?: number;
}

const ICONE: Record<TipoAcontecimento, LucideIcon> = {
  travou: TriangleAlert,
  dica: Lightbulb,
  mudanca: Shuffle,
  adaptou: Check,
  colagem: ClipboardPaste,
};

/** O que pesa contra fica em tinta cheia com borda; o resto, em areia. Sem cor: o tema do papel é só tinta. */
const TOM: Record<TipoAcontecimento, string> = {
  travou: "bg-texto text-texto-claro",
  dica: "bg-superficie-2 text-texto",
  mudanca: "bg-superficie-2 text-texto",
  adaptou: "bg-texto text-texto-claro",
  colagem: "bg-texto text-texto-claro",
};

const ALTURA_PLOT = 150;
const FOLGA_Y = 10;
const TAMANHO_ICONE = 22;
/** Altura de cada fileira de ícones acima do gráfico. */
const ALTURA_FILEIRA = TAMANHO_ICONE + 4;

/** "50 s", "2 min", "1 min 50 s": mais fácil de ler que 01:50 quando é uma duração. */
export function duracaoCurta(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const resto = s % 60;
  return resto === 0 ? `${m} min` : `${m} min ${resto} s`;
}

function marcasDoEixo(duracao: number): number[] {
  const passos = [30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000);
  const passo = passos.find((p) => duracao / p <= 6) ?? passos.at(-1)!;
  const marcas: number[] = [];
  for (let t = 0; t <= duracao; t += passo) marcas.push(t);
  return marcas;
}

/** Largura do componente na tela. */
function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

type Props = {
  duracao: number;
  gravacao: Gravacao | null;
  acontecimentos: Acontecimento[];
  onAbrir?: (momento: number) => void;
};

export default function HistoriaDaEntrevista({ duracao: duracaoBruta, gravacao, acontecimentos, onAbrir }: Props) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [cursor, setCursor] = useState<{ t: number; y: number } | null>(null);
  const [destaque, setDestaque] = useState<number | null>(null);

  const execucoes = gravacao?.execucoes ?? [];
  const duracao = Math.max(duracaoBruta, ...execucoes.map((e) => e.t), ...acontecimentos.map((a) => a.fim ?? a.t), 1);
  const x = (t: number) => (Math.min(Math.max(t, 0), duracao) / duracao) * largura;
  const yFrac = (f: number) => FOLGA_Y + (1 - f) * (ALTURA_PLOT - 2 * FOLGA_Y);
  const marcas = useMemo(() => marcasDoEixo(duracao), [duracao]);

  // Em ordem de tempo: a lista lê de cima para baixo como a entrevista aconteceu.
  const ordem = useMemo(
    () => acontecimentos.map((a, i) => ({ a, i })).sort((p, q) => p.a.t - q.a.t),
    [acontecimentos],
  );

  // Ícones acima do gráfico, cada um no seu minuto: se encostar no de antes, sobe para a fileira de cima.
  const icones = useMemo(() => {
    if (!largura) return [];
    const fimDasFileiras: number[] = [];
    return ordem.map(({ a, i }) => {
      const cx = (Math.min(a.t, duracao) / duracao) * largura;
      let fileira = fimDasFileiras.findIndex((fim) => fim + 3 <= cx - TAMANHO_ICONE / 2);
      if (fileira < 0) fileira = fimDasFileiras.length;
      fimDasFileiras[fileira] = cx + TAMANHO_ICONE / 2;
      return { a, i, cx, fileira };
    });
  }, [ordem, largura, duracao]);
  const fileiras = Math.max(1, ...icones.map((c) => c.fileira + 1));
  const alturaTrilha = fileiras * ALTURA_FILEIRA + 4;

  // Degraus da curva: de uma execução até a próxima, e a última vai até o fim. A área embaixo dá corpo à linha.
  const curva = useMemo(() => {
    if (!largura || execucoes.length === 0) return null;
    const fr = (e: { passed: number; total: number }) => (e.total ? e.passed / e.total : 0);
    let d = `M ${x(execucoes[0].t)} ${yFrac(fr(execucoes[0]))}`;
    for (const e of execucoes.slice(1)) d += ` H ${x(e.t)} V ${yFrac(fr(e))}`;
    d += ` H ${largura}`;
    const area = `${d} V ${ALTURA_PLOT - FOLGA_Y} H ${x(execucoes[0].t)} Z`;
    return { linha: d, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execucoes, largura, duracao]);

  const abre = (a: Acontecimento) => a.momento !== undefined && !!onAbrir && !!gravacao;
  const acender = (i: number) => ({
    onPointerEnter: () => setDestaque(i),
    onPointerLeave: () => setDestaque(null),
    onFocus: () => setDestaque(i),
    onBlur: () => setDestaque(null),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[17px] font-medium">Como foi a entrevista</h2>
        <p className="text-sm text-texto-suave">
          {execucoes.length > 0
            ? "A linha mostra quanto dos testes passava cada vez que ele rodou o código."
            : "O que aconteceu durante a entrevista, em ordem."}
        </p>
      </div>

      <div className="rounded-padrao bg-superficie p-4 sm:p-6">
        <div className="flex gap-2">
          {/* Eixo y: só 0, metade e todos */}
          <div aria-hidden className="relative w-9 shrink-0 text-right text-[11px] text-texto-suave tabular-nums">
            {execucoes.length > 0 &&
              [1, 0.5, 0].map((f) => (
                <span key={f} className="absolute right-0 -translate-y-1/2" style={{ top: alturaTrilha + yFrac(f) }}>
                  {f * 100}%
                </span>
              ))}
          </div>

          <div ref={ref} className="relative min-w-0 flex-1">
            {/* Trilha: um ícone por acontecimento, no minuto em que aconteceu */}
            <div className="relative" style={{ height: alturaTrilha }}>
              {icones.map(({ a, i, cx, fileira }) => {
                const Icone = ICONE[a.tipo];
                return (
                  <span
                    key={i}
                    aria-hidden
                    {...acender(i)}
                    className={`absolute flex -translate-x-1/2 items-center justify-center rounded-full ring-2 ring-superficie transition-transform duration-150 ${TOM[a.tipo]} ${
                      destaque === i ? "scale-125" : ""
                    }`}
                    style={{ left: cx, top: (fileiras - 1 - fileira) * ALTURA_FILEIRA, width: TAMANHO_ICONE, height: TAMANHO_ICONE }}
                  >
                    <Icone size={12} strokeWidth={2.25} />
                  </span>
                );
              })}
            </div>

            {/* O gráfico */}
            <div
              className="relative"
              style={{ height: ALTURA_PLOT }}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const t = ((e.clientX - r.left) / r.width) * duracao;
                setCursor({ t: Math.min(duracao, Math.max(0, t)), y: e.clientY - r.top });
              }}
              onPointerLeave={() => setCursor(null)}
            >
              {execucoes.length > 0 &&
                [1, 0.5, 0].map((f) => (
                  <span key={f} aria-hidden className="absolute inset-x-0 h-px bg-texto/[0.07]" style={{ top: yFrac(f) }} />
                ))}

              {/* Trechos (travou, mudança) em faixa clara; os pontuais, só a linha fina do ícone até embaixo */}
              {acontecimentos.map((a, i) =>
                a.fim === undefined ? (
                  <span
                    key={`linha-${i}`}
                    aria-hidden
                    className={`absolute inset-y-0 w-px transition-colors duration-150 ${destaque === i ? "bg-texto/50" : "bg-texto/15"}`}
                    style={{ left: x(a.t) }}
                  />
                ) : (
                  <span
                    key={`trecho-${i}`}
                    aria-hidden
                    className={`absolute inset-y-0 border-l transition-colors duration-150 ${
                      destaque === i ? "border-texto/50 bg-texto/[0.08]" : "border-texto/20 bg-texto/[0.04]"
                    }`}
                    style={{ left: x(a.t), width: Math.max(2, x(a.fim ?? duracao) - x(a.t)) }}
                  />
                ),
              )}

              {curva && (
                <svg width={largura} height={ALTURA_PLOT} className="absolute inset-0 overflow-visible" aria-hidden>
                  <path d={curva.area} fill="var(--texto)" fillOpacity={0.06} />
                  <path d={curva.linha} fill="none" stroke="var(--texto)" strokeWidth={2} strokeLinejoin="round" />
                  {execucoes.map((e, i) => (
                    <circle
                      key={i}
                      cx={x(e.t)}
                      cy={yFrac(e.total ? e.passed / e.total : 0)}
                      r={3}
                      fill="var(--texto)"
                      stroke="var(--superficie)"
                      strokeWidth={1.5}
                    />
                  ))}
                </svg>
              )}

              {cursor && gravacao && <Cursor cursor={cursor} gravacao={gravacao} x={x(cursor.t)} largura={largura} />}
            </div>

            {/* Eixo do tempo */}
            <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-texto-suave tabular-nums">
              {marcas.map((t, i) => (
                <span
                  key={t}
                  className={`absolute ${i === 0 ? "" : "-translate-x-1/2"} ${i % 2 === 1 ? "hidden sm:block" : ""}`}
                  style={{ left: x(t) }}
                >
                  {formatMs(t)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Os acontecimentos escritos, na ordem em que aconteceram */}
        {ordem.length > 0 && (
          <ol className="mt-5 flex flex-col border-t border-borda pt-3">
            {ordem.map(({ a, i }) => {
              const Icone = ICONE[a.tipo];
              const conteudo = (
                <>
                  <span
                    className={`mt-px flex shrink-0 items-center justify-center rounded-full ${TOM[a.tipo]}`}
                    style={{ width: TAMANHO_ICONE, height: TAMANHO_ICONE }}
                  >
                    <Icone size={12} strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="numero w-11 shrink-0 pt-0.5 text-[13px] text-texto-suave tabular-nums">{formatMs(a.t)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14px] font-medium">{a.titulo}</span>
                    {a.detalhe && <span className="text-[13px] leading-snug text-pretty text-texto-suave">{a.detalhe}</span>}
                  </span>
                  {abre(a) && (
                    <span className="hidden shrink-0 items-center gap-0.5 pt-0.5 text-[13px] text-texto-suave group-hover:text-texto sm:flex">
                      Ver o momento
                      <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
                    </span>
                  )}
                </>
              );
              const classe = `group -mx-2 flex items-start gap-3 rounded-controle px-2 py-2.5 text-left transition-colors duration-150 ${
                destaque === i ? "bg-superficie-2/70" : ""
              }`;
              return (
                <li key={i}>
                  {abre(a) ? (
                    <button
                      type="button"
                      onClick={() => onAbrir!(a.momento!)}
                      aria-label={`${formatMs(a.t)}: ${a.titulo}. Abrir o código e a conversa.`}
                      className={`${classe} w-[calc(100%+1rem)] outline-none hover:bg-superficie-2/70 focus-visible:ring-2 focus-visible:ring-marca`}
                      {...acender(i)}
                    >
                      {conteudo}
                    </button>
                  ) : (
                    <div className={classe} {...acender(i)}>
                      {conteudo}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

/** Linha vertical que acompanha o mouse, com quantos testes passavam e o que estava sendo dito. */
function Cursor({ cursor, gravacao, x, largura }: {
  cursor: { t: number; y: number };
  gravacao: Gravacao;
  x: number;
  largura: number;
}) {
  const e = execucaoAte(gravacao, cursor.t);
  const fala = gravacao.falas.filter((f) => f.t <= cursor.t && f.t >= cursor.t - 30_000).at(-1);
  const w = Math.min(260, largura);
  const esquerda = x + 12 + w <= largura ? x + 12 : Math.max(0, x - 12 - w);
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-texto/40" style={{ left: x }} />
      <div
        className="pointer-events-none absolute z-10 rounded-pequeno bg-superficie p-2.5 text-[13px] shadow-flutuante ring-1 ring-borda"
        style={{ left: esquerda, top: Math.min(cursor.y + 12, ALTURA_PLOT - 40), width: w }}
      >
        <p className="text-xs text-texto-suave tabular-nums">{formatMs(cursor.t)}</p>
        <p className="font-medium tabular-nums">
          {e ? `${e.passed} de ${e.total} testes passando` : "Ainda não tinha rodado o código"}
        </p>
        {fala && (
          <p className="mt-1 line-clamp-2 leading-snug text-texto-suave">
            {fala.role === "candidate" ? "Candidato" : "Totti"}: “{fala.text}”
          </p>
        )}
      </div>
    </>
  );
}
