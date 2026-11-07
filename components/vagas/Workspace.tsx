"use client";

// A tela inicial do recrutador, pensada para uma empresa grande (dezenas ou centenas de vagas, dezenas
// de milhares de inscritos numa vaga de júnior). Em ordem de importância:
//   1. Os números que pedem ação, que também são filtros: relatórios novos para revisar, entrevistas
//      acontecendo agora, vagas ativas.
//   2. Todas as vagas: busca, abas por situação (inclusive "Escopo em definição"), filtros (área, time,
//      responsável), ordenação e páginas. Os escopos com o Totti também aparecem aqui (o menu lateral
//      tem um atalho para essa aba).
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import {
  NOME_AREA_VAGA,
  NOME_SENIORIDADE_VAGA,
  descartarRascunho,
  diasDoRascunho,
  novosDa,
  numero,
  numeroCurto,
  quandoFoi,
  situacaoDoRascunho,
  useVagas,
  type Area,
  type RascunhoVaga,
  type VagaEmpresa,
} from "@/lib/vagas/workspace";
import { buscaNormalizada, comConvites, useConvitesFeitos, type Funil } from "@/lib/vagas/candidatos";
import { comReais, useEntrevistasReais } from "@/lib/vagas/entrevistas";
import { curvaSuave } from "@/lib/design/motion";
import Casca from "./Casca";
import { Abas, Busca, Paginacao, Seletor, type Aba } from "./controles";

type AbaVagas = "todas" | "revisar" | "recebendo" | "sem" | "escopo" | "encerradas";
const ABAS: AbaVagas[] = ["todas", "revisar", "recebendo", "sem", "escopo", "encerradas"];
type Ordem = "novos" | "recentes" | "inscritos" | "az";
type Linha = VagaEmpresa & { f: Funil };
// Na tabela entram as vagas publicadas e os escopos ainda com o Totti (vagas "meio" criadas).
type Item = { tipo: "vaga"; v: Linha } | { tipo: "escopo"; r: RascunhoVaga };

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
  // As entrevistas feitas pelo link entram no funil da vaga (e nos "relatórios novos" da tela inicial).
  const linhas: Linha[] = useMemo(
    () =>
      vagas.map((v) => {
        const funil = comReais(v.funil, v.resumo ? reais?.[v.resumo.configId] : undefined);
        return { ...v, funil, f: comConvites(funil, convites[v.id]) };
      }),
    [vagas, convites, reais],
  );

  const params = useSearchParams();
  const abaDaUrl = params.get("aba");
  const [aba, setAba] = useState<AbaVagas>("todas");
  const tabela = useRef<HTMLElement>(null);
  useEffect(() => {
    if (abaDaUrl && ABAS.includes(abaDaUrl as AbaVagas)) {
      setAba(abaDaUrl as AbaVagas);
      setPagina(0);
      tabela.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [abaDaUrl]);
  const [busca, setBusca] = useState("");
  const termo = useDeferredValue(buscaNormalizada(busca.trim()));
  const [area, setArea] = useState<Area | "">("");
  const [time, setTime] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("novos");
  const [pagina, setPagina] = useState(0);

  const ativas = linhas.filter((v) => v.etapa !== "encerrada");
  const novos = ativas.reduce((n, v) => n + novosDa(v), 0);
  const agora = ativas.reduce((n, v) => n + v.f.emAndamento, 0);

  // Filtros que valem para todas as abas (as contagens das abas respeitam busca e filtros).
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
    () =>
      area || time || responsavel
        ? []
        : rascunhos.filter((r) => !termo || buscaNormalizada(`${r.cargo} escopo totti`).includes(termo)),
    [rascunhos, area, time, responsavel, termo],
  );
  const escoposNaAba = (a: AbaVagas) => (a === "todas" || a === "escopo" ? escopos : []);

  const naAba = (a: AbaVagas, v: Linha) =>
    a === "todas"
      ? v.etapa !== "encerrada"
      : a === "revisar"
        ? novosDa(v) > 0
        : a === "recebendo"
          ? v.etapa !== "encerrada" && v.f.inscritos > 0
          : a === "sem"
            ? v.etapa !== "encerrada" && v.f.inscritos === 0
            : a === "escopo"
              ? false
              : v.etapa === "encerrada";

  const abas: Aba<AbaVagas>[] = [
    { id: "todas", nome: "Todas", n: filtradas.filter((v) => naAba("todas", v)).length + escopos.length },
    { id: "revisar", nome: "Para revisar", n: filtradas.filter((v) => naAba("revisar", v)).length, destaque: true },
    { id: "recebendo", nome: "Recebendo inscrições", n: filtradas.filter((v) => naAba("recebendo", v)).length },
    { id: "sem", nome: "Sem inscritos", n: filtradas.filter((v) => naAba("sem", v)).length },
    { id: "escopo", nome: "Escopo em definição", n: escopos.length },
    { id: "encerradas", nome: "Encerradas", n: filtradas.filter((v) => naAba("encerradas", v)).length },
  ];

  const lista = useMemo(() => {
    const l = filtradas.filter((v) => naAba(aba, v));
    const cmp: Record<Ordem, (a: Linha, b: Linha) => number> = {
      novos: (a, b) => novosDa(b) - novosDa(a) || a.abertaHaDias - b.abertaHaDias,
      recentes: (a, b) => a.abertaHaDias - b.abertaHaDias,
      inscritos: (a, b) => b.f.inscritos - a.f.inscritos,
      az: (a, b) => a.cargo.localeCompare(b.cargo, "pt-BR"),
    };
    const vagasOrdenadas: Item[] = l.sort(cmp[ordem]).map((v) => ({ tipo: "vaga", v }));
    const meio: Item[] = escoposNaAba(aba).map((r) => ({ tipo: "escopo", r }));
    // Por nome ou por data, os escopos se misturam às vagas; nas outras ordens (novos, inscritos) vão
    // para o fim, porque ainda não têm candidatos.
    if (ordem === "az") return [...vagasOrdenadas, ...meio].sort((a, b) => cargoDe(a).localeCompare(cargoDe(b), "pt-BR"));
    if (ordem === "recentes") return [...vagasOrdenadas, ...meio].sort((a, b) => diasDe(a) - diasDe(b));
    return [...vagasOrdenadas, ...meio];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, escopos, aba, ordem]);

  const paginaSegura = Math.min(pagina, Math.max(0, Math.ceil(lista.length / POR_PAGINA) - 1));
  const visiveis = lista.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);

  const unicos = (k: "time" | "responsavel") => [...new Set(linhas.map((v) => v[k]).filter((x) => x && x !== "—"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const temFiltro = !!(area || time || responsavel || busca);
  const limpar = () => {
    setArea("");
    setTime("");
    setResponsavel("");
    setBusca("");
    setPagina(0);
  };
  const irPara = (a: AbaVagas) => {
    setAba(a);
    setPagina(0);
    tabela.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const mudar = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setPagina(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: curvaSuave }}
      className="mx-auto flex max-w-[1120px] flex-col gap-10"
    >
      {/* 1. O que pede ação: números grandes, cada um leva para a lista já filtrada */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="rotulo text-texto-suave">{hoje()}</span>
            <h1 className="titulo-display text-[40px] text-texto">Vagas</h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-[1.6fr_1fr_1fr]">
          <Indicador
            n={novos}
            rotulo="Relatórios novos para revisar"
            acao="Revisar"
            forte
            onClick={() => irPara("revisar")}
          />
          <Indicador n={agora} rotulo="Entrevistas acontecendo agora" onClick={() => irPara("recebendo")} />
          <Indicador n={ativas.length} rotulo="Vagas ativas" onClick={() => irPara("todas")} />
        </div>
      </header>

      {/* 3. Todas as vagas */}
      <section ref={tabela} className="flex scroll-mt-8 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-texto">Todas as vagas</h2>
          <Busca valor={busca} onMudar={mudar(setBusca)} placeholder="Buscar vaga, time ou responsável" />
        </div>
        <Abas abas={abas} atual={aba} onMudar={mudar(setAba)} />
        <div className="flex flex-wrap items-center gap-2 pt-3 pb-4">
          <Seletor
            rotulo="Área"
            valor={area}
            onMudar={mudar(setArea)}
            todos="Todas"
            opcoes={(Object.keys(NOME_AREA_VAGA) as Area[]).map((a) => ({ valor: a, nome: NOME_AREA_VAGA[a] }))}
          />
          <Seletor rotulo="Time" valor={time} onMudar={mudar(setTime)} opcoes={unicos("time").map((t) => ({ valor: t, nome: t }))} />
          <Seletor
            rotulo="Responsável"
            valor={responsavel}
            onMudar={mudar(setResponsavel)}
            opcoes={unicos("responsavel").map((t) => ({ valor: t, nome: t }))}
          />
          {temFiltro && (
            <button onClick={limpar} className="px-2 text-[13px] text-texto-suave underline underline-offset-4 hover:text-texto">
              Limpar filtros
            </button>
          )}
          <div className="ml-auto">
            <Seletor<Ordem>
              rotulo="Ordenar"
              valor={ordem}
              todos={null}
              onMudar={(v) => setOrdem((v || "novos") as Ordem)}
              opcoes={[
                { valor: "novos", nome: "Mais relatórios novos" },
                { valor: "recentes", nome: "Abertas há menos tempo" },
                { valor: "inscritos", nome: "Mais inscritos" },
                { valor: "az", nome: "Nome (A–Z)" },
              ]}
            />
          </div>
        </div>

        <div className="cartao overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_190px_90px_150px_20px] gap-6 px-5 pt-4 pb-2 md:grid">
          {["Vaga", "Inscritos", "Entrevistas feitas", "Novos", "Responsável", ""].map((t, i) => (
            <span key={i} className={`rotulo text-texto-suave ${i === 1 || i === 3 ? "text-right" : ""}`}>
              {t}
            </span>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-5 py-12">
            <p className="text-[15px] text-texto">Nenhuma vaga com esses filtros.</p>
            {temFiltro && (
              <button onClick={limpar} className="text-[13.5px] text-texto-suave underline underline-offset-4 hover:text-texto">
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <ul className="pb-1.5">
            {visiveis.map((it) =>
              it.tipo === "vaga" ? <LinhaVaga key={it.v.id} v={it.v} /> : <LinhaEscopo key={it.r.id} r={it.r} />,
            )}
          </ul>
        )}
        </div>
        <Paginacao pagina={paginaSegura} porPagina={POR_PAGINA} total={lista.length} onMudar={setPagina} />
      </section>
    </motion.div>
  );
}

function Indicador({ n, rotulo, acao, forte, onClick }: { n: number; rotulo: string; acao?: string; forte?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group flex min-h-[148px] flex-col items-start justify-between gap-4 rounded-[18px] p-5 text-left transition-[transform,background-color] duration-200 active:scale-[0.99] ${
        forte
          ? "col-span-2 bg-texto text-texto-claro hover:bg-texto/92 md:col-span-1"
          : "cartao hover:bg-superficie/70"
      }`}
    >
      <span className={`text-[13.5px] ${forte ? "text-texto-claro/70" : "text-texto-suave"}`}>{rotulo}</span>
      <span className="flex w-full items-end justify-between gap-3">
        <span
          className={`titulo-display leading-none ${forte ? "text-[52px]" : "text-[34px]"} ${
            n === 0 ? (forte ? "text-texto-claro/40" : "text-texto-suave/40") : ""
          }`}
        >
          {numero(n)}
        </span>
        {acao && n > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-texto-claro px-3 py-1.5 text-[13px] font-medium text-texto">
            {acao} <ArrowRight size={13} />
          </span>
        ) : (
          <ArrowRight size={15} className="mb-1 text-texto-suave/50 transition-transform group-hover:translate-x-0.5 group-hover:text-texto" />
        )}
      </span>
    </button>
  );
}

const cargoDe = (it: Item) => (it.tipo === "vaga" ? it.v.cargo : it.r.cargo);
const diasDe = (it: Item) => (it.tipo === "vaga" ? it.v.abertaHaDias : diasDoRascunho(it.r));

/** Um escopo ainda com o Totti, na mesma grade da tabela: leva de volta para a conversa. */
function LinhaEscopo({ r }: { r: RascunhoVaga }) {
  return (
    <li className="linha-lista group/linha relative mx-2">
      <Link
        href={`/vagas/nova?rascunho=${encodeURIComponent(r.id)}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 rounded-xl px-3 py-3.5 transition-colors outline-none hover:bg-superficie-2/50 focus-visible:bg-superficie-2/70 md:grid-cols-[minmax(0,1fr)_110px_190px_90px_150px_20px]"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] text-texto">{r.cargo}</span>
          <span className="truncate text-[12.5px] text-texto-suave">
            {situacaoDoRascunho(r)} · {quandoFoi(diasDoRascunho(r))}
          </span>
        </div>
        <span className="hidden text-right text-[14px] text-texto-suave/50 md:block">—</span>
        <span className="hidden text-[13px] text-texto-suave md:block">Plano ainda com o Totti</span>
        <span className="hidden text-right text-[14px] text-texto-suave/50 md:block">—</span>
        <span className="hidden text-[13px] text-texto md:block group-hover:underline group-hover:underline-offset-4">
          {r.sessaoId ? "Continuar" : "Definir"} com o Totti
        </span>
        <ArrowRight size={15} className="justify-self-end text-texto-suave transition-opacity group-hover/linha:opacity-0" />
      </Link>
      <button
        onClick={() => descartarRascunho(r.id)}
        aria-label={`Descartar o escopo ${r.cargo}`}
        title="Descartar escopo"
        className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-texto-suave opacity-0 transition-[opacity,color] group-hover/linha:opacity-100 hover:bg-superficie-2 hover:text-perigo focus-visible:opacity-100"
      >
        <X size={14} />
      </button>
    </li>
  );
}

function LinhaVaga({ v }: { v: Linha }) {
  const n = novosDa(v);
  const feitos = v.f.convidados > 0 ? v.f.concluiram / v.f.convidados : 0;
  const meta = [v.time, NOME_SENIORIDADE_VAGA[v.senioridade], v.local].filter((x) => x && x !== "—").join(" · ");
  return (
    <li className="linha-lista mx-2">
      <Link
        href={`/vagas/vaga?id=${encodeURIComponent(v.id)}&etapa=${n > 0 ? "escores" : "entrevistas"}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 rounded-xl px-3 py-3.5 transition-colors outline-none hover:bg-superficie-2/50 focus-visible:bg-superficie-2/70 md:grid-cols-[minmax(0,1fr)_110px_190px_90px_150px_20px]"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] text-texto">{v.cargo}</span>
          <span className="truncate text-[12.5px] text-texto-suave">{meta}</span>
        </div>
        <span className="numero hidden text-right text-[14px] text-texto md:block" title={numero(v.f.inscritos)}>
          {v.f.inscritos ? numeroCurto(v.f.inscritos) : <span className="text-texto-suave/50">—</span>}
        </span>
        <div className="hidden flex-col gap-1.5 md:flex">
          {v.f.convidados > 0 ? (
            <>
              <span className="numero text-[13px] text-texto">
                {numero(v.f.concluiram)} <span className="text-texto-suave">de {numero(v.f.convidados)}</span>
              </span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-superficie-2">
                <span className="block h-1 rounded-full bg-texto" style={{ width: `${Math.max(2, feitos * 100)}%` }} />
              </span>
            </>
          ) : (
            <span className="text-[13px] text-texto-suave/60">Ninguém convidado</span>
          )}
        </div>
        <span className="numero text-right text-[14px] max-md:hidden">
          {n > 0 ? <span className="font-medium text-texto">+{numero(n)}</span> : <span className="text-texto-suave/50">—</span>}
        </span>
        <span className="hidden truncate text-[13px] text-texto-suave md:block">{v.responsavel}</span>
        <ArrowRight size={15} className="justify-self-end text-texto-suave transition-transform group-hover:translate-x-0.5 group-hover:text-texto" />
        <span className="numero text-[12.5px] text-texto-suave md:hidden">
          {numeroCurto(v.f.inscritos)} inscritos{n > 0 && <span className="text-texto"> · +{numero(n)} novos</span>}
        </span>
      </Link>
    </li>
  );
}
