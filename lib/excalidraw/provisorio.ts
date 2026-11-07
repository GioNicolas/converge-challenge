// Conversor e diff PROVISÓRIOS, só para o fluxo rodar até o conversor de verdade
// (lib/excalidraw/conversor.ts e diff.ts) ficar pronto. Mesma interface; usa os IDs reais.
// Apagar este arquivo quando trocar.
import type { ExcalidrawElement } from "@/lib/excalidraw/tipos";

const TIPO: Record<string, string> = {
  rectangle: "retângulo",
  ellipse: "elipse",
  diamond: "losango",
};

export type InstantaneoProvisorio = { linhas: string[] };

export function criarConversor() {
  return {
    converter(elementos: readonly ExcalidrawElement[]) {
      const vivos = elementos.filter((e) => !e.isDeleted && e.customData?.autor !== "agente");
      const textoDe = (id: string) => {
        const t = vivos.find((e) => e.type === "text" && "containerId" in e && e.containerId === id);
        return t && "text" in t ? t.text.replace(/\s+/g, " ") : "";
      };
      const nome = (id?: string | null) => (id ? textoDe(id) || "?" : "?");

      const componentes = vivos
        .filter((e) => e.type in TIPO)
        .map((e) => `- [${e.id}] ${textoDe(e.id) || "(sem texto)"} (${TIPO[e.type]})`);
      const conexoes = vivos
        .filter((e) => e.type === "arrow")
        .map((e) => {
          const seta = e as ExcalidrawElement & {
            startBinding?: { elementId: string } | null;
            endBinding?: { elementId: string } | null;
          };
          const rotulo = textoDe(e.id);
          return `- [${e.id}] ${nome(seta.startBinding?.elementId)} → ${nome(seta.endBinding?.elementId)}${rotulo ? ` ("${rotulo}")` : ""}`;
        });
      const anotacoes = vivos
        .filter((e) => e.type === "text" && "containerId" in e && !e.containerId)
        .map((e) => `- [${e.id}] "${"text" in e ? e.text.replace(/\s+/g, " ") : ""}"`);

      const linhas = [...componentes, ...conexoes, ...anotacoes];
      const texto = [
        "COMPONENTES",
        ...componentes,
        "CONEXÕES",
        ...conexoes,
        ...(anotacoes.length ? ["ANOTAÇÕES SOLTAS", ...anotacoes] : []),
      ].join("\n");

      return {
        texto,
        instantaneo: { linhas } as InstantaneoProvisorio,
        precisaImagem: vivos.some((e) => e.type === "freedraw"),
      };
    },
    idReal: (id: string) => id,
    idCurto: (id: string) => id,
  };
}

export function descreverMudancas(anterior: InstantaneoProvisorio | null, atual: InstantaneoProvisorio) {
  const antes = new Set(anterior?.linhas ?? []);
  const depois = new Set(atual.linhas);
  return [
    ...atual.linhas.filter((l) => !antes.has(l)).map((l) => `+ ${l.slice(2)}`),
    ...(anterior?.linhas ?? []).filter((l) => !depois.has(l)).map((l) => `- ${l.slice(2)}`),
  ].join("\n");
}

export function houveMudancaRelevante(anterior: InstantaneoProvisorio | null, atual: InstantaneoProvisorio) {
  return descreverMudancas(anterior, atual) !== "";
}
