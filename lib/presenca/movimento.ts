import { aleatorioComSemente, bezier, limitar } from "./interno";
import type { Ponto } from "./tipos";

export type { Ponto } from "./tipos";
export type Movimento = { duracaoMs: number; pontoEm(t: number): Ponto };

/** Aceleração e frenagem suaves, com velocidade e aceleração nulas nas pontas. */
export function suavizar(t: number): number {
  const u = limitar(t);
  return limitar(u ** 3 * (u * (u * 6 - 15) + 10));
}

/** Coordenadas em pixels; avaliar pontoEm não consome novas amostras aleatórias. */
export function planejarMovimento(de: Ponto, para: Ponto, semente: number): Movimento {
  const inicio = { ...de };
  const alvo = { ...para };
  const dx = alvo.x - inicio.x;
  const dy = alvo.y - inicio.y;
  const distancia = Math.hypot(dx, dy);
  const duracaoMs = limitar(Math.round(250 + 140 * Math.log2(1 + distancia / 40)), 250, 1100);
  if (distancia === 0) return { duracaoMs, pontoEm: () => ({ ...inicio }) };

  const aleatorio = aleatorioComSemente(semente);
  const ux = dx / distancia;
  const uy = dy / distancia;
  const lado = aleatorio() < 0.5 ? -1 : 1;
  const curva = distancia * (0.1 + 0.1 * aleatorio()) * lado;
  const ultrapassagem = distancia > 150 ? distancia * (0.03 + 0.03 * aleatorio()) : 0;
  const destino = { x: alvo.x + ux * ultrapassagem, y: alvo.y + uy * ultrapassagem };
  const deslocar = (p: Ponto, frente: number, lateral: number): Ponto => ({
    x: p.x + ux * frente - uy * lateral,
    y: p.y + uy * frente + ux * lateral,
  });
  const comprimento = distancia + ultrapassagem;
  const controle1 = deslocar(inicio, comprimento * 0.32, curva);
  const controle2 = deslocar(inicio, comprimento * 0.72, curva);
  const retorno1 = deslocar(destino, -ultrapassagem * 0.35, curva * 0.04);
  const retorno2 = deslocar(alvo, ultrapassagem * 0.2, curva * 0.02);
  const amplitude = Math.min(0.6, distancia * 0.01) * aleatorio();
  const fase = aleatorio() * Math.PI * 2;
  const frequencia = 2 + aleatorio() * 2;

  return {
    duracaoMs,
    pontoEm(t: number): Ponto {
      const u = limitar(t);
      if (u === 0) return { ...inicio };
      if (u === 1) return { ...alvo };
      const retornando = ultrapassagem > 0 && u > 0.82;
      const local = ultrapassagem === 0 ? u : retornando ? (u - 0.82) / 0.18 : u / 0.82;
      const ponto = retornando
        ? bezier(destino, retorno1, retorno2, alvo, suavizar(local))
        : bezier(inicio, controle1, controle2, destino, suavizar(local));
      // Tremor perpendicular: não cria ultrapassagem em deslocamentos curtos.
      const tremor = amplitude * Math.sin(Math.PI * local) ** 2
        * Math.sin(fase + local * frequencia * Math.PI * 2);
      return { x: ponto.x - uy * tremor, y: ponto.y + ux * tremor };
    },
  };
}
