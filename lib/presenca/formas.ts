import { aleatorioComSemente, bezier, centro, limitar, normalizarCaixa } from "./interno";
import type { Caixa, Ponto } from "./tipos";

export type { Caixa, Ponto } from "./tipos";
export type Traco = { origem: Ponto; pontos: [number, number][] };

/** Elipse horária, com uma volta mais 15–30 graus e variação radial de até 4%. */
export function circuloAMao(c: Caixa, semente: number): Traco {
  const caixa = normalizarCaixa(c);
  const meio = centro(caixa);
  const aleatorio = aleatorioComSemente(semente);
  const quantidade = 48 + Math.floor(aleatorio() * 17);
  const inicio = -3 * Math.PI / 4 + (aleatorio() - 0.5) * Math.PI / 12;
  const volta = 2 * Math.PI + (15 + 15 * aleatorio()) * Math.PI / 180;
  const fase1 = aleatorio() * Math.PI * 2;
  const fase2 = aleatorio() * Math.PI * 2;
  const folga = Math.max(12, Math.min(caixa.largura, caixa.altura) * 0.08);
  // sqrt(2) inclui os cantos; /0.96 compensa a menor oscilação do raio.
  const rx = (caixa.largura / 2 + folga) * Math.SQRT2 / 0.96;
  const ry = (caixa.altura / 2 + folga) * Math.SQRT2 / 0.96;
  const absolutos: Ponto[] = [];
  for (let i = 0; i < quantidade; i++) {
    const angulo = inicio + volta * i / (quantidade - 1);
    const raio = 1 + 0.025 * Math.sin(3 * angulo + fase1) + 0.015 * Math.sin(7 * angulo + fase2);
    absolutos.push({ x: meio.x + rx * raio * Math.cos(angulo), y: meio.y + ry * raio * Math.sin(angulo) });
  }
  const origem = { ...absolutos[0] };
  return { origem, pontos: absolutos.map((p) => [p.x - origem.x, p.y - origem.y]) };
}

/**
 * Contorno à mão que acompanha uma elipse (ou o losango inscrito nela), por fora: raio da forma mais `folga`, com a
 * mesma volta e variação de `circuloAMao`. `circuloAMao` envolve os cantos da caixa (sqrt(2)) e, numa elipse,
 * ficava largo demais.
 */
export function contornoAMao(c: Caixa, semente: number, folga: number): Traco {
  const caixa = normalizarCaixa(c);
  const meio = centro(caixa);
  const aleatorio = aleatorioComSemente(semente);
  const quantidade = 48 + Math.floor(aleatorio() * 17);
  const inicio = -3 * Math.PI / 4 + (aleatorio() - 0.5) * Math.PI / 12;
  const volta = 2 * Math.PI + (15 + 15 * aleatorio()) * Math.PI / 180;
  const fase1 = aleatorio() * Math.PI * 2;
  const fase2 = aleatorio() * Math.PI * 2;
  // A variação de raio é só para fora (1 a 1,04): o traço nunca entra na forma.
  const rx = caixa.largura / 2 + folga;
  const ry = caixa.altura / 2 + folga;
  const absolutos: Ponto[] = [];
  for (let i = 0; i < quantidade; i++) {
    const angulo = inicio + volta * i / (quantidade - 1);
    const raio = 1.02 + 0.012 * Math.sin(3 * angulo + fase1) + 0.008 * Math.sin(7 * angulo + fase2);
    absolutos.push({ x: meio.x + rx * raio * Math.cos(angulo), y: meio.y + ry * raio * Math.sin(angulo) });
  }
  const origem = { ...absolutos[0] };
  return { origem, pontos: absolutos.map((p) => [p.x - origem.x, p.y - origem.y]) };
}

/** Haste curva sem ponta; origem e último ponto correspondem exatamente aos extremos. */
export function setaAMao(de: Ponto, para: Ponto, semente: number): Traco {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const distancia = Math.hypot(dx, dy);
  if (distancia === 0) return { origem: { ...de }, pontos: [[0, 0]] };
  const aleatorio = aleatorioComSemente(semente);
  const lado = aleatorio() < 0.5 ? -1 : 1;
  const curva = distancia * (0.04 + 0.04 * aleatorio()) * lado;
  const perpendicular = { x: -dy / distancia, y: dx / distancia };
  const a = { x: 0, y: 0 };
  const b = { x: dx * 0.33 + perpendicular.x * curva, y: dy * 0.33 + perpendicular.y * curva };
  const c = { x: dx * 0.7 + perpendicular.x * curva * 0.8, y: dy * 0.7 + perpendicular.y * curva * 0.8 };
  const d = { x: dx, y: dy };
  const quantidade = 16 + Math.floor(aleatorio() * 5);
  const pontos: [number, number][] = Array.from({ length: quantidade }, (_, i) => {
    const p = bezier(a, b, c, d, i / (quantidade - 1));
    return [p.x, p.y];
  });
  pontos[0] = [0, 0];
  pontos[pontos.length - 1] = [dx, dy];
  return { origem: { ...de }, pontos };
}

/** Recorta por comprimento percorrido e sempre devolve uma cópia independente. */
export function parteDoTraco(t: Traco, progresso: number): Traco {
  const u = limitar(progresso);
  const origem = { ...t.origem };
  if (!t.pontos.length) return { origem, pontos: [] };
  if (u === 1) return { origem, pontos: t.pontos.map(([x, y]) => [x, y]) };
  const pontos: [number, number][] = [[...t.pontos[0]]];
  if (u === 0) return { origem, pontos };
  const comprimentos = t.pontos.slice(1).map((p, i) => Math.hypot(p[0] - t.pontos[i][0], p[1] - t.pontos[i][1]));
  const total = comprimentos.reduce((soma, valor) => soma + valor, 0);
  if (total === 0) return { origem, pontos };
  const desejado = total * u;
  let percorrido = 0;
  for (let i = 0; i < comprimentos.length; i++) {
    const comprimento = comprimentos[i];
    if (comprimento === 0) continue;
    const fim = t.pontos[i + 1];
    if (percorrido + comprimento < desejado) {
      pontos.push([...fim]);
      percorrido += comprimento;
      continue;
    }
    const inicio = t.pontos[i];
    const fracao = limitar((desejado - percorrido) / comprimento);
    pontos.push([inicio[0] + (fim[0] - inicio[0]) * fracao, inicio[1] + (fim[1] - inicio[1]) * fracao]);
    break;
  }
  return { origem, pontos };
}

function bordaEmDirecao(caixa: Caixa, destino: Ponto): Ponto {
  const meio = centro(caixa);
  const dx = destino.x - meio.x;
  const dy = destino.y - meio.y;
  if (dx === 0 && dy === 0) return meio;
  const fator = Math.min(dx === 0 ? Infinity : caixa.largura / (2 * Math.abs(dx)), dy === 0 ? Infinity : caixa.altura / (2 * Math.abs(dy)));
  return { x: meio.x + dx * fator, y: meio.y + dy * fator };
}

/**
 * Tudo em unidades da cena. Tenta direita, esquerda e embaixo, com folga de 24.
 * Sem espaço suficiente na vista, mantém a nota embaixo, sem sobrepor o alvo.
 */
export function posicionarNota(
  alvo: Caixa,
  tamanhoNota: { largura: number; altura: number },
  areaVisivel: Caixa,
): { nota: Ponto; setaDe: Ponto; setaPara: Ponto } {
  const caixa = normalizarCaixa(alvo);
  const area = normalizarCaixa(areaVisivel);
  const largura = Math.max(0, tamanhoNota.largura);
  const altura = Math.max(0, tamanhoNota.altura);
  const meio = centro(caixa);
  const x = limitar(meio.x - largura / 2, area.x, Math.max(area.x, area.x + area.largura - largura));
  const y = limitar(meio.y - altura / 2, area.y, Math.max(area.y, area.y + area.altura - altura));
  const candidatos: Caixa[] = [
    { x: caixa.x + caixa.largura + 24, y, largura, altura },
    { x: caixa.x - largura - 24, y, largura, altura },
    { x, y: caixa.y + caixa.altura + 24, largura, altura },
  ];
  const cabe = (c: Caixa) => c.x >= area.x && c.y >= area.y
    && c.x + c.largura <= area.x + area.largura && c.y + c.altura <= area.y + area.altura;
  const escolhida = candidatos.find(cabe) ?? candidatos[2];
  return {
    nota: { x: escolhida.x, y: escolhida.y },
    setaDe: bordaEmDirecao(caixa, centro(escolhida)),
    setaPara: bordaEmDirecao(escolhida, meio),
  };
}
