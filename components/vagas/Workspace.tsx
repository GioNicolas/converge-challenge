"use client";

// A tela inicial da recrutadora. A pergunta que ela responde é "o que eu tenho que fazer agora?":
//   1. Cabeçalho: saudação e, numa linha, como estão as vagas (sem cartões de número).
//   2. Como funciona: os três passos (você cria, o Totti entrevista, você decide). Some quando a pessoa dispensa.
//   3. Esperando por você: as vagas com relatório pronto e os planos parados com o Totti, cada um com o botão.
//   4. A lista: abas por estado, busca e gaveta de filtros; cada vaga numa linha com o estado escrito por extenso
//      e o atalho para onde ela pede atenção. Por padrão, quem pede decisão vem primeiro.
// Os convites saem sozinhos ao publicar, então não há estágio de "enviar convites".
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowRight, SlidersHorizontal, X } from "lucide-react";
import {
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
import type { InterviewConfig } from "@/lib/contracts";
import { buscaNormalizada, comConvites, useConvitesFeitos } from "@/lib/vagas/candidatos";
import { comReais, useEntrevistasReais } from "@/lib/vagas/entrevistas";
import { curvaSaida, curvaSuave } from "@/lib/design/motion";
import TituloRevelado from "@/components/totti/TituloRevelado";
import Casca from "./Casca";
import { Busca, Chip, Etiqueta, Grupo, Paginacao, Pilula, Popover } from "./controles";

type Linha = VagaEmpresa & { estagio: ReturnType<typeof estagioDa> };
type Item = { tipo: "vaga"; v: Linha } | { tipo: "escopo"; r: RascunhoVaga };
type Formato = InterviewConfig["mode"];

const POR_PAGINA = 12;
// Quem tem relatório esperando decisão sobe para o topo: é o que a recrutadora veio fazer.
const ORDEM_PADRAO: OrdemVagas = "pendentes";
const CHAVE_COMO_FUNCIONA = "converge.como-funciona-dispensado.v1";

const hrefVaga = (id: string, etapa: "escores" | "entrevistas") => `/vagas/vaga?id=${encodeURIComponent(id)}&etapa=${etapa}`;
const hrefRascunho = (id: string) => `/vagas/nova?rascunho=${encodeURIComponent(id)}`;
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

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
  const [formato, setFormato] = useState<Formato | "">("");
  const [time, setTime] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [ordem, setOrdem] = useState<OrdemVagas>(ORDEM_PADRAO);

  const temFiltro = !!(area || senioridade || formato || time || responsavel);

  // Busca e gaveta valem para tudo; a aba escolhe a fatia por cima disso.
  const base = useMemo(
    () =>
      linhas.filter(
        (v) =>
          (!area || v.area === area) &&
          (!senioridade || v.senioridade === senioridade) &&
          (!formato || v.resumo?.formato === formato) &&
          (!time || v.time === time) &&
          (!responsavel || v.responsavel === responsavel) &&
          (!termo || buscaNormalizada(`${v.cargo} ${v.time} ${v.responsavel} ${NOME_AREA_VAGA[v.area]}`).includes(termo)),
      ),
    [linhas, area, senioridade, formato, time, responsavel, termo],
  );
  // Escopos não têm área, senioridade, formato, time nem responsável: com esses filtros ligados, eles saem da lista.
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
    // Vindo de cima ("Esperando por você"), a página desce até a lista.
    if (rolar)
      rolagem.current = setTimeout(() => {
        const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        lista.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
      }, 120);
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
    setFormato("");
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

  // Os filtros aplicados, à vista: cada um sai no próprio X. A aba não entra aqui: ela já aparece marcada.
  const aplicados: { rotulo: string; valor: string; tirar: () => void }[] = [
    ...(busca.trim() ? [{ rotulo: "Busca", valor: busca.trim(), tirar: () => setBusca("") }] : []),
    ...(area ? [{ rotulo: "Área", valor: NOME_AREA_VAGA[area], tirar: () => mudar(setArea)("") }] : []),
    ...(senioridade
      ? [{ rotulo: "Senioridade", valor: NOME_SENIORIDADE_VAGA[senioridade], tirar: () => mudar(setSenioridade)("") }]
      : []),
    ...(formato ? [{ rotulo: "Formato", valor: NOME_FORMATO_CURTO[formato], tirar: () => mudar(setFormato)("") }] : []),
    ...(time ? [{ rotulo: "Time", valor: time, tirar: () => mudar(setTime)("") }] : []),
    ...(responsavel ? [{ rotulo: "Responsável", valor: responsavel, tirar: () => mudar(setResponsavel)("") }] : []),
  ];
  // Aba fora das quatro (link antigo ou "Ver vagas encerradas"): mostra o nome dela e um X para voltar.
  const recorteAvulso = !(RECORTES_RAPIDOS as readonly string[]).includes(recorte);

  return (
    // "user": com reduzir movimento ligado no sistema, o motion tira os deslizes; a altura da lista é tratada em Altura.
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: curvaSuave }}
        className="mx-auto flex max-w-[1040px] flex-col gap-10"
      >
        <Cabecalho totais={totais} />

        <ComoFunciona />

        <EsperandoPorVoce linhas={linhas} rascunhos={rascunhos} onVerTodas={() => escolher("pendentes", true)} />

        <section ref={lista} aria-labelledby="titulo-lista" className="flex scroll-mt-20 flex-col gap-4 md:scroll-mt-8">
          <div className="flex flex-col gap-1 px-1">
            <h2 id="titulo-lista" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-texto">
              Suas vagas
            </h2>
            <p className="text-[14px] text-texto-suave">Cada vaga mostra em que pé está e o próximo passo.</p>
          </div>

          {/* Barra de controle: abas por estado à esquerda; busca e gaveta de filtros à direita. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div role="group" aria-label="Estado das vagas" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0">
                {RECORTES_RAPIDOS.map((r) => (
                  <Chip key={r} ativo={recorte === r} n={contagem(r)} destaque={r === "pendentes"} onClick={() => escolher(r)}>
                    {NOME_RECORTE[r]}
                  </Chip>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Busca valor={busca} onMudar={mudar(setBusca)} placeholder="Buscar vaga, time ou responsável" />
                <Gaveta
                  area={area}
                  senioridade={senioridade}
                  formato={formato}
                  time={time}
                  responsavel={responsavel}
                  ordem={ordem}
                  times={unicos("time")}
                  responsaveis={unicos("responsavel")}
                  onArea={mudar(setArea)}
                  onSenioridade={mudar(setSenioridade)}
                  onFormato={mudar(setFormato)}
                  onTime={mudar(setTime)}
                  onResponsavel={mudar(setResponsavel)}
                  onOrdem={mudar(setOrdem)}
                  onLimpar={limparGaveta}
                />
              </div>
            </div>
            {(aplicados.length > 0 || recorteAvulso) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[12.5px] text-texto-suave">Filtrando por</span>
                {recorteAvulso && <Etiqueta rotulo="Vagas" valor={NOME_RECORTE[recorte]} onTirar={() => escolher("todas")} />}
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
                key={`${recorte}-${area}-${senioridade}-${formato}-${time}-${responsavel}-${ordem}-${!!termo}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.2, ease: curvaSuave }}
                className="flex flex-col gap-4"
              >
                {visiveis.length === 0 ? (
                  <div className="cartao">
                    <Vazio onLimpar={limparTudo} />
                  </div>
                ) : (
                  <ul className="cartao flex flex-col overflow-hidden">
                    {visiveis.map((it, i) =>
                      it.tipo === "vaga" ? (
                        <LinhaVaga key={it.v.id} v={it.v} indice={i} />
                      ) : (
                        <LinhaEscopo key={`escopo-${it.r.id}`} r={it.r} indice={i} />
                      ),
                    )}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  {recorte !== "escopo" && itens.length > 1 ? (
                    <span className="text-[12.5px] text-texto-suave">Ordenadas por: {NOME_ORDEM[ordem].toLowerCase()}</span>
                  ) : (
                    <span />
                  )}
                  <Paginacao pagina={paginaSegura} porPagina={POR_PAGINA} total={itens.length} onMudar={setPagina} />
                </div>
              </motion.div>
            </AnimatePresence>
          </Altura>

          {/* Encerradas não têm aba: o mesmo link abre e fecha, sem mexer na busca nem nos filtros. */}
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
// Topo: cabeçalho, como funciona e o que espera pela recrutadora
// ---------------------------------------------------------------------------

/** Saudação e o estado geral numa frase: os números viram texto, não cartões. */
function Cabecalho({ totais: t }: { totais: Totais }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] text-texto-suave first-letter:uppercase">{dataDeHoje()}</span>
        <h1 className="titulo-display text-[44px] text-texto">
          <TituloRevelado texto={saudacao()} />
        </h1>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-texto-suave">
        <span>
          <span className="numero text-texto">{numero(t.vagas)}</span> {t.vagas === 1 ? "vaga aberta" : "vagas abertas"}
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="numero text-texto">{numero(t.inscritos)}</span> inscritos
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="numero text-texto">{numero(t.entrevistados)}</span> já entrevistados pelo Totti
        </span>
        {t.emAndamento > 0 && (
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-superficie px-2.5 py-0.5 text-[13px] text-texto shadow-padrao">
            <span aria-hidden className="size-1.5 rounded-full bg-texto anim-pulso" />
            {plural(t.emAndamento, "entrevista agora", "entrevistas agora")}
          </span>
        )}
      </p>
    </header>
  );
}

const PASSOS_COMO_FUNCIONA = [
  { quem: "Você", titulo: "Cria a vaga", texto: "Cola a descrição e combina o plano da entrevista com o Totti." },
  { quem: "Totti", titulo: "Entrevista os inscritos", texto: "Convida todo mundo e conduz cada entrevista técnica por voz." },
  { quem: "Você", titulo: "Decide", texto: "Lê os relatórios com nota e evidência e escolhe quem segue." },
];

/** Os três passos do produto, para quem chega e não sabe por onde começar. Dispensado, não volta. */
function ComoFunciona() {
  // null até ler o navegador: assim a faixa não pisca para quem já dispensou.
  const [dispensado, setDispensado] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setDispensado(localStorage.getItem(CHAVE_COMO_FUNCIONA) === "1");
    } catch {
      setDispensado(false);
    }
  }, []);
  const dispensar = () => {
    setDispensado(true);
    try {
      localStorage.setItem(CHAVE_COMO_FUNCIONA, "1");
    } catch {}
  };

  return (
    <AnimatePresence initial={false}>
      {dispensado === false && (
        <motion.section
          aria-label="Como funciona"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: curvaSuave }}
          className="overflow-hidden"
        >
          <div className="relative rounded-[20px] bg-superficie-2/60 p-5 md:p-6">
            <button
              onClick={dispensar}
              aria-label="Dispensar o como funciona"
              title="Entendi, não mostrar de novo"
              className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-superficie hover:text-texto"
            >
              <X size={15} />
            </button>
            <span className="text-[13px] text-texto-suave">Como funciona</span>
            <ol className="mt-3 grid gap-5 md:grid-cols-3 md:gap-6">
              {PASSOS_COMO_FUNCIONA.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span
                    aria-hidden
                    className={`numero flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-medium ${
                      p.quem === "Você" ? "bg-texto text-texto-claro" : "bg-superficie text-texto shadow-padrao"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-medium text-texto">
                      <span className="text-texto-suave">{p.quem}</span> {p.titulo.toLowerCase()}
                    </span>
                    <span className="text-[13.5px] leading-[1.45] text-texto-suave">{p.texto}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

type Tarefa = { id: string; cargo: string; texto: string; href: string; acao: string };

const MAX_TAREFAS = 4;

/**
 * O que está parado esperando a recrutadora: relatórios prontos para decidir (os maiores primeiro)
 * e planos que ela começou com o Totti e não terminou. Sem nada, diz que está tudo em dia.
 */
function EsperandoPorVoce({
  linhas,
  rascunhos,
  onVerTodas,
}: {
  linhas: Linha[];
  rascunhos: RascunhoVaga[];
  onVerTodas: () => void;
}) {
  const pendentes = linhas.filter((v) => novosDa(v) > 0).sort((a, b) => novosDa(b) - novosDa(a));
  const tarefas: Tarefa[] = [
    ...pendentes.map((v) => ({
      id: v.id,
      cargo: v.cargo,
      texto: `${plural(novosDa(v), "relatório pronto", "relatórios prontos")} para você decidir`,
      href: hrefVaga(v.id, "escores"),
      acao: "Decidir",
    })),
    ...rascunhos.map((r) => ({
      id: `escopo-${r.id}`,
      cargo: r.cargo,
      texto: "O plano da entrevista está esperando você terminar com o Totti",
      href: hrefRascunho(r.id),
      acao: "Continuar",
    })),
  ];
  // Um plano parado com o Totti sempre aparece, mesmo com muitas decisões na fila: sem ele, a vaga não anda.
  const decisoes = tarefas.filter((t) => !t.id.startsWith("escopo-"));
  const planos = tarefas.filter((t) => t.id.startsWith("escopo-"));
  const visiveis = [...decisoes.slice(0, planos.length ? MAX_TAREFAS - 1 : MAX_TAREFAS), ...planos].slice(0, MAX_TAREFAS);
  const restantes = pendentes.length - visiveis.filter((t) => !t.id.startsWith("escopo-")).length;

  return (
    <section aria-labelledby="titulo-esperando" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 px-1">
        <h2 id="titulo-esperando" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-texto">
          Esperando por você
        </h2>
        <p className="text-[14px] text-texto-suave">
          {tarefas.length === 0
            ? "Tudo em dia. Quando um relatório ficar pronto, ele aparece aqui."
            : "O resto o Totti cuida sozinho: convites, agenda e entrevistas."}
        </p>
      </div>
      {visiveis.length > 0 && (
        <ul className="cartao flex flex-col overflow-hidden">
          {visiveis.map((t, i) => (
            <motion.li
              key={t.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: 0.1 + i * 0.05, ease: curvaSaida }}
              className="linha-lista"
            >
              <Link
                href={t.href}
                className="group flex items-center gap-4 px-5 py-4 transition-colors outline-none hover:bg-superficie-2/40 focus-visible:bg-superficie-2/60"
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-texto" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-[15px] font-medium text-texto" title={t.cargo}>
                    {t.cargo}
                  </span>
                  <span className="text-[13px] text-texto-suave">{t.texto}</span>
                </span>
                <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-texto px-4 text-[13.5px] font-medium text-texto-claro transition-transform group-hover:-translate-y-px">
                  {t.acao}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.li>
          ))}
          {restantes > 0 && (
            <li className="linha-lista">
              <button
                onClick={onVerTodas}
                className="flex w-full items-center gap-1.5 px-5 py-3.5 text-left text-[13.5px] text-texto-suave transition-colors hover:bg-superficie-2/40 hover:text-texto"
              >
                Mais {plural(restantes, "vaga com relatório pronto", "vagas com relatório pronto")}
                <ArrowRight size={13} />
              </button>
            </li>
          )}
        </ul>
      )}
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

// ---------------------------------------------------------------------------
// Linhas da lista
// ---------------------------------------------------------------------------

const classeLinha =
  "group grid items-center gap-x-6 gap-y-3 px-5 py-4 transition-colors outline-none hover:bg-superficie-2/40 focus-visible:bg-superficie-2/60 md:grid-cols-[minmax(0,1fr)_230px_130px]";

type Estado = { texto: string; tom: "acao" | "ativo" | "calmo" };

/** O estado da vaga por extenso: o que está acontecendo nela agora, do ponto de vista da recrutadora. */
function estadoDa(v: Linha): Estado {
  const f = v.funil;
  const novos = novosDa(v);
  if (v.estagio === "encerrada") return { texto: `Encerrada ${quandoFoi(v.encerradaHaDias ?? 0)}`, tom: "calmo" };
  if (novos > 0) return { texto: "Precisa da sua decisão", tom: "acao" };
  if (f.emAndamento > 0) return { texto: "Totti entrevistando agora", tom: "ativo" };
  if (f.inscritos === 0) return { texto: "Esperando inscritos", tom: "calmo" };
  if (f.convidados === 0) return { texto: "Convites saindo", tom: "ativo" };
  if (f.concluiram >= f.convidados) return { texto: "Entrevistas concluídas", tom: "calmo" };
  return { texto: "Candidatos agendando", tom: "ativo" };
}

function SeloEstado({ estado }: { estado: Estado }) {
  // Sem pílula: a cor do texto e o ponto bastam para separar o que pede ação do que só está andando.
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start text-[12.5px] ${
        estado.tom === "acao" ? "font-medium text-texto" : "text-texto-suave"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          estado.tom === "acao" ? "bg-texto" : estado.tom === "ativo" ? "bg-texto/60 anim-pulso" : "bg-texto/25"
        }`}
      />
      {estado.texto}
    </span>
  );
}

/** O atalho da linha: leva direto para onde a vaga pede atenção. */
function acaoDa(v: Linha): { href: string; texto: string } {
  const f = v.funil;
  const novos = novosDa(v);
  if (v.estagio === "encerrada") return { href: hrefVaga(v.id, "escores"), texto: "Ver resultados" };
  if (novos > 0) return { href: hrefVaga(v.id, "escores"), texto: novos === 1 ? "Decidir" : `Decidir ${numero(novos)}` };
  if (f.emAndamento > 0) return { href: hrefVaga(v.id, "entrevistas"), texto: "Acompanhar" };
  if (f.concluiram > 0) return { href: hrefVaga(v.id, "escores"), texto: "Ver relatórios" };
  return { href: hrefVaga(v.id, "entrevistas"), texto: "Ver candidatos" };
}

function LinhaVaga({ v, indice }: { v: Linha; indice: number }) {
  const f = v.funil;
  const acao = acaoDa(v);
  const estado = estadoDa(v);
  const meta = [
    v.time && v.time !== "—" ? v.time : null,
    NOME_SENIORIDADE_VAGA[v.senioridade],
    v.resumo ? NOME_FORMATO_CURTO[v.resumo.formato] : null,
    v.estagio === "encerrada" ? null : `aberta ${quandoFoi(v.abertaHaDias)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const fatia = f.inscritos ? Math.max(f.concluiram ? 2 : 0, (f.concluiram / f.inscritos) * 100) : 0;

  return (
    <motion.li {...entradaLinha(indice)} className="linha-lista">
      <Link href={acao.href} className={classeLinha}>
        <span className="flex min-w-0 flex-col gap-1.5">
          <SeloEstado estado={estado} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15.5px] font-medium tracking-[-0.01em] text-texto" title={v.cargo}>
              {v.cargo}
            </span>
            <span className="truncate text-[12.5px] text-texto-suave">{meta}</span>
          </span>
        </span>

        {/* Quanto do volume o Totti já entrevistou: um número que se lê sozinho e uma barra fina. */}
        <span className="flex flex-col gap-1.5">
          {f.inscritos === 0 ? (
            <span className="text-[12.5px] text-texto-suave">Link pronto, sem inscritos</span>
          ) : (
            <>
              <span className="numero text-[12.5px] text-texto-suave">
                <span className="text-texto">{numero(f.concluiram)}</span> de {numero(f.inscritos)} entrevistados
              </span>
              <span aria-hidden className="h-1 overflow-hidden rounded-full bg-superficie-2">
                <motion.span
                  className="block h-full rounded-full bg-texto"
                  initial={{ width: 0 }}
                  animate={{ width: `${fatia}%` }}
                  transition={{ duration: 0.9, delay: 0.1 + Math.min(indice, 8) * 0.04, ease: curvaSaida }}
                />
              </span>
            </>
          )}
        </span>

        <span className="flex items-center gap-1 text-[13.5px] font-medium text-texto md:justify-end">
          <span className="sublinha">{acao.texto}</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </motion.li>
  );
}

/** Um escopo ainda com o Totti: leva de volta para a conversa. O X, no fim da linha, descarta. */
function LinhaEscopo({ r, indice }: { r: RascunhoVaga; indice: number }) {
  return (
    <motion.li {...entradaLinha(indice)} className="linha-lista group/escopo relative">
      <Link href={hrefRascunho(r.id)} className={classeLinha}>
        <span className="flex min-w-0 flex-col gap-1.5">
          <SeloEstado estado={{ texto: "Em definição com o Totti", tom: "calmo" }} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15.5px] font-medium tracking-[-0.01em] text-texto" title={r.cargo}>
              {r.cargo}
            </span>
            <span className="truncate text-[12.5px] text-texto-suave">
              {situacaoDoRascunho(r)} · criada {quandoFoi(diasDoRascunho(r))}
            </span>
          </span>
        </span>
        <span className="text-[12.5px] text-texto-suave">Ainda não publicada</span>
        <span className="flex items-center gap-1 pr-8 text-[13.5px] font-medium text-texto md:justify-end">
          <span className="sublinha">{r.sessaoId ? "Continuar" : "Começar"}</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      <button
        onClick={() => descartarRascunho(r.id)}
        aria-label={`Descartar o escopo ${r.cargo}`}
        title="Descartar escopo"
        className="absolute right-3 bottom-4 flex size-7 items-center justify-center rounded-full text-texto-suave opacity-0 transition-[opacity,color,background-color] group-hover/escopo:opacity-100 hover:bg-superficie-2 hover:text-perigo focus-visible:opacity-100 md:top-1/2 md:bottom-auto md:-translate-y-1/2"
      >
        <X size={13} />
      </button>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Gaveta de filtros
// ---------------------------------------------------------------------------

/** O botão "Filtros" (com o número de filtros ligados) e o painel: ordem, área, senioridade, formato, time e responsável. */
function Gaveta({
  area,
  senioridade,
  formato,
  time,
  responsavel,
  ordem,
  times,
  responsaveis,
  onArea,
  onSenioridade,
  onFormato,
  onTime,
  onResponsavel,
  onOrdem,
  onLimpar,
}: {
  area: Area | "";
  senioridade: Senioridade | "";
  formato: Formato | "";
  time: string;
  responsavel: string;
  ordem: OrdemVagas;
  times: string[];
  responsaveis: string[];
  onArea: (v: Area | "") => void;
  onSenioridade: (v: Senioridade | "") => void;
  onFormato: (v: Formato | "") => void;
  onTime: (v: string) => void;
  onResponsavel: (v: string) => void;
  onOrdem: (v: OrdemVagas) => void;
  onLimpar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  const ativos = [area, senioridade, formato, time, responsavel].filter(Boolean).length;

  return (
    <Popover
      aberto={aberto}
      onFechar={fechar}
      gatilho={
        <button
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-label="Filtros e ordem"
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] transition-colors ${
            ativos ? "bg-texto text-texto-claro" : "bg-superficie-2/70 text-texto hover:bg-superficie-2"
          }`}
        >
          <SlidersHorizontal size={14} strokeWidth={1.75} />
          Filtros
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
      <Grupo titulo="Formato">
        {(Object.keys(NOME_FORMATO_CURTO) as Formato[]).map((m) => (
          <Pilula key={m} ativa={formato === m} onClick={() => onFormato(formato === m ? "" : m)}>
            {NOME_FORMATO_CURTO[m]}
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
