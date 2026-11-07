"use client";

// Pré-entrevista com a Totti, do lado do recrutador:
//   vaga → a Totti lê → conversa + plano ao vivo → revisão → entrevista pronta (link para o candidato).
// Os dados vêm de lib/pre-entrevista/tela/cliente.ts (rotas reais ou demonstração).
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
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

export default function PreEntrevistaTotti() {
  const [etapa, setEtapa] = useState<Etapa>("vaga");
  const [vaga, setVaga] = useState<Vaga | null>(null);
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
      setEstado(await criarSessao(v));
    } catch (e) {
      setErro(`Não consegui ler a vaga: ${e instanceof Error ? e.message : String(e)}`);
      setEtapa("vaga");
    }
  }

  const abrirConversa = useCallback(() => setEtapa("conversa"), []);

  async function responder(texto: string) {
    if (!estado) return;
    setErro(null);
    setPensando(true);
    // A fala aparece na hora; a resposta da Totti chega depois.
    setEstado({ ...estado, transcricao: [...estado.transcricao, { role: "recrutadora", text: texto }] });
    try {
      setEstado(await enviarFala(estado.id, texto));
    } catch (e) {
      setEstado(estado);
      setErro(`A Totti não respondeu: ${e instanceof Error ? e.message : String(e)}`);
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
  const tottiTerminou = estado?.planejamento.passo?.tipo === "encerrar";

  return (
    <main className="relative flex min-h-dvh flex-col">

      <AnimatePresence mode="wait">
        {etapa === "vaga" && (
          <motion.div key="vaga" exit={{ opacity: 0, y: -8 }} className="relative flex flex-1 items-center px-4 py-12">
            <EntradaVaga onEnviar={comecar} erro={erro} />
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
                  onClick={novaEntrevista}
                  aria-label="Começar de novo"
                  className="flex size-8 items-center justify-center rounded-controle text-texto-suave transition-colors hover:bg-fundo hover:text-texto"
                >
                  <ArrowLeft size={16} />
                </button>
                <span className="text-[14px] text-texto">{estado.vaga.roleTitle}</span>
                <span className="rotulo ml-3 text-texto-suave">
                  {combinados}/{total} combinados
                </span>
              </div>
              <Passos atual={2} />
              <button
                onClick={() => setRevisando(true)}
                className={`rounded-controle px-4 py-2.5 text-[14px] font-medium transition-colors duration-200 ${
                  tottiTerminou ? "bg-[var(--destaque)] text-texto" : "bg-texto text-superficie hover:opacity-90"
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
            <EntrevistaPronta config={config} onNova={novaEntrevista} />
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
