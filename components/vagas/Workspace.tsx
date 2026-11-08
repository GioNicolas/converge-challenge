"use client";

// A tela inicial do recrutador. A pergunta que ela responde é "o que eu tenho que fazer agora?":
//   1. As abas de estágio: Definir escopo → Enviar convites → Aguardando entrevistas → Ver resultados.
//      Cada aba mostra só quantas vagas estão nela e, clicada, vira o filtro da lista.
//   2. A lista: sem estágio escolhido, agrupada pelo que pede ação primeiro (resultados, convites,
//      escopos e, por último, o que só está esperando); com estágio, busca ou filtro, uma lista só.
// Cada linha tem o cargo, uma frase curta (com um número, no máximo) e um único próximo passo.
// Os detalhes (funil, barras, responsável) ficam dentro da vaga. Encerradas ficam num atalho à parte.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, SlidersHorizontal, X } from "lucide-react";
import {
  ESTAGIOS,
  NOME_AREA_VAGA,
  NOME_ESTAGIO,
  NOME_SENIORIDADE_VAGA,
  descartarRascunho,
  diasDoRascunho,
  estagioDa,
  numeroCurto,
  quandoFoi,
  situacaoDoRascunho,
  useVagas,
  type Area,
  type Estagio,
  type RascunhoVaga,
  type VagaEmpresa,
} from "@/lib/vagas/workspace";
import { buscaNormalizada, comConvites, useConvitesFeitos } from "@/lib/vagas/candidatos";
import { comReais, useEntrevistasReais } from "@/lib/vagas/entrevistas";
import { curvaSuave } from "@/lib/design/motion";
import Casca from "./Casca";
import { Busca, Paginacao } from "./controles";

type Filtro = Estagio | "encerradas" | null;
type Ordem = "recentes" | "inscritos" | "az";
type Linha = VagaEmpresa & { estagio: ReturnType<typeof estagioDa> };
type Item = { tipo: "vaga"; v: Linha } | { tipo: "escopo"; r: RascunhoVaga };

/** Na lista agrupada, o que pede ação vem antes do que só está esperando. */
const ORDEM_GRUPOS: Estagio[] = ["resultados", "convidar", "escopo", "aguardando"];
const POR_GRUPO = 4;
const POR_PAGINA = 12;

export default function Workspace() {
  const { vagas, rascunhos } = useVagas();
  return <Casca>{vagas && rascunhos && <Conteudo vagas={vagas} rascunhos={rascunhos} />}</Casca>;
}

function Conteudo({ vagas, rascunhos }: { vagas: VagaEmpresa[]; rascunhos: RascunhoVaga[] }) {
  const convites = useConvitesFeitos();
  const reais = useEntrevistasReais();
  // As entrevistas feitas pelo link e os convites feitos aqui entram no funil (e mudam o estágio da vaga).
  const linhas: Linha[] = useMemo(
    () =>
      vagas.map((v) => {
        const funil = comConvites(comReais(v.funil, v.resumo ? reais?.[v.resumo.configId] : undefined), convites[v.id]);
        const comFunil = { ...v, funil };
        return { ...comFunil, estagio: estagioDa(comFunil) };
      }),
    [vagas, convites, reais],
  );

  const params = useSearchParams();
  const daUrl = params.get("estagio") ?? params.get("aba");
  const [filtro, setFiltro] = useState<Filtro>(null);
  const lista = useRef<HTMLElement>(null);
  useEffect(() => {
    // O menu lateral muda a URL: "Escopos em definição" abre o estágio, "Todas as vagas" volta ao quadro.
    setFiltro(daUrl && (ESTAGIOS.includes(daUrl as Estagio) || daUrl === "encerradas") ? (daUrl as Filtro) : null);
    setPagina(0);
  }, [daUrl]);

  const [busca, setBusca] = useState("");
  const termo = useDeferredValue(buscaNormalizada(busca.trim()));
  const [area, setArea] = useState<Area | "">("");
  const [time, setTime] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [pagina, setPagina] = useState(0);

  const filtradas = useMemo(
    () =>
      linhas.filter(
        (v) =>
          (!area || v.area === area) &&
          (!time || v.time === time) &&
          (!responsavel || v.responsavel === responsavel) &&
          (!termo || buscaNormalizada(`${v.cargo} ${v.time} ${v.responsavel} ${NOME_AREA_VAGA[v.area]}`).includes(termo)),
      ),
    [linhas, area, time, responsavel, termo],
  );
  // Escopos não têm área, time nem responsável: com esses filtros ligados, eles saem da lista.
  const escopos = useMemo(
    () => (area || time || responsavel ? [] : rascunhos.filter((r) => !termo || buscaNormalizada(r.cargo).includes(termo))),
    [rascunhos, area, time, responsavel, termo],
  );

  const ordenar = (l: Linha[], estagio?: Filtro) => {
    const cmp: Record<Ordem, (a: Linha, b: Linha) => number> = {
      recentes: (a, b) => a.abertaHaDias - b.abertaHaDias,
      inscritos: (a, b) => b.funil.inscritos - a.funil.inscritos,
      az: (a, b) => a.cargo.localeCompare(b.cargo, "pt-BR"),
    };
    // Sem ordem escolhida, cada estágio põe na frente o que mais pede atenção.
    if (ordem === "recentes" && estagio === "resultados") return [...l].sort((a, b) => b.funil.novos - a.funil.novos);
    if (ordem === "recentes" && estagio === "convidar") return [...l].sort((a, b) => b.funil.inscritos - a.funil.inscritos);
    return [...l].sort(cmp[ordem]);
  };

  const doEstagio = (e: Filtro): Item[] => {
    if (e === "escopo") {
      const r = [...escopos].sort((a, b) =>
        ordem === "az" ? a.cargo.localeCompare(b.cargo, "pt-BR") : diasDoRascunho(a) - diasDoRascunho(b),
      );
      return r.map((r) => ({ tipo: "escopo", r }));
    }
    const l = filtradas.filter((v) => (e === "encerradas" ? v.estagio === "encerrada" : v.estagio === e));
    return ordenar(l, e).map((v) => ({ tipo: "vaga", v }));
  };

  const contagem = (e: Estagio) => (e === "escopo" ? escopos.length : filtradas.filter((v) => v.estagio === e).length);
  const encerradas = filtradas.filter((v) => v.estagio === "encerrada").length;

  const temFiltro = !!(area || time || responsavel);
  // Busca ou filtro ligados sem estágio: uma lista só, com tudo que está aberto.
  const plana = filtro !== null || temFiltro || !!termo;
  const itensPlanos = useMemo(() => {
    if (filtro) return doEstagio(filtro);
    if (!plana) return [];
    return [...doEstagio("resultados"), ...doEstagio("convidar"), ...doEstagio("escopo"), ...doEstagio("aguardando")];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, plana, filtradas, escopos, ordem]);

  const paginaSegura = Math.min(pagina, Math.max(0, Math.ceil(itensPlanos.length / POR_PAGINA) - 1));
  const visiveis = itensPlanos.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);

  const escolher = (e: Filtro) => {
    setFiltro((atual) => (atual === e ? null : e));
    setPagina(0);
  };
  const limpar = () => {
    setArea("");
    setTime("");
    setResponsavel("");
    setBusca("");
    setFiltro(null);
    setPagina(0);
  };
  const unicos = (k: "time" | "responsavel") =>
    [...new Set(linhas.map((v) => v[k]).filter((x) => x && x !== "—"))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const tituloLista =
    filtro === "encerradas" ? "Encerradas" : filtro ? NOME_ESTAGIO[filtro] : termo || temFiltro ? "Resultado da busca" : "O que fazer agora";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: curvaSuave }}
      className="mx-auto flex max-w-[1120px] flex-col gap-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="titulo-display text-[40px] text-texto">Vagas</h1>
        <Busca valor={busca} onMudar={(v) => (setBusca(v), setPagina(0))} placeholder="Buscar vaga, time ou responsável" />
      </header>

      {/* Os estágios viram abas: a vaga anda da esquerda para a direita. Clicada, a aba filtra a lista. */}
      <section ref={lista} className="flex scroll-mt-8 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <nav aria-label="Estágios das vagas" className="flex flex-wrap items-center gap-1">
            <Aba ativa={filtro === null} onClick={() => escolher(null)}>
              Tudo
            </Aba>
            {ESTAGIOS.map((e) => (
              <Aba key={e} ativa={filtro === e} n={contagem(e)} pedeAcao={e !== "aguardando"} onClick={() => escolher(e)}>
                {NOME_ESTAGIO[e]}
              </Aba>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {filtro !== "encerradas" && encerradas > 0 && (
              <button
                onClick={() => escolher("encerradas")}
                className="px-2 text-[13px] text-texto-suave underline-offset-4 hover:text-texto hover:underline"
              >
                Encerradas
              </button>
            )}
            <Filtros
              area={area}
              time={time}
              responsavel={responsavel}
              ordem={ordem}
              times={unicos("time")}
              responsaveis={unicos("responsavel")}
              onArea={(v) => (setArea(v), setPagina(0))}
              onTime={(v) => (setTime(v), setPagina(0))}
              onResponsavel={(v) => (setResponsavel(v), setPagina(0))}
              onOrdem={setOrdem}
            />
          </div>
        </div>

        {(filtro === "encerradas" || temFiltro || busca) && (
          <div className="-mt-1 flex items-center gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-texto">{tituloLista}</h2>
            <button
              onClick={limpar}
              className="flex items-center gap-1 rounded-full bg-superficie-2/70 py-1 pr-2.5 pl-2 text-[12.5px] text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
            >
              <X size={12} /> Limpar
            </button>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${filtro}-${plana}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: curvaSuave }}
            className="flex flex-col gap-6"
          >
            {plana ? (
              <>
                <div className="cartao overflow-hidden">
                  {visiveis.length === 0 ? (
                    <Vazio onLimpar={limpar} />
                  ) : (
                    <ul className="py-1.5">{visiveis.map((it) => <ItemLista key={chave(it)} it={it} mostrarEstagio={!filtro} />)}</ul>
                  )}
                </div>
                <Paginacao pagina={paginaSegura} porPagina={POR_PAGINA} total={itensPlanos.length} onMudar={setPagina} />
              </>
            ) : (
              ORDEM_GRUPOS.map((e) => {
                const itens = doEstagio(e);
                if (itens.length === 0) return null;
                return (
                  <div key={e} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <span className="flex items-center gap-2 text-[14px] font-medium text-texto">
                        <Ponto estagio={e} />
                        {NOME_ESTAGIO[e]}
                      </span>
                      {itens.length > POR_GRUPO && (
                        <button
                          onClick={() => escolher(e)}
                          className="group flex items-center gap-1 text-[13px] text-texto-suave hover:text-texto"
                        >
                          Ver todas <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                        </button>
                      )}
                    </div>
                    <div className="cartao overflow-hidden">
                      <ul className="py-1.5">
                        {itens.slice(0, POR_GRUPO).map((it) => (
                          <ItemLista key={chave(it)} it={it} />
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </motion.div>
  );
}

const chave = (it: Item) => (it.tipo === "vaga" ? it.v.id : `escopo-${it.r.id}`);

/** Uma aba de estágio: nome e, ao lado, quantas vagas. Um ponto avisa quando o estágio pede ação. */
function Aba({
  ativa,
  n,
  pedeAcao,
  onClick,
  children,
}: {
  ativa: boolean;
  n?: number;
  pedeAcao?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativa}
      className={`relative flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors ${
        ativa ? "text-texto-claro" : "text-texto/75 hover:bg-superficie-2/70 hover:text-texto"
      }`}
    >
      {ativa && (
        <motion.span
          layoutId="aba-estagio"
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="absolute inset-0 rounded-full bg-texto"
        />
      )}
      <span className="relative">{children}</span>
      {n !== undefined && n > 0 && (
        <span className={`numero relative text-[12.5px] ${ativa ? "text-texto-claro/60" : "text-texto-suave"}`}>{n}</span>
      )}
      {pedeAcao && !!n && !ativa && <span className="relative -ml-0.5 size-1.5 rounded-full bg-texto" aria-label="Pede ação" />}
    </button>
  );
}

/** O ponto do estágio: cheio pede ação, vazado está esperando. */
function Ponto({ estagio }: { estagio: Estagio | "encerrada" }) {
  const cheio = estagio === "resultados" || estagio === "convidar" || estagio === "escopo";
  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${cheio ? "bg-texto" : estagio === "encerrada" ? "bg-texto-suave/30" : "border-[1.5px] border-texto/50"}`}
    />
  );
}

function Vazio({ onLimpar }: { onLimpar: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-12">
      <p className="text-[15px] text-texto">Nenhuma vaga por aqui.</p>
      <button onClick={onLimpar} className="text-[13.5px] text-texto-suave underline underline-offset-4 hover:text-texto">
        Ver todas as vagas
      </button>
    </div>
  );
}

function ItemLista({ it, mostrarEstagio = false }: { it: Item; mostrarEstagio?: boolean }) {
  return it.tipo === "vaga" ? <LinhaVaga v={it.v} mostrarEstagio={mostrarEstagio} /> : <LinhaEscopo r={it.r} mostrarEstagio={mostrarEstagio} />;
}

/**
 * Uma linha: o cargo, uma frase curta sobre em que pé a vaga está e o próximo passo.
 * `lateral` fica fora do link, numa coluna própria no fim (ex.: descartar o escopo), para nunca cobrir o texto.
 */
function Grade({
  href,
  titulo,
  sub,
  situacao,
  acao,
  forte,
  lateral,
}: {
  href: string;
  titulo: ReactNode;
  sub: ReactNode;
  situacao: ReactNode;
  acao: string;
  forte: boolean;
  lateral?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={href}
        className="group grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 rounded-xl px-3 py-3.5 transition-colors outline-none hover:bg-superficie-2/50 focus-visible:bg-superficie-2/70 md:grid-cols-[minmax(0,1fr)_220px_190px]"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] text-texto">{titulo}</span>
          <span className="truncate text-[12.5px] text-texto-suave">{sub}</span>
        </div>
        <span className="col-span-2 row-start-2 truncate text-[13px] text-texto-suave md:col-span-1 md:row-start-auto">{situacao}</span>
        <span
          className={`col-start-2 row-start-1 flex items-center gap-1.5 justify-self-end rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-colors md:col-start-auto md:row-start-auto ${
            forte ? "bg-texto font-medium text-texto-claro group-hover:bg-texto/85" : "bg-superficie-2/70 text-texto group-hover:bg-superficie-2"
          }`}
        >
          {acao}
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      <div className="flex w-8 shrink-0 justify-center">{lateral}</div>
    </div>
  );
}

function Selo({ estagio }: { estagio: Linha["estagio"] | "escopo" }) {
  return (
    <span className="flex items-center gap-1.5">
      <Ponto estagio={estagio} />
      {estagio === "encerrada" ? "Encerrada" : NOME_ESTAGIO[estagio]}
    </span>
  );
}

const plural = (n: number, um: string, varios: string) => `${numeroCurto(n)} ${n === 1 ? um : varios}`;

function LinhaVaga({ v, mostrarEstagio }: { v: Linha; mostrarEstagio: boolean }) {
  const f = v.funil;
  const meta = [v.time, NOME_SENIORIDADE_VAGA[v.senioridade]].filter((x) => x && x !== "—").join(" · ");
  const sub = mostrarEstagio ? (
    <span className="flex items-center gap-2">
      <Selo estagio={v.estagio} />
      {meta && <span className="truncate">· {meta}</span>}
    </span>
  ) : (
    meta || `Aberta ${quandoFoi(v.abertaHaDias)}`
  );
  const base = `/vagas/vaga?id=${encodeURIComponent(v.id)}`;
  const faltam = Math.max(0, f.convidados - f.concluiram);

  // Um número por linha, no máximo: o resto fica dentro da vaga.
  const porEstagio = {
    resultados: {
      href: `${base}&etapa=escores`,
      acao: "Ver resultados",
      situacao:
        f.novos > 0 ? (
          <span className="font-medium text-texto">{plural(f.novos, "relatório novo", "relatórios novos")}</span>
        ) : (
          plural(f.concluiram, "relatório", "relatórios")
        ),
    },
    convidar: {
      href: `${base}&etapa=entrevistas`,
      acao: f.inscritos > 0 ? "Enviar convites" : "Divulgar link",
      situacao: f.inscritos > 0 ? plural(f.inscritos, "inscrito esperando", "inscritos esperando") : "Ninguém inscrito ainda",
    },
    aguardando: {
      href: `${base}&etapa=entrevistas`,
      acao: "Acompanhar",
      situacao: faltam > 0 ? plural(faltam, "entrevista por fazer", "entrevistas por fazer") : "Esperando os candidatos",
    },
    encerrada: {
      href: `${base}&etapa=escores`,
      acao: "Ver resultados",
      situacao: "Encerrada",
    },
  }[v.estagio];

  return (
    <li className="linha-lista mx-2">
      <Grade
        href={porEstagio.href}
        titulo={v.cargo}
        sub={sub}
        situacao={porEstagio.situacao}
        acao={porEstagio.acao}
        forte={v.estagio === "resultados" || v.estagio === "convidar"}
      />
    </li>
  );
}

/** Um escopo ainda com o Totti: leva de volta para a conversa. O X, no fim da linha, descarta. */
function LinhaEscopo({ r, mostrarEstagio }: { r: RascunhoVaga; mostrarEstagio: boolean }) {
  return (
    <li className="linha-lista group/linha mx-2">
      <Grade
        href={`/vagas/nova?rascunho=${encodeURIComponent(r.id)}`}
        titulo={r.cargo}
        sub={
          mostrarEstagio ? (
            <span className="flex items-center gap-2">
              <Selo estagio="escopo" /> · {quandoFoi(diasDoRascunho(r))}
            </span>
          ) : (
            `Criada ${quandoFoi(diasDoRascunho(r))}`
          )
        }
        situacao={situacaoDoRascunho(r)}
        acao={r.sessaoId ? "Continuar com o Totti" : "Começar com o Totti"}
        forte
        lateral={
          <button
            onClick={() => descartarRascunho(r.id)}
            aria-label={`Descartar o escopo ${r.cargo}`}
            title="Descartar escopo"
            className="flex size-7 items-center justify-center rounded-full text-texto-suave opacity-0 transition-[opacity,color,background-color] group-hover/linha:opacity-100 hover:bg-superficie-2 hover:text-perigo focus-visible:opacity-100"
          >
            <X size={13} />
          </button>
        }
      />
    </li>
  );
}

/** Um botão "Filtros" que abre um painel com área, time, responsável e ordem, todos em pílulas. */
function Filtros({
  area,
  time,
  responsavel,
  ordem,
  times,
  responsaveis,
  onArea,
  onTime,
  onResponsavel,
  onOrdem,
}: {
  area: Area | "";
  time: string;
  responsavel: string;
  ordem: Ordem;
  times: string[];
  responsaveis: string[];
  onArea: (v: Area | "") => void;
  onTime: (v: string) => void;
  onResponsavel: (v: string) => void;
  onOrdem: (v: Ordem) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  const ativos = [area, time, responsavel].filter(Boolean).length;

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors ${
          ativos ? "bg-texto text-texto-claro" : "bg-superficie-2/70 text-texto hover:bg-superficie-2"
        }`}
      >
        <SlidersHorizontal size={13} />
        Filtros
        {ativos > 0 && <span className="numero rounded-full bg-texto-claro/20 px-1.5 text-[11.5px]">{ativos}</span>}
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: curvaSuave }}
            className="absolute top-10 right-0 z-30 flex max-h-[70vh] w-[min(92vw,380px)] overflow-y-auto origin-top-right flex-col gap-4 rounded-[18px] bg-superficie p-4 shadow-flutuante"
          >
            <Grupo titulo="Ordenar por">
              {(
                [
                  ["recentes", "O que pede atenção"],
                  ["inscritos", "Mais inscritos"],
                  ["az", "Nome (A–Z)"],
                ] as [Ordem, string][]
              ).map(([v, nome]) => (
                <Pilula key={v} ativa={ordem === v} onClick={() => onOrdem(v)}>
                  {nome}
                </Pilula>
              ))}
            </Grupo>
            <Grupo titulo="Área">
              {(Object.keys(NOME_AREA_VAGA) as Area[]).map((a) => (
                <Pilula key={a} ativa={area === a} onClick={() => onArea(area === a ? "" : a)}>
                  {NOME_AREA_VAGA[a]}
                </Pilula>
              ))}
            </Grupo>
            <Grupo titulo="Time">
              {times.map((t) => (
                <Pilula key={t} ativa={time === t} onClick={() => onTime(time === t ? "" : t)}>
                  {t}
                </Pilula>
              ))}
            </Grupo>
            <Grupo titulo="Responsável">
              {responsaveis.map((t) => (
                <Pilula key={t} ativa={responsavel === t} onClick={() => onResponsavel(responsavel === t ? "" : t)}>
                  {t}
                </Pilula>
              ))}
            </Grupo>
            {ativos > 0 && (
              <button
                onClick={() => (onArea(""), onTime(""), onResponsavel(""))}
                className="self-start text-[12.5px] text-texto-suave underline underline-offset-4 hover:text-texto"
              >
                Limpar filtros
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="rotulo text-texto-suave">{titulo}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pilula({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativa}
      className={`flex h-7 items-center gap-1 rounded-full px-3 text-[12.5px] transition-colors ${
        ativa ? "bg-texto text-texto-claro" : "bg-superficie-2/70 text-texto hover:bg-superficie-2"
      }`}
    >
      {ativa && <Check size={12} />}
      {children}
    </button>
  );
}
