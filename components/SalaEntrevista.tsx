"use client";

// Sala da entrevista de system design: o quadro em tela cheia e a janela de chamada no canto.
// O enunciado não fica num painel: o agente escreve no próprio quadro.
import { useState } from "react";
import dynamic from "next/dynamic";
import JanelaChamada from "@/components/JanelaChamada";
import type { Quadro } from "@/components/Canvas";
import { useEntrevista } from "@/lib/sessao/useEntrevista";
import type { NonDeletedExcalidrawElement } from "@/lib/excalidraw/tipos";

const Canvas = dynamic(() => import("@/components/Canvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-superficie-2" />,
});

export default function SalaEntrevista() {
  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const entrevista = useEntrevista(quadro);
  const { estado } = entrevista;

  function aoMudarDesenho(elementos: NonDeletedExcalidrawElement[]) {
    console.groupCollapsed(`[quadro] ${elementos.length} elemento(s)`);
    console.table(
      elementos.map((e) => ({
        id: e.id,
        tipo: e.type,
        texto: "text" in e ? e.text : "",
        autor: e.customData?.autor ?? "candidato",
      })),
    );
    console.groupEnd();
    entrevista.desenhoMudou();
  }

  function aoQuadroPronto(q: Quadro) {
    setQuadro(q);
    // Só para depurar no console do navegador durante o desenvolvimento.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { quadro: Quadro }).quadro = q;
    }
  }

  const prontoParaComecar = estado.fase === "AGUARDANDO" && quadro !== null && entrevista.sessao !== null;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-superficie">
      <Canvas onDesenhoMudou={aoMudarDesenho} onPronto={aoQuadroPronto} />

      {/* Acima do botão de ajuda do Excalidraw, no canto inferior direito. */}
      <div className="pointer-events-none absolute right-4 bottom-16 z-10">
        <JanelaChamada
          estado={estado}
          iniciadaEm={entrevista.iniciadaEm}
          onClicarPlin={entrevista.clicarPlin}
          onTerminarResposta={entrevista.terminarResposta}
          onEncerrar={entrevista.encerrar}
        />
      </div>

      {(estado.fase === "AGUARDANDO" || estado.fase === "ENCERRADA") && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-fundo/60 backdrop-blur-sm">
          <div className="flex w-[360px] flex-col gap-4 rounded-padrao bg-superficie p-8 shadow-flutuante">
            {estado.fase === "AGUARDANDO" ? (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">Entrevista de system design</h1>
                <p className="leading-relaxed text-texto-suave">
                  O entrevistador vai apresentar o problema no quadro e acompanhar o seu desenho. Fale
                  com ele sempre que quiser.
                </p>
                <button
                  onClick={entrevista.comecar}
                  disabled={!prontoParaComecar}
                  className="rounded-full bg-marca px-5 py-2.5 font-medium text-white transition-opacity duration-150 ease-suave hover:opacity-90 disabled:opacity-40"
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
          </div>
        </div>
      )}
    </main>
  );
}
