"use client";

// A tela inicial do recrutador. A pergunta que ela responde é "o que eu tenho que fazer agora?":
//   1. O quadro de estágios: Definir escopo → Enviar convites → Aguardando entrevistas → Ver resultados.
//      Cada estágio mostra quantas vagas estão nele e, clicado, vira o filtro da lista.
//   2. A lista: sem estágio escolhido, agrupada pelo que pede ação primeiro (resultados, convites,
//      escopos e, por último, o que só está esperando); com estágio, busca ou filtro, uma lista só.
// Cada linha diz em que pé a vaga está e tem um único próximo passo. Encerradas ficam num atalho à parte.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, SlidersHorizontal, X } from "lucide-react";
import {
  DICA_ESTAGIO,
  ESTAGIOS,
  NOME_AREA_VAGA,
  NOME_ESTAGIO,
  NOME_SENIORIDADE_VAGA,
  descartarRascunho,
  diasDoRascunho,
  estagioDa,
  numero,
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

const hoje = () => {
  const d = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return d.charAt(0).toUpperCase() + d.slice(1);
};

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
  const fazendoAgora = linhas.reduce((n, v) => (v.estagio === "encerrada" ? n : n + v.funil.emAndamento), 0);

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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="rotulo text-texto-suave">{hoje()}</span>
          <h1 className="titulo-display text-[40px] text-texto">Vagas</h1>
        </div>
        <Busca valor={busca} onMudar={(v) => (setBusca(v), setPagina(0))} placeholder="Buscar vaga, time ou responsável" />
      </header>

      {/* 1. O quadro de estágios: a vaga anda da esquerda para a direita */}
      <nav aria-label="Estágios das vagas" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ESTAGIOS.map((e, i) => (
          <CartaoEstagio
            key={e}
            passo={i + 1}
            estagio={e}
            n={contagem(e)}
            dica={e === "aguardando" && fazendoAgora > 0 ? `${numero(fazendoAgora)} candidatos fazendo agora` : DICA_ESTAGIO[e]}
            ativo={filtro === e}
            onClick={() => escolher(e)}
          />
        ))}
      </nav>

      {/* 2. A lista */}
      <section ref={lista} className="flex scroll-mt-8 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-texto">{tituloLista}</h2>
          {(filtro || temFiltro || busca) && (
            <button
              onClick={limpar}
              className="flex items-center gap-1 rounded-full bg-superficie-2/70 py-1 pr-2.5 pl-2 text-[12.5px] text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
            >
              <X size={12} /> Ver tudo
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {filtro !== "encerradas" && encerradas > 0 && (
              <button
                onClick={() => escolher("encerradas")}
                className="px-2 text-[13px] text-texto-suave underline-offset-4 hover:text-texto hover:underline"
              >
                Encerradas · {numero(encerradas)}
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
                  <Cabecalho />
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
                        <span className="numero font-normal text-texto-suave">{numero(itens.length)}</span>
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

/** Um estágio do quadro: número do passo, nome, quantas vagas e o que fazer. Clicado, filtra a lista. */
function CartaoEstagio({
  passo,
  estagio,
  n,
  dica,
  ativo,
  onClick,
}: {
  passo: number;
  estagio: Estagio;
  n: number;
  dica: string;
  ativo: boolean;
  onClick: () => void;
}) {
  const pedeAcao = estagio !== "aguardando" && n > 0;
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={`group relative flex min-h-[132px] flex-col justify-between gap-3 rounded-[18px] p-4 text-left transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.99] ${
        ativo ? "bg-texto text-texto-claro" : "cartao hover:shadow-[0_0_0_1px_rgb(17_17_17/0.14)]"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-2 text-[13px] font-medium ${ativo ? "text-texto-claro" : "text-texto"}`}>
          <span
            className={`numero flex size-5 items-center justify-center rounded-full text-[11px] ${
              ativo ? "bg-texto-claro/15 text-texto-claro" : "bg-superficie-2 text-texto-suave"
            }`}
          >
            {passo}
          </span>
          {NOME_ESTAGIO[estagio]}
        </span>
        {pedeAcao && !ativo && <span className="size-2 rounded-full bg-texto" aria-label="Pede ação" />}
      </span>
      <span className="flex flex-col gap-1">
        <span className={`titulo-display text-[34px] leading-none ${n === 0 ? (ativo ? "text-texto-claro/40" : "text-texto-suave/35") : ""}`}>
          {numero(n)}
        </span>
        <span className={`text-[12.5px] leading-snug ${ativo ? "text-texto-claro/70" : "text-texto-suave"}`}>{dica}</span>
      </span>
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

const GRADE = "md:grid-cols-[minmax(0,1fr)_200px_190px] xl:grid-cols-[minmax(0,1fr)_220px_130px_190px]";

function Cabecalho() {
  return (
    <div className={`hidden gap-6 px-5 pt-4 pb-1 md:grid ${GRADE}`}>
      {["Vaga", "Andamento", "Responsável", ""].map((t, i) => (
        <span key={i} className={`rotulo text-texto-suave ${i === 2 ? "hidden xl:block" : ""}`}>
          {t}
        </span>
      ))}
    </div>
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

/** A grade de uma linha: vaga, andamento, responsável e o próximo passo. */
function Grade({
  href,
  titulo,
  sub,
  andamento,
  responsavel,
  acao,
  forte,
}: {
  href: string;
  titulo: ReactNode;
  sub: ReactNode;
  andamento: ReactNode;
  responsavel: ReactNode;
  acao: string;
  forte: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 rounded-xl px-3 py-3.5 transition-colors outline-none hover:bg-superficie-2/50 focus-visible:bg-superficie-2/70 ${GRADE}`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] text-texto">{titulo}</span>
        <span className="truncate text-[12.5px] text-texto-suave">{sub}</span>
      </div>
      <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">{andamento}</div>
      <span className="hidden truncate text-[13px] text-texto-suave xl:block">{responsavel}</span>
      <span
        className={`col-start-2 row-start-1 flex items-center gap-1.5 justify-self-end rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-colors md:col-start-auto md:row-start-auto ${
          forte ? "bg-texto font-medium text-texto-claro group-hover:bg-texto/85" : "bg-superficie-2/70 text-texto group-hover:bg-superficie-2"
        }`}
      >
        {acao}
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Barra({ feito, total, rotulo }: { feito: number; total: number; rotulo: ReactNode }) {
  const p = total > 0 ? Math.min(1, feito / total) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="numero text-[13px] text-texto">{rotulo}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-superficie-2">
        <span className="block h-1 rounded-full bg-texto" style={{ width: `${Math.max(2, p * 100)}%` }} />
      </span>
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

function LinhaVaga({ v, mostrarEstagio }: { v: Linha; mostrarEstagio: boolean }) {
  const f = v.funil;
  const meta = [v.time, NOME_SENIORIDADE_VAGA[v.senioridade], v.local].filter((x) => x && x !== "—").join(" · ");
  const sub = mostrarEstagio ? (
    <span className="flex items-center gap-2">
      <Selo estagio={v.estagio} />
      {meta && <span className="truncate">· {meta}</span>}
    </span>
  ) : (
    meta || `Aberta ${quandoFoi(v.abertaHaDias)}`
  );
  const base = `/vagas/vaga?id=${encodeURIComponent(v.id)}`;

  const porEstagio = {
    resultados: {
      href: `${base}&etapa=escores`,
      acao: "Ver resultados",
      andamento: (
        <Barra
          feito={f.concluiram}
          total={f.convidados}
          rotulo={
            <>
              {f.novos > 0 && <span className="font-medium">+{numero(f.novos)} novos </span>}
              <span className="text-texto-suave">
                · {numero(f.concluiram)} de {numero(f.convidados)}
              </span>
            </>
          }
        />
      ),
    },
    convidar: {
      href: `${base}&etapa=entrevistas`,
      acao: f.inscritos > 0 ? "Enviar convites" : "Divulgar link",
      andamento: (
        <span className="numero text-[13px] text-texto-suave">
          {f.inscritos > 0 ? (
            <>
              <span className="text-texto">{numeroCurto(f.inscritos)} inscritos</span> · ninguém convidado
            </>
          ) : (
            "Link pronto · nenhum inscrito ainda"
          )}
        </span>
      ),
    },
    aguardando: {
      href: `${base}&etapa=entrevistas`,
      acao: "Acompanhar",
      andamento: (
        <Barra
          feito={f.concluiram}
          total={f.convidados}
          rotulo={
            <>
              {numero(f.concluiram)} <span className="text-texto-suave">de {numero(f.convidados)} feitas</span>
              {f.emAndamento > 0 && <span className="text-texto-suave"> · {numero(f.emAndamento)} agora</span>}
            </>
          }
        />
      ),
    },
    encerrada: {
      href: `${base}&etapa=escores`,
      acao: "Ver resultados",
      andamento: <span className="numero text-[13px] text-texto-suave">{numero(f.concluiram)} entrevistas feitas</span>,
    },
  }[v.estagio];

  return (
    <li className="linha-lista mx-2">
      <Grade
        href={porEstagio.href}
        titulo={v.cargo}
        sub={sub}
        andamento={porEstagio.andamento}
        responsavel={v.responsavel}
        acao={porEstagio.acao}
        forte={v.estagio === "resultados" || v.estagio === "convidar"}
      />
    </li>
  );
}

/** Um escopo ainda com o Totti: leva de volta para a conversa. Dá para descartar pelo X. */
function LinhaEscopo({ r, mostrarEstagio }: { r: RascunhoVaga; mostrarEstagio: boolean }) {
  const c = r.combinados;
  return (
    <li className="linha-lista group/linha relative mx-2">
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
        andamento={
          c && c.total > 0 ? (
            <Barra feito={c.feitos} total={c.total} rotulo={<>{c.feitos} <span className="text-texto-suave">de {c.total} pontos combinados</span></>} />
          ) : (
            <span className="text-[13px] text-texto-suave">{situacaoDoRascunho(r)}</span>
          )
        }
        responsavel="Você"
        acao={r.sessaoId ? "Continuar com o Totti" : "Começar com o Totti"}
        forte
      />
      <button
        onClick={() => descartarRascunho(r.id)}
        aria-label={`Descartar o escopo ${r.cargo}`}
        title="Descartar escopo"
        className="absolute top-1/2 -left-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-superficie text-texto-suave opacity-0 shadow-[0_0_0_1px_rgb(17_17_17/0.08)] transition-[opacity,color] group-hover/linha:opacity-100 hover:text-perigo focus-visible:opacity-100"
      >
        <X size={13} />
      </button>
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
