"use client";

// Excalidraw embutido. Só roda no navegador: importe este arquivo com
// dynamic(() => import("@/components/Canvas"), { ssr: false }).
import { useRef } from "react";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { criarCamadaAgente, ehDoAgente, type CamadaAgente } from "@/lib/excalidraw/agente";
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
  /**
   * Chamado só quando o desenho DO CANDIDATO muda (não em scroll, zoom, seleção
   * nem quando o agente escreve). Recebe os elementos visíveis, inclusive os do agente.
   */
  onDesenhoMudou?: (elementos: NonDeletedExcalidrawElement[]) => void;
  onPronto?: (quadro: Quadro) => void;
  bloqueado?: boolean;
};

export default function Canvas({ onDesenhoMudou, onPronto, bloqueado = false }: Props) {
  const ultimaVersao = useRef(-1);
  const agente = useRef<CamadaAgente | null>(null);

  function aoMudar(elementos: readonly OrderedExcalidrawElement[]) {
    agente.current?.proteger(elementos);

    // O onChange dispara também em scroll, zoom e seleção; a versão só muda com o desenho.
    // Conta só os elementos do candidato: o agente escrevendo não é mudança do candidato.
    const versao = getSceneVersion(elementos.filter((e) => !ehDoAgente(e)));
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
        viewModeEnabled={bloqueado}
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
