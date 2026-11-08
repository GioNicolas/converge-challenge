// A mão executa uma composição escolhida pelo modelo, em sincronia com a fala.
// Sem plano, os gestos de apoio variam com o histórico. [] significa não desenhar.
// Tudo pertence a um grupo temporário; nenhuma ação altera o desenho do candidato.
import type { Quadro } from "@/components/Canvas";
import type { ControleCursor } from "@/components/CursorAgente";
import { alvosDaAcao, escolherAcoesVisuais, criarMemoriaVisual, type AcaoVisual, type MemoriaVisual } from "./acoesVisuais";
import { comporGestos } from "./gestos";
import {
  caixaDosElementos,
  cenaParaTela,
  estaVisivel,
  parteDoTraco,
  planejarMovimento,
  scrollParaCentralizar,
  suavizar,
  type Caixa,
  type Ponto,
  type Traco,
  type Vista,
} from "@/lib/presenca";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const proximoQuadro = () => new Promise<number>((r) => requestAnimationFrame(r));

class Cancelada extends Error {}

/** Roda `passo(progresso)` de 0 a 1 ao longo de `duracaoMs`, a cada quadro. Para se o sinal for abortado. */
async function animar(duracaoMs: number, passo: (progresso: number) => void, sinal?: AbortSignal) {
  const inicio = performance.now();
  for (;;) {
    if (sinal?.aborted) throw new Cancelada();
    const p = Math.min(1, (performance.now() - inicio) / duracaoMs);
    passo(p);
    if (p >= 1) return;
    await proximoQuadro();
  }
}

function vistaDe(quadro: Quadro): Vista {
  const s = quadro.api.getAppState();
  return {
    scrollX: s.scrollX,
    scrollY: s.scrollY,
    zoom: s.zoom.value,
    offsetLeft: s.offsetLeft,
    offsetTop: s.offsetTop,
    largura: s.width,
    altura: s.height,
  };
}

/** A parte da cena que está à vista. */
function areaVisivel(v: Vista): Caixa {
  return { x: -v.scrollX, y: -v.scrollY, largura: v.largura / v.zoom, altura: v.altura / v.zoom };
}

function pontaDoTraco(t: Traco): Ponto {
  const ultimo = t.pontos[t.pontos.length - 1] ?? [0, 0];
  return { x: t.origem.x + ultimo[0], y: t.origem.y + ultimo[1] };
}

export type OpcoesApontar = {
  quadro: Quadro;
  cursor: ControleCursor | null;
  grupo: string;
  /** IDs reais dos elementos a circular. Vazio: a nota vai ao lado do desenho, sem círculo. */
  alvos: string[];
  nota: string;
  semente: number;
  /** Abortar para a coreografia no meio (o cursor some; o que já foi desenhado fica para quem chamou apagar). */
  sinal?: AbortSignal;
  visual?: AcaoVisual[];
  memoria?: MemoriaVisual;
};

// A mão do agente faz uma coisa por vez: as ações entram numa fila.
let fila: Promise<unknown> = Promise.resolve();
function enfileirar<T>(acao: () => Promise<T>): Promise<T> {
  const vez = fila.then(acao, acao);
  fila = vez.catch(() => undefined);
  return vez;
}

export function apontarEAnotar(o: OpcoesApontar) {
  return enfileirar(async () => {
    if (o.sinal?.aborted) return;
    try {
      await coreografar(o);
    } catch (erro) {
      if (!(erro instanceof Cancelada)) throw erro;
    } finally {
      o.cursor?.esconder();
    }
  });
}

/** Cor do texto escrito "a lápis" (enunciado e requisitos) e do check. */
const COR_TEXTO = "#1e1e1e";
const COR_CHECK = "#2f9e44";

export type OpcoesRequisito = {
  quadro: Quadro;
  cursor: ControleCursor | null;
  texto: string;
  /** Posição do item na lista (0 = primeiro, que também escreve o título). */
  indice: number;
};

/**
 * Escreve um requisito combinado no quadro, abaixo do enunciado, e desenha um check ao lado.
 * Não move a tela do candidato: se a área estiver fora de vista, escreve sem o cursor.
 */
export function anotarRequisito(o: OpcoesRequisito) {
  return enfileirar(async () => {
    const { quadro, cursor, indice } = o;
    const grupo = "requisitos";
    const enunciado = quadro.api.getSceneElements().find((e) => e.id === "agente-enunciado-texto");
    const x = enunciado?.x ?? 40;
    const topo = enunciado ? enunciado.y + enunciado.height + 34 : 260;
    const linha = topo + 34 + indice * 30;
    const textoX = x + 30;

    const naTela = (p: Ponto) => cenaParaTela(p, vistaDe(quadro));
    const visivel = estaVisivel({ x, y: topo, largura: 320, altura: linha - topo + 30 }, vistaDe(quadro), 0);
    const mover = async (para: Ponto, semente: number) => {
      if (!cursor || !visivel) return;
      const de = cursor.posicao() ?? { x: innerWidth - 180, y: innerHeight - 160 };
      const movimento = planejarMovimento(de, naTela(para), semente);
      await animar(movimento.duracaoMs, (p) => cursor.mover(movimento.pontoEm(p)));
    };

    try {
      await quadro.agente.esperarCandidatoLivre();
      if (visivel) cursor?.mostrar();

      if (indice === 0) {
        await mover({ x, y: topo + 20 }, 11);
        await quadro.agente.escrever({
          id: "agente-requisitos-titulo",
          grupo,
          texto: "Requisitos combinados",
          x,
          y: topo,
          tamanho: 18,
          cor: "#868e96",
          velocidade: 40,
        });
      }

      // O item, escrito à mão.
      await mover({ x: textoX, y: linha + 20 }, 23 + indice);
      await quadro.agente.escrever({
        id: `agente-requisito-${indice}`,
        grupo,
        texto: o.texto,
        x: textoX,
        y: linha,
        tamanho: 18,
        largura: 60,
        cor: COR_TEXTO,
        velocidade: 45,
      });

      // O check, desenhado de uma vez só, como um traço de caneta.
      const check: Traco = { origem: { x: x + 2, y: linha + 10 }, pontos: [[0, 0], [6, 7], [18, -6]] };
      await mover({ x: x + 2, y: linha + 10 }, 31 + indice);
      await esperar(80);
      await animar(260, (p) => {
        const parte = parteDoTraco(check, suavizar(p));
        quadro.agente.tracar({
          id: `agente-requisito-${indice}-check`,
          grupo,
          origem: parte.origem,
          pontos: parte.pontos,
          espessura: 2.5,
          semente: 101 + indice,
          cor: COR_CHECK,
        });
        if (visivel) cursor?.mover(naTela(pontaDoTraco(parte)));
      });
      await esperar(300);
    } finally {
      cursor?.esconder();
    }
  });
}


/**
 * A parte da vista onde dá para escrever: sem a barra de ferramentas (em cima), os controles (embaixo)
 * e a janela de chamada (no canto em que ela estiver).
 */
function areaLivre(v: Vista): Caixa {
  const area = areaVisivel(v);
  const topo = 84 / v.zoom;
  const base = 72 / v.zoom;
  let { x, largura } = area;
  const janela = document.querySelector("[data-janela-chamada]")?.getBoundingClientRect();
  if (janela && janela.width > 0) {
    if (janela.left + janela.width / 2 > v.largura / 2) {
      largura -= (v.largura - janela.left + 16) / v.zoom;
    } else {
      x += (janela.right + 16) / v.zoom;
      largura -= (janela.right + 16) / v.zoom;
    }
  }
  return { x, y: area.y + topo, largura: Math.max(120, largura), altura: Math.max(80, area.altura - topo - base) };
}

async function coreografar(o: OpcoesApontar) {
  const { quadro, cursor, grupo, sinal } = o;
  const memoria = o.memoria ?? criarMemoriaVisual();
  const acoes = escolherAcoesVisuais(o.visual, o.alvos, o.nota, memoria);
  if (!acoes.length || sinal?.aborted) return;
  await quadro.agente.esperarCandidatoLivre();
  if (quadro.agente.candidatoOcupado() || sinal?.aborted) return;
  const conferir = () => {
    if (sinal?.aborted || quadro.agente.candidatoOcupado()) throw new Cancelada();
  };
  const naTela = (p: Ponto) => cenaParaTela(p, vistaDe(quadro));
  const mover = async (para: Ponto, semente: number) => {
    conferir();
    if (!cursor) return;
    const de = cursor.posicao() ?? { x: innerWidth - 180, y: innerHeight - 160 };
    const movimento = planejarMovimento(de, naTela(para), semente);
    await animar(Math.min(450, movimento.duracaoMs), (p) => { conferir(); cursor.mover(movimento.pontoEm(p)); }, sinal);
  };
  const ids = [...new Set(acoes.flatMap(alvosDaAcao))];
  const primeiro = quadro.api.getSceneElements().find((e) => e.id === ids[0] && !e.isDeleted);
  const foco = primeiro && caixaDosElementos([primeiro], 12);
  if (foco && !estaVisivel(foco, vistaDe(quadro), 60)) {
    const inicial = vistaDe(quadro);
    const para = scrollParaCentralizar(foco, inicial);
    await animar(420, (p) => {
      conferir();
      const k = suavizar(p);
      quadro.agente.rolar(inicial.scrollX + (para.scrollX - inicial.scrollX) * k, inicial.scrollY + (para.scrollY - inicial.scrollY) * k);
    }, sinal);
  }
  if (ids.length) quadro.agente.ancorar(grupo, ids);
  cursor?.mostrar();
  let indice = 0;
  for (const acao of acoes) {
    conferir();
    const caixas = new Map(quadro.api.getSceneElements().filter((e) => !e.isDeleted).flatMap((e) => {
      const caixa = caixaDosElementos([e], 0);
      if (!caixa) return [];
      // Setas e linhas levam a polilinha (relativa à caixa): os gestos miram o meio do traço, não a caixa.
      const pontos = (e.type === "arrow" || e.type === "line") && "points" in e
        ? (e.points as readonly (readonly [number, number])[]).map(([px, py]) => [e.x + px - caixa.x, e.y + py - caixa.y] as const)
        : undefined;
      return [[e.id, pontos ? { ...caixa, pontos } : caixa] as const];
    }));
    for (const gesto of comporGestos(acao, caixas, areaLivre(vistaDe(quadro)), o.semente + indice)) {
      conferir();
      const id = `agente-${grupo}-gesto-${indice++}`;
      if (gesto.tipo === "apontar") {
        await mover(gesto.ponto, o.semente + indice);
        await animar(220, () => conferir(), sinal);
      } else if (gesto.tipo === "texto") {
        await mover(gesto.ponto, o.semente + indice);
        await quadro.agente.escrever({ id, grupo, texto: gesto.texto, x: gesto.ponto.x, y: gesto.ponto.y,
          tamanho: 20, largura: 26, velocidade: 55, sinal });
      } else {
        await mover(gesto.traco.origem, o.semente + indice);
        await animar(450, (p) => {
          conferir();
          const parte = parteDoTraco(gesto.traco, suavizar(p));
          quadro.agente.tracar({ id, grupo, origem: parte.origem, pontos: parte.pontos, semente: o.semente + indice });
          cursor?.mover(naTela(pontaDoTraco(parte)));
        }, sinal);
      }
    }
  }
}
