"use client";

// A página de uma vaga publicada (/vagas/vaga?id=...&etapa=plano|entrevistas|escores), dentro do menu.
// Feita para escala (uma vaga de júnior pode ter 70 mil inscritos): nada de lista solta.
//   Candidatos → o funil (Inscritos · Convidados · Fazendo agora · Relatório pronto) é o filtro principal;
//                embaixo, busca por nome ou e-mail, filtros, ordenação, páginas e convite em lote.
//   Escores    → só quem concluiu, com o lugar do escore reservado (o escore ainda vai ser construído).
//   Plano      → o que foi combinado com o Totti, o que ele aprendeu com o time e o link de convite.
//   Contratações → (só em vaga que contratou) o ciclo dos 90 dias: como foi cada contratação.
// Em Candidatos e Escores, as entrevistas feitas de verdade pelo link vêm antes, com o relatório.
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronRight, Link2, X } from "lucide-react";
import { NOME_AREA } from "@/components/pre-entrevista/textos";
import {
  NOME_AREA_VAGA,
  NOME_ETAPA,
  NOME_FORMATO_VAGA,
  NOME_SENIORIDADE_VAGA,
  etapasDa,
  marcarRecente,
  numero,
  quandoFoi,
  situacaoDa,
  useVagas,
  type EtapaVaga,
  type VagaEmpresa,
} from "@/lib/vagas/workspace";
import {
  CIDADES,
  NOME_SITUACAO,
  buscaNormalizada,
  convidar,
  ehCandidatoTeste,
  useCandidatos,
  type CandidatoVaga,
  type Situacao,
} from "@/lib/vagas/candidatos";
import {
  NOME_ANDAMENTO,
  NOME_RECOMENDACAO,
  andamentoDa,
  comReais,
  useEntrevistasReais,
  type EntrevistaReal,
} from "@/lib/vagas/entrevistas";
import { curvaSuave } from "@/lib/design/motion";
import AprendidoNoPlano from "./AprendidoNoPlano";
import Casca from "./Casca";
import Contratacoes from "./Contratacoes";
import { Abas, Busca, Paginacao, Seletor, Voltar } from "./controles";
import ResultadosDaVaga from "./ResultadosDaVaga";

const POR_PAGINA = 50;
/** Limite de candidatos por pedido em /api/convites. */
const LOTE_CONVITES = 200;

type Resultado = { email: string; status: "enviado" | "simulado" | "erro"; motivo?: string; link?: string };

/** O que aparece no aviso depois de convidar. */
type Retorno = {
  enviados: number;
  demo: number;
  simulados: { nome: string; email: string; link?: string }[];
  erros: { email: string; motivo?: string }[];
  falha?: string;
};

export default function PaginaVaga({ id, etapa }: { id: string; etapa: EtapaVaga }) {
  const { vagas } = useVagas();
  const vaga = vagas?.find((v) => v.id === id);
  useEffect(() => {
    if (vaga) marcarRecente(vaga.id);
  }, [vaga]);

  return (
    <Casca vagaAtual={id} etapaAtual={etapa}>
      {vagas !== null && !vaga && (
        <div className="flex flex-col items-start gap-4">
          <Voltar href="/vagas">Todas as vagas</Voltar>
          <p className="titulo-display text-[32px] text-texto">Não encontrei essa vaga.</p>
        </div>
      )}
      {vaga && <Conteudo key={vaga.id} vaga={vaga} etapa={etapa} />}
    </Casca>
  );
}

function Conteudo({ vaga, etapa }: { vaga: VagaEmpresa; etapa: EtapaVaga }) {
  const meta = [NOME_AREA_VAGA[vaga.area], NOME_SENIORIDADE_VAGA[vaga.senioridade], vaga.time, vaga.local]
    .filter((x) => x && x !== "—")
    .join(" · ");
  const href = (e: EtapaVaga) => `/vagas/vaga?id=${encodeURIComponent(vaga.id)}&etapa=${e}`;
  const todasReais = useEntrevistasReais();
  const reais = vaga.resumo ? (todasReais?.[vaga.resumo.configId] ?? []) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: curvaSuave }}
      className="mx-auto flex max-w-[1120px] flex-col gap-10"
    >
      <header className="flex flex-col gap-4">
        <Voltar href="/vagas">Todas as vagas</Voltar>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex min-w-0 flex-col gap-3">
            <span className="rotulo text-texto-suave">{meta}</span>
            <h1 className="titulo-display text-[34px] text-texto md:text-[40px]">{vaga.cargo}</h1>
            <p className="text-[14px] text-texto-suave">
              Aberta {quandoFoi(vaga.abertaHaDias)} · {situacaoDa({ ...vaga, funil: comReais(vaga.funil, reais) })} · Responsável:{" "}
              {vaga.responsavel}
            </p>
          </div>
          {vaga.etapa !== "encerrada" && <CopiarLink vaga={vaga} />}
        </div>
        <nav
          className="mt-3 flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full bg-superficie-2/70 p-1 [scrollbar-width:none]"
          aria-label="Etapas da vaga"
        >
          {etapasDa(vaga).map((e) => (
            <Link
              key={e}
              href={href(e)}
              aria-current={e === etapa ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors sm:px-4 sm:text-[13.5px] ${
                e === etapa ? "bg-superficie text-texto shadow-[0_1px_3px_rgb(17_17_17/0.1)]" : "text-texto-suave hover:text-texto"
              }`}
            >
              {NOME_ETAPA[e]}
            </Link>
          ))}
        </nav>
      </header>

      {etapa === "plano" && <Plano vaga={vaga} />}
      {etapa === "entrevistas" && reais.length > 0 && <EntrevistasReais reais={reais} />}
      {etapa === "escores" && reais.length > 0 && <ResultadosDaVaga reais={reais} />}
      {etapa === "entrevistas" && <Candidatos key="candidatos" vaga={vaga} modo="candidatos" href={href} temReais={reais.length > 0} />}
      {etapa === "escores" && <Candidatos key="escores" vaga={vaga} modo="escores" href={href} temReais={reais.length > 0} />}
      {etapa === "contratacoes" && <Contratacoes vaga={vaga} />}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Candidatos e escores: a mesma tabela, com filtros diferentes.
// ---------------------------------------------------------------------------

type Etapa = "todos" | "aguardando" | "convidados" | "em_andamento" | "concluiu";
type Ordem = "recentes" | "antigos" | "az" | "escore";

const NA_ETAPA: Record<Etapa, (c: CandidatoVaga) => boolean> = {
  todos: () => true,
  aguardando: (c) => c.situacao === "inscrito",
  convidados: (c) => c.situacao !== "inscrito",
  em_andamento: (c) => c.situacao === "em_andamento",
  concluiu: (c) => c.situacao === "concluiu",
};

function Candidatos({
  vaga,
  modo,
  href,
  temReais,
}: {
  vaga: VagaEmpresa;
  modo: "candidatos" | "escores";
  href: (e: EtapaVaga) => string;
  temReais: boolean;
}) {
  const lista = useCandidatos(vaga.id, vaga.funil);
  const escores = modo === "escores";

  const [etapa, setEtapa] = useState<Etapa>(escores ? "concluiu" : vaga.funil.novos > 0 ? "concluiu" : "todos");
  const [soNovos, setSoNovos] = useState(escores && vaga.funil.novos > 0);
  const [busca, setBusca] = useState("");
  const termo = useDeferredValue(buscaNormalizada(busca.trim()));
  const [cidade, setCidade] = useState("");
  const [periodo, setPeriodo] = useState<"" | "1" | "7" | "30">("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [pagina, setPagina] = useState(0);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno | null>(null);

  const contagem = useMemo(() => {
    const n = { todos: 0, aguardando: 0, convidados: 0, em_andamento: 0, concluiu: 0, novos: 0 };
    for (const c of lista ?? []) {
      n.todos++;
      if (c.situacao === "inscrito") n.aguardando++;
      else n.convidados++;
      if (c.situacao === "em_andamento") n.em_andamento++;
      if (c.situacao === "concluiu") n.concluiu++;
      if (c.novo) n.novos++;
    }
    return n;
  }, [lista]);

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const naEtapa = NA_ETAPA[etapa];
    const dias = periodo ? Number(periodo) : Infinity;
    const l = lista.filter(
      (c) =>
        naEtapa(c) &&
        (!soNovos || c.novo) &&
        (!cidade || c.cidade === cidade) &&
        c.haDias <= dias &&
        (!termo || buscaNormalizada(`${c.nome} ${c.email}`).includes(termo)),
    );
    if (ordem === "az") return l.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (ordem === "antigos") return l.sort((a, b) => b.haDias - a.haDias || a.i - b.i);
    return l.sort((a, b) => a.haDias - b.haDias || a.i - b.i);
  }, [lista, etapa, soNovos, cidade, periodo, termo, ordem]);

  const paginaSegura = Math.min(pagina, Math.max(0, Math.ceil(filtrados.length / POR_PAGINA) - 1));
  const visiveis = filtrados.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);
  const mudar = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setPagina(0);
  };

  // Seleção para convidar em lote: só faz sentido para quem ainda aguarda convite.
  const aguardandoNaPagina = visiveis.filter((c) => c.situacao === "inscrito");
  const aguardandoNoFiltro = filtrados.filter((c) => c.situacao === "inscrito");
  const todaPaginaMarcada = aguardandoNaPagina.length > 0 && aguardandoNaPagina.every((c) => selecionados.has(c.i));
  const marcar = (i: number) =>
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(i)) novo.delete(i);
      else novo.add(i);
      return novo;
    });
  const marcarPagina = () =>
    setSelecionados((s) => {
      const novo = new Set(s);
      for (const c of aguardandoNaPagina) {
        if (todaPaginaMarcada) novo.delete(c.i);
        else novo.add(c.i);
      }
      return novo;
    });
  const enviarConvites = async () => {
    const escolhidos = (lista ?? []).filter((c) => selecionados.has(c.i));
    // Vaga sem plano salvo: não há formato nem config para o email, então só registra aqui.
    if (!vaga.resumo) {
      convidar(vaga.id, escolhidos.map((c) => c.i));
      setSelecionados(new Set());
      return;
    }
    const plano = vaga.resumo;

    setEnviando(true);
    const novo: Retorno = { enviados: 0, demo: 0, simulados: [], erros: [] };
    try {
      // Em lotes, um por vez: cada lote que chega já vira convite registrado e sai da seleção.
      for (let ini = 0; ini < escolhidos.length; ini += LOTE_CONVITES) {
        const lote = escolhidos.slice(ini, ini + LOTE_CONVITES);
        const res = await fetch("/api/convites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vagaId: vaga.id,
            cargo: vaga.cargo,
            configId: plano.configId,
            formato: plano.formato,
            duracaoMin: plano.duracaoMin,
            candidatos: lote.map((c) => ({ nome: c.nome, email: c.email })),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { resultados } = (await res.json()) as { resultados: Resultado[] };

        const porEmail = new Map(lote.map((c) => [c.email.toLowerCase(), c]));
        const registrar: number[] = [];
        for (const r of resultados) {
          const c = porEmail.get(r.email);
          if (!c) continue;
          if (r.status === "erro") {
            novo.erros.push({ email: r.email, motivo: r.motivo });
            continue;
          }
          registrar.push(c.i);
          if (r.status === "enviado") novo.enviados++;
          else if (ehCandidatoTeste(c)) novo.simulados.push({ nome: c.nome, email: c.email, link: r.link });
          else novo.demo++;
        }
        convidar(vaga.id, registrar);
        setSelecionados((s) => {
          const resto = new Set(s);
          for (const c of lote) resto.delete(c.i);
          return resto;
        });
      }
    } catch {
      // Sem resposta: o que não saiu continua selecionado, para tentar de novo.
      novo.falha = "Não foi possível enviar. Os convites que não saíram continuam selecionados; tente de novo.";
    }
    setRetorno(novo);
    setEnviando(false);
  };

  if (lista === null) {
    return <p className="py-10 text-[14px] text-texto-suave">Carregando {numero(vaga.funil.inscritos)} inscritos…</p>;
  }

  if (lista.length === 0) {
    // Vaga nova: as entrevistas feitas pelo link já aparecem acima; aqui fica só o link para mandar mais.
    if (temReais) return <LinkCandidatos vaga={vaga} />;
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="titulo-display text-[28px] text-texto">Ninguém se inscreveu ainda.</p>
          <p className="text-[15px] text-texto-suave">Publique a vaga ou mande o link. Cada entrevista feita vira um relatório aqui.</p>
        </div>
        <LinkCandidatos vaga={vaga} destaque />
      </section>
    );
  }

  const podeConvidar = !escores && vaga.etapa !== "encerrada";

  return (
    <>
      {/* 1º: o funil, que também é o filtro */}
      {escores ? (
        <div className="flex flex-col gap-4">
          <p className="max-w-2xl text-[14px] leading-relaxed text-texto-suave">
            O escore de cada entrevista aparece aqui quando o relatório fica pronto. Por enquanto, a lista mostra quem já
            concluiu, para você filtrar e encontrar alguém.
          </p>
          <div>
            <Abas
              abas={[
                { id: "novos", nome: "Relatórios novos", n: contagem.novos, destaque: true },
                { id: "todos", nome: "Todos que concluíram", n: contagem.concluiu },
              ]}
              atual={soNovos ? "novos" : "todos"}
              onMudar={mudar((a: string) => setSoNovos(a === "novos"))}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              ["todos", "Inscritos", contagem.todos, `${numero(contagem.aguardando)} aguardando convite`],
              ["convidados", "Convidados", contagem.convidados, `${pct(contagem.convidados, contagem.todos)} dos inscritos`],
              ["em_andamento", "Fazendo agora", contagem.em_andamento, "entrevistas em curso"],
              ["concluiu", "Relatório pronto", contagem.concluiu, contagem.novos ? `+${numero(contagem.novos)} novos` : "nenhum novo"],
            ] as const
          ).map(([id, rotulo, n, apoio]) => {
            const ativo = etapa === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setEtapa(id);
                  setSoNovos(false);
                  setPagina(0);
                }}
                aria-pressed={ativo}
                className={`relative flex flex-col items-start gap-1.5 rounded-[18px] p-5 text-left transition-[background-color,color,transform] duration-200 active:scale-[0.99] ${
                  ativo ? "bg-texto text-texto-claro" : "cartao text-texto hover:bg-superficie/70"
                }`}
              >
                <span className={`text-[13.5px] ${ativo ? "text-texto-claro/75" : "text-texto-suave"}`}>{rotulo}</span>
                <span className={`titulo-display pt-2 text-[34px] leading-none ${n === 0 ? "opacity-40" : ""}`}>{numero(n)}</span>
                <span
                  className={`text-[12px] ${
                    id === "concluiu" && contagem.novos ? "font-medium" : ativo ? "text-texto-claro/60" : "text-texto-suave/80"
                  }`}
                >
                  {apoio}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2º: busca e filtros */}
      <section className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <Busca valor={busca} onMudar={mudar(setBusca)} placeholder="Buscar por nome ou e-mail" />
          <div className="flex flex-wrap items-center gap-2 sm:ml-4">
            {!escores && etapa === "todos" && (
              <button
                onClick={() => mudar(setEtapa)("aguardando")}
                className="h-8 rounded-full bg-superficie-2/70 px-3.5 text-[13px] text-texto hover:bg-superficie-2"
              >
                Só quem aguarda convite
              </button>
            )}
            {!escores && etapa === "aguardando" && (
              <button
                onClick={() => mudar(setEtapa)("todos")}
                className="h-8 rounded-full bg-texto px-3.5 text-[13px] text-texto-claro"
              >
                Aguardando convite ×
              </button>
            )}
            <Seletor rotulo="Cidade" valor={cidade} onMudar={mudar(setCidade)} opcoes={CIDADES.map((c) => ({ valor: c, nome: c }))} todos="Todas" />
            <Seletor
              rotulo={escores ? "Concluiu" : "Última mudança"}
              valor={periodo}
              onMudar={mudar(setPeriodo)}
              todos="Qualquer data"
              opcoes={[
                { valor: "1", nome: "Últimas 24 h" },
                { valor: "7", nome: "Últimos 7 dias" },
                { valor: "30", nome: "Últimos 30 dias" },
              ]}
            />
          </div>
          <div className="ml-auto">
            <Seletor<Ordem>
              rotulo="Ordenar"
              valor={ordem}
              todos={null}
              onMudar={(v) => setOrdem((v || "recentes") as Ordem)}
              opcoes={[
                { valor: "recentes", nome: "Mais recentes" },
                { valor: "antigos", nome: "Mais antigos" },
                { valor: "az", nome: "Nome (A–Z)" },
                { valor: "escore", nome: "Escore (em breve)", desativado: true },
              ]}
            />
          </div>
        </div>

        {/* Barra do convite em lote */}
        <AnimatePresence>
          {selecionados.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: curvaSuave }}
              className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-texto px-5 py-2.5 text-[13.5px] text-texto-claro"
            >
              <span className="numero">{numero(selecionados.size)} selecionados</span>
              {aguardandoNoFiltro.length > selecionados.size && (
                <button
                  onClick={() => setSelecionados(new Set(aguardandoNoFiltro.map((c) => c.i)))}
                  className="text-texto-claro/75 underline underline-offset-4 hover:text-texto-claro"
                >
                  Selecionar todos os {numero(aguardandoNoFiltro.length)} deste filtro
                </button>
              )}
              <span className="ml-auto flex items-center gap-3">
                <button onClick={() => setSelecionados(new Set())} className="text-texto-claro/75 hover:text-texto-claro">
                  Limpar
                </button>
                <button
                  onClick={enviarConvites}
                  disabled={enviando}
                  className="rounded-full bg-texto-claro px-3.5 py-1.5 font-medium text-texto hover:opacity-90 disabled:opacity-60"
                >
                  {enviando ? "Enviando…" : "Convidar para a entrevista"}
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Aviso do último envio: some quando o recrutador fecha */}
        <AnimatePresence>
          {retorno && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: curvaSuave }}
              role="status"
              className="cartao mb-3 flex flex-col gap-3 p-5 text-[14px]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  {retorno.enviados > 0 && (
                    <p className="text-texto">
                      <span className="numero">{numero(retorno.enviados)}</span>{" "}
                      {retorno.enviados === 1 ? "e-mail enviado" : "e-mails enviados"}
                    </p>
                  )}
                  {retorno.demo > 0 && (
                    <p className="text-texto-suave">
                      {numero(retorno.demo)} {retorno.demo === 1 ? "convite registrado" : "convites registrados"} para candidatos
                      de demonstração (sem envio)
                    </p>
                  )}
                  {retorno.falha && <p className="text-perigo">{retorno.falha}</p>}
                </div>
                <button onClick={() => setRetorno(null)} aria-label="Fechar aviso" className="text-texto-suave hover:text-texto">
                  <X size={16} />
                </button>
              </div>
              {retorno.simulados.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-texto-suave">Envio simulado: falta RESEND_API_KEY no .env.local</p>
                  <ul className="flex flex-col gap-1.5">
                    {retorno.simulados.map((s) => (
                      <li key={s.email} className="flex flex-wrap items-center gap-x-3 text-texto">
                        <span>{s.nome}</span>
                        {s.link && (
                          <a
                            href={s.link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-texto-suave underline decoration-texto/25 underline-offset-4 hover:text-texto hover:decoration-texto"
                          >
                            abrir link de agendamento
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {retorno.erros.length > 0 && (
                <ul className="flex flex-col gap-1 text-perigo">
                  {retorno.erros.map((e) => (
                    <li key={e.email}>
                      {e.email}: {e.motivo ?? "falha no envio"}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="cartao overflow-hidden">
        <div
          className={`hidden gap-5 px-5 pt-4 pb-2 md:grid ${
            podeConvidar ? "grid-cols-[20px_minmax(0,1fr)_150px_150px_110px_100px]" : "grid-cols-[minmax(0,1fr)_150px_150px_110px_100px]"
          }`}
        >
          {podeConvidar && (
            <input
              type="checkbox"
              checked={todaPaginaMarcada}
              onChange={marcarPagina}
              disabled={aguardandoNaPagina.length === 0}
              aria-label="Selecionar quem aguarda convite nesta página"
              className="size-3.5 accent-[var(--texto)]"
            />
          )}
          {["Candidato", "Cidade", "Situação", escores ? "Concluiu" : "Última mudança", escores ? "Escore" : ""].map((t, i) => (
            <span key={i} className={`rotulo text-texto-suave ${i >= 3 ? "text-right" : ""}`}>
              {t}
            </span>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <p className="px-5 py-12 text-[15px] text-texto">Ninguém com esses filtros.</p>
        ) : (
          <ul className="pb-1.5">
            {visiveis.map((c) => (
              <li
                key={c.i}
                className={`linha-lista mx-2 grid items-center gap-x-5 gap-y-1 rounded-xl px-3 py-3 ${
                  podeConvidar
                    ? "grid-cols-[20px_minmax(0,1fr)_auto] md:grid-cols-[20px_minmax(0,1fr)_150px_150px_110px_100px]"
                    : "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_150px_150px_110px_100px]"
                } ${selecionados.has(c.i) ? "bg-superficie-2/60" : ""}`}
              >
                {podeConvidar && (
                  <input
                    type="checkbox"
                    checked={selecionados.has(c.i)}
                    onChange={() => marcar(c.i)}
                    disabled={c.situacao !== "inscrito"}
                    aria-label={`Selecionar ${c.nome}`}
                    className="size-3.5 accent-[var(--texto)] disabled:opacity-20"
                  />
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14.5px] text-texto">
                    {c.nome}
                    {c.novo && <span className="rotulo rotulo-destaque ml-2">Novo</span>}
                  </span>
                  <span className="truncate text-[12.5px] text-texto-suave">{c.email}</span>
                </div>
                <span className="hidden truncate text-[13px] text-texto-suave md:block">{c.cidade}</span>
                <Selo s={c.situacao} />
                <span className="numero hidden text-right text-[13px] text-texto-suave md:block">{quandoFoi(c.haDias)}</span>
                <span className="hidden text-right md:block">
                  {escores ? (
                    <span className="text-[15px] text-texto-suave/40" aria-label="Escore ainda não disponível">
                      —
                    </span>
                  ) : (
                    c.situacao === "concluiu" && (
                      <Link
                        href={href("escores")}
                        className="inline-flex items-center gap-1 text-[13px] text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto"
                      >
                        Escore <ArrowRight size={13} />
                      </Link>
                    )
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        </div>
        <Paginacao pagina={paginaSegura} porPagina={POR_PAGINA} total={filtrados.length} onMudar={setPagina} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Entrevistas feitas pelo link: as sessões reais desta vaga, com o relatório quando fica pronto.
// ---------------------------------------------------------------------------

function EntrevistasReais({ reais }: { reais: EntrevistaReal[] }) {
  const prontas = reais.filter((e) => andamentoDa(e) === "pronto").length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-texto">Entrevistas feitas pelo link</h2>
        <span className="numero text-[13px] text-texto-suave">
          {numero(reais.length)} {reais.length === 1 ? "entrevista" : "entrevistas"} · {numero(prontas)}{" "}
          {prontas === 1 ? "relatório pronto" : "relatórios prontos"}
        </span>
      </div>
      <ul className="cartao overflow-hidden py-1.5">
        {reais.map((e) => {
          const a = andamentoDa(e);
          return (
            <li
              key={e.sessionId}
              className="linha-lista mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 rounded-xl px-3 py-3 md:grid-cols-[minmax(0,1fr)_170px_150px_110px]"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[14.5px] text-texto">
                  {e.candidato ?? `Candidato ${e.sessionId.slice(0, 6)}`}
                  {a === "pronto" && <span className="rotulo rotulo-destaque ml-2">Novo</span>}
                </span>
                <span className="numero truncate text-[12.5px] text-texto-suave">
                  {new Date(e.startedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <span className={`justify-self-end text-[13px] md:justify-self-start ${a === "pronto" ? "text-texto" : "text-texto-suave"}`}>
                {(a === "fazendo" || a === "gerando") && (
                  <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-sucesso align-middle" />
                )}
                {NOME_ANDAMENTO[a]}
              </span>
              <span className="hidden text-[13px] text-texto md:block">
                {e.recommendation ? (
                  <>
                    {NOME_RECOMENDACAO[e.recommendation]}
                    {e.overallScore !== undefined && (
                      <span className="numero text-texto-suave"> · {e.overallScore.toFixed(1)}/4</span>
                    )}
                  </>
                ) : (
                  <span className="text-texto-suave/40">—</span>
                )}
              </span>
              <span className="hidden text-right md:block">
                {e.ended && (
                  <Link
                    href={e.href}
                    className="inline-flex items-center gap-1 text-[13px] text-texto underline decoration-texto/25 underline-offset-4 hover:decoration-texto"
                  >
                    Relatório <ArrowRight size={13} />
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

function Selo({ s }: { s: Situacao }) {
  return (
    <span className={`justify-self-end text-[13px] md:justify-self-start ${s === "concluiu" ? "text-texto" : "text-texto-suave"}`}>
      {s === "em_andamento" && <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-sucesso align-middle" />}
      {NOME_SITUACAO[s]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Plano combinado: formato, duração, o que pesa, o link e a descrição.
// ---------------------------------------------------------------------------

function Plano({ vaga }: { vaga: VagaEmpresa }) {
  const r = vaga.resumo;
  if (!r) return <p className="text-[15px] text-texto-suave">O plano desta vaga não foi salvo.</p>;
  const foco = [...r.foco].sort((a, b) => b.peso - a.peso);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Formato", NOME_FORMATO_VAGA[r.formato]],
          ["Duração", `${r.duracaoMin} min`],
          ...(r.criterios ? [["Critérios", String(r.criterios)]] : []),
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="cartao flex flex-col gap-2 p-5">
            <dt className="rotulo text-texto-suave">{rotulo}</dt>
            <dd className="titulo-display text-[24px] text-texto">{valor}</dd>
          </div>
        ))}
      </dl>

      <section className="cartao flex flex-col gap-4 p-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-texto">O que pesa na avaliação</h2>
        {foco.map((f) => (
          <div key={f.area} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-texto">{NOME_AREA[f.area]}</span>
              <span className="numero text-[13px] text-texto-suave">{Math.round(f.peso * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2">
              <motion.div
                className="h-1.5 rounded-full bg-texto"
                initial={{ width: 0 }}
                animate={{ width: `${f.peso * 100}%` }}
                transition={{ duration: 0.7, ease: curvaSuave }}
              />
            </div>
          </div>
        ))}
      </section>

      {vaga.etapa !== "encerrada" && <AprendidoNoPlano formato={r.formato} />}

      {vaga.etapa !== "encerrada" && (
        <section className="cartao flex flex-col gap-3 p-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-texto">Link para os candidatos</h2>
          <LinkCandidatos vaga={vaga} />
        </section>
      )}

      {vaga.descricao && (
        <details className="cartao group px-5">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[14px] text-texto-suave transition-colors hover:text-texto">
            Descrição da vaga
            <ChevronRight size={14} className="transition-transform duration-200 group-open:rotate-90" />
          </summary>
          <p className="max-h-96 overflow-y-auto pb-5 text-[14px] leading-relaxed whitespace-pre-wrap text-texto-suave">
            {vaga.descricao}
          </p>
        </details>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function useLink(vaga: VagaEmpresa) {
  const [origem, setOrigem] = useState("");
  useEffect(() => setOrigem(window.location.origin), []);
  const r = vaga.resumo;
  if (!r) return null;
  // Mesmo caminho da pré-entrevista: "Antes de começar" com a vaga, depois a entrevista com a mesma config.
  const rota = `/?config=${encodeURIComponent(r.configId)}`;
  return { rota, link: `${origem}${rota}` };
}

function useCopiar() {
  const [copiado, setCopiado] = useState(false);
  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sem permissão para a área de transferência: o link continua visível na aba Plano.
    }
  }
  return { copiado, copiar };
}

/** Atalho no topo da vaga: copiar o link de convite sem sair da etapa atual. */
function CopiarLink({ vaga }: { vaga: VagaEmpresa }) {
  const l = useLink(vaga);
  const { copiado, copiar } = useCopiar();
  if (!l) return null;
  return (
    <button
      onClick={() => copiar(l.link)}
      className="flex items-center gap-1.5 rounded-full bg-texto px-4 py-2 text-[13.5px] font-medium text-texto-claro transition-opacity hover:opacity-85"
    >
      <Link2 size={14} />
      {copiado ? "Link copiado" : "Copiar link de convite"}
    </button>
  );
}

function LinkCandidatos({ vaga, destaque }: { vaga: VagaEmpresa; destaque?: boolean }) {
  const l = useLink(vaga);
  const { copiado, copiar } = useCopiar();
  if (!l) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center gap-3 rounded-2xl py-1.5 pr-1.5 pl-4 ${destaque ? "cartao" : "bg-superficie-2/60"}`}>
        <span className="flex-1 truncate font-mono text-[12.5px] text-texto">{l.link}</span>
        <button
          onClick={() => copiar(l.link)}
          className={`shrink-0 rounded-full px-3.5 py-2 text-[13.5px] transition-[opacity,background-color,color] duration-150 ${
            destaque
              ? "bg-texto font-medium text-texto-claro hover:opacity-85"
              : "bg-superficie text-texto shadow-[0_1px_3px_rgb(17_17_17/0.1)] hover:bg-texto hover:text-texto-claro"
          }`}
        >
          {copiado ? "Copiado" : "Copiar link"}
        </button>
      </div>
      <a href={l.rota} className="flex items-center gap-1 self-start text-[13px] text-texto-suave transition-colors hover:text-texto">
        Ver como o candidato vê <ArrowUpRight size={13} />
      </a>
    </div>
  );
}
