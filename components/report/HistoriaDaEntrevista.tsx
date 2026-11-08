"use client";

// A entrevista contada num gráfico só: quanto dos testes passava a cada execução, com os acontecimentos
// escritos em cima (travou, dica, mudança no problema, adaptou). Dá para entender sem legenda; passar o mouse
// mostra o detalhe e clicar num acontecimento abre o código e a conversa daquele minuto.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Lightbulb, Shuffle, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Gravacao } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import { execucaoAte } from "@/lib/gravacao";

export type TipoAcontecimento = "travou" | "dica" | "mudanca" | "adaptou" | "colagem";

export interface Acontecimento {
  t: number;
  /** Trechos (travou, mudança) vão até aqui; null = até o fim da entrevista. */
  fim?: number | null;
  tipo: TipoAcontecimento;
  /** O que fica escrito no gráfico: curto e com o número que importa ("Travou por 2 min"). */
  titulo: string;
  /** Aparece ao passar o mouse. */
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

/** Cor do ícone: vermelho para o que pesa contra, verde para o que conta a favor, tinta no resto. */
const TOM: Record<TipoAcontecimento, string> = {
  travou: "bg-perigo text-white",
  dica: "bg-texto text-texto-claro",
  mudanca: "bg-texto text-texto-claro",
  adaptou: "bg-sucesso text-white",
  colagem: "bg-texto text-texto-claro",
};

const ALTURA_PLOT = 176;
const FOLGA_Y = 12;
const ALTURA_LINHA_ROTULO = 30;

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

/** Largura do componente na tela (para não encavalar os rótulos). */
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

let contexto: CanvasRenderingContext2D | null = null;
/** Largura do texto do rótulo, medida com a mesma fonte da página. */
function medir(texto: string): number {
  if (typeof document === "undefined") return texto.length * 7;
  contexto ??= document.createElement("canvas").getContext("2d");
  if (!contexto) return texto.length * 7;
  contexto.font = `500 12.5px ${getComputedStyle(document.body).fontFamily}`;
  return contexto.measureText(texto).width;
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
  const fracEm = (t: number) => {
    const e = gravacao ? execucaoAte(gravacao, t) : undefined;
    return e && e.total ? e.passed / e.total : null;
  };
  const marcas = useMemo(() => marcasDoEixo(duracao), [duracao]);

  // Rótulos em fileiras: cada um começa no minuto do acontecimento e desce para a fileira de baixo se encostar.
  const rotulos = useMemo(() => {
    if (!largura) return [];
    const fimDasFileiras: number[] = [];
    return acontecimentos
      .map((a, i) => ({ a, i }))
      .sort((p, q) => p.a.t - q.a.t)
      .map(({ a, i }) => {
        const w = medir(a.titulo) + 34;
        const ancora = (Math.min(a.t, duracao) / duracao) * largura;
        const esquerda = Math.max(0, Math.min(ancora - 10, largura - w));
        let fileira = fimDasFileiras.findIndex((fim) => fim + 8 <= esquerda);
        if (fileira < 0) fileira = fimDasFileiras.length;
        fimDasFileiras[fileira] = esquerda + w;
        return { a, i, esquerda, ancora, fileira };
      });
  }, [acontecimentos, largura, duracao]);
  const fileiras = Math.max(1, ...rotulos.map((r) => r.fileira + 1));
  const alturaRotulos = fileiras * ALTURA_LINHA_ROTULO + 6;

  // Degraus: de uma execução até a próxima, e a última vai até o fim.
  const curva = useMemo(() => {
    if (!largura || execucoes.length === 0) return null;
    const fr = (e: { passed: number; total: number }) => (e.total ? e.passed / e.total : 0);
    let d = `M ${x(execucoes[0].t)} ${yFrac(fr(execucoes[0]))}`;
    for (const e of execucoes.slice(1)) d += ` H ${x(e.t)} V ${yFrac(fr(e))}`;
    d += ` H ${largura}`;
    return { linha: d };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execucoes, largura, duracao]);

  const abre = (a: Acontecimento) => a.momento !== undefined && !!onAbrir && !!gravacao;

  return (
    <figure className="rounded-padrao bg-superficie p-4 sm:p-6">
      <figcaption className="mb-5">
        <p className="font-medium">Como foi a entrevista</p>
        <p className="text-sm text-texto-suave">
          {execucoes.length > 0
            ? "Quanto dos testes passava cada vez que ele rodou o código. Clique num acontecimento para ver o código e a conversa."
            : "Os acontecimentos da entrevista. Clique num deles para ver o código e a conversa."}
        </p>
      </figcaption>

      <div className="flex gap-2">
        {/* Eixo y: só 0, metade e todos */}
        <div aria-hidden className="relative w-9 shrink-0 text-right text-[11px] text-texto-suave tabular-nums">
          {execucoes.length > 0 &&
            [1, 0.5, 0].map((f) => (
              <span key={f} className="absolute right-0 -translate-y-1/2" style={{ top: alturaRotulos + yFrac(f) }}>
                {f * 100}%
              </span>
            ))}
        </div>

        <div ref={ref} className="relative min-w-0 flex-1">
          {/* Rótulos dos acontecimentos, com uma linha fina até o gráfico */}
          <div className="relative" style={{ height: alturaRotulos }}>
            {rotulos.map(({ a, i, esquerda, ancora, fileira }) => {
              const Icone = ICONE[a.tipo];
              const ativo = destaque === i;
              const conteudo = (
                <>
                  <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-full ${TOM[a.tipo]}`}>
                    <Icone size={10} strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className="whitespace-nowrap">{a.titulo}</span>
                </>
              );
              const classe = `absolute flex h-6 items-center gap-1.5 rounded-full pr-2.5 pl-[3px] text-[12.5px] font-medium transition-colors duration-150 ${
                ativo ? "bg-superficie-2" : "bg-superficie"
              }`;
              const estilo = { left: esquerda, top: fileira * ALTURA_LINHA_ROTULO };
              const eventos = {
                onPointerEnter: () => setDestaque(i),
                onPointerLeave: () => setDestaque(null),
                onFocus: () => setDestaque(i),
                onBlur: () => setDestaque(null),
              };
              return (
                <div key={i}>
                  <span
                    aria-hidden
                    className={`absolute w-px ${ativo ? "bg-texto/60" : "bg-texto/15"}`}
                    style={{ left: ancora, top: fileira * ALTURA_LINHA_ROTULO + 24, height: alturaRotulos - fileira * ALTURA_LINHA_ROTULO - 24 + ALTURA_PLOT }}
                  />
                  {abre(a) ? (
                    <button
                      type="button"
                      onClick={() => onAbrir!(a.momento!)}
                      aria-label={`${formatMs(a.t)}: ${a.titulo}${a.detalhe ? `. ${a.detalhe}` : ""}. Abrir o código e a conversa.`}
                      className={`${classe} cursor-pointer outline-none hover:bg-superficie-2 focus-visible:ring-2 focus-visible:ring-marca`}
                      style={estilo}
                      {...eventos}
                    >
                      {conteudo}
                    </button>
                  ) : (
                    <div className={classe} style={estilo} {...eventos}>
                      {conteudo}
                    </div>
                  )}
                  {ativo && (a.detalhe || abre(a)) && (
                    <Detalhe a={a} abre={abre(a)} esquerda={esquerda} topo={(fileira + 1) * ALTURA_LINHA_ROTULO} largura={largura} />
                  )}
                </div>
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
            {/* Grade: só as linhas de 0, metade e todos */}
            {execucoes.length > 0 &&
              [1, 0.5, 0].map((f) => (
                <span key={f} aria-hidden className="absolute inset-x-0 h-px bg-texto/[0.07]" style={{ top: yFrac(f) }} />
              ))}

            {/* Trechos: travou e mudança */}
            {acontecimentos.map((a, i) =>
              a.fim === undefined ? null : (
                <span
                  key={`trecho-${i}`}
                  aria-hidden
                  className={`absolute inset-y-0 border-l transition-opacity duration-150 ${
                    a.tipo === "travou" ? "border-perigo/50 bg-perigo/[0.09]" : "border-texto/30 bg-texto/[0.05]"
                  } ${destaque !== null && destaque !== i ? "opacity-50" : ""}`}
                  style={{ left: x(a.t), width: Math.max(2, x(a.fim ?? duracao) - x(a.t)) }}
                />
              ),
            )}

            {curva && (
              <svg width={largura} height={ALTURA_PLOT} className="absolute inset-0 overflow-visible" aria-hidden>
                <path d={curva.linha} fill="none" stroke="var(--texto)" strokeWidth={2.5} strokeLinejoin="round" />
                {execucoes.map((e, i) => (
                  <circle
                    key={i}
                    cx={x(e.t)}
                    cy={yFrac(e.total ? e.passed / e.total : 0)}
                    r={4}
                    fill="var(--texto)"
                    stroke="var(--superficie)"
                    strokeWidth={2}
                  />
                ))}
              </svg>
            )}

            {/* Acontecimentos pontuais em cima da curva */}
            {acontecimentos.map((a, i) => {
              if (a.fim !== undefined) return null;
              const Icone = ICONE[a.tipo];
              const f = fracEm(a.t);
              return (
                <span
                  key={`ponto-${i}`}
                  aria-hidden
                  className={`absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-superficie transition-transform duration-150 ${TOM[a.tipo]} ${
                    destaque === i ? "scale-125" : ""
                  }`}
                  style={{ left: x(a.t), top: f === null ? ALTURA_PLOT - FOLGA_Y : yFrac(f) }}
                >
                  <Icone size={11} strokeWidth={2.5} />
                </span>
              );
            })}

            {cursor && gravacao && (
              <Cursor cursor={cursor} gravacao={gravacao} x={x(cursor.t)} largura={largura} />
            )}
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
    </figure>
  );
}

/** O detalhe do acontecimento, embaixo do rótulo, ao passar o mouse. */
function Detalhe({ a, abre, esquerda, topo, largura }: {
  a: Acontecimento;
  abre: boolean;
  esquerda: number;
  topo: number;
  largura: number;
}) {
  const w = Math.min(300, largura);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 rounded-padrao bg-superficie p-3 text-sm shadow-flutuante ring-1 ring-borda"
      style={{ left: Math.max(0, Math.min(esquerda, largura - w)), top: topo, width: w }}
    >
      <p className="text-xs text-texto-suave tabular-nums">
        {formatMs(a.t)}
        {a.fim !== undefined && ` até ${a.fim === null ? "o fim" : formatMs(a.fim)}`}
      </p>
      <p className="mt-0.5 font-medium">{a.titulo}</p>
      {a.detalhe && <p className="mt-1 leading-snug text-pretty">{a.detalhe}</p>}
      {abre && <p className="mt-2 text-xs text-texto-suave">Clique para ver o código e a conversa</p>}
    </div>
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
        className="pointer-events-none absolute z-10 rounded-padrao bg-superficie p-2.5 text-[13px] shadow-flutuante ring-1 ring-borda"
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
