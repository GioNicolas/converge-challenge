"use client";

// A tela inicial da recrutadora, pensada para escala (dezenas de vagas, dezenas de milhares de inscritos):
//   1. Painel executivo: os grandes números somados das vagas abertas e o funil da empresa (clicável: filtra a lista).
//   2. Entrevistas ao vivo, quando houver.
//   3. Barra de filtros: busca, chips de recorte com contagem, gaveta com área/senioridade/time/responsável e a ordem,
//      e os filtros aplicados à vista, cada um com seu X.
//   4. A lista em cards: volume em destaque, micro-barra do funil, alerta de relatórios prontos e o atalho
//      direto para onde a vaga pede atenção (escores, entrevistas ou a conversa com o Totti).
// Os convites saem sozinhos ao publicar, então não há estágio de "enviar convites".
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import {
  ALTO_VOLUME,
  MINUTOS_POR_TRIAGEM,
  NOME_AREA_VAGA,
  NOME_FORMATO_CURTO,
  NOME_ORDEM,
  NOME_RECORTE,
  NOME_SENIORIDADE_VAGA,
  ORDENS,
  RECORTES_RAPIDOS,
  compararVagas,
  descartarRascunho,
  diasDoRascunho,
  estagioDa,
  noRecorte,
  novosDa,
  numero,
  porcento,
  quandoFoi,
  recorteDaUrl,
  situacaoDoRascunho,
  totaisDas,
  useVagas,
  type Area,
  type OrdemVagas,
  type RascunhoVaga,
  type Recorte,
  type Senioridade,
  type Totais,
  type VagaEmpresa,
} from "@/lib/vagas/workspace";
import { buscaNormalizada, comConvites, useConvitesFeitos } from "@/lib/vagas/candidatos";
import { comReais, useEntrevistasReais } from "@/lib/vagas/entrevistas";
import { curvaSaida, curvaSuave } from "@/lib/design/motion";
import { BarrasDeVoz } from "@/components/totti/Perola";
import { useContar } from "@/components/totti/useContar";
import TituloRevelado from "@/components/totti/TituloRevelado";
import Casca from "./Casca";
import { Busca, Chip, Etiqueta, Grupo, Paginacao, Pilula, Popover } from "./controles";

type Linha = VagaEmpresa & { estagio: ReturnType<typeof estagioDa> };
type Item = { tipo: "vaga"; v: Linha } | { tipo: "escopo"; r: RascunhoVaga };

const POR_PAGINA = 12;
const ORDEM_PADRAO: OrdemVagas = "inscritos";

const hrefVaga = (id: string, etapa: "escores" | "entrevistas") => `/vagas/vaga?id=${encodeURIComponent(id)}&etapa=${etapa}`;
const hrefRascunho = (id: string) => `/vagas/nova?rascunho=${encodeURIComponent(id)}`;

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

  const totais = useMemo(() => totaisDas(linhas), [linhas]);
  const aoVivo = useMemo(() => linhas.filter((v) => v.estagio !== "encerrada" && v.funil.emAndamento > 0), [linhas]);
  const maisPendente = useMemo(
    () => linhas.reduce<Linha | undefined>((m, v) => (novosDa(v) > (m ? novosDa(m) : 0) ? v : m), undefined),
    [linhas],
  );

  // O recorte pode vir na URL (?recorte=... ou o antigo ?estagio=...); "Todas as vagas", no menu lateral, volta a tudo.
  const params = useSearchParams();
  const daUrl = params.get("recorte") ?? params.get("estagio") ?? params.get("aba");
  const [recorte, setRecorte] = useState<Recorte>("todas");
  const [pagina, setPagina] = useState(0);
  useEffect(() => {
    setRecorte(recorteDaUrl(daUrl));
    setPagina(0);
  }, [daUrl]);

  const [busca, setBusca] = useState("");
  const termo = useDeferredValue(buscaNormalizada(busca.trim()));
  const [area, setArea] = useState<Area | "">("");
  const [senioridade, setSenioridade] = useState<Senioridade | "">("");
  const [time, setTime] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [ordem, setOrdem] = useState<OrdemVagas>(ORDEM_PADRAO);

  const temFiltro = !!(area || senioridade || time || responsavel);

  // Busca e gaveta valem para tudo; o recorte (chip ou funil) escolhe a fatia por cima disso.
  const base = useMemo(
    () =>
      linhas.filter(
        (v) =>
          (!area || v.area === area) &&
          (!senioridade || v.senioridade === senioridade) &&
          (!time || v.time === time) &&
          (!responsavel || v.responsavel === responsavel) &&
          (!termo || buscaNormalizada(`${v.cargo} ${v.time} ${v.responsavel} ${NOME_AREA_VAGA[v.area]}`).includes(termo)),
      ),
    [linhas, area, senioridade, time, responsavel, termo],
  );
  // Escopos não têm área, senioridade, time nem responsável: com esses filtros ligados, eles saem da lista.
  const escopos = useMemo(
    () => (temFiltro ? [] : rascunhos.filter((r) => !termo || buscaNormalizada(r.cargo).includes(termo))),
    [rascunhos, temFiltro, termo],
  );

  const contagem = (r: Recorte) => {
    if (r === "escopo") return escopos.length;
    const n = base.filter((v) => noRecorte(v, r)).length;
    return r === "todas" ? n + escopos.length : n;
  };

  const itens: Item[] = useMemo(() => {
    const deEscopo = [...escopos]
      .sort((a, b) => (ordem === "az" ? a.cargo.localeCompare(b.cargo, "pt-BR") : diasDoRascunho(a) - diasDoRascunho(b)))
      .map((r): Item => ({ tipo: "escopo", r }));
    if (recorte === "escopo") return deEscopo;
    const lista = base
      .filter((v) => noRecorte(v, recorte))
      .sort(compararVagas(ordem))
      .map((v): Item => ({ tipo: "vaga", v }));
    // Em "Todas", os escopos (sem inscritos ainda) vêm depois das vagas publicadas.
    return recorte === "todas" ? [...lista, ...deEscopo] : lista;
  }, [base, escopos, recorte, ordem]);

  const paginaSegura = Math.min(pagina, Math.max(0, Math.ceil(itens.length / POR_PAGINA) - 1));
  const visiveis = itens.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);
  const encerradas = base.filter((v) => v.estagio === "encerrada").length;

  // Um só agendamento de rolagem por vez; some junto com a tela.
  const lista = useRef<HTMLElement>(null);
  const rolagem = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(rolagem.current), []);

  const escolher = (r: Recorte, rolar = false) => {
    const proximo = recorte === r && r !== "todas" ? "todas" : r;
    setRecorte(proximo);
    setPagina(0);
    clearTimeout(rolagem.current);
    // Vindo do funil (lá em cima), a página desce até a lista se ela estiver abaixo da dobra.
    if (rolar && proximo !== "todas")
      rolagem.current = setTimeout(() => {
        const topo = lista.current?.getBoundingClientRect().top ?? 0;
        if (topo > window.innerHeight - 200) {
          const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          lista.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
        }
      }, 200);
  };
  const mudar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(0);
    };
  const limparGaveta = () => {
    setArea("");
    setSenioridade("");
    setTime("");
    setResponsavel("");
    setPagina(0);
  };
  const limparTudo = () => {
    limparGaveta();
    setBusca("");
    setRecorte("todas");
    setOrdem(ORDEM_PADRAO);
  };
  const unicos = (k: "time" | "responsavel") =>
    [...new Set(linhas.map((v) => v[k]).filter((x) => x && x !== "—"))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Os filtros aplicados, à vista: cada um sai no próprio X.
  const aplicados: { rotulo: string; valor: string; tirar: () => void }[] = [
    ...(recorte !== "todas" ? [{ rotulo: "Recorte", valor: NOME_RECORTE[recorte], tirar: () => escolher("todas") }] : []),
    ...(busca.trim() ? [{ rotulo: "Busca", valor: busca.trim(), tirar: () => setBusca("") }] : []),
    ...(area ? [{ rotulo: "Área", valor: NOME_AREA_VAGA[area], tirar: () => mudar(setArea)("") }] : []),
    ...(senioridade
      ? [{ rotulo: "Senioridade", valor: NOME_SENIORIDADE_VAGA[senioridade], tirar: () => mudar(setSenioridade)("") }]
      : []),
    ...(time ? [{ rotulo: "Time", valor: time, tirar: () => mudar(setTime)("") }] : []),
    ...(responsavel ? [{ rotulo: "Responsável", valor: responsavel, tirar: () => mudar(setResponsavel)("") }] : []),
  ];

  const tituloLista = recorte === "todas" ? (aplicados.length ? "Resultado da busca" : "Todas as vagas") : NOME_RECORTE[recorte];

  return (
    // "user": com reduzir movimento ligado no sistema, o motion tira os deslizes; a altura da lista é tratada em Altura.
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: curvaSuave }}
        className="mx-auto flex max-w-[1120px] flex-col gap-8"
      >
        <header className="flex flex-col gap-0.5">
          <span className="text-[15px] text-texto-suave first-letter:uppercase">{dataDeHoje()}</span>
          <h1 className="titulo-display text-[44px] text-texto">
            <TituloRevelado texto={saudacao()} />
          </h1>
        </header>

        <Painel totais={totais} maisPendente={maisPendente} recorte={recorte} onRecorte={(r) => escolher(r, true)} />

        <AoVivo linhas={aoVivo} />

        <section ref={lista} aria-label="Vagas" className="flex scroll-mt-20 flex-col gap-4 md:scroll-mt-8">
          {/* Barra de controle: busca e gaveta de filtros; abaixo, os recortes rápidos com contagem. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Busca valor={busca} onMudar={mudar(setBusca)} placeholder="Buscar vaga, time ou responsável" />
              <Gaveta
                area={area}
                senioridade={senioridade}
                time={time}
                responsavel={responsavel}
                ordem={ordem}
                times={unicos("time")}
                responsaveis={unicos("responsavel")}
                onArea={mudar(setArea)}
                onSenioridade={mudar(setSenioridade)}
                onTime={mudar(setTime)}
                onResponsavel={mudar(setResponsavel)}
                onOrdem={mudar(setOrdem)}
                onLimpar={limparGaveta}
              />
            </div>
            <div role="group" aria-label="Recortes rápidos" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {RECORTES_RAPIDOS.map((r) => (
                <Chip key={r} ativo={recorte === r} n={contagem(r)} destaque={r === "pendentes"} onClick={() => escolher(r)}>
                  {NOME_RECORTE[r]}
                </Chip>
              ))}
            </div>
            {aplicados.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[12.5px] text-texto-suave">Filtrando por</span>
                {aplicados.map((a) => (
                  <Etiqueta key={a.rotulo} rotulo={a.rotulo} valor={a.valor} onTirar={a.tirar} />
                ))}
                <button
                  onClick={limparTudo}
                  className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-texto underline-offset-4 hover:underline"
                >
                  <X size={12} /> Limpar tudo
                </button>
              </div>
            )}
          </div>

          <Altura>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${recorte}-${area}-${senioridade}-${time}-${responsavel}-${ordem}-${!!termo}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.2, ease: curvaSuave }}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
                  <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-texto">{tituloLista}</h2>
                  <span className="numero text-[14px] text-texto-suave">{numero(itens.length)}</span>
                  {recorte !== "escopo" && itens.length > 1 && (
                    <span className="text-[12.5px] text-texto-suave sm:ml-auto">Ordenadas por: {NOME_ORDEM[ordem].toLowerCase()}</span>
                  )}
                </div>
                {visiveis.length === 0 ? (
                  <div className="cartao">
                    <Vazio onLimpar={limparTudo} />
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                    {visiveis.map((it, i) =>
                      it.tipo === "vaga" ? (
                        <CartaoVaga key={it.v.id} v={it.v} indice={i} />
                      ) : (
                        <CartaoEscopo key={`escopo-${it.r.id}`} r={it.r} indice={i} />
                      ),
                    )}
                  </ul>
                )}
                <Paginacao pagina={paginaSegura} porPagina={POR_PAGINA} total={itens.length} onMudar={setPagina} />
              </motion.div>
            </AnimatePresence>
          </Altura>

          {/* Encerradas não têm chip: o mesmo link abre e fecha, sem mexer na busca nem nos filtros. */}
          {(recorte === "encerradas" || encerradas > 0) && (
            <button
              onClick={() => escolher("encerradas")}
              className="self-start px-1 text-[13px] text-texto-suave underline-offset-4 hover:text-texto hover:underline"
            >
              {recorte === "encerradas" ? "Voltar às vagas abertas" : `Ver vagas encerradas (${numero(encerradas)})`}
            </button>
          )}
        </section>
      </motion.div>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------------------
// Painel executivo
// ---------------------------------------------------------------------------

/** Os quatro grandes números e, abaixo, o funil da empresa. */
function Painel({
  totais: t,
  maisPendente,
  recorte,
  onRecorte,
}: {
  totais: Totais;
  maisPendente?: Linha;
  recorte: Recorte;
  onRecorte: (r: Recorte) => void;
}) {
  return (
    <section aria-label="Visão geral da empresa" className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GrandeNumero indice={0} rotulo="Total de inscrições" n={t.inscritos} sub={`em ${numero(t.vagas)} vagas abertas`} />
        <GrandeNumero
          indice={1}
          rotulo="Triados pelo Totti"
          n={t.entrevistados}
          sub={`entrevistas feitas pela IA${t.emAndamento ? ` · ${numero(t.emAndamento)} agora` : ""}`}
        />
        <GrandeNumero
          indice={2}
          escuro
          rotulo="Aguardando sua decisão"
          n={t.pendentes}
          sub={t.pendentes ? `relatórios prontos em ${numero(t.vagasComPendentes)} ${t.vagasComPendentes === 1 ? "vaga" : "vagas"}` : "Nada esperando por você"}
          acao={maisPendente ? { href: hrefVaga(maisPendente.id, "escores"), texto: "Decidir agora" } : undefined}
        />
        <GrandeNumero
          indice={3}
          rotulo="Tempo poupado pela IA"
          n={t.horasPoupadas}
          prefixo="~"
          sufixo="h"
          sub={`de entrevistas, ~${MINUTOS_POR_TRIAGEM} min por triagem`}
        />
      </div>
      <FunilMacro totais={t} recorte={recorte} onRecorte={onRecorte} />
    </section>
  );
}

function GrandeNumero({
  indice,
  rotulo,
  n,
  sub,
  prefixo,
  sufixo,
  escuro = false,
  acao,
}: {
  indice: number;
  rotulo: string;
  n: number;
  sub: string;
  prefixo?: string;
  sufixo?: string;
  escuro?: boolean;
  acao?: { href: string; texto: string };
}) {
  const contado = Math.round(useContar(n));
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: indice * 0.06, ease: curvaSaida }}
      className={`flex min-h-[156px] flex-col gap-3 rounded-[22px] p-5 ${
        escuro ? "bg-[#1c1812] text-[#f5f0e8] shadow-[0_24px_44px_-22px_rgb(28_24_18/0.55)]" : "bg-superficie text-texto shadow-padrao"
      }`}
    >
      <span className={`flex items-center gap-2 text-[13.5px] ${escuro ? "text-[#f5f0e8]/75" : "text-texto-suave"}`}>
        {escuro && n > 0 && <span aria-hidden className="size-1.5 rounded-full bg-[#f5f0e8] anim-pulso" />}
        {rotulo}
      </span>
      <span className="titulo-display text-[44px] leading-none">
        {prefixo && <span className="text-[0.6em] opacity-60">{prefixo}</span>}
        {numero(contado)}
        {sufixo && <span className="ml-1 text-[0.55em] opacity-70">{sufixo}</span>}
      </span>
      <span className={`mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 text-[12.5px] ${escuro ? "text-[#f5f0e8]/70" : "text-texto-suave"}`}>
        <span>{sub}</span>
        {acao && (
          <Link href={acao.href} className="group/acao flex items-center gap-1 text-[13px] font-medium text-[#f5f0e8] sublinha">
            {acao.texto} <ArrowRight size={13} className="transition-transform group-hover/acao:translate-x-0.5" />
          </Link>
        )}
      </span>
    </motion.div>
  );
}

/**
 * O funil agregado da empresa, em quatro etapas. A barra de cada uma é a fatia dos inscritos;
 * clicar numa etapa filtra a lista pelas vagas que têm gente nela.
 */
function FunilMacro({ totais: t, recorte, onRecorte }: { totais: Totais; recorte: Recorte; onRecorte: (r: Recorte) => void }) {
  const etapas: { nome: string; n: number; recorte: Recorte; dica: string }[] = [
    { nome: "Inscritos", n: t.inscritos, recorte: "todas", dica: "Todas as vagas abertas" },
    { nome: "Convidados", n: t.convidados, recorte: "em_entrevista", dica: "Vagas em entrevista" },
    { nome: "Entrevistados pela IA", n: t.entrevistados, recorte: "com_relatorios", dica: "Vagas com entrevistas feitas" },
    { nome: "Em decisão", n: t.pendentes, recorte: "pendentes", dica: "Vagas com decisão pendente" },
  ];
  return (
    <motion.nav
      aria-label="Funil da empresa"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 0.24, ease: curvaSaida }}
      className="flex flex-col gap-1 rounded-[22px] bg-superficie p-2 shadow-padrao"
    >
      <span className="flex items-center justify-between gap-3 px-3 pt-2 pb-1">
        <span className="font-display text-[15px] font-semibold tracking-[-0.015em] text-texto">Funil da empresa</span>
        <span className="hidden text-[12px] text-texto-suave sm:block">Clique numa etapa para filtrar as vagas</span>
      </span>
      <ol className="grid grid-cols-2 gap-1 md:grid-cols-4">
        {etapas.map((e, i) => {
          // "Inscritos" é o funil inteiro: não fica marcado, senão parece filtro ligado.
          const ativa = recorte === e.recorte && e.recorte !== "todas";
          const largura = t.inscritos ? Math.max(1.5, (e.n / t.inscritos) * 100) : 0;
          return (
            <li key={e.nome} className="relative flex">
              <button
                onClick={() => onRecorte(e.recorte)}
                aria-pressed={ativa}
                title={e.dica}
                className={`group flex w-full flex-col gap-2 rounded-[16px] px-3 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-texto/30 ${
                  ativa ? "bg-[#1c1812] text-[#f5f0e8]" : "text-texto hover:bg-superficie-2/60"
                }`}
              >
                <span className={`flex items-center gap-1.5 text-[12.5px] ${ativa ? "text-[#f5f0e8]/75" : "text-texto-suave"}`}>
                  <span className="font-mono text-[11px] opacity-70">{i + 1}</span>
                  {e.nome}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="titulo-display text-[26px] leading-none">{numero(e.n)}</span>
                  <span className={`numero text-[12.5px] ${ativa ? "text-[#f5f0e8]/70" : "text-texto-suave"}`}>
                    {i === 0 ? "100%" : porcento(e.n, t.inscritos)}
                  </span>
                </span>
                <span aria-hidden className={`h-1 overflow-hidden rounded-full ${ativa ? "bg-[#f5f0e8]/15" : "bg-superficie-2"}`}>
                  <motion.span
                    className={`block h-full rounded-full ${ativa ? "bg-[#f5f0e8]" : "bg-texto"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${largura}%` }}
                    transition={{ duration: 1.1, delay: 0.3 + i * 0.08, ease: curvaSaida }}
                  />
                </span>
              </button>
              {i < etapas.length - 1 && (
                <ChevronRight
                  aria-hidden
                  size={14}
                  className="pointer-events-none absolute top-1/2 -right-[11px] z-10 hidden -translate-y-1/2 text-texto-suave/60 md:block"
                />
              )}
            </li>
          );
        })}
      </ol>
    </motion.nav>
  );
}

/**
 * Entrevistas acontecendo agora, lidas do funil (`emAndamento`): um palco escuro por vaga, com o ponto
 * pulsando e as barras de voz. Sem entrevista em andamento, a faixa não aparece.
 */
function AoVivo({ linhas }: { linhas: Linha[] }) {
  if (linhas.length === 0) return null;
  return (
    <section aria-label="Entrevistas ao vivo" className="grid auto-rows-fr grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {linhas.slice(0, 3).map((v, i) => (
        <motion.div
          key={v.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: i * 0.06, ease: curvaSaida }}
          className="h-full"
        >
          <Link
            href={hrefVaga(v.id, "entrevistas")}
            className="flex h-full min-h-[176px] flex-col gap-3.5 rounded-[22px] bg-[#13110e] p-[18px] text-[#f5f0e8] transition-transform duration-[240ms] hover:-translate-y-0.5"
          >
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] whitespace-nowrap text-[#f5f0e8]/70">
                <span aria-hidden className="size-2 rounded-full bg-[#f5f0e8] anim-pulso" style={{ animationDelay: `${i * 0.5}s` }} />
                Ao vivo
              </span>
              <span className="font-mono text-[13px] whitespace-nowrap">{numero(v.funil.emAndamento)} em andamento</span>
            </span>
            {/* Título em até 2 linhas, sempre com a altura de 2: cartões do mesmo tamanho com qualquer cargo */}
            <span className="flex flex-col">
              <span className="line-clamp-2 min-h-[2lh] font-semibold" title={v.cargo}>{v.cargo}</span>
              <span className="text-[13px] text-[#f5f0e8]/70">
                {[v.time, NOME_SENIORIDADE_VAGA[v.senioridade]].filter((x) => x && x !== "—").join(" · ")}
              </span>
            </span>
            <BarrasDeVoz n={7} altura={20} largura={3} className="mt-auto text-[#f5f0e8]" />
          </Link>
        </motion.div>
      ))}
    </section>
  );
}

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia." : h < 18 ? "Boa tarde." : "Boa noite.";
};
const dataDeHoje = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

function Vazio({ onLimpar }: { onLimpar: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-12">
      <p className="text-[15px] text-texto">Nenhuma vaga por aqui.</p>
      <button onClick={onLimpar} className="text-[13.5px] text-texto-suave underline underline-offset-4 hover:text-texto">
        Limpar filtros e ver todas as vagas
      </button>
    </div>
  );
}

/** Entrada de um card da lista: sobe 4px e aparece, um logo depois do outro (no máximo ~0,2s de espera). */
const entradaCard = (i: number) =>
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

// ---------------------------------------------------------------------------
// Cards da lista
// ---------------------------------------------------------------------------

const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

const classeCard =
  "group flex h-full flex-col gap-4 rounded-[20px] bg-superficie p-5 shadow-padrao transition-[transform,box-shadow] duration-[240ms] ease-saida outline-none hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgb(28_24_18/0.06),0_24px_44px_-22px_rgb(28_24_18/0.4)] focus-visible:ring-2 focus-visible:ring-texto/30";

/** O atalho do card: leva direto para onde a vaga pede atenção. */
function acaoDa(v: Linha): { href: string; texto: string } {
  const f = v.funil;
  const novos = novosDa(v);
  if (v.estagio === "encerrada") return { href: hrefVaga(v.id, "escores"), texto: "Ver resultados" };
  // O número já está no alerta ao lado: aqui só o verbo.
  if (novos > 0) return { href: hrefVaga(v.id, "escores"), texto: novos === 1 ? "Ver e decidir" : `Ver os ${numero(novos)}` };
  if (f.emAndamento > 0) return { href: hrefVaga(v.id, "entrevistas"), texto: "Ver entrevistas em andamento" };
  if (f.concluiram > 0) return { href: hrefVaga(v.id, "escores"), texto: "Ver relatórios" };
  return { href: hrefVaga(v.id, "entrevistas"), texto: "Ver candidatos" };
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-superficie-2/80 px-2 py-0.5 text-[11.5px] text-texto-suave">{children}</span>;
}

function CartaoVaga({ v, indice }: { v: Linha; indice: number }) {
  const f = v.funil;
  const novos = novosDa(v);
  const acao = acaoDa(v);
  const alto = f.inscritos >= ALTO_VOLUME;
  const meta = [v.time, v.responsavel].filter((x) => x && x !== "—").join(" · ");
  const aberta = v.estagio === "encerrada" ? `Encerrada ${quandoFoi(v.encerradaHaDias ?? 0)}` : `Aberta ${quandoFoi(v.abertaHaDias)}`;

  // Micro-funil dos convidados: entrevistados (tinta cheia), fazendo agora (meia tinta) e esperando a vez (traço leve).
  const aguardando = Math.max(0, f.convidados - f.concluiram - f.emAndamento);
  const fatia = (n: number) => (f.convidados ? (n / f.convidados) * 100 : 0);
  const atraso = 0.1 + Math.min(indice, 8) * 0.04;

  return (
    <motion.li {...entradaCard(indice)} className="h-full">
      <Link href={acao.href} className={classeCard}>
        <span className="flex items-start justify-between gap-3">
          <span className="flex flex-wrap gap-1">
            <Tag>{NOME_SENIORIDADE_VAGA[v.senioridade]}</Tag>
            <Tag>{NOME_AREA_VAGA[v.area]}</Tag>
            {v.resumo && <Tag>{NOME_FORMATO_CURTO[v.resumo.formato]}</Tag>}
          </span>
          <span
            className={`numero shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap ${
              alto ? "bg-texto text-texto-claro" : "bg-superficie-2 text-texto"
            }`}
          >
            {plural(f.inscritos, "inscrito", "inscritos")}
          </span>
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display line-clamp-2 text-[18px] leading-snug font-semibold tracking-[-0.015em] text-texto" title={v.cargo}>
            {v.cargo}
          </span>
          <span className="truncate text-[12.5px] text-texto-suave">{[meta, aberta].filter(Boolean).join(" · ")}</span>
        </span>

        {f.inscritos === 0 ? (
          <span className="text-[12.5px] text-texto-suave">Link pronto · nenhum inscrito ainda</span>
        ) : f.convidados > 0 ? (
          <span className="flex flex-col gap-1.5">
            <span aria-hidden className="flex h-[5px] overflow-hidden rounded-full bg-superficie-2">
              <motion.span
                className="h-full bg-texto"
                initial={{ width: 0 }}
                animate={{ width: `${fatia(f.concluiram)}%` }}
                transition={{ duration: 0.9, delay: atraso, ease: curvaSaida }}
              />
              <motion.span
                className="h-full bg-texto/45"
                initial={{ width: 0 }}
                animate={{ width: `${fatia(f.emAndamento)}%` }}
                transition={{ duration: 0.9, delay: atraso + 0.05, ease: curvaSaida }}
              />
              <motion.span
                className="h-full bg-texto/15"
                initial={{ width: 0 }}
                animate={{ width: `${fatia(aguardando)}%` }}
                transition={{ duration: 0.9, delay: atraso + 0.1, ease: curvaSaida }}
              />
            </span>
            <span className="numero flex flex-wrap gap-x-3 text-[12px] text-texto-suave">
              <span>
                <span className="text-texto">{numero(f.concluiram)}</span> triados
              </span>
              {f.emAndamento > 0 && <span>{numero(f.emAndamento)} agora</span>}
              {aguardando > 0 && <span>{numero(aguardando)} aguardando entrevista</span>}
            </span>
          </span>
        ) : (
          <span className="text-[12.5px] text-texto-suave">Convites saindo para os inscritos</span>
        )}

        <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {novos > 0 ? (
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-texto">
              <span aria-hidden className="size-1.5 rounded-full bg-texto" />
              {plural(novos, "relatório pronto", "relatórios prontos")} para decidir
            </span>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1 text-[13.5px] font-medium text-texto">
            <span className="sublinha">{acao.texto}</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </span>
      </Link>
    </motion.li>
  );
}

/** Um escopo ainda com o Totti: leva de volta para a conversa. O X, no canto, descarta. */
function CartaoEscopo({ r, indice }: { r: RascunhoVaga; indice: number }) {
  return (
    <motion.li {...entradaCard(indice)} className="group/escopo relative h-full">
      <Link href={hrefRascunho(r.id)} className={classeCard}>
        <span className="flex flex-wrap gap-1 pr-8">
          <span className="rotulo-destaque">Em definição</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display line-clamp-2 text-[18px] leading-snug font-semibold tracking-[-0.015em] text-texto" title={r.cargo}>
            {r.cargo}
          </span>
          <span className="truncate text-[12.5px] text-texto-suave">
            {situacaoDoRascunho(r)} · criada {quandoFoi(diasDoRascunho(r))}
          </span>
        </span>
        <span className="mt-auto flex items-center justify-end gap-1 text-[13.5px] font-medium text-texto">
          <span className="sublinha">{r.sessaoId ? "Continuar com o Totti" : "Começar com o Totti"}</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      <button
        onClick={() => descartarRascunho(r.id)}
        aria-label={`Descartar o escopo ${r.cargo}`}
        title="Descartar escopo"
        className="absolute top-4 right-4 flex size-7 items-center justify-center rounded-full text-texto-suave opacity-0 transition-[opacity,color,background-color] group-hover/escopo:opacity-100 hover:bg-superficie-2 hover:text-perigo focus-visible:opacity-100"
      >
        <X size={13} />
      </button>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Gaveta de filtros
// ---------------------------------------------------------------------------

/** O botão "Filtros" (com o número de filtros ligados) e o painel: ordem, área, senioridade, time e responsável. */
function Gaveta({
  area,
  senioridade,
  time,
  responsavel,
  ordem,
  times,
  responsaveis,
  onArea,
  onSenioridade,
  onTime,
  onResponsavel,
  onOrdem,
  onLimpar,
}: {
  area: Area | "";
  senioridade: Senioridade | "";
  time: string;
  responsavel: string;
  ordem: OrdemVagas;
  times: string[];
  responsaveis: string[];
  onArea: (v: Area | "") => void;
  onSenioridade: (v: Senioridade | "") => void;
  onTime: (v: string) => void;
  onResponsavel: (v: string) => void;
  onOrdem: (v: OrdemVagas) => void;
  onLimpar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  const ativos = [area, senioridade, time, responsavel].filter(Boolean).length;

  return (
    <Popover
      aberto={aberto}
      onFechar={fechar}
      gatilho={
        <button
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] transition-colors ${
            ativos ? "bg-texto text-texto-claro" : "bg-superficie-2/70 text-texto hover:bg-superficie-2"
          }`}
        >
          <SlidersHorizontal size={14} strokeWidth={1.75} />
          Filtros e ordem
          {ativos > 0 && <span className="numero rounded-full bg-texto-claro/20 px-1.5 text-[11.5px]">{ativos}</span>}
        </button>
      }
    >
      <Grupo titulo="Ordenar por">
        {ORDENS.map((o) => (
          <Pilula key={o} ativa={ordem === o} onClick={() => onOrdem(o)}>
            {NOME_ORDEM[o]}
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
      <Grupo titulo="Senioridade">
        {(Object.keys(NOME_SENIORIDADE_VAGA) as Senioridade[]).map((s) => (
          <Pilula key={s} ativa={senioridade === s} onClick={() => onSenioridade(senioridade === s ? "" : s)}>
            {NOME_SENIORIDADE_VAGA[s]}
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
          onClick={onLimpar}
          className="self-start text-[12.5px] text-texto-suave underline underline-offset-4 hover:text-texto"
        >
          Limpar filtros ({ativos})
        </button>
      )}
    </Popover>
  );
}
