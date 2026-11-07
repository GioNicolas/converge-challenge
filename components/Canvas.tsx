"use client";

// Excalidraw embutido. Só roda no navegador: importe este arquivo com
// dynamic(() => import("@/components/Canvas"), { ssr: false }).
import { useRef } from "react";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@/lib/excalidraw/tipos";

type Props = {
  /** Chamado só quando o desenho muda de verdade (não a cada scroll ou zoom). */
  onDesenhoMudou?: (elementos: NonDeletedExcalidrawElement[]) => void;
  onApiPronta?: (api: ExcalidrawImperativeAPI) => void;
};

export default function Canvas({ onDesenhoMudou, onApiPronta }: Props) {
  const ultimaVersao = useRef(-1);

  function aoMudar(elementos: readonly OrderedExcalidrawElement[]) {
    // O onChange dispara também em scroll, zoom e seleção; a versão da cena só muda com o desenho.
    const versao = getSceneVersion(elementos);
    if (versao === ultimaVersao.current) return;
    ultimaVersao.current = versao;
    onDesenhoMudou?.(elementos.filter((e) => !e.isDeleted));
  }

  return (
    <div className="h-full w-full">
      <Excalidraw
        langCode="pt-BR"
        excalidrawAPI={(api) => onApiPronta?.(api)}
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
