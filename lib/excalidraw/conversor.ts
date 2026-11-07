import type { ExcalidrawElement } from "./tipos";
import {
  descreverConexao, entreAspas, nomeDoElemento, normalizarTexto,
  textoCurto, tiposEmPortugues,
  type Componente, type Conexao, type Instantaneo, type Secao,
} from "./instantaneo";

export type { Instantaneo } from "./instantaneo";

export type ResultadoConversao = {
  texto: string;
  instantaneo: Instantaneo;
  precisaImagem: boolean;
};

type Caixa = Extract<ExcalidrawElement, { type: Componente["tipo"] }>;
type Linha = Extract<ExcalidrawElement, { type: "arrow" | "line" }>;
type Texto = Extract<ExcalidrawElement, { type: "text" }>;
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

function contemTexto(forma: Caixa, ponto: Ponto): boolean {
  const [cx, cy] = centro(forma);
  const cos = Math.cos(forma.angle);
  const sin = Math.sin(forma.angle);
  const dx = (ponto[0] - cx) * cos + (ponto[1] - cy) * sin;
  const dy = -(ponto[0] - cx) * sin + (ponto[1] - cy) * cos;
  const rx = Math.abs(forma.width) / 2;
  const ry = Math.abs(forma.height) / 2;
  const tolerancia = 1e-9;
  if (rx === 0 || ry === 0) return Math.abs(dx) <= rx + tolerancia && Math.abs(dy) <= ry + tolerancia;
  if (forma.type === "ellipse") return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1 + tolerancia;
  if (forma.type === "diamond") return Math.abs(dx) / rx + Math.abs(dy) / ry <= 1 + tolerancia;
  return Math.abs(dx) <= rx + tolerancia && Math.abs(dy) <= ry + tolerancia;
}

function areaDaForma(forma: Caixa): number {
  const fator = forma.type === "ellipse" ? Math.PI / 4 : forma.type === "diamond" ? 0.5 : 1;
  return Math.abs(forma.width * forma.height) * fator;
}

/** Projeta no traço completo para medir proximidade e fração do comprimento. */
function proximidadeDaLinha(ponto: Ponto, linha: Linha): { distancia: number; progresso: number } | null {
  const pontos = linha.points.map(([x, y]): Ponto => [linha.x + x, linha.y + y]);
  const comprimentos = pontos.slice(1).map((p, i) => Math.hypot(p[0] - pontos[i][0], p[1] - pontos[i][1]));
  const total = comprimentos.reduce((soma, valor) => soma + valor, 0);
  if (total === 0) return null;
  let percorrido = 0;
  let distancia = Infinity;
  let progresso = 0;
  for (let i = 0; i < comprimentos.length; i++) {
    const comprimento = comprimentos[i];
    if (comprimento === 0) continue;
    const inicio = pontos[i];
    const fim = pontos[i + 1];
    const dx = fim[0] - inicio[0];
    const dy = fim[1] - inicio[1];
    const fracao = Math.max(0, Math.min(1, ((ponto[0] - inicio[0]) * dx + (ponto[1] - inicio[1]) * dy) / comprimento ** 2));
    const d = Math.hypot(ponto[0] - inicio[0] - dx * fracao, ponto[1] - inicio[1] - dy * fracao);
    if (d < distancia) {
      distancia = d;
      progresso = (percorrido + comprimento * fracao) / total;
    }
    percorrido += comprimento;
  }
  return { distancia, progresso };
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
    const textos = new Map<string, string[]>();
    for (const e of visiveis) {
      if (e.type !== "text" || !e.containerId) continue;
      const lista = textos.get(e.containerId) ?? [];
      lista.push(normalizarTexto(e.text));
      textos.set(e.containerId, lista);
    }
    const vinculados = new Set([...textos].filter(([, lista]) => lista.some(Boolean)).map(([real]) => real));
    const caixas = visiveis.filter(ehCaixa);
    const linhasVisiveis = visiveis.filter((e): e is Linha => e.type === "arrow" || e.type === "line");
    const soltos = visiveis.filter((e): e is Texto => e.type === "text" && !e.containerId);
    const absorvidos = new Map<string, string>();
    const dentroDe = new Map<string, string>();
    for (const texto of soltos) {
      if (!normalizarTexto(texto.text)) continue;
      const ponto = centro(texto);
      const recipiente = caixas.filter((c) => contemTexto(c, ponto)).reduce<Caixa | undefined>((menor, c) =>
        !menor || areaDaForma(c) < areaDaForma(menor) ? c : menor, undefined);
      if (recipiente) {
        if (vinculados.has(recipiente.id)) dentroDe.set(texto.id, recipiente.id);
        else absorvidos.set(texto.id, recipiente.id);
        continue;
      }
      let proxima: Linha | undefined;
      let menorDistancia = Infinity;
      for (const linha of linhasVisiveis) {
        const p = proximidadeDaLinha(ponto, linha);
        if (p && p.distancia <= 30 && p.progresso >= 0.2 && p.progresso <= 0.8 && p.distancia < menorDistancia) {
          proxima = linha;
          menorDistancia = p.distancia;
        }
      }
      if (proxima && !vinculados.has(proxima.id)) absorvidos.set(texto.id, proxima.id);
    }
    for (const texto of soltos) {
      const destino = absorvidos.get(texto.id);
      if (destino) textos.set(destino, [...(textos.get(destino) ?? []), normalizarTexto(texto.text)]);
    }
    const representados = visiveis.filter((e) => e.type !== "text" || (!e.containerId && !absorvidos.has(e.id)));
    const ids = new Map(representados.map((e) => [e.id, atribuirId(e)]));
    const id = (real: string) => ids.get(real)!;
    const nome = (real: string) => (textos.get(real) ?? []).filter(Boolean).join(" ");
    const componentes: Componente[] = caixas.map((e) => {
      const area = Math.abs(e.width * e.height);
      const pais = caixas.filter((outro) => outro.id !== e.id && Math.abs(outro.width * outro.height) > area && distancia(centro(e), outro) === 0);
      // O menor recipiente evita repetir todos os ancestrais de caixas aninhadas.
      const pai = pais.reduce<Caixa | undefined>((menor, outro) =>
        !menor || Math.abs(outro.width * outro.height) < Math.abs(menor.width * menor.height) ? outro : menor, undefined);
      return { id: id(e.id), tipo: e.type, nome: nome(e.id), dentroDe: pai ? id(pai.id) : null };
    });
    const conexoes = linhasVisiveis.map((e): Conexao => {
      function ponta(binding: typeof e.startBinding, indice: number): string | null {
        // Um vínculo explícito a um elemento ignorado nunca vira vínculo por proximidade.
        if (binding) return ids.get(absorvidos.get(binding.elementId) ?? binding.elementId) ?? null;
        const ponto = e.points[indice];
        if (!ponto) return null;
        const proximo = maisProximo([e.x + ponto[0], e.y + ponto[1]], caixas, 40);
        return proximo ? id(proximo.id) : null;
      }
      const comeco = ponta(e.startBinding, 0);
      const fim = ponta(e.endBinding, e.points.length - 1);
      const cabecaNoComeco = !!e.startArrowhead;
      const cabecaNoFim = !!e.endArrowhead;
      // Em system design a direção importa (quem chama quem): ponta só no começo inverte a leitura.
      const inverter = cabecaNoComeco && !cabecaNoFim;
      const seta = cabecaNoComeco && cabecaNoFim ? "↔" : cabecaNoComeco || cabecaNoFim ? "→" : "—";
      return {
        id: id(e.id), tipo: e.type,
        de: inverter ? fim : comeco, para: inverter ? comeco : fim,
        seta, rotulo: nome(e.id),
      };
    });
    const anotacoes = soltos.filter((e) => !absorvidos.has(e.id)).map((e) => ({
      id: id(e.id), texto: normalizarTexto(e.text), dentroDe: dentroDe.has(e.id) ? id(dentroDe.get(e.id)!) : null,
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
    if (anotacoes.length) linhas.push("ANOTAÇÕES SOLTAS", ...anotacoes.map((a) =>
      `- [${a.id}] ${entreAspas(a.texto)}${a.dentroDe ? `  dentro de [${a.dentroDe}] ${nomeDoElemento(instantaneo, a.dentroDe)}` : ""}`));
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
