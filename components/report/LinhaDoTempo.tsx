"use client";

// Linha do tempo da entrevista no topo do relatório. Bate o olho e entende como foi: quando os testes passaram,
// quando conversaram, quando veio a mudança no problema e em que minuto está cada prova de cada critério.
// Passar o mouse mostra o que acontecia ali; clicar numa prova abre o código e a conversa daquele momento.
import { useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, Clock, Languages, Lightbulb, Shuffle, type LucideIcon } from "lucide-react";
import type { Gravacao } from "@/lib/contracts";
import { formatMs } from "@/lib/format";
import { execucaoAte } from "@/lib/gravacao";
import type { MomentoProva } from "@/components/report/MomentoDaSessao";

/** Uma faixa de provas: um critério, ou a adaptação à mudança. */
export interface Faixa {
  id: string;
  nome: string;
  /** Nota de 0 a 4; null = não explorado. */
  nota: number | null;
  /** Observação curta embaixo do nome ("fora da nota geral"). */
  detalhe?: string;
  /** Índices em `momentos`. */
  provas: number[];
}

/** A mudança no problema: vira uma faixa clara de fundo entre o anúncio e a adaptação. */
export interface FaixaMudanca {
  inicio: number;
  /** Quando os testes da mudança passaram pela primeira vez; null se não passaram. */
  fim: number | null;
  titulo: string;
}

/** Um trecho em que ele travou: do começo até destravar (null = não destravou até o fim). */
export interface Travamento {
  inicio: number;
  fim: number | null;
}

/** Fato medido que aparece no balão quando o cursor passa perto (ex.: o que aconteceu depois de uma dica). */
export interface Fato {
  t: number;
  texto: string;
}

type TipoMarco = NonNullable<Gravacao["marcos"][number]["tipo"]> | "adaptou";
type Marco = { t: number; text: string; tipo: TipoMarco };

const ICONE: Record<TipoMarco, LucideIcon> = {
  mudanca: Shuffle,
  adaptou: Check,
  dica: Lightbulb,
  colagem: ClipboardPaste,
  linguagem: Languages,
  adiou: Clock,
};
const NOME_MARCO: Record<TipoMarco, string> = {
  mudanca: "Mudança no problema",
  adaptou: "Passou nos testes da mudança",
  dica: "Dica",
  colagem: "Colagem",
  linguagem: "Troca de linguagem",
  adiou: "Adiou uma pergunta",
};

/** Relatórios salvos antes do campo `tipo`: deduz pelo texto. */
function tipoDoMarco(m: Gravacao["marcos"][number]): TipoMarco {
  if (m.tipo) return m.tipo;
  if (m.text.startsWith("Recebeu uma dica")) return "dica";
  if (m.text.startsWith("Colou")) return "colagem";
  if (m.text.startsWith("O Totti trouxe")) return "mudanca";
  if (m.text.startsWith("Trocou a linguagem")) return "linguagem";
  return "adiou";
}

/** Distância (px) em que o cursor gruda numa prova ou num marco. */
const IMA_PX = 10;
const ALTURA_TESTES = 52;

/** Marcas do eixo: um passo redondo que dê no máximo umas 6 marcas. */
function marcasDoEixo(duracao: number): number[] {
  const passos = [30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000);
  const passo = passos.find((p) => duracao / p <= 6) ?? passos.at(-1)!;
  const marcas: number[] = [];
  for (let t = 0; t <= duracao; t += passo) marcas.push(t);
  return marcas;
}

type Foco = {
  t: number;
  /** Altura do ponteiro dentro do gráfico, para o balão acompanhar. */
  y: number;
  /** Provas grudadas nesse minuto (índices em `momentos`). */
  provas: number[];
  /** A prova da faixa em que o ponteiro está, quando há: é a que o clique abre. */
  preferida?: number;
  /** Medidas da área do gráfico na tela, para o balão não sair dela. */
  area: { left: number; width: number; height: number };
};

type Props = {
  duracao: number;
  momentos: MomentoProva[];
  faixas: Faixa[];
  gravacao: Gravacao | null;
  mudanca?: FaixaMudanca;
  travamentos?: Travamento[];
  fatos?: Fato[];
  /** Abre a prova; sem gravação, as provas não abrem. */
  onAbrir?: (indice: number) => void;
};

export default function LinhaDoTempo({
  duracao: duracaoBruta,
  momentos,
  faixas,
  gravacao,
  mudanca,
  travamentos = [],
  fatos = [],
  onAbrir,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState<Foco | null>(null);

  const duracao = Math.max(
    duracaoBruta,
    ...momentos.map((m) => m.t),
    ...(gravacao ? [...gravacao.execucoes, ...gravacao.falas].map((x) => x.t) : []),
    1,
  );
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duracao) * 100))}%`;
  const marcas = useMemo(() => marcasDoEixo(duracao), [duracao]);

  const marcos = useMemo<Marco[]>(() => {
    const lista: Marco[] = (gravacao?.marcos ?? []).map((m) => ({ ...m, tipo: tipoDoMarco(m) }));
    if (mudanca && !lista.some((m) => m.tipo === "mudanca")) {
      lista.push({ t: mudanca.inicio, tipo: "mudanca", text: `O Totti trouxe uma mudança no problema: ${mudanca.titulo}` });
    }
    if (mudanca?.fim != null) {
      lista.push({
        t: mudanca.fim,
        tipo: "adaptou",
        text: `Passou nos testes da mudança ${formatMs(mudanca.fim - mudanca.inicio)} depois do anúncio`,
      });
    }
    return lista.sort((a, b) => a.t - b.t);
  }, [gravacao, mudanca]);

  const execucoes = gravacao?.execucoes ?? [];
  const falas = gravacao?.falas ?? [];
  const temConversa = falas.length > 0;
  const temMarcos = marcos.length > 0 || travamentos.length > 0;
  const abre = !!onAbrir && !!gravacao;

  /** Converte a posição do ponteiro em tempo e gruda na prova mais perto. */
  function focar(clientX: number, clientY: number, faixaId: string | undefined) {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    const area = { left: r.left, width: r.width, height: r.height };
    const x = clientX - area.left;
    if (x < -IMA_PX || x > area.width + IMA_PX) return setFoco(null);
    const y = clientY - r.top;
    const t = Math.min(duracao, Math.max(0, (x / area.width) * duracao));
    const px = (tt: number) => (tt / duracao) * area.width;

    let perto: number | undefined;
    for (const m of momentos) {
      const d = Math.abs(px(m.t) - x);
      if (d <= IMA_PX && (perto === undefined || d < Math.abs(px(perto) - x))) perto = m.t;
    }
    if (perto === undefined) {
      // Sem prova perto: gruda num marco ou numa execução, se houver.
      const outros = [...marcos.map((m) => m.t), ...fatos.map((f) => f.t), ...execucoes.map((e) => e.t)];
      const alvo = outros.find((tt) => Math.abs(px(tt) - x) <= IMA_PX);
      return setFoco({ t: alvo ?? t, y, provas: [], area });
    }
    const provas = momentos.flatMap((m, i) => (m.t === perto ? [i] : []));
    const daFaixa = faixas.find((f) => f.id === faixaId)?.provas.find((i) => provas.includes(i));
    setFoco({ t: perto, y, provas, preferida: daFaixa, area });
  }

  function aoClicar() {
    if (!abre || !foco || foco.provas.length === 0) return;
    onAbrir!(foco.preferida ?? foco.provas[0]);
  }

  const larguraLabel = "grid-cols-[6.75rem_minmax(0,1fr)] sm:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]";
  // Cada célula com a linha explícita: o fundo e o cursor ocupam a coluna 2 inteira por cima.
  const linhaTestes = 1;
  const linhaConversa = linhaTestes + (execucoes.length > 0 ? 1 : 0);
  const linhaMarcos = linhaConversa + (temConversa ? 1 : 0);
  const linhaFaixas = linhaMarcos + (temMarcos ? 1 : 0);
  const linhaEixo = linhaFaixas + faixas.length;
  const todas = `1 / ${linhaEixo}`;

  return (
    <figure className="rounded-padrao bg-superficie p-4 sm:p-5">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span className="font-medium">Linha do tempo da entrevista</span>
        <Legenda
          execucoes={execucoes.length > 0}
          conversa={temConversa}
          tipos={[...new Set(marcos.map((m) => m.tipo))]}
          travou={travamentos.length > 0}
          abre={abre}
        />
      </figcaption>

      <div
        className={`relative grid ${larguraLabel} ${foco?.provas.length && abre ? "cursor-pointer" : ""}`}
        onPointerMove={(e) => {
          const faixa = (e.target as HTMLElement).closest<HTMLElement>("[data-faixa]")?.dataset.faixa;
          focar(e.clientX, e.clientY, faixa);
        }}
        onPointerLeave={() => setFoco(null)}
        onClick={aoClicar}
      >
        {/* Fundo: marcas do eixo e a faixa da mudança, atrás de tudo */}
        <div aria-hidden className="pointer-events-none relative" style={{ gridColumn: 2, gridRow: todas }}>
          <div className="absolute inset-y-0 inset-x-3">
            {marcas.map((t) => (
              <span key={t} className="absolute inset-y-0 w-px bg-texto/[0.06]" style={{ left: pct(t) }} />
            ))}
            {mudanca && (
              <span
                className="absolute inset-y-0 border-l border-texto/40 bg-texto/[0.05]"
                style={{ left: pct(mudanca.inicio), width: `calc(${pct(mudanca.fim ?? duracao)} - ${pct(mudanca.inicio)})` }}
              />
            )}
          </div>
        </div>

        {execucoes.length > 0 && (
          <>
            <Rotulo linha={linhaTestes} nome="Testes" valor={`${execucoes.at(-1)!.passed}/${execucoes.at(-1)!.total}`} altura={ALTURA_TESTES} />
            <Pista linha={linhaTestes} altura={ALTURA_TESTES}>
              <CurvaTestes execucoes={execucoes} duracao={duracao} pct={pct} />
            </Pista>
          </>
        )}

        {temConversa && (
          <>
            <Rotulo linha={linhaConversa} nome="Conversa" altura={32} />
            <Pista linha={linhaConversa} altura={32}>
              {falas.map((f, i) => (
                <span
                  key={i}
                  className={`absolute w-0.5 -translate-x-1/2 rounded-full ${
                    f.role === "candidate" ? "top-1.5 h-2.5 bg-texto" : "bottom-1.5 h-2.5 bg-texto-suave/70"
                  }`}
                  style={{ left: pct(f.t) }}
                />
              ))}
            </Pista>
          </>
        )}

        {temMarcos && (
          <>
            <Rotulo linha={linhaMarcos} nome="Acontecimentos" altura={36} />
            <Pista linha={linhaMarcos} altura={36}>
              {mudanca && (
                <span
                  className="absolute top-1/2 hidden -translate-y-1/2 truncate pr-2 pl-4 text-xs text-texto-suave sm:block"
                  style={{ left: pct(mudanca.inicio), maxWidth: `calc(${pct(mudanca.fim ?? duracao)} - ${pct(mudanca.inicio)} - 0.75rem)` }}
                >
                  Mudança: {mudanca.titulo}
                </span>
              )}
              {travamentos.map((s, i) => (
                <span
                  key={`trav-${i}`}
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-perigo/70"
                  style={{ left: pct(s.inicio), width: `calc(${pct(s.fim ?? duracao)} - ${pct(s.inicio)})` }}
                />
              ))}
              {marcos.map((m, i) => {
                const Icone = ICONE[m.tipo];
                return (
                  <span
                    key={i}
                    className={`absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-superficie ${
                      m.tipo === "adaptou" ? "bg-sucesso text-white" : "bg-texto text-texto-claro"
                    }`}
                    style={{ left: pct(m.t) }}
                  >
                    <Icone size={11} strokeWidth={2.25} aria-hidden />
                  </span>
                );
              })}
            </Pista>
          </>
        )}

        {faixas.map((f, k) => (
          <FaixaDeProvas
            key={f.id}
            faixa={f}
            primeira={k === 0}
            linha={linhaFaixas + k}
            momentos={momentos}
            pct={pct}
            abre={abre}
            focoT={foco?.t}
            onAbrir={onAbrir}
            onFocar={(indice, el) => {
              const a = areaRef.current?.getBoundingClientRect();
              const r = el.getBoundingClientRect();
              if (!a) return;
              setFoco({
                t: momentos[indice].t,
                y: r.top + r.height / 2 - a.top,
                provas: [indice],
                preferida: indice,
                area: { left: a.left, width: a.width, height: a.height },
              });
            }}
            onDesfocar={() => setFoco(null)}
          />
        ))}

        {/* Eixo do tempo */}
        <div aria-hidden className="relative h-6" style={{ gridColumn: 2, gridRow: linhaEixo }}>
          <div className="absolute inset-x-3 top-1.5">
            {marcas.map((t, i) => (
              <span
                key={t}
                className={`absolute text-[11px] text-texto-suave tabular-nums ${i === 0 ? "" : "-translate-x-1/2"} ${
                  i % 2 === 1 ? "hidden sm:block" : ""
                }`}
                style={{ left: pct(t) }}
              >
                {formatMs(t)}
              </span>
            ))}
          </div>
        </div>

        {/* Por cima: cursor e balão. Não pega o ponteiro, só desenha. */}
        <div className="pointer-events-none relative" style={{ gridColumn: 2, gridRow: todas }}>
          <div ref={areaRef} className="absolute inset-y-0 inset-x-3">
            {foco && (
              <>
                <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-texto/45" style={{ left: pct(foco.t) }} />
                <Balao
                  foco={foco}
                  duracao={duracao}
                  momentos={momentos}
                  marcos={marcos}
                  fatos={fatos}
                  travamentos={travamentos}
                  gravacao={gravacao}
                  abre={abre}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </figure>
  );
}

function Rotulo({ linha, nome, valor, detalhe, altura, apagado = false, className = "" }: {
  linha: number;
  className?: string;
  nome: string;
  valor?: string;
  detalhe?: string;
  altura: number;
  apagado?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 pr-2 sm:pr-4 ${className}`}
      style={{ height: altura, gridColumn: 1, gridRow: linha }}
    >
      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs sm:text-sm ${apagado ? "text-texto-suave" : ""}`} title={nome}>
          {nome}
        </p>
        {detalhe && <p className="truncate text-[11px] text-texto-suave">{detalhe}</p>}
      </div>
      {valor && <span className="shrink-0 text-xs font-medium tabular-nums sm:text-sm">{valor}</span>}
    </div>
  );
}

function Pista({ linha, altura, faixa, className = "", children }: {
  linha: number;
  altura: number;
  faixa?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative ${className}`} style={{ height: altura, gridColumn: 2, gridRow: linha }} data-faixa={faixa}>
      <div className="absolute inset-y-0 inset-x-3">{children}</div>
    </div>
  );
}

/** Testes passando a cada execução: degraus de uma execução até a próxima. */
function CurvaTestes({ execucoes, duracao, pct }: {
  execucoes: Gravacao["execucoes"];
  duracao: number;
  pct: (t: number) => string;
}) {
  const H = ALTURA_TESTES;
  const y = (e: { passed: number; total: number }) => 6 + (1 - (e.total ? e.passed / e.total : 0)) * (H - 12);
  const x = (t: number) => (Math.min(t, duracao) / duracao) * 1000;
  let linha = `M ${x(execucoes[0].t)} ${y(execucoes[0])}`;
  for (const e of execucoes.slice(1)) linha += ` H ${x(e.t)} V ${y(e)}`;
  linha += " H 1000";
  const area = `${linha} V ${H} H ${x(execucoes[0].t)} Z`;
  return (
    <>
      {/* Linha de "todos passando" */}
      <span className="absolute inset-x-0 h-px bg-texto/10" style={{ top: 6 }} />
      <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <path d={area} fill="var(--texto)" fillOpacity={0.07} />
        <path d={linha} fill="none" stroke="var(--texto)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {execucoes.map((e, i) => (
        <span
          key={i}
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-texto ring-2 ring-superficie"
          style={{ left: pct(e.t), top: y(e) }}
        />
      ))}
    </>
  );
}

function FaixaDeProvas({ faixa, primeira, linha, momentos, pct, abre, focoT, onAbrir, onFocar, onDesfocar }: {
  faixa: Faixa;
  primeira: boolean;
  linha: number;
  momentos: MomentoProva[];
  pct: (t: number) => string;
  abre: boolean;
  focoT?: number;
  onAbrir?: (indice: number) => void;
  onFocar: (indice: number, el: HTMLElement) => void;
  onDesfocar: () => void;
}) {
  const altura = faixa.detalhe ? 44 : 36;
  const separador = primeira ? "border-t border-borda" : "";
  return (
    <>
        <Rotulo
          linha={linha}
          className={separador}
          nome={faixa.nome}
          valor={faixa.nota === null ? "—" : `${faixa.nota}/4`}
          detalhe={faixa.nota === null ? "não explorado" : faixa.detalhe}
          altura={altura}
          apagado={faixa.nota === null}
        />
        <Pista linha={linha} className={separador} altura={altura} faixa={faixa.id}>
          <span className="absolute inset-x-0 top-1/2 h-px bg-texto/[0.08]" />
          {faixa.provas.map((indice) => {
            const m = momentos[indice];
            const ativa = focoT === m.t;
            return (
              <button
                key={indice}
                type="button"
                tabIndex={abre ? 0 : -1}
                disabled={!abre}
                onClick={(e) => {
                  e.stopPropagation();
                  onAbrir?.(indice);
                }}
                onFocus={(e) => onFocar(indice, e.currentTarget)}
                onBlur={onDesfocar}
                aria-label={`${faixa.nome}, ${formatMs(m.t)}: ${m.text}${abre ? ". Abrir o código e a conversa." : ""}`}
                className="group absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:cursor-default"
                style={{ left: pct(m.t) }}
              >
                <span
                  className={`block rounded-full bg-texto ring-2 ring-superficie transition-[width,height] duration-150 ${
                    ativa ? "size-3.5" : "size-2.5"
                  }`}
                />
              </button>
            );
          })}
        </Pista>
    </>
  );
}

function Balao({ foco, duracao, momentos, marcos, fatos, travamentos, gravacao, abre }: {
  foco: Foco;
  duracao: number;
  momentos: MomentoProva[];
  marcos: Marco[];
  fatos: Fato[];
  travamentos: Travamento[];
  gravacao: Gravacao | null;
  abre: boolean;
}) {
  const { area } = foco;
  const emBaixo = foco.y < area.height * 0.5;
  // Ao lado do cursor, do lado com mais espaço, sem passar das bordas da tela (16 px de folga).
  const largura = Math.min(304, innerWidth - 32);
  const x = (foco.t / duracao) * area.width;
  const preferido = foco.t / duracao < 0.55 ? x + 12 : x - 12 - largura;
  const esquerda = Math.max(16 - area.left, Math.min(preferido, innerWidth - 16 - area.left - largura));
  const janela = Math.max(duracao * 0.012, 4000);
  const fatosAqui = fatos.filter((f) => Math.abs(f.t - foco.t) <= janela);
  // A dica já vem descrita no fato (qual dica e o que aconteceu depois): não repete "Recebeu uma dica".
  const marcosAqui = marcos.filter(
    (m) => Math.abs(m.t - foco.t) <= janela && !(m.tipo === "dica" && fatosAqui.some((f) => f.t === m.t)),
  );
  const travado = travamentos.find((s) => foco.t >= s.inicio && foco.t <= (s.fim ?? duracao));
  const execucao = gravacao ? execucaoAte(gravacao, foco.t) : undefined;
  // A fala mais recente até ali (até 30 s antes): o que estava sendo dito.
  const fala = gravacao?.falas.filter((f) => f.t <= foco.t + janela && f.t >= foco.t - 30_000).at(-1);
  const provas = foco.provas.map((i) => momentos[i]);

  return (
    <div
      role="status"
      className="absolute z-20 rounded-padrao bg-superficie p-3 text-sm shadow-flutuante ring-1 ring-borda"
      style={{
        left: esquerda,
        width: largura,
        top: foco.y,
        transform: `translateY(${emBaixo ? "12px" : "calc(-100% - 12px)"})`,
      }}
    >
      <p className="text-xs font-medium text-texto-suave tabular-nums">{formatMs(foco.t)}</p>
      {provas.length > 0 ? (
        <ul className="mt-1.5 space-y-2">
          {provas.slice(0, 3).map((p, i) => (
            <li key={i}>
              <p className="line-clamp-3 leading-snug font-medium text-pretty">{p.text}</p>
              <p className="mt-0.5 text-xs text-texto-suave">{p.origem}</p>
            </li>
          ))}
          {provas.length > 3 && <li className="text-xs text-texto-suave">e mais {provas.length - 3} neste minuto</li>}
        </ul>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {marcosAqui.map((m, i) => (
            <li key={i} className="leading-snug font-medium text-pretty">{m.text}</li>
          ))}
          {fatosAqui.map((f, i) => (
            <li key={`f${i}`} className="leading-snug text-pretty">{f.texto}</li>
          ))}
          {travado && (
            <li className="flex items-start gap-2 leading-snug text-pretty">
              <span className="mt-1.5 h-1.5 w-3 shrink-0 rounded-full bg-perigo/70" aria-hidden />
              {travado.fim === null
                ? `Travado desde ${formatMs(travado.inicio)}, não destravou até o fim`
                : `Travado de ${formatMs(travado.inicio)} a ${formatMs(travado.fim)}`}
            </li>
          )}
          {fala && (
            <li className="leading-snug text-pretty">
              <span className="text-texto-suave">{fala.role === "candidate" ? "Candidato" : "Totti"}: </span>
              <span className="line-clamp-3">“{fala.text}”</span>
            </li>
          )}
          {execucao ? (
            <li className="text-texto-suave tabular-nums">
              Última execução: {execucao.passed}/{execucao.total} testes
            </li>
          ) : (
            gravacao && <li className="text-texto-suave">Ainda não tinha rodado o código</li>
          )}
        </ul>
      )}
      {provas.length > 0 && abre && (
        <p className="mt-2 border-t border-borda pt-2 text-xs text-texto-suave">Clique para ver o código e a conversa</p>
      )}
    </div>
  );
}

function Legenda({ execucoes, conversa, tipos, travou, abre }: {
  execucoes: boolean;
  conversa: boolean;
  tipos: TipoMarco[];
  travou: boolean;
  abre: boolean;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-texto-suave">
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-texto" aria-hidden />
        Prova{abre ? " (clique para abrir)" : ""}
      </li>
      {execucoes && (
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-texto" aria-hidden />
          Testes passando
        </li>
      )}
      {conversa && (
        <>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-0.5 rounded-full bg-texto" aria-hidden />
            Candidato falou
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-0.5 rounded-full bg-texto-suave/70" aria-hidden />
            Totti falou
          </li>
        </>
      )}
      {travou && (
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-perigo/70" aria-hidden />
          Travou
        </li>
      )}
      {tipos.map((tipo) => {
        const Icone = ICONE[tipo];
        return (
          <li key={tipo} className="flex items-center gap-1.5">
            <span
              className={`flex size-4 items-center justify-center rounded-full ${
                tipo === "adaptou" ? "bg-sucesso text-white" : "bg-texto text-texto-claro"
              }`}
              aria-hidden
            >
              <Icone size={9} strokeWidth={2.5} />
            </span>
            {NOME_MARCO[tipo]}
          </li>
        );
      })}
    </ul>
  );
}
