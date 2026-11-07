"use client";

// Excalidraw embutido. Só roda no navegador: importe este arquivo com
// dynamic(() => import("@/components/Canvas"), { ssr: false }).
import { useRef } from "react";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { criarCamadaAgente, type CamadaAgente } from "@/lib/excalidraw/agente";
import type {
  ExcalidrawImperativeAPI,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@/lib/excalidraw/tipos";

export type Quadro = {
  api: ExcalidrawImperativeAPI;
  agente: CamadaAgente;
};

type Props = {
  /** Chamado só quando o desenho muda de verdade (não a cada scroll ou zoom). */
  onDesenhoMudou?: (elementos: NonDeletedExcalidrawElement[]) => void;
  onPronto?: (quadro: Quadro) => void;
};

export default function Canvas({ onDesenhoMudou, onPronto }: Props) {
  const ultimaVersao = useRef(-1);
  const agente = useRef<CamadaAgente | null>(null);

  function aoMudar(elementos: readonly OrderedExcalidrawElement[]) {
    agente.current?.proteger(elementos);

    // O onChange dispara também em scroll, zoom e seleção; a versão da cena só muda com o desenho.
    const versao = getSceneVersion(elementos);
    if (versao === ultimaVersao.current) return;
    ultimaVersao.current = versao;
    onDesenhoMudou?.(elementos.filter((e) => !e.isDeleted));
  }

  function aoApiPronta(api: ExcalidrawImperativeAPI) {
    agente.current = criarCamadaAgente(api);
    onPronto?.({ api, agente: agente.current });
  }

  return (
    <div className="h-full w-full">
      <Excalidraw
        langCode="pt-BR"
        excalidrawAPI={aoApiPronta}
        onChange={aoMudar}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  );
}
