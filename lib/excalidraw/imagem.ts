import { exportToBlob, exportToCanvas } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "./tipos";

/** Importe este módulo dinamicamente no navegador. Exporta apenas o desenho do candidato. */
export async function imagemDoCandidato(
  api: ExcalidrawImperativeAPI,
  opcoes?: { maxLargura?: number },
): Promise<Blob | null> {
  const maxLargura = opcoes?.maxLargura ?? 1600;
  if (!Number.isFinite(maxLargura) || maxLargura < 1) {
    throw new RangeError("A largura máxima deve ser finita e de pelo menos um pixel.");
  }
  const cena = api.getSceneElements();
  const ignorados = new Set(cena.filter((e) => e.isDeleted || e.customData?.autor === "agente").map((e) => e.id));
  const elements = cena.filter((e) => !ignorados.has(e.id) && e.type !== "selection"
    && !(e.type === "text" && e.containerId && ignorados.has(e.containerId)));
  if (!elements.length) return null;

  return exportToBlob({
    elements,
    appState: {
      ...api.getAppState(),
      exportBackground: true,
      viewBackgroundColor: "#ffffff",
      exportWithDarkMode: false,
      exportEmbedScene: false,
    },
    files: api.getFiles(),
    mimeType: "image/png",
    exportPadding: 24,
    getDimensions(width: number, height: number) {
      const scale = Math.min(1, Math.floor(maxLargura) / width);
      return { width: width * scale, height: height * scale, scale };
    },
  });
}

/** Miniatura JPEG (data URL) do desenho do candidato, para o Totti enxergar o quadro. Null se vazio ou em erro. */
export async function quadroDataUrl(
  api: ExcalidrawImperativeAPI,
  opcoes?: { maxLargura?: number; qualidade?: number },
): Promise<string | null> {
  try {
    const maxLargura = opcoes?.maxLargura ?? 1024;
    const qualidade = opcoes?.qualidade ?? 0.76;
    const cena = api.getSceneElements();
    const ignorados = new Set(cena.filter((e) => e.isDeleted || e.customData?.autor === "agente").map((e) => e.id));
    const elements = cena.filter((e) => !ignorados.has(e.id) && e.type !== "selection"
      && !(e.type === "text" && e.containerId && ignorados.has(e.containerId)));
    if (!elements.length) return null;
    const canvas = await exportToCanvas({
      elements,
      appState: {
        ...api.getAppState(),
        exportBackground: true,
        viewBackgroundColor: "#ffffff",
        exportWithDarkMode: false,
        exportEmbedScene: false,
      },
      files: api.getFiles(),
      exportPadding: 24,
      getDimensions(width: number, height: number) {
        const scale = Math.min(1, maxLargura / width);
        return { width: width * scale, height: height * scale, scale };
      },
    });
    return canvas.toDataURL("image/jpeg", qualidade);
  } catch {
    return null;
  }
}
