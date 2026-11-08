"use client";

// "O que o Totti aprendeu": a Memória Viva da Squad à vista do time.
// Cada regra só vale na vaga de onde veio, então a tela é de uma vaga por vez: o seletor no topo (e ?vaga= na URL)
// escolhe qual. Sem escolha, abre na mais recente.
//   1. Concordância Totti × Tech Lead: o número da vaga escolhida e a série de todas as vagas (clicar troca a vaga).
//   2. As regras que o Totti aprendeu nesta vaga, cada uma com a decisão de onde veio. Dá para editar, desligar e apagar.
//   3. O que o guarda-corpo ignorou nesta vaga: motivo não técnico nunca vira regra, mas fica visível.
//   4. (só em desenvolvimento) Simular o Tech Lead decidindo no Slack nesta vaga, pelo mesmo caminho do clique de verdade.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Check, Pencil, ShieldOff, Trash2, X } from "lucide-react";
import type { ConcordanciaVaga, EfeitoRegra, MotivoIgnorado, OrigemRegra, RegraSquad } from "@/lib/squad-memory/tipos";
import type { VisaoMemoria } from "@/lib/squad-memory/visao";
import { curvaSuave } from "@/lib/design/motion";
import Casca from "./Casca";

const MODO_DEV = process.env.NODE_ENV !== "production";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** De onde veio. A vaga não entra: a tela inteira já é de uma vaga. */
function textoDaOrigem(o: OrigemRegra): string {
  switch (o.tipo) {
    case "reprovacao":
      return `Da reprovação de ${o.candidato}`;
    case "aprovacao":
      return `Da aprovação de ${o.candidato}`;
    case "ajuste_plano":
      return "De um ajuste no plano";
    case "resultado_90_dias":
      return `De ${o.candidato} aos 90 dias (${o.deuCerto ? "deu certo" : "não deu certo"})`;
  }
}

type OpcaoVaga = { id: string; titulo: string };

/** A vaga do card de demo do Slack: o simulador ensina nela quando a memória ainda não tem vaga nenhuma. */
const VAGA_DA_DEMO: OpcaoVaga = { id: "demo-backend-pleno", titulo: "Backend Pleno" };

/**
 * As vagas que têm algo na memória, da mais recente para a mais antiga: primeiro as com decisões (na ordem da
 * concordância), depois as que só têm regra ou motivo ignorado (sem decisão, o nome é o id).
 */
function vagasDaMemoria(m: VisaoMemoria): OpcaoVaga[] {
  const comDecisao = [...m.concordancia.porVaga].reverse().map((v) => ({ id: v.vagaId, titulo: v.vagaTitulo }));
  const vistos = new Set(comDecisao.map((v) => v.id));
  const soComRegra: OpcaoVaga[] = [];
  for (const { origem } of [...m.regras, ...m.ignorados]) {
    if (vistos.has(origem.vagaId)) continue;
    vistos.add(origem.vagaId);
    soComRegra.push({ id: origem.vagaId, titulo: m.vagas[origem.vagaId] ?? origem.vagaId });
  }
  return [...comDecisao, ...soComRegra];
}

/** Qual vaga a tela mostra. A primeira é a mais recente, marcada como atual. */
function SeletorVaga({ opcoes, escolhida, onEscolher }: { opcoes: OpcaoVaga[]; escolhida: string; onEscolher: (id: string) => void }) {
  return (
    <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="rotulo text-texto-suave">Vaga</span>
      <div className="flex flex-wrap gap-0.5 rounded-full bg-superficie-2/70 p-1" role="radiogroup" aria-label="Vaga">
        {opcoes.map((v, i) => {
          const ativa = v.id === escolhida;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={ativa}
              onClick={() => onEscolher(v.id)}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors ${
                ativa ? "bg-superficie font-medium text-texto shadow-[0_1px_2px_rgb(17_17_17/0.08)]" : "text-texto-suave hover:text-texto"
              }`}
            >
              {v.titulo}
              {i === 0 && opcoes.length > 1 && <span className="ml-1.5 text-[11.5px] font-normal text-texto-suave">atual</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Aprendizado() {
  const [memoria, setMemoria] = useState<VisaoMemoria | null>(null);
  const [erro, setErro] = useState(false);
  /** Regras que acabaram de chegar pela simulação: ganham destaque na lista. */
  const [novas, setNovas] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/squad-memory", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setMemoria(await r.json());
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const trocarRegra = (regra: RegraSquad) =>
    setMemoria((m) => (m ? { ...m, regras: m.regras.map((r) => (r.id === regra.id ? regra : r)) } : m));
  const tirarRegra = (id: string) => setMemoria((m) => (m ? { ...m, regras: m.regras.filter((r) => r.id !== id) } : m));

  // A vaga escolhida (?vaga= na URL, para os links da vaga e dos 90 dias abrirem já nela). Sem escolha: a mais recente.
  const [pedida, setPedida] = useState<string | null>(null);
  useEffect(() => setPedida(new URLSearchParams(window.location.search).get("vaga")), []);
  const opcoes = memoria ? vagasDaMemoria(memoria) : [];
  const vaga = opcoes.find((v) => v.id === pedida) ?? opcoes[0];
  const escolher = (id: string) => {
    setPedida(id);
    const url = new URL(window.location.href);
    url.searchParams.set("vaga", id);
    window.history.replaceState(null, "", url);
  };

  const regras = memoria?.regras.filter((r) => r.origem.vagaId === vaga?.id) ?? [];
  const ignorados = memoria?.ignorados.filter((i) => i.origem.vagaId === vaga?.id) ?? [];
  const ativas = regras.filter((r) => r.ativa).length;

  return (
    <Casca>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: curvaSuave }}
        className="mx-auto flex max-w-[1120px] flex-col gap-10"
      >
        <header className="flex flex-col gap-2">
          <span className="rotulo text-texto-suave">Memória da squad</span>
          <h1 className="titulo-display text-[34px] text-texto sm:text-[40px]">O que o Totti aprendeu</h1>
          <p className="max-w-[640px] text-[15px] leading-relaxed text-texto-suave">
            Cada vez que o Tech Lead aprova ou reprova alguém no Slack, o Totti aprende um critério técnico deste time e usa nas
            próximas entrevistas daquela vaga. Nada fica escondido: edite, desligue ou apague o que quiser.
          </p>
        </header>

        {erro && !memoria && (
          <div className="cartao flex items-center justify-between gap-4 p-5 text-[14px] text-texto">
            Não consegui carregar a memória do time.
            <button onClick={() => void carregar()} className="rounded-full bg-texto px-4 py-1.5 text-[13px] text-texto-claro">
              Tentar de novo
            </button>
          </div>
        )}

        {!memoria && !erro && <Esqueleto />}

        {memoria && (
          <>
            {vaga && <SeletorVaga opcoes={opcoes} escolhida={vaga.id} onEscolher={escolher} />}

            <Concordancia porVaga={memoria.concordancia.porVaga} vagaId={vaga?.id} onEscolher={escolher} />

            {MODO_DEV && (
              <Simulador
                vaga={vaga ?? VAGA_DA_DEMO}
                onAprendeu={(nova, ids) => {
                  setMemoria(nova);
                  setNovas(new Set(ids));
                }}
              />
            )}

            <Secao
              titulo="Critérios aprendidos nesta vaga"
              detalhe={regras.length ? `${ativas} de ${regras.length} ${regras.length === 1 ? "ligado" : "ligados"}` : undefined}
              apoio={`Valem só nas entrevistas de ${vaga?.titulo ?? "cada vaga"}. Os ligados entram no plano e na avaliação das próximas entrevistas, marcados como critério aprendido com o time.`}
            >
              {regras.length === 0 ? (
                <div className="cartao p-6 text-[14px] text-texto-suave">
                  Ainda nada nesta vaga. Quando o Tech Lead escrever o motivo de uma decisão no Slack, o Totti guarda aqui o
                  critério técnico.
                </div>
              ) : (
                <ul className="cartao overflow-hidden py-1">
                  <AnimatePresence initial={false}>
                    {regras.map((r) => (
                      <LinhaRegra
                        key={r.id}
                        regra={r}
                        nova={novas.has(r.id)}
                        criterios={memoria.criterios}
                        onMudou={trocarRegra}
                        onApagou={tirarRegra}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Secao>

            <Secao
              titulo="O que o Totti ignorou"
              detalhe={ignorados.length ? String(ignorados.length) : undefined}
              apoio="Motivo que não é técnico nunca vira regra. Fica registrado aqui para o time ver o que foi descartado e por quê."
            >
              {ignorados.length === 0 ? (
                <div className="cartao p-6 text-[14px] text-texto-suave">Nenhum motivo descartado nesta vaga.</div>
              ) : (
                <ul className="cartao overflow-hidden py-1">
                  {ignorados.map((m) => (
                    <LinhaIgnorado key={m.id} item={m} />
                  ))}
                </ul>
              )}
            </Secao>
          </>
        )}
      </motion.div>
    </Casca>
  );
}

function Secao({ titulo, detalhe, apoio, children }: { titulo: string; detalhe?: string; apoio: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-1">
        <h2 className="flex items-baseline gap-2 text-[20px] font-semibold tracking-[-0.025em] text-texto">
          {titulo}
          {detalhe && <span className="numero text-[14px] font-normal tracking-normal text-texto-suave">{detalhe}</span>}
        </h2>
        <p className="max-w-[640px] text-[13.5px] text-texto-suave">{apoio}</p>
      </div>
      {children}
    </section>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="cartao h-[280px] animate-pulse" />
      <div className="cartao h-[220px] animate-pulse" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Concordância
// ---------------------------------------------------------------------------

function Concordancia({
  porVaga,
  vagaId,
  onEscolher,
}: {
  porVaga: ConcordanciaVaga[];
  vagaId: string | undefined;
  onEscolher: (id: string) => void;
}) {
  const comNumero = porVaga.filter((v) => v.pct !== null);
  // O número grande é o da vaga escolhida; o gráfico continua com todas, para mostrar a série no tempo.
  const atual = comNumero.find((v) => v.vagaId === vagaId);
  const primeira = comNumero[0];
  const delta = atual && primeira && atual !== primeira ? atual.pct! - primeira.pct! : null;

  return (
    <section className="cartao grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-12 md:p-8">
      <div className="flex flex-col gap-3">
        <span className="rotulo text-texto-suave">Concordância entre o Totti e o Tech Lead</span>
        {atual ? (
          <>
            <motion.span
              key={atual.pct}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: curvaSuave }}
              className="titulo-display text-[64px] text-texto"
            >
              {atual.pct}%
            </motion.span>
            <p className="max-w-[420px] text-[14.5px] leading-relaxed text-texto">
              Em {atual.vagaTitulo}, o Tech Lead decidiu igual ao Totti em{" "}
              <span className="numero font-medium">
                {atual.concordou} de {atual.total}
              </span>{" "}
              candidatos.
            </p>
            {delta !== null && primeira && (
              <span className="flex items-center gap-1.5 text-[13.5px] text-texto-suave">
                {delta >= 0 ? <ArrowUp size={14} className="text-texto" /> : <ArrowDown size={14} className="text-texto" />}
                <span>
                  <span className="numero font-medium text-texto">
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(delta)} pontos
                  </span>{" "}
                  desde a primeira vaga ({primeira.pct}%)
                </span>
              </span>
            )}
            <p className="mt-1 text-[12.5px] text-texto-suave">
              Quando o Totti fica no &ldquo;talvez&rdquo;, a decisão não entra na conta.
            </p>
          </>
        ) : (
          <p className="max-w-[420px] text-[14.5px] text-texto-suave">
            A concordância desta vaga aparece depois das primeiras decisões do Tech Lead no Slack.
          </p>
        )}
      </div>
      {comNumero.length > 0 && <GraficoConcordancia vagas={comNumero} escolhida={vagaId} onEscolher={onEscolher} />}
    </section>
  );
}

const ALTURA_GRAFICO = 148;

/** Colunas por vaga, da mais antiga para a atual. A escolhida em tinta, as outras em cinza; clicar numa coluna escolhe a vaga. */
function GraficoConcordancia({
  vagas,
  escolhida,
  onEscolher,
}: {
  vagas: ConcordanciaVaga[];
  escolhida: string | undefined;
  onEscolher: (id: string) => void;
}) {
  const [foco, setFoco] = useState<string | null>(null);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">Concordância por vaga, da mais antiga para a atual</figcaption>
      <div className="flex">
        {/* Eixo: só 0, 50 e 100%, bem apagado */}
        <div className="relative w-9 shrink-0" style={{ height: ALTURA_GRAFICO }} aria-hidden>
          {[100, 50, 0].map((v) => (
            <span
              key={v}
              className="numero absolute right-2 -translate-y-1/2 text-[11px] text-texto-suave/80"
              style={{ top: ALTURA_GRAFICO * (1 - v / 100) }}
            >
              {v}%
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0" style={{ height: ALTURA_GRAFICO }} aria-hidden>
            {[100, 50].map((v) => (
              <div
                key={v}
                className="absolute inset-x-0 border-t border-dashed border-texto/10"
                style={{ top: ALTURA_GRAFICO * (1 - v / 100) }}
              />
            ))}
            <div className="absolute inset-x-0 bottom-0 border-t border-texto/25" />
          </div>
          <ul className="relative flex">
            {vagas.map((v, i) => {
              const atual = i === vagas.length - 1;
              const marcada = v.vagaId === escolhida;
              const aberto = foco === v.vagaId;
              const altura = Math.max(2, (ALTURA_GRAFICO * (v.pct ?? 0)) / 100);
              return (
                <li
                  key={v.vagaId}
                  tabIndex={0}
                  role="button"
                  aria-pressed={marcada}
                  onClick={() => onEscolher(v.vagaId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEscolher(v.vagaId);
                    }
                  }}
                  onMouseEnter={() => setFoco(v.vagaId)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(v.vagaId)}
                  onBlur={() => setFoco(null)}
                  aria-label={`${v.vagaTitulo}: ${v.pct}%, ${v.concordou} de ${v.total} decisões iguais`}
                  className="group relative flex w-[92px] cursor-pointer flex-col items-center outline-none sm:w-[104px]"
                >
                  <div className="relative flex w-full items-end justify-center" style={{ height: ALTURA_GRAFICO }}>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: altura }}
                      transition={{
                        duration: 0.7,
                        delay: 0.1 + i * 0.08,
                        ease: curvaSuave,
                      }}
                      className={`relative w-6 rounded-t-[4px] transition-[opacity,background-color] ${
                        marcada ? "bg-texto" : "bg-[#c4bdb1] group-hover:bg-[#a9a196]"
                      } ${foco && !aberto ? "opacity-60" : ""}`}
                    >
                      <span
                        className={`numero absolute -top-6 left-1/2 -translate-x-1/2 text-[12.5px] whitespace-nowrap ${
                          marcada ? "font-semibold text-texto" : "text-texto-suave"
                        }`}
                      >
                        {v.pct}%
                      </span>
                    </motion.div>
                    <AnimatePresence>
                      {aberto && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.14 }}
                          className="pointer-events-none absolute left-1/2 z-10 w-max max-w-[220px] -translate-x-1/2 rounded-[10px] bg-texto px-3 py-2 text-[12px] leading-snug text-texto-claro shadow-[var(--sombra-flutuante)]"
                          style={{ bottom: altura + 30 }}
                        >
                          <span className="block font-medium">{v.vagaTitulo}</span>
                          <span className="numero block text-texto-claro/80">
                            {v.concordou} de {v.total} decisões iguais
                          </span>
                          {v.semPosicao > 0 && (
                            <span className="numero block text-texto-claro/60">
                              +{v.semPosicao} &ldquo;talvez&rdquo; fora da conta
                            </span>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <span
                    className={`mt-2 line-clamp-2 px-1 text-center text-[12px] leading-tight ${
                      marcada ? "font-medium text-texto" : "text-texto-suave"
                    }`}
                  >
                    {v.vagaTitulo}
                  </span>
                  <span className="text-[11px] text-texto-suave/80">{atual ? "atual" : `desde ${dataCurta(v.inicio)}`}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="sr-only">
        <table>
          <caption>Concordância entre o Totti e o Tech Lead por vaga</caption>
          <thead>
            <tr>
              <th scope="col">Vaga</th>
              <th scope="col">Concordância</th>
              <th scope="col">Decisões iguais</th>
              <th scope="col">Talvez (fora da conta)</th>
            </tr>
          </thead>
          <tbody>
            {vagas.map((v) => (
              <tr key={v.vagaId}>
                <th scope="row">{v.vagaTitulo}</th>
                <td>{v.pct}%</td>
                <td>
                  {v.concordou} de {v.total}
                </td>
                <td>{v.semPosicao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 2. Regras
// ---------------------------------------------------------------------------

function SeloEfeito({ efeito }: { efeito: EfeitoRegra }) {
  return (
    <span className="rotulo-neutro gap-1 !text-texto">
      {efeito === "valoriza" ? <ArrowUp size={11} strokeWidth={2.25} /> : <ArrowDown size={11} strokeWidth={2.25} />}
      {efeito === "valoriza" ? "Valoriza" : "Penaliza"}
    </span>
  );
}

function LinhaRegra({
  regra,
  nova,
  criterios,
  onMudou,
  onApagou,
}: {
  regra: RegraSquad;
  nova: boolean;
  criterios: VisaoMemoria["criterios"];
  onMudou: (r: RegraSquad) => void;
  onApagou: (id: string) => void;
}) {
  const [modo, setModo] = useState<"ver" | "editar" | "apagar">("ver");
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const nomeCriterio = criterios.find((c) => c.id === regra.criterio)?.nome ?? regra.criterio;

  const mudar = async (mudanca: Partial<Pick<RegraSquad, "ativa" | "texto" | "efeito" | "criterio">>) => {
    setOcupado(true);
    setFalha(null);
    try {
      const r = await fetch(`/api/squad-memory/regras/${encodeURIComponent(regra.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mudanca),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) {
        setFalha(corpo?.error ?? "Não consegui salvar.");
        return false;
      }
      onMudou(corpo as RegraSquad);
      return true;
    } catch {
      setFalha("Não consegui salvar.");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const apagar = async () => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/squad-memory/regras/${encodeURIComponent(regra.id)}`, { method: "DELETE" });
      if (r.ok || r.status === 404) onApagou(regra.id);
      else setFalha("Não consegui apagar.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: curvaSuave }}
      className="linha-lista overflow-hidden"
    >
      <div className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:gap-6 ${nova ? "bg-superficie-2/60" : ""}`}>
        {modo === "editar" ? (
          <EditorRegra
            regra={regra}
            criterios={criterios}
            ocupado={ocupado}
            falha={falha}
            onCancelar={() => (setModo("ver"), setFalha(null))}
            onSalvar={async (m) => {
              if (await mudar(m)) setModo("ver");
            }}
          />
        ) : (
          <>
            <div className={`flex min-w-0 flex-1 flex-col gap-2 transition-opacity ${regra.ativa ? "" : "opacity-55"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <SeloEfeito efeito={regra.efeito} />
                <span className="text-[12.5px] text-texto-suave">
                  Pesa em <span className="text-texto">{nomeCriterio}</span>
                </span>
                {nova && <span className="rotulo-destaque">Acabou de aprender</span>}
                {!regra.ativa && <span className="text-[12.5px] text-texto-suave">· desligado</span>}
              </div>
              <p className="text-[15px] leading-snug text-texto">{regra.texto}</p>
              <p className="text-[12.5px] text-texto-suave">
                {textoDaOrigem(regra.origem)} · {dataCurta(regra.criadaEm)}
              </p>
              {falha && <p className="text-[12.5px] text-perigo">{falha}</p>}
            </div>

            {modo === "apagar" ? (
              <div className="flex shrink-0 items-center gap-2 self-start">
                <span className="text-[13px] text-texto">Apagar este critério?</span>
                <button
                  onClick={apagar}
                  disabled={ocupado}
                  className="rounded-full bg-perigo px-3.5 py-1.5 text-[13px] font-medium text-texto-claro disabled:opacity-60"
                >
                  Apagar
                </button>
                <button
                  onClick={() => setModo("ver")}
                  className="rounded-full px-3 py-1.5 text-[13px] text-texto-suave hover:bg-superficie-2 hover:text-texto"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-1 self-start">
                <Interruptor
                  ligado={regra.ativa}
                  ocupado={ocupado}
                  rotulo={regra.ativa ? "Desligar este critério" : "Ligar este critério"}
                  onMudar={() => void mudar({ ativa: !regra.ativa })}
                />
                <BotaoIcone rotulo="Editar" onClick={() => setModo("editar")}>
                  <Pencil size={15} strokeWidth={1.75} />
                </BotaoIcone>
                <BotaoIcone rotulo="Apagar" onClick={() => setModo("apagar")}>
                  <Trash2 size={15} strokeWidth={1.75} />
                </BotaoIcone>
              </div>
            )}
          </>
        )}
      </div>
    </motion.li>
  );
}

function Interruptor({
  ligado,
  ocupado,
  rotulo,
  onMudar,
}: {
  ligado: boolean;
  ocupado: boolean;
  rotulo: string;
  onMudar: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={rotulo}
      disabled={ocupado}
      onClick={onMudar}
      className="flex h-9 items-center gap-2 rounded-full px-2 text-[12.5px] text-texto-suave hover:bg-superficie-2/60 disabled:opacity-60"
    >
      <span className={`relative h-[18px] w-[30px] rounded-full transition-colors ${ligado ? "bg-texto" : "bg-texto/20"}`}>
        <motion.span
          initial={false}
          animate={{ x: ligado ? 12 : 0 }}
          transition={{ duration: 0.2, ease: curvaSuave }}
          className="absolute top-[2px] left-[2px] size-[14px] rounded-full bg-superficie shadow-[0_1px_2px_rgb(17_17_17/0.2)]"
        />
      </span>
      <span className="w-[54px] text-left">{ligado ? "Ligado" : "Desligado"}</span>
    </button>
  );
}

function BotaoIcone({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className="flex size-9 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
    >
      {children}
    </button>
  );
}

function EditorRegra({
  regra,
  criterios,
  ocupado,
  falha,
  onCancelar,
  onSalvar,
}: {
  regra: RegraSquad;
  criterios: VisaoMemoria["criterios"];
  ocupado: boolean;
  falha: string | null;
  onCancelar: () => void;
  onSalvar: (m: Pick<RegraSquad, "texto" | "efeito" | "criterio">) => void;
}) {
  const [texto, setTexto] = useState(regra.texto);
  const [efeito, setEfeito] = useState<EfeitoRegra>(regra.efeito);
  const [criterio, setCriterio] = useState(regra.criterio);
  const valido = texto.trim().length >= 3;

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) onSalvar({ texto: texto.trim(), efeito, criterio });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="rotulo text-texto-suave">O que o Totti deve considerar</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={160}
          rows={2}
          autoFocus
          className="w-full resize-none rounded-[10px] bg-superficie-2/60 px-3 py-2 text-[15px] leading-snug text-texto outline-none ring-texto/15 focus:bg-superficie focus:ring-2"
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="rotulo text-texto-suave">Efeito</span>
          <div className="flex gap-0.5 rounded-full bg-superficie-2/70 p-1" role="radiogroup" aria-label="Efeito">
            {(["valoriza", "penaliza"] as const).map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={efeito === e}
                onClick={() => setEfeito(e)}
                className={`rounded-full px-3 py-1 text-[13px] transition-colors ${
                  efeito === e ? "bg-superficie font-medium text-texto shadow-[0_1px_2px_rgb(17_17_17/0.08)]" : "text-texto-suave"
                }`}
              >
                {e === "valoriza" ? "Valoriza" : "Penaliza"}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="rotulo text-texto-suave">Pesa em</span>
          <select
            value={criterio}
            onChange={(e) => setCriterio(e.target.value)}
            className="h-[34px] rounded-full bg-superficie-2/70 px-3 text-[13px] text-texto outline-none focus:ring-2 focus:ring-texto/15"
          >
            {criterios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-full px-3 py-1.5 text-[13px] text-texto-suave hover:bg-superficie-2 hover:text-texto"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valido || ocupado}
            className="flex items-center gap-1.5 rounded-full bg-texto px-4 py-1.5 text-[13px] font-medium text-texto-claro disabled:opacity-50"
          >
            <Check size={14} /> Salvar
          </button>
        </div>
      </div>
      {falha && <p className="text-[12.5px] text-perigo">{falha}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// 3. Ignorados
// ---------------------------------------------------------------------------

function LinhaIgnorado({ item }: { item: MotivoIgnorado }) {
  return (
    <li className="linha-lista flex gap-3 px-5 py-4">
      <ShieldOff size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-texto-suave" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[15px] leading-snug text-texto">
          <span className="text-texto-suave line-through decoration-texto/30">&ldquo;{item.trecho}&rdquo;</span>
        </p>
        <p className="text-[13px] text-texto">Ignorado: {item.porque}.</p>
        <p className="text-[12.5px] text-texto-suave">
          {textoDaOrigem(item.origem)} · {dataCurta(item.criadoEm)}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 4. Simulador (só em desenvolvimento)
// ---------------------------------------------------------------------------

const SUGESTOES: { decisao: "aprovado" | "reprovado"; motivo: string }[] = [
  {
    decisao: "reprovado",
    motivo: "propôs Kafka sem necessidade para esse volume",
  },
  {
    decisao: "reprovado",
    motivo: "muito novo para o cargo e não tratou o caso de lista vazia",
  },
  {
    decisao: "aprovado",
    motivo: "perguntou o volume antes de escolher o banco",
  },
];

/** Ensina na vaga escolhida na tela, como se o card do Slack fosse de uma entrevista dela. */
function Simulador({ vaga, onAprendeu }: { vaga: OpcaoVaga; onAprendeu: (memoria: VisaoMemoria, novas: string[]) => void }) {
  const [decisao, setDecisao] = useState<"aprovado" | "reprovado">("reprovado");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<{
    regras: RegraSquad[];
    ignorados: MotivoIgnorado[];
  } | null>(null);
  const [falha, setFalha] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    setFalha(false);
    try {
      const r = await fetch("/api/squad-memory/simular", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisao, motivo, vagaId: vaga.id, vagaTitulo: vaga.titulo }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const { aprendizado, memoria } = (await r.json()) as {
        aprendizado: { regras: RegraSquad[]; ignorados: MotivoIgnorado[] };
        memoria: VisaoMemoria;
      };
      setResposta(aprendizado);
      onAprendeu(
        memoria,
        aprendizado.regras.map((x) => x.id),
      );
      setMotivo("");
    } catch {
      setFalha(true);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-dashed border-texto/20 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-texto">Simular o Tech Lead no Slack</h2>
        <span className="text-[12px] text-texto-suave">
          Só em desenvolvimento · Rafael Moura, {vaga.titulo} · o Totti recomendou avançar
        </span>
      </div>
      <form
        className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <div
          className="flex shrink-0 gap-0.5 self-start rounded-full bg-superficie-2/70 p-1"
          role="radiogroup"
          aria-label="Decisão"
        >
          {(["reprovado", "aprovado"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={decisao === d}
              onClick={() => setDecisao(d)}
              className={`rounded-full px-3 py-1 text-[13px] transition-colors ${
                decisao === d ? "bg-superficie font-medium text-texto shadow-[0_1px_2px_rgb(17_17_17/0.08)]" : "text-texto-suave"
              }`}
            >
              {d === "reprovado" ? "Reprovar" : "Aprovar"}
            </button>
          ))}
        </div>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          placeholder="Motivo (opcional), como o Tech Lead escreveria no Slack"
          className="h-10 w-full min-w-0 shrink-0 rounded-full bg-superficie px-4 sm:w-auto sm:flex-1 text-[14px] text-texto outline-none ring-texto/15 placeholder:text-texto-suave/70 focus:ring-2"
        />
        <button
          type="submit"
          disabled={enviando}
          className="h-10 shrink-0 rounded-full bg-texto px-5 text-[13.5px] font-medium text-texto-claro disabled:opacity-60"
        >
          {enviando ? "Aprendendo…" : "Enviar decisão"}
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGESTOES.map((s) => (
          <button
            key={s.motivo}
            onClick={() => (setDecisao(s.decisao), setMotivo(s.motivo))}
            className="rounded-full bg-superficie-2/70 px-3 py-1 text-left text-[12.5px] text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            {s.decisao === "reprovado" ? "Reprovar" : "Aprovar"}: {s.motivo}
          </button>
        ))}
      </div>
      {falha && <p className="text-[12.5px] text-perigo">A simulação falhou. O servidor está em modo dev?</p>}
      <AnimatePresence>
        {resposta && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-1 rounded-[12px] bg-superficie px-4 py-3 text-[13.5px]"
          >
            <span className="rotulo text-texto-suave">Resposta do Totti na thread</span>
            {resposta.regras.map((r) => (
              <span key={r.id} className="text-texto">
                <span className="font-medium">Aprendi:</span> {r.texto}
              </span>
            ))}
            {resposta.ignorados.map((m) => (
              <span key={m.id} className="text-texto">
                <span className="font-medium">Ignorei</span> &ldquo;{m.trecho}
                &rdquo;: {m.porque}. O Totti só aprende critério técnico.
              </span>
            ))}
            {!resposta.regras.length && !resposta.ignorados.length && (
              <span className="flex items-center gap-1.5 text-texto-suave">
                <X size={13} /> Sem motivo técnico, nada novo para aprender. A decisão entrou na concordância.
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
