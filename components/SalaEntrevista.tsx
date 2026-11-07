"use client";

// Sala da entrevista no quadro: o quadro em tela cheia, a janela de chamada no canto e a legenda embaixo.
// O enunciado não fica num painel: o agente escreve no próprio quadro.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import JanelaChamada from "@/components/JanelaChamada";
import Legenda from "@/components/Legenda";
import PainelConversa, { type MensagemConversa } from "@/components/PainelConversa";
import CursorAgente, { type ControleCursor } from "@/components/CursorAgente";
import ConfirmarEncerrar from "@/components/ConfirmarEncerrar";
import type { Quadro } from "@/components/Canvas";
import { useEntrevista } from "@/lib/sessao/useEntrevista";
import { useMidiaLocal } from "@/lib/presenca/useMidiaLocal";
import { useFimPorSilencio } from "@/lib/presenca/useFimPorSilencio";
import type { NonDeletedExcalidrawElement } from "@/lib/excalidraw/tipos";
import { adicionar, type Requisito } from "@/lib/sessao/requisitos";
import { anotarRequisito } from "@/lib/presenca/coreografia";

/** Demonstração: o que o agente pergunta, o que o candidato responde e o requisito que fica combinado. */
const ROTEIRO_DEMO = [
  {
    pergunta: "Quantas URLs novas vocês esperam por mês?",
    resposta: "Acho que umas 100 milhões por mês.",
    requisito: "100 milhões de URLs novas por mês",
  },
  {
    pergunta: "E a proporção entre leitura e escrita?",
    resposta: "A leitura é bem maior, umas 100 vezes. Dá uns 4 mil por segundo.",
    requisito: "Leitura 100x maior que escrita (~4 mil/s)",
  },
  {
    pergunta: "Por quanto tempo os links precisam continuar funcionando?",
    resposta: "Vamos guardar por 5 anos.",
    requisito: "Guardar por 5 anos",
  },
  {
    pergunta: "Qual o tamanho do código curto?",
    resposta: "7 caracteres devem bastar.",
    requisito: "Código curto de 7 caracteres",
  },
];

/** Simula a conversa e os requisitos até virem do servidor: cada clique encena um passo do roteiro. */
function useDemoRequisitos() {
  const [requisitos, setRequisitos] = useState<Requisito[]>([]);
  const [mensagens, setMensagens] = useState<MensagemConversa[]>([]);
  const [passo, setPasso] = useState(0);
  const [encenando, setEncenando] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const depois = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  function encenar() {
    const item = ROTEIRO_DEMO[passo];
    if (!item || encenando) return;
    setEncenando(true);
    setPasso((p) => p + 1);
    const idPergunta = `demo-${passo}-agente`;
    const idResposta = `demo-${passo}-candidato`;
    setMensagens((m) => [...m, { id: idPergunta, quem: "agente", texto: item.pergunta, horario: Date.now() }]);

    // A resposta chega aos poucos (parcial), como a transcrição da voz, e depois fica final.
    const palavras = item.resposta.split(" ");
    const inicio = 900;
    palavras.forEach((_, i) => {
      depois(inicio + i * 140, () => {
        const texto = palavras.slice(0, i + 1).join(" ");
        setMensagens((m) =>
          m.some((x) => x.id === idResposta)
            ? m.map((x) => (x.id === idResposta ? { ...x, texto } : x))
            : [...m, { id: idResposta, quem: "candidato", texto, parcial: true, horario: Date.now() }],
        );
      });
    });
    const fim = inicio + palavras.length * 140 + 300;
    depois(fim, () => {
      setMensagens((m) => m.map((x) => (x.id === idResposta ? { ...x, parcial: false } : x)));
      setRequisitos((r) => adicionar(r, item.requisito));
      setEncenando(false);
    });
  }

  return { requisitos, mensagens, encenar, encenando, acabou: passo >= ROTEIRO_DEMO.length };
}

const Canvas = dynamic(() => import("@/components/Canvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-superficie-2" />,
});

export default function SalaEntrevista() {
  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const cursor = useRef<ControleCursor | null>(null);
  const entrevista = useEntrevista(quadro, cursor);
  const midia = useMidiaLocal();
  const { estado, sessao } = entrevista;
  const demo = useDemoRequisitos();

  // Cada requisito combinado é escrito pelo agente no próprio quadro, abaixo do enunciado.
  const requisitosEscritos = useRef(0);
  useEffect(() => {
    if (!quadro) return;
    while (requisitosEscritos.current < demo.requisitos.length) {
      const indice = requisitosEscritos.current++;
      void anotarRequisito({ quadro, cursor: cursor.current, texto: demo.requisitos[indice].texto, indice }).catch((erro) =>
        console.warn("[requisitos]", erro),
      );
    }
  }, [demo.requisitos, quadro]);
  const [conversaAberta, setConversaAberta] = useState(false);
  const [confirmandoFim, setConfirmandoFim] = useState(false);
  const cancelarFim = useCallback(() => setConfirmandoFim(false), []);
  const fecharConversa = useCallback(() => setConversaAberta(false), []);

  // A resposta a um plin termina sozinha quando o candidato fala e depois fica em silêncio.
  useFimPorSilencio({
    ativo: estado.plin === "PERGUNTA_ATIVA",
    agenteFalando: entrevista.agenteFalando,
    volume: midia.volume,
    aoTerminar: entrevista.terminarResposta,
  });

  function aoMudarDesenho(elementos: NonDeletedExcalidrawElement[]) {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[quadro] ${elementos.length} elemento(s)`, elementos);
    }
    entrevista.desenhoMudou();
  }

  function aoQuadroPronto(q: Quadro) {
    setQuadro(q);
    // Só para depurar no console do navegador durante o desenvolvimento.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { quadro: Quadro }).quadro = q;
    }
  }

  async function comecar() {
    await midia.pedir();
    entrevista.comecar();
  }

  const pronto = quadro !== null && sessao !== null;
  const mostrarCartao = estado.fase === "AGUARDANDO" || estado.fase === "ENCERRADA";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-superficie">
      <Canvas onDesenhoMudou={aoMudarDesenho} onPronto={aoQuadroPronto} />

      {estado.fase !== "AGUARDANDO" && (
        <JanelaChamada
          estado={estado}
          iniciadaEm={entrevista.iniciadaEm}
          midia={midia}
          agenteFalando={entrevista.agenteFalando}
          onClicarPlin={entrevista.clicarPlin}
          onTerminarResposta={entrevista.terminarResposta}
          onEncerrar={() => setConfirmandoFim(true)}
        />
      )}

      <Legenda fala={entrevista.falaAtual} />

      {/* Só para demonstração: dispara a pergunta do agente e encena a conversa dos requisitos. */}
      {estado.fase !== "AGUARDANDO" && estado.fase !== "ENCERRADA" && (
        <div className="absolute top-[72px] left-4 z-10 flex gap-2">
          <button
            onClick={entrevista.perguntaDemo}
            disabled={estado.plin !== "LIVRE"}
            className="rounded-full border border-borda bg-vidro px-3.5 py-1.5 text-xs font-medium text-texto-suave shadow-padrao backdrop-blur-xl transition-[opacity,transform] duration-150 ease-suave hover:text-texto active:scale-95 disabled:opacity-40"
          >
            Demo: fazer pergunta
          </button>
          <button
            onClick={demo.encenar}
            disabled={demo.encenando || demo.acabou}
            aria-label="Demonstração: combinar o próximo requisito"
            className="rounded-full border border-borda bg-vidro px-3.5 py-1.5 text-xs font-medium text-texto-suave shadow-padrao backdrop-blur-xl transition-[opacity,transform] duration-150 ease-suave outline-none hover:text-texto focus-visible:ring-2 focus-visible:ring-marca active:scale-95 disabled:opacity-40"
          >
            Demo: combinar requisito
          </button>
        </div>
      )}

      {estado.fase !== "AGUARDANDO" && (
        <div data-painel-direito className="absolute top-[72px] right-4 z-10 flex items-start gap-2">
          <button
            onClick={() => setConversaAberta(true)}
            aria-label="Abrir conversa"
            aria-haspopup="dialog"
            aria-expanded={conversaAberta}
            className="flex items-center gap-1.5 rounded-full border border-borda bg-vidro px-3.5 py-2 text-xs font-medium text-texto-suave shadow-padrao backdrop-blur-xl transition-[color,transform] duration-150 ease-suave outline-none hover:text-texto focus-visible:ring-2 focus-visible:ring-marca active:scale-95"
          >
            <svg
              viewBox="0 0 16 16"
              width={14}
              height={14}
              aria-hidden
              className="fill-none stroke-current"
              strokeWidth={1.5}
              strokeLinejoin="round"
            >
              <path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0.5a2 2 0 0 1-2-2Z" />
            </svg>
            Conversa
          </button>
        </div>
      )}

      <PainelConversa
        aberto={conversaAberta}
        onFechar={fecharConversa}
        mensagens={demo.mensagens}
        onVerNoQuadro={(id) => console.debug("[conversa] ver no quadro", id)}
      />

      <ConfirmarEncerrar
        aberto={confirmandoFim}
        onCancelar={cancelarFim}
        onConfirmar={() => {
          setConfirmandoFim(false);
          entrevista.encerrar();
        }}
      />

      <CursorAgente
        onPronto={(c) => {
          cursor.current = c;
        }}
      />

      <AnimatePresence>
        {mostrarCartao && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-fundo/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.36, ease: [0.32, 0.72, 0, 1] }}
              className="flex w-[380px] flex-col gap-4 rounded-padrao bg-superficie p-8 shadow-flutuante"
            >
              {estado.fase === "AGUARDANDO" ? (
                <>
                  <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">
                    {sessao ? `Entrevista de ${sessao.area}` : "Entrevista"}
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight">Pronto para começar?</h1>
                  <p className="leading-relaxed text-texto-suave">
                    O entrevistador vai apresentar o problema no quadro e acompanhar o seu desenho. Fale com
                    ele sempre que quiser.
                  </p>
                  <p className="text-sm leading-relaxed text-texto-suave">
                    Vamos pedir a câmera e o microfone. A sua câmera aparece só para você: não é gravada nem
                    analisada.
                  </p>
                  <button
                    onClick={comecar}
                    disabled={!pronto}
                    className="mt-2 rounded-full bg-marca px-5 py-2.5 font-medium text-white transition-[opacity,transform] duration-150 ease-suave hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                  >
                    Começar
                  </button>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight">Entrevista encerrada</h1>
                  <p className="leading-relaxed text-texto-suave">Obrigado! O relatório está sendo gerado.</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
