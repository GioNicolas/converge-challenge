"use client";

// A tela inicial do recrutador: as vagas como uma pipeline, na ordem em que andam.
//   Definir escopo → Aguardando entrevistas → Ver resultados
// Três cards grandes, um por estágio, com o número de vagas em destaque. Abaixo, a lista com todas as vagas abertas;
// clicar num card mostra só as daquele estágio (clicar de novo volta a tudo). Busca e filtros valem para a lista.
// Os convites saem sozinhos ao publicar, então não há estágio de "enviar convites" nem "divulgar link".
// Cada vaga tem o cargo e uma frase curta (com um número, no máximo); os detalhes ficam dentro da vaga.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { Check, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import {
  DICA_ESTAGIO,
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
    // O estágio pode vir na URL (?estagio=...); "Todas as vagas", no menu lateral, volta à lista com tudo.
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
  // Sem estágio escolhido, a lista mostra tudo que está aberto (com busca e filtros aplicados).
  const itensPlanos = useMemo(() => {
    if (filtro) return doEstagio(filtro);
    return ESTAGIOS.flatMap((e) => doEstagio(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, filtradas, escopos, ordem]);

  const paginaSegura = Math.min(pagina, Math.max(0, Math.ceil(itensPlanos.length / POR_PAGINA) - 1));
  const visiveis = itensPlanos.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);

  // Um só agendamento de rolagem por vez; some junto com a tela.
  const rolagem = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(rolagem.current), []);

  const escolher = (e: Filtro) => {
    const proximo = filtro === e ? null : e;
    setFiltro(proximo);
    setPagina(0);
    clearTimeout(rolagem.current);
    // No celular os cards empilham e a lista abre abaixo da dobra: a página desce até ela, sem pressa.
    if (proximo)
      rolagem.current = setTimeout(() => {
        const topo = lista.current?.getBoundingClientRect().top ?? 0;
        if (topo > window.innerHeight - 160) {
          const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          lista.current?.scrollIntoView({
            behavior: suave ? "smooth" : "auto",
            block: "start",
          });
        }
      }, 360);
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
    filtro === "encerradas"
      ? "Encerradas"
      : filtro
        ? NOME_ESTAGIO[filtro]
        : temFiltro || termo
          ? "Resultado da busca"
          : "Todas as vagas";

  return (
    // "user": com reduzir movimento ligado no sistema, o motion tira os deslizes; a altura da lista é tratada em Altura.
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: curvaSuave }}
        className="mx-auto flex max-w-[1120px] flex-col gap-8"
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="titulo-display text-[40px] text-texto">Vagas</h1>
          <div className="flex items-center gap-2">
            <Busca valor={busca} onMudar={(v) => (setBusca(v), setPagina(0))} placeholder="Buscar vaga, time ou responsável" />
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
        </header>

        {/* Os estágios, em ordem. Clicado, o card abre a lista das vagas dele logo abaixo. */}
        <nav aria-label="Estágios das vagas" className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {ESTAGIOS.map((e, i) => (
            <CardEstagio key={e} passo={i + 1} estagio={e} n={contagem(e)} ativo={filtro === e} onClick={() => escolher(e)} />
          ))}
        </nav>

        <section ref={lista} className="flex scroll-mt-20 flex-col gap-4 md:scroll-mt-8">
          <Altura>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${filtro}-${temFiltro}-${!!termo}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.2, ease: curvaSuave }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center gap-3 px-1">
                  <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-texto">{tituloLista}</h2>
                  <span className="numero text-[14px] text-texto-suave">{itensPlanos.length}</span>
                  {(temFiltro || busca) && (
                    <button
                      onClick={limpar}
                      className="flex items-center gap-1 rounded-full bg-superficie-2/70 py-1 pr-2.5 pl-2 text-[12.5px] text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
                    >
                      <X size={12} /> Limpar
                    </button>
                  )}
                </div>
                <div className="cartao overflow-hidden">
                  {visiveis.length === 0 ? (
                    <Vazio onLimpar={limpar} />
                  ) : (
                    <ul className="py-1.5">
                      {visiveis.map((it, i) => (
                        <ItemLista key={chave(it)} it={it} indice={i} mostrarEstagio={!filtro} />
                      ))}
                    </ul>
                  )}
                </div>
                <Paginacao pagina={paginaSegura} porPagina={POR_PAGINA} total={itensPlanos.length} onMudar={setPagina} />
              </motion.div>
            </AnimatePresence>
          </Altura>

          {/* Encerradas não têm card: o mesmo link abre e fecha, sem mexer na busca nem nos filtros. */}
          {(filtro === "encerradas" || encerradas > 0) && (
            <button
              onClick={() => escolher("encerradas")}
              className="self-start px-1 text-[13px] text-texto-suave underline-offset-4 hover:text-texto hover:underline"
            >
              {filtro === "encerradas" ? "Voltar às vagas abertas" : `Ver vagas encerradas (${encerradas})`}
            </button>
          )}
        </section>
      </motion.div>
    </MotionConfig>
  );
}

const chave = (it: Item) => (it.tipo === "vaga" ? it.v.id : `escopo-${it.r.id}`);

/**
 * Um estágio da pipeline: o passo, o nome, quantas vagas estão nele (em destaque) e o que acontece ali.
 * O escolhido fica em tinta cheia.
 */
function CardEstagio({
  passo,
  estagio,
  n,
  ativo,
  onClick,
}: {
  passo: number;
  estagio: Estagio;
  n: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: (passo - 1) * 0.06,
        ease: curvaSuave,
      }}
      onClick={onClick}
      aria-pressed={ativo}
      className={`group flex flex-col gap-5 rounded-[18px] p-5 text-left transition-[background-color,box-shadow,transform] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-texto/30 active:scale-[0.99] ${
        ativo
          ? "bg-texto text-texto-claro"
          : "bg-superficie text-texto shadow-[0_1px_2px_rgb(17_17_17/0.04),0_0_0_1px_rgb(17_17_17/0.035)] hover:-translate-y-px hover:shadow-[0_0_0_1px_rgb(17_17_17/0.1),0_8px_20px_-10px_rgb(17_17_17/0.2)]"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span
            className={`numero flex size-6 items-center justify-center rounded-full text-[11.5px] ${
              ativo ? "bg-texto-claro/15 text-texto-claro" : "bg-superficie-2 text-texto-suave"
            }`}
          >
            {passo}
          </span>
          <span className="text-[15px] font-medium tracking-[-0.012em]">{NOME_ESTAGIO[estagio]}</span>
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 transition-transform duration-200 ${ativo ? "rotate-90 text-texto-claro/70" : "text-texto-suave group-hover:translate-x-0.5"}`}
        />
      </span>
      <span className="flex flex-col gap-1">
        <span className="titulo-display text-[44px]">{n}</span>
        <span className={`text-[13.5px] ${ativo ? "text-texto-claro/65" : "text-texto-suave"}`}>{DICA_ESTAGIO[estagio]}</span>
      </span>
    </motion.button>
  );
}

/** O ponto do estágio: cheio pede ação, vazado está esperando. */
function Ponto({ estagio }: { estagio: Estagio | "encerrada" }) {
  const cheio = estagio === "resultados" || estagio === "escopo";
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

function ItemLista({ it, indice, mostrarEstagio = false }: { it: Item; indice: number; mostrarEstagio?: boolean }) {
  return it.tipo === "vaga" ? (
    <LinhaVaga v={it.v} indice={indice} mostrarEstagio={mostrarEstagio} />
  ) : (
    <LinhaEscopo r={it.r} indice={indice} mostrarEstagio={mostrarEstagio} />
  );
}

/** Entrada de uma linha da lista: sobe 4px e aparece, uma logo depois da outra (no máximo ~0,2s de espera). */
const entradaLinha = (i: number) =>
  ({
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.28,
      delay: 0.04 + Math.min(i, 8) * 0.022,
      ease: curvaSuave,
    },
  }) as const;

/**
 * Anima a altura até a do conteúdo, para a página abrir e fechar a lista sem pular.
 * O respiro de 4px (com margem negativa) evita cortar a borda e a sombra dos cartões.
 */
function Altura({ children }: { children: ReactNode }) {
  const dentro = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number | "auto">("auto");
  // O reducedMotion do MotionConfig não cobre altura: com reduzir movimento ligado, ela muda de uma vez.
  const semMovimento = useReducedMotion();
  useEffect(() => {
    const el = dentro.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setAltura(el.offsetHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <motion.div
      initial={false}
      animate={{ height: altura }}
      transition={semMovimento ? { duration: 0 } : { duration: 0.34, ease: curvaSuave }}
      className="-m-1 overflow-hidden"
    >
      <div ref={dentro} className="p-1">
        {children}
      </div>
    </motion.div>
  );
}

/**
 * Uma linha: o cargo e o detalhe à esquerda, em que pé a vaga está à direita, e uma seta.
 * `lateral` fica fora do link, numa coluna própria no fim (ex.: descartar o escopo), para nunca cobrir o texto.
 */
function Grade({
  href,
  titulo,
  sub,
  situacao,
  lateral,
}: {
  href: string;
  titulo: ReactNode;
  sub: ReactNode;
  situacao: ReactNode;
  lateral?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={href}
        className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl px-3 py-3.5 transition-colors outline-none hover:bg-superficie-2/50 focus-visible:bg-superficie-2/70"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] text-texto">{titulo}</span>
          <span className="truncate text-[12.5px] text-texto-suave">{sub}</span>
          {/* No celular a situação desce para baixo do detalhe, em vez de sumir. */}
          <span className="truncate text-[13px] text-texto-suave sm:hidden">{situacao}</span>
        </div>
        <span className="hidden max-w-[240px] shrink-0 truncate text-right text-[13px] text-texto-suave sm:block">
          {situacao}
        </span>
        <ChevronRight size={15} className="shrink-0 text-texto-suave transition-transform group-hover:translate-x-0.5" />
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

/** Para onde a vaga leva e a frase do estágio (um número, no máximo: o resto fica dentro da vaga). */
function estadoDa(v: Linha): { href: string; situacao: ReactNode } {
  const f = v.funil;
  const base = `/vagas/vaga?id=${encodeURIComponent(v.id)}`;
  const faltam = Math.max(0, f.convidados - f.concluiram);
  if (v.estagio === "resultados")
    return {
      href: `${base}&etapa=escores`,
      situacao:
        f.novos > 0 ? (
          <span className="font-medium text-texto">{plural(f.novos, "relatório novo", "relatórios novos")}</span>
        ) : (
          plural(f.concluiram, "relatório", "relatórios")
        ),
    };
  if (v.estagio === "encerrada") return { href: `${base}&etapa=escores`, situacao: "Encerrada" };
  return {
    href: `${base}&etapa=entrevistas`,
    situacao: faltam > 0 ? plural(faltam, "entrevista por fazer", "entrevistas por fazer") : "Esperando os candidatos",
  };
}

function LinhaVaga({ v, indice, mostrarEstagio }: { v: Linha; indice: number; mostrarEstagio: boolean }) {
  const meta = [v.time, NOME_SENIORIDADE_VAGA[v.senioridade]].filter((x) => x && x !== "—").join(" · ");
  const sub = mostrarEstagio ? (
    <span className="flex items-center gap-2">
      <Selo estagio={v.estagio} />
      {meta && <span className="truncate">· {meta}</span>}
    </span>
  ) : (
    meta || `Aberta ${quandoFoi(v.abertaHaDias)}`
  );
  const porEstagio = estadoDa(v);

  return (
    <motion.li {...entradaLinha(indice)} className="linha-lista mx-2">
      <Grade href={porEstagio.href} titulo={v.cargo} sub={sub} situacao={porEstagio.situacao} />
    </motion.li>
  );
}

/** Um escopo ainda com o Totti: leva de volta para a conversa. O X, no fim da linha, descarta. */
function LinhaEscopo({ r, indice, mostrarEstagio }: { r: RascunhoVaga; indice: number; mostrarEstagio: boolean }) {
  return (
    <motion.li {...entradaLinha(indice)} className="linha-lista group/linha mx-2">
      <Grade
        href={`/vagas/nova?rascunho=${encodeURIComponent(r.id)}`}
        titulo={r.cargo}
        sub={
          mostrarEstagio ? (
            <span className="flex items-center gap-2">
              <Selo estagio="escopo" /> · {situacaoDoRascunho(r)}
            </span>
          ) : (
            `${situacaoDoRascunho(r)} · criada ${quandoFoi(diasDoRascunho(r))}`
          )
        }
        situacao={<span className="font-medium text-texto">{r.sessaoId ? "Continuar com o Totti" : "Começar com o Totti"}</span>}
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
    </motion.li>
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
