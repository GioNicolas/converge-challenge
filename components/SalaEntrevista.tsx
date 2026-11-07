"use client";

// Sala da entrevista no quadro: o quadro em tela cheia, a janela de chamada no canto e a legenda embaixo.
// O enunciado não fica num painel: o agente escreve no próprio quadro.
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import JanelaChamada from "@/components/JanelaChamada";
import Legenda from "@/components/Legenda";
import CursorAgente, { type ControleCursor } from "@/components/CursorAgente";
import type { Quadro } from "@/components/Canvas";
import { useEntrevista } from "@/lib/sessao/useEntrevista";
import { useMidiaLocal } from "@/lib/presenca/useMidiaLocal";
import { useFimPorSilencio } from "@/lib/presenca/useFimPorSilencio";
import type { NonDeletedExcalidrawElement } from "@/lib/excalidraw/tipos";

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
          onEncerrar={entrevista.encerrar}
        />
      )}

      <Legenda fala={entrevista.falaAtual} />

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
