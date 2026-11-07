"use client";

// Monta a sala da entrevista de system design: painel do problema, quadro e janela de chamada.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import PainelProblema from "@/components/PainelProblema";
import JanelaChamada from "@/components/JanelaChamada";
import { criarSessao, type Fase, type Sessao } from "@/lib/sessao/cliente";
import type { ExcalidrawImperativeAPI, NonDeletedExcalidrawElement } from "@/lib/excalidraw/tipos";

const Canvas = dynamic(() => import("@/components/Canvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-superficie-2" />,
});

export default function SalaEntrevista() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [fase] = useState<Fase>("REQUISITOS");
  const [iniciadaEm, setIniciadaEm] = useState<number | null>(null);

  useEffect(() => {
    criarSessao().then((s) => {
      setSessao(s);
      setIniciadaEm(Date.now());
    });
  }, []);

  function aoMudarDesenho(elementos: NonDeletedExcalidrawElement[]) {
    console.groupCollapsed(`[quadro] ${elementos.length} elemento(s)`);
    console.table(
      elementos.map((e) => ({
        id: e.id,
        tipo: e.type,
        texto: "text" in e ? e.text : "",
        x: Math.round(e.x),
        y: Math.round(e.y),
        autor: e.customData?.autor ?? "candidato",
      })),
    );
    console.log(elementos);
    console.groupEnd();
  }

  function aoApiPronta(api: ExcalidrawImperativeAPI) {
    // Só para depurar no console do navegador durante o desenvolvimento.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { excalidrawAPI: ExcalidrawImperativeAPI }).excalidrawAPI = api;
    }
  }

  return (
    <main className="flex h-dvh gap-3 bg-fundo p-3">
      <PainelProblema
        titulo={sessao?.problema.titulo}
        enunciado={sessao?.problema.enunciado}
        fase={fase}
        iniciadaEm={iniciadaEm}
      />

      <section className="relative min-w-0 flex-1 overflow-hidden rounded-padrao bg-superficie shadow-padrao">
        <Canvas onDesenhoMudou={aoMudarDesenho} onApiPronta={aoApiPronta} />

        {/* Fica acima do botão de ajuda do Excalidraw, no canto inferior direito. */}
        <div className="pointer-events-none absolute right-4 bottom-16 z-10">
          <JanelaChamada />
        </div>
      </section>
    </main>
  );
}
