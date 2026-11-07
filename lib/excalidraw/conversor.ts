import type { ExcalidrawElement } from "./tipos";
import {
  descreverConexao, entreAspas, nomeDoElemento, normalizarTexto,
  textoCurto, tiposEmPortugues,
  type Componente, type Instantaneo, type Secao,
} from "./instantaneo";

export type { Instantaneo } from "./instantaneo";

export type ResultadoConversao = {
  texto: string;
  instantaneo: Instantaneo;
  precisaImagem: boolean;
};

type Caixa = Extract<ExcalidrawElement, { type: Componente["tipo"] }>;
type Ponto = readonly [number, number];

function ehCaixa(elemento: ExcalidrawElement): elemento is Caixa {
  return elemento.type in tiposEmPortugues;
}

function limites(elemento: ExcalidrawElement) {
  return {
    esquerda: Math.min(elemento.x, elemento.x + elemento.width),
    direita: Math.max(elemento.x, elemento.x + elemento.width),
    topo: Math.min(elemento.y, elemento.y + elemento.height),
    base: Math.max(elemento.y, elemento.y + elemento.height),
  };
}

function centro(elemento: ExcalidrawElement): Ponto {
  return [elemento.x + elemento.width / 2, elemento.y + elemento.height / 2];
}

function distancia(ponto: Ponto, elemento: ExcalidrawElement): number {
  const b = limites(elemento);
  return Math.hypot(
    Math.max(b.esquerda - ponto[0], 0, ponto[0] - b.direita),
    Math.max(b.topo - ponto[1], 0, ponto[1] - b.base),
  );
}

function maisProximo(ponto: Ponto, candidatos: readonly ExcalidrawElement[], limite: number) {
  let escolhido: ExcalidrawElement | undefined;
  let menor = limite;
  for (const candidato of candidatos) {
    const d = distancia(ponto, candidato);
    if (d <= menor && (!escolhido || d < menor)) {
      escolhido = candidato;
      menor = d;
    }
  }
  return escolhido;
}

function prefixo(elemento: ExcalidrawElement): string {
  switch (elemento.type) {
    case "rectangle": return "r";
    case "ellipse": return "e";
    case "diamond": return "l";
    case "arrow": case "line": return "s";
    case "text": return "t";
    case "frame": case "magicframe": return "m";
    case "freedraw": return "f";
    case "image": return "i";
    default: return "v";
  }
}

/** Crie uma instância por quadro e preserve-a entre análises. */
export function criarConversor(): {
  converter(elementos: readonly ExcalidrawElement[]): ResultadoConversao;
  idReal(idCurto: string): string | undefined;
  idCurto(idReal: string): string | undefined;
} {
  const curtos = new Map<string, string>();
  const reais = new Map<string, string>();
  const contadores = new Map<string, number>();

  function atribuirId(elemento: ExcalidrawElement): string {
    const existente = curtos.get(elemento.id);
    if (existente) return existente;
    const tipo = prefixo(elemento);
    const numero = (contadores.get(tipo) ?? 0) + 1;
    contadores.set(tipo, numero);
    const id = `${tipo}${numero}`;
    curtos.set(elemento.id, id);
    reais.set(id, elemento.id);
    return id;
  }

  function converter(elementos: readonly ExcalidrawElement[]): ResultadoConversao {
    const porId = new Map(elementos.map((e) => [e.id, e]));
    const visiveis = elementos.filter((e) => {
      if (e.isDeleted || e.customData?.autor === "agente" || e.type === "selection") return false;
      if (e.type !== "text" || !e.containerId) return true;
      const container = porId.get(e.containerId);
      return !!container && !container.isDeleted && container.customData?.autor !== "agente";
    });
    const representados = visiveis.filter((e) => e.type !== "text" || !e.containerId);
    const ids = new Map(representados.map((e) => [e.id, atribuirId(e)]));
    const id = (real: string) => ids.get(real)!;
    const textos = new Map<string, string[]>();
    for (const e of visiveis) {
      if (e.type !== "text" || !e.containerId) continue;
      const lista = textos.get(e.containerId) ?? [];
      lista.push(normalizarTexto(e.text));
      textos.set(e.containerId, lista);
    }
    const nome = (real: string) => (textos.get(real) ?? []).filter(Boolean).join(" ");
    const caixas = visiveis.filter(ehCaixa);
    const componentes: Componente[] = caixas.map((e) => {
      const area = Math.abs(e.width * e.height);
      const pais = caixas.filter((outro) => outro.id !== e.id && Math.abs(outro.width * outro.height) > area && distancia(centro(e), outro) === 0);
      // O menor recipiente evita repetir todos os ancestrais de caixas aninhadas.
      const pai = pais.reduce<Caixa | undefined>((menor, outro) =>
        !menor || Math.abs(outro.width * outro.height) < Math.abs(menor.width * menor.height) ? outro : menor, undefined);
      return { id: id(e.id), tipo: e.type, nome: nome(e.id), dentroDe: pai ? id(pai.id) : null };
    });
    const conexoes = visiveis.filter((e): e is Extract<ExcalidrawElement, { type: "arrow" | "line" }> => e.type === "arrow" || e.type === "line").map((e) => {
      function ponta(binding: typeof e.startBinding, indice: number): string | null {
        // Um vínculo explícito a um elemento ignorado nunca vira vínculo por proximidade.
        if (binding) return ids.get(binding.elementId) ?? null;
        const ponto = e.points[indice];
        if (!ponto) return null;
        const proximo = maisProximo([e.x + ponto[0], e.y + ponto[1]], caixas, 40);
        return proximo ? id(proximo.id) : null;
      }
      return { id: id(e.id), tipo: e.type, de: ponta(e.startBinding, 0), para: ponta(e.endBinding, e.points.length - 1), rotulo: nome(e.id) };
    });
    const anotacoes = visiveis.filter((e): e is Extract<ExcalidrawElement, { type: "text" }> => e.type === "text" && !e.containerId).map((e) => ({
      id: id(e.id), texto: normalizarTexto(e.text),
    }));
    const secoes: Secao[] = [];
    const grupos = new Set<string>();
    for (const e of representados) {
      if (e.type === "frame" || e.type === "magicframe") {
        secoes.push({ id: id(e.id), tipo: e.type, nome: normalizarTexto(e.name ?? ""), membros: representados.filter((outro) => outro.frameId === e.id).map((outro) => id(outro.id)) });
      }
      for (const grupo of e.groupIds) {
        if (grupos.has(grupo)) continue;
        grupos.add(grupo);
        secoes.push({ id: `grupo:${grupo}`, tipo: "grupo", nome: "", membros: representados.filter((outro) => outro.groupIds.includes(grupo)).map((outro) => id(outro.id)) });
      }
    }
    const desenhos = visiveis.filter((e) => e.type === "freedraw" || e.type === "image").map((e) => ({ id: id(e.id), tipo: e.type }));
    const instantaneo: Instantaneo = { componentes, conexoes, anotacoes, secoes, desenhos };
    const linhas = ["COMPONENTES"];
    for (const c of componentes) {
      const tipo = tiposEmPortugues[c.tipo];
      const dentro = c.dentroDe ? `  dentro de [${c.dentroDe}] ${nomeDoElemento(instantaneo, c.dentroDe)}` : "";
      linhas.push(`- [${c.id}] ${c.nome ? `${textoCurto(c.nome)} (${tipo})` : `(${tipo} sem texto)`}${dentro}`);
    }
    linhas.push("CONEXÕES");
    for (const c of conexoes) {
      const rotulo = c.rotulo ? ` (${entreAspas(c.rotulo)})` : "";
      const solta = c.de === null || c.para === null ? ` (${c.tipo === "arrow" ? "seta" : "linha"} solta)` : "";
      linhas.push(`- [${c.id}] ${descreverConexao(instantaneo, c)}${rotulo}${solta}`);
    }
    if (anotacoes.length) linhas.push("ANOTAÇÕES SOLTAS", ...anotacoes.map((a) => `- [${a.id}] ${entreAspas(a.texto)}`));
    if (secoes.length) linhas.push("SEÇÕES", ...secoes.map((s) =>
      `- ${s.tipo === "grupo" ? "grupo" : `[${s.id}] ${textoCurto(s.nome) || "moldura sem nome"}`}: ${s.membros.map((m) => `[${m}]`).join(", ")}`));
    if (desenhos.length) {
      linhas.push("DESENHOS SEM TEXTO");
      for (const d of desenhos) {
        const elemento = representados.find((e) => id(e.id) === d.id)!;
        const perto = maisProximo(centro(elemento), caixas, Infinity);
        linhas.push(`- [${d.id}] ${d.tipo === "freedraw" ? "desenho à mão livre" : "imagem"}${perto ? `, perto de [${id(perto.id)}]` : ""}`);
      }
    }
    const ordem = caixas.filter((e) => nome(e.id)).slice().sort((a, b) => centro(a)[0] - centro(b)[0]);
    if (ordem.length) linhas.push("ORDEM NA TELA (esquerda → direita)", `- ${ordem.map((e) => textoCurto(nome(e.id))).join(", ")}`);
    return { texto: linhas.join("\n"), instantaneo, precisaImagem: desenhos.length > 0 || componentes.some((c) => !c.nome) };
  }

  return { converter, idReal: (curto) => reais.get(curto), idCurto: (real) => curtos.get(real) };
}
