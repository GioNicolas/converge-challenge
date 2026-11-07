"use client";

// Pré-entrevista com o Totti, do lado do recrutador:
//   vaga → o Totti lê → conversa + plano ao vivo → revisão → entrevista pronta (link para o candidato).
// Os dados vêm de lib/pre-entrevista/tela/cliente.ts (rotas reais ou demonstração).
// No workspace (/vagas/nova) tudo acontece aqui, sem trocar de página; um rascunho salvo entra por
// `vagaInicial`/`sessaoInicial` e o Totti começa lendo (ou volta direto para a conversa).
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import type { InterviewConfig } from "@/lib/contracts";
import type { Vaga } from "@/lib/pre-entrevista/classificador";
import type { Rascunho } from "@/lib/pre-entrevista/rascunho";
import type { EstadoSessao } from "@/lib/pre-entrevista/sessoes";
import { buscarSessao, criarSessao, enviarFala, finalizar, usarServidor } from "@/lib/pre-entrevista/tela/cliente";
import { curvaSuave } from "@/lib/design/motion";
import EntradaVaga from "./EntradaVaga";
import LeituraDaVaga from "./LeituraDaVaga";
import ConversaTotti from "./ConversaTotti";
import PlanoAoVivo from "./PlanoAoVivo";
import RevisaoPlano from "./RevisaoPlano";
import EntrevistaPronta from "./EntrevistaPronta";
import Passos from "./Passos";

type Etapa = "vaga" | "lendo" | "conversa" | "pronta";

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
  const [revisando, setRevisando] = useState(false);
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
      setEstado(await enviarFala(estado.id, texto));
    } catch (e) {
      setEstado(estado);
      setErro(`O Totti não respondeu: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPensando(false);
    }
  }

  // Com o servidor real, a extração do rascunho roda em segundo plano: busca o estado de tempos em tempos.
  useEffect(() => {
    if (!usarServidor() || etapa !== "conversa" || !estado?.id) return;
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
        setRevisando(false);
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

  return (
    <main className="relative flex min-h-dvh flex-col">
      {/* Voltar, fora da conversa (lá o cabeçalho já tem a seta de voltar) */}
      {onSair && etapa !== "conversa" && (
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

        {etapa === "conversa" && estado && (
          <motion.div
            key="conversa"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.36, ease: curvaSuave }}
            className="relative flex h-dvh flex-col gap-3 p-3"
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-padrao bg-superficie py-1.5 pr-4 pl-1.5">
                <button
                  onClick={onSair ?? novaEntrevista}
                  aria-label={onSair ? "Voltar para as vagas" : "Começar de novo"}
                  className="flex size-8 items-center justify-center rounded-controle text-texto-suave transition-colors hover:bg-fundo hover:text-texto"
                >
                  <ArrowLeft size={16} />
                </button>
                <span className="text-[14px] text-texto">{estado.vaga.roleTitle}</span>
                <span className="rotulo ml-3 text-texto-suave">
                  {combinados}/{total} combinados
                </span>
              </div>
              <Passos atual={3} />
              <button
                onClick={() => setRevisando(true)}
                className={`rounded-controle px-4 py-2.5 text-[14px] font-medium transition-colors duration-200 ${
                  tottiTerminou
                    ? "bg-texto text-texto-claro shadow-[0_0_0_4px_rgb(17_17_17/0.08)]"
                    : "border border-texto/80 text-texto hover:bg-texto hover:text-texto-claro"
                }`}
              >
                Revisar e confirmar
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
              <ConversaTotti transcricao={estado.transcricao} pensando={pensando} erro={erro} onEnviar={responder} />
              <PlanoAoVivo estado={estado} />
            </div>
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

      <AnimatePresence>
        {revisando && estado && (
          <RevisaoPlano
            rascunho={estado.rascunho}
            enviando={finalizando}
            erros={errosRevisao}
            onConfirmar={confirmar}
            onFechar={() => setRevisando(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
