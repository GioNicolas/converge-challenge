import { circuloAMao, type Traco } from "./formas";
import type { AcaoVisual } from "./acoesVisuais";
import type { Caixa, Ponto } from "./tipos";
import { quebrarLinhas } from "../excalidraw/texto";

export type Gesto = { tipo: "traco"; traco: Traco } | { tipo: "apontar"; ponto: Ponto }
  | { tipo: "texto"; texto: string; ponto: Ponto };
/** Caixa de um elemento; setas e linhas podem trazer a polilinha (pontos relativos a x,y) em `pontos`. */
export type CaixaComPontos = Caixa & { pontos?: readonly (readonly [number, number])[] };

/** Ponto médio ao longo da polilinha (pelo comprimento). */
function pontoMedioDaPolilinha(c: CaixaComPontos): Ponto | null {
  const pts = c.pontos;
  if (!pts || pts.length < 2) return null;
  const trechos = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = trechos.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let alvo = total / 2;
  for (let i = 0; i < trechos.length; i++) {
    if (alvo <= trechos[i] || i === trechos.length - 1) {
      const f = trechos[i] === 0 ? 0 : alvo / trechos[i];
      return { x: c.x + pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y: c.y + pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f };
    }
    alvo -= trechos[i];
  }
  return null;
}
const meio = (c: Caixa): Ponto => pontoMedioDaPolilinha(c) ?? { x: c.x + c.largura / 2, y: c.y + c.altura / 2 };
/** Numa seta ou linha, os gestos de contorno miram um trecho pequeno no meio dela, não a caixa inteira
 * (uma seta diagonal longa virava um círculo cobrindo metade do quadro). */
function focoDe(c: CaixaComPontos): Caixa {
  const m = pontoMedioDaPolilinha(c);
  return m ? { x: m.x - 40, y: m.y - 26, largura: 80, altura: 52 } : c;
}
const traco = (c: Caixa, pontos: [number, number][]): Gesto => ({ tipo: "traco", traco: { origem: { x: c.x, y: c.y }, pontos } });
const sublinhar = (c: Caixa): Gesto => traco(c, [[0, c.altura + 8], [c.largura * 0.45, c.altura + 10], [c.largura, c.altura + 7]]);
function intersecao(a: Caixa, b: Caixa): number {
  return Math.max(0, Math.min(a.x + a.largura, b.x + b.largura) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.altura, b.y + b.altura) - Math.max(a.y, b.y));
}

/** Busca espaço livre ao redor do assunto e nas demais regiões visíveis. */
export function lugarDaAnotacao(texto: string, alvo: Caixa | undefined, ocupados: Caixa[], area: Caixa): Caixa {
  const linhas = quebrarLinhas(texto, 26).split("\n");
  const largura = Math.min(area.largura, Math.max(...linhas.map((l) => l.length)) * 11 + 20);
  const altura = Math.min(area.altura, linhas.length * 25 + 12);
  const referencia = alvo ?? { x: area.x, y: area.y, largura: 0, altura: 0 };
  const candidatos: Ponto[] = [
    { x: referencia.x + referencia.largura + 24, y: referencia.y },
    { x: referencia.x, y: referencia.y + referencia.altura + 24 },
    { x: referencia.x - largura - 24, y: referencia.y },
    { x: referencia.x, y: referencia.y - altura - 24 },
  ];
  for (let linha = 0; linha < 4; linha++) for (let coluna = 0; coluna < 4; coluna++) {
    candidatos.push({ x: area.x + (area.largura - largura) * coluna / 3, y: area.y + (area.altura - altura) * linha / 3 });
  }
  const caixas = candidatos.map((p) => ({
    x: Math.max(area.x, Math.min(p.x, area.x + area.largura - largura)),
    y: Math.max(area.y, Math.min(p.y, area.y + area.altura - altura)), largura, altura,
  }));
  const custo = (c: Caixa) => ocupados.reduce((s, o) => s + intersecao(c, o), 0) * 1000
    + Math.hypot(c.x - referencia.x, c.y - referencia.y);
  return caixas.reduce((melhor, c) => custo(c) < custo(melhor) ? c : melhor);
}

/** Converte o plano relativo em gestos na cena, sem modificar os elementos do candidato. */
export function comporGestos(acao: AcaoVisual, caixas: ReadonlyMap<string, CaixaComPontos>, area: Caixa, semente: number): Gesto[] {
  if (acao.tipo === "anotar") {
    const alvo = acao.alvo ? caixas.get(acao.alvo) : undefined;
    if (acao.alvo && !alvo) return [];
    const lugar = lugarDaAnotacao(acao.texto, alvo, [...caixas.values()], area);
    return [{ tipo: "texto", texto: acao.texto, ponto: { x: lugar.x + 10, y: lugar.y + 6 } }];
  }
  if (acao.tipo === "percorrer" || acao.tipo === "comparar") {
    const alvos = acao.alvos.map((id) => caixas.get(id));
    if (alvos.some((c) => !c)) return [];
    return alvos.flatMap((c, i): Gesto[] => acao.tipo === "percorrer"
      ? [{ tipo: "apontar", ponto: meio(c!) }]
      : [sublinhar(focoDe(c!)), { tipo: "texto", texto: String.fromCharCode(65 + i), ponto: { x: c!.x - 22, y: c!.y } }]);
  }
  const original = caixas.get(acao.alvo);
  if (!original) return [];
  const c = focoDe(original);
  switch (acao.tipo) {
    case "apontar": return [{ tipo: "apontar", ponto: meio(original) }];
    case "sublinhar": return [sublinhar(c)];
    case "circular": return [{ tipo: "traco", traco: circuloAMao(c, semente) }];
    case "enquadrar": return [traco(c, [[-10, -10], [c.largura + 10, -8], [c.largura + 8, c.altura + 10], [-10, c.altura + 8], [-10, -10]])];
    case "colchetes": return [
      traco(c, [[4, -10], [-12, -10], [-12, c.altura + 10], [4, c.altura + 10]]),
      traco(c, [[c.largura - 4, -10], [c.largura + 12, -10], [c.largura + 12, c.altura + 10], [c.largura - 4, c.altura + 10]]),
    ];
    case "traco": return [traco(c, acao.pontos.map(([x, y]) => [-10 + x * (c.largura + 20), -10 + y * (c.altura + 20)]))];
  }
}
