"use client";

// Pré-entrevista com o Totti, do lado do recrutador:
//   vaga → o Totti lê → conversa → plano (confere, ajusta e publica na mesma tela) → entrevista pronta.
// Quando o Totti dá a conversa por encerrada, o botão "Concluir conversa" sai do canto e vem para o meio
// da conversa (mesmo `layoutId`), para ficar claro que o próximo passo é revisar o plano.
// Os dados vêm de lib/pre-entrevista/tela/cliente.ts (rotas reais ou demonstração).
// No workspace (/vagas/nova) tudo acontece aqui, sem trocar de página; um rascunho salvo entra por
// `vagaInicial`/`sessaoInicial` e o Totti começa lendo (ou volta direto para a conversa).
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import type { InterviewConfig } from "@/lib/contracts";
import type { Vaga } from "@/lib/pre-entrevista/classificador";
import type { Rascunho } from "@/lib/pre-entrevista/rascunho";
import type { EstadoSessao } from "@/lib/pre-entrevista/sessoes";
import { buscarSessao, criarSessao, enviarFala, finalizar, usarServidor } from "@/lib/pre-entrevista/tela/cliente";
import { curvaSuave } from "@/lib/design/motion";
import EntradaVaga from "./EntradaVaga";
import LeituraDaVaga from "./LeituraDaVaga";
import ConversaTotti from "./ConversaTotti";
import RevisaoPlano from "./RevisaoPlano";
import EntrevistaPronta from "./EntrevistaPronta";
import Passos from "./Passos";

type Etapa = "vaga" | "lendo" | "conversa" | "plano" | "pronta";

/** A resposta do Totti nunca chega antes disso: dá tempo de ele "ler" e de os pontinhos aparecerem. */
const RESPOSTA_MINIMA_MS = 1500;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Props = {
  /** Vaga já cadastrada no workspace: começa direto com o Totti lendo. */
  vagaInicial?: Vaga;
  /** A pessoa enviou o formulário: a vaga vira rascunho antes de o Totti começar a ler. */
  onComecar?: (vaga: Vaga) => void;
  /** Sessão de antes, para retomar a conversa de onde parou. */
  sessaoInicial?: string;
  onSessao?: (id: string) => void;
  onProgresso?: (feitos: number, total: number) => void;
  onPronta?: (config: InterviewConfig) => void;
  /** Volta para a lista de vagas. */
  onSair?: () => void;
  /** Ação principal da tela final (ex.: abrir a vaga publicada). */
  final?: { rotulo: string; acao: () => void };
};

export default function PreEntrevistaTotti({
  vagaInicial,
  onComecar,
  sessaoInicial,
  onSessao,
  onProgresso,
  onPronta,
  onSair,
  final,
}: Props = {}) {
  const [etapa, setEtapa] = useState<Etapa>(vagaInicial ? "lendo" : "vaga");
  const [vaga, setVaga] = useState<Vaga | null>(vagaInicial ?? null);
  const [estado, setEstado] = useState<EstadoSessao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, setPensando] = useState(false);
  /** O recrutador quis continuar conversando depois de o Totti encerrar: o botão volta para o canto. */
  const [seguirConversando, setSeguirConversando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [errosRevisao, setErrosRevisao] = useState<string[]>([]);
  const [config, setConfig] = useState<InterviewConfig | null>(null);

  async function comecar(v: Vaga) {
    setVaga(v);
    setErro(null);
    setEstado(null);
    setEtapa("lendo");
    try {
      const novo = await criarSessao(v);
      setEstado(novo);
      onSessao?.(novo.id);
    } catch (e) {
      setErro(`Não consegui ler a vaga: ${e instanceof Error ? e.message : String(e)}`);
      setEtapa("vaga");
    }
  }

  const abrirConversa = useCallback(() => setEtapa("conversa"), []);

  // Workspace: retoma a sessão salva (se ainda existir) ou começa a leitura da vaga. Roda uma vez só.
  const iniciou = useRef(false);
  useEffect(() => {
    if (!vagaInicial || iniciou.current) return;
    iniciou.current = true;
    void (async () => {
      const anterior = sessaoInicial ? await buscarSessao(sessaoInicial).catch(() => null) : null;
      if (anterior) {
        setEstado(anterior);
        setEtapa("conversa");
      } else void comecar(vagaInicial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function responder(texto: string) {
    if (!estado) return;
    setErro(null);
    setPensando(true);
    // A fala aparece na hora; a resposta do Totti chega depois.
    setEstado({ ...estado, transcricao: [...estado.transcricao, { role: "recrutadora", text: texto }] });
    try {
      const [novo] = await Promise.all([enviarFala(estado.id, texto), esperar(RESPOSTA_MINIMA_MS)]);
      setEstado(novo);
    } catch (e) {
      setEstado(estado);
      setErro(`O Totti não respondeu: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPensando(false);
    }
  }

  // Com o servidor real, a extração do rascunho roda em segundo plano: busca o estado de tempos em tempos.
  useEffect(() => {
    if (!usarServidor() || (etapa !== "conversa" && etapa !== "plano") || !estado?.id) return;
    const id = estado.id;
    const t = setInterval(async () => {
      try {
        const novo = await buscarSessao(id);
        if (novo) setEstado((atual) => (atual && novo.transcricao.length >= atual.transcricao.length ? novo : atual));
      } catch {
        // Falhas pontuais não interrompem a conversa.
      }
    }, 1500);
    return () => clearInterval(t);
  }, [etapa, estado?.id]);

  async function confirmar(rascunho: Rascunho) {
    if (!estado) return;
    setFinalizando(true);
    setErrosRevisao([]);
    try {
      const r = await finalizar(estado.id, rascunho);
      if ("config" in r) {
        setConfig(r.config);
        onPronta?.(r.config);
        setEtapa("pronta");
      } else setErrosRevisao(r.erros);
    } catch (e) {
      setErrosRevisao([e instanceof Error ? e.message : String(e)]);
    } finally {
      setFinalizando(false);
    }
  }

  function novaEntrevista() {
    setEtapa("vaga");
    setEstado(null);
    setConfig(null);
    setErro(null);
  }

  const combinados = estado?.topicos.filter((t) => t.coberto).length ?? 0;
  const total = estado?.topicos.length ?? 0;
  useEffect(() => {
    if (total > 0) onProgresso?.(combinados, total);
  }, [combinados, total, onProgresso]);
  const tottiTerminou = estado?.planejamento.passo?.tipo === "encerrar";
  const atualizando = !!estado?.status.extraindo;
  // O plano está pronto para revisar: o botão vem para o meio da conversa, um instante depois da última
  // fala do Totti (dá tempo de ler e de ver o botão sair do canto).
  const prontoAgora = tottiTerminou && !atualizando && !pensando && !seguirConversando;
  const [planoPronto, setPlanoPronto] = useState(false);
  useEffect(() => {
    if (!prontoAgora) return setPlanoPronto(false);
    const t = setTimeout(() => setPlanoPronto(true), 1200);
    return () => clearTimeout(t);
  }, [prontoAgora]);
  // Se a conversa andar de novo (nova fala), o Totti pode encerrar outra vez.
  const falas = estado?.transcricao.length ?? 0;
  useEffect(() => setSeguirConversando(false), [falas]);

  return (
    <main className="relative flex min-h-dvh flex-col">
      {/* Voltar, fora da conversa (lá o cabeçalho já tem a seta de voltar) */}
      {onSair && etapa !== "conversa" && etapa !== "plano" && (
        <button
          onClick={onSair}
          aria-label="Voltar para as vagas"
          className="group absolute top-5 left-5 z-10 flex items-center gap-1.5 rounded-controle px-2.5 py-1.5 text-[13.5px] text-texto-suave transition-colors hover:text-texto"
        >
          <ChevronLeft size={15} className="transition-transform group-hover:-translate-x-0.5" /> Vagas
        </button>
      )}

      <AnimatePresence mode="wait">
        {etapa === "vaga" && (
          <motion.div key="vaga" exit={{ opacity: 0, y: -8 }} className="relative flex flex-1 items-center px-4 py-12">
            <EntradaVaga
              onEnviar={(v) => {
                onComecar?.(v);
                void comecar(v);
              }}
              erro={erro}
              inicial={vaga ?? undefined}
            />
          </motion.div>
        )}

        {etapa === "lendo" && (
          <motion.div key="lendo" className="relative flex flex-1 items-center px-4 py-12">
            <LeituraDaVaga cargo={vaga?.roleTitle ?? ""} estado={estado} onPronto={abrirConversa} />
          </motion.div>
        )}

        {(etapa === "conversa" || etapa === "plano") && estado && (
          <motion.div
            key={etapa}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.36, ease: curvaSuave }}
            className="relative flex h-dvh flex-col gap-3 p-3"
          >
            {/* Três colunas iguais nas pontas: as etapas ficam no centro de verdade */}
            <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 max-md:grid-cols-[1fr_auto]">
              <div className="flex min-w-0 items-center gap-1 justify-self-start rounded-full bg-superficie py-1.5 pr-4 pl-1.5">
                <button
                  onClick={etapa === "plano" ? () => setEtapa("conversa") : (onSair ?? novaEntrevista)}
                  aria-label={etapa === "plano" ? "Voltar à conversa" : onSair ? "Voltar para as vagas" : "Começar de novo"}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-fundo hover:text-texto"
                >
                  <ArrowLeft size={16} />
                </button>
                <span className="truncate text-[14px] text-texto">{estado.vaga.roleTitle}</span>
                {etapa === "conversa" && (
                  <span className="numero ml-2 shrink-0 text-[12px] text-texto-suave">
                    {combinados}/{total}
                  </span>
                )}
              </div>
              <div className="justify-self-center max-md:hidden">
                <Passos atual={3} />
              </div>
              <div className="flex justify-self-end">
                {etapa === "conversa" && !planoPronto && (
                  <motion.button
                    layoutId="cta-plano"
                    onClick={() => setEtapa("plano")}
                    // O plano é montado pela extração em segundo plano: espera ela terminar para mostrar o plano completo.
                    disabled={atualizando || pensando}
                    transition={{ type: "spring", stiffness: 260, damping: 30 }}
                    className={`rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors duration-200 disabled:cursor-wait disabled:opacity-50 ${
                      tottiTerminou
                        ? "bg-texto text-texto-claro"
                        : "bg-superficie text-texto shadow-[0_0_0_1px_rgb(17_17_17/0.12)] hover:bg-texto hover:text-texto-claro"
                    }`}
                  >
                    <motion.span layout="position" className="block">
                      {atualizando || pensando ? "Atualizando o plano…" : tottiTerminou ? "Revisar o plano" : "Concluir conversa"}
                    </motion.span>
                  </motion.button>
                )}
              </div>
            </header>

            {etapa === "conversa" ? (
              <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col [&>section]:flex-1">
                <ConversaTotti transcricao={estado.transcricao} pensando={pensando} erro={erro} onEnviar={responder} />
                <AnimatePresence>
                  {planoPronto && (
                    <ConversaConcluida
                      combinados={combinados}
                      onRevisar={() => setEtapa("plano")}
                      onContinuar={() => setSeguirConversando(true)}
                    />
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <RevisaoPlano
                rascunho={estado.rascunho}
                enviando={finalizando}
                erros={errosRevisao}
                onConfirmar={confirmar}
                onVoltar={() => setEtapa("conversa")}
              />
            )}
          </motion.div>
        )}

        {etapa === "pronta" && config && (
          <motion.div key="pronta" className="relative flex flex-1 items-center px-4 py-12">
            <EntrevistaPronta
              config={config}
              onNova={final?.acao ?? onSair ?? novaEntrevista}
              rotuloNova={final?.rotulo ?? (onSair ? "Voltar para as vagas" : undefined)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/**
 * O Totti encerrou: a conversa escurece um pouco e um cartão no meio chama para revisar o plano.
 * O botão é o mesmo do canto do cabeçalho (mesmo `layoutId`), então ele "voa" até aqui.
 */
function ConversaConcluida({ combinados, onRevisar, onContinuar }: { combinados: number; onRevisar: () => void; onContinuar: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: curvaSuave }}
      className="absolute inset-0 z-10 flex items-center justify-center rounded-padrao bg-fundo/60 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.45, ease: curvaSuave }}
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-[24px] bg-superficie p-7 text-center shadow-flutuante"
        role="dialog"
        aria-label="Conversa concluída"
      >
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.15 }}
          className="flex size-12 items-center justify-center rounded-full bg-texto text-texto-claro"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
            <motion.path
              d="M3.5 8.4 L6.6 11.3 L12.5 4.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, delay: 0.3, ease: [0.32, 0.72, 0, 1] }}
            />
          </svg>
        </motion.span>
        <div className="flex flex-col gap-1.5">
          <h2 className="titulo-display text-[24px] text-texto">Conversa concluída</h2>
          <p className="text-[14.5px] leading-relaxed text-texto-suave">
            O Totti combinou {combinados} {combinados === 1 ? "ponto" : "pontos"} com você e montou o plano da entrevista.
            Dê uma olhada e publique.
          </p>
        </div>
        <motion.button
          layoutId="cta-plano"
          onClick={onRevisar}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-texto px-5 py-3 text-[15px] font-medium text-texto-claro hover:opacity-90"
        >
          <motion.span layout="position" className="flex items-center gap-2">
            Revisar o plano <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </motion.span>
        </motion.button>
        <button onClick={onContinuar} className="text-[13px] text-texto-suave underline-offset-4 hover:text-texto hover:underline">
          Quero falar mais alguma coisa
        </button>
      </motion.div>
    </motion.div>
  );
}
