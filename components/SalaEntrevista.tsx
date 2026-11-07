"use client";

// Sala da entrevista de system design: o quadro em tela cheia e a janela de chamada no canto.
// O enunciado não fica num painel: o agente escreve no próprio quadro.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import JanelaChamada from "@/components/JanelaChamada";
import type { Quadro } from "@/components/Canvas";
import { criarSessao, type Fase, type Sessao } from "@/lib/sessao/cliente";
import type { NonDeletedExcalidrawElement } from "@/lib/excalidraw/tipos";

const Canvas = dynamic(() => import("@/components/Canvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-superficie-2" />,
});

export default function SalaEntrevista() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const [fase] = useState<Fase>("REQUISITOS");
  const [iniciadaEm, setIniciadaEm] = useState<number | null>(null);
  const enunciadoEscrito = useRef(false);

  useEffect(() => {
    criarSessao().then((s) => {
      setSessao(s);
      setIniciadaEm(Date.now());
    });
  }, []);

  // O agente escreve o enunciado no quadro assim que a sessão e o quadro estão prontos.
  useEffect(() => {
    if (!sessao || !quadro || enunciadoEscrito.current) return;
    enunciadoEscrito.current = true;
    (async () => {
      await quadro.agente.escrever({
        id: "agente-enunciado-titulo",
        grupo: "enunciado",
        texto: sessao.problema.titulo,
        x: 40,
        y: 110,
        tamanho: 32,
      });
      await quadro.agente.escrever({
        id: "agente-enunciado-texto",
        grupo: "enunciado",
        texto: sessao.problema.enunciado,
        x: 40,
        y: 160,
        tamanho: 20,
      });
    })();
  }, [sessao, quadro]);

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

  function aoQuadroPronto(q: Quadro) {
    setQuadro(q);
    // Só para depurar no console do navegador durante o desenvolvimento.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { quadro: Quadro }).quadro = q;
    }
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-superficie">
      <Canvas onDesenhoMudou={aoMudarDesenho} onPronto={aoQuadroPronto} />

      {/* Acima do botão de ajuda do Excalidraw, no canto inferior direito. */}
      <div className="pointer-events-none absolute right-4 bottom-16 z-10">
        <JanelaChamada fase={fase} iniciadaEm={iniciadaEm} />
      </div>
    </main>
  );
}
