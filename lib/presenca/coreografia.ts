// Coreografia da mão do agente ao fazer uma pergunta:
//   1. a tela desliza até o elemento (se ele não estiver à vista);
//   2. o cursor vem em curva até lá;
//   3. circula o elemento aos poucos (o cursor segue a ponta do traço);
//   4. puxa uma seta da nota até o elemento;
//   5. escreve a nota letra a letra; o cursor sai de cena.
// Tudo que o agente desenha entra no grupo da pergunta, para ele apagar depois.
import type { Quadro } from "@/components/Canvas";
import type { ControleCursor } from "@/components/CursorAgente";
import { quebrarLinhas } from "@/lib/excalidraw/texto";
import {
  caixaDosElementos,
  cenaParaTela,
  circuloAMao,
  estaVisivel,
  parteDoTraco,
  planejarMovimento,
  posicionarNota,
  scrollParaCentralizar,
  setaAMao,
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


/** Caixa que envolve os pontos de um traço, na cena. */
function caixaDoTraco(t: Traco): Caixa {
  const xs = t.pontos.map((p) => t.origem.x + p[0]);
  const ys = t.pontos.map((p) => t.origem.y + p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, largura: Math.max(...xs) - x, altura: Math.max(...ys) - y };
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

const FONTE = 20;
const POR_LINHA = 26;
const PADDING = { x: 14, y: 10 };

async function coreografar(o: OpcoesApontar) {
  const { quadro, cursor, grupo, sinal } = o;

  // Não disputa o quadro: se o candidato está no meio de um traço, espera ele soltar.
  await quadro.agente.esperarCandidatoLivre();

  const cena = quadro.api.getSceneElements();
  const elementosAlvo = cena.filter((e) => o.alvos.includes(e.id));
  const temAlvo = elementosAlvo.length > 0;
  const doCandidato = cena.filter((e) => e.customData?.autor !== "agente");
  const alvo =
    caixaDosElementos(elementosAlvo, 4) ??
    caixaDosElementos(doCandidato, 4) ?? { x: 40, y: 260, largura: 160, altura: 80 };
  if (temAlvo) quadro.agente.ancorar(grupo, o.alvos);

  // 1. A tela desliza até o alvo, se preciso.
  const inicial = vistaDe(quadro);
  if (!estaVisivel(alvo, inicial, 80)) {
    const de = { x: inicial.scrollX, y: inicial.scrollY };
    const para = scrollParaCentralizar(alvo, inicial);
    await animar(
      560,
      (p) => {
        const k = suavizar(p);
        quadro.agente.rolar(de.x + (para.scrollX - de.x) * k, de.y + (para.scrollY - de.y) * k);
      },
      sinal,
    );
  }

  // A vista é lida a cada quadro: se o candidato rolar ou der zoom no meio, o cursor continua no lugar certo.
  const naTela = (p: Ponto) => cenaParaTela(p, vistaDe(quadro));
  const moverCursor = async (para: Ponto, semente: number) => {
    if (!cursor) return;
    const de = cursor.posicao() ?? { x: innerWidth - 180, y: innerHeight - 160 }; // sai da janela de chamada
    const movimento = planejarMovimento(de, naTela(para), semente);
    await animar(movimento.duracaoMs, (p) => cursor.mover(movimento.pontoEm(p)), sinal);
  };
  const desenhar = async (id: string, traco: Traco, tipo: "linha" | "seta", duracaoMs: number) => {
    await animar(
      duracaoMs,
      (p) => {
        const parte = parteDoTraco(traco, suavizar(p));
        quadro.agente.tracar({ id, grupo, origem: parte.origem, pontos: parte.pontos, tipo, semente: o.semente });
        cursor?.mover(naTela(pontaDoTraco(parte)));
      },
      sinal,
    );
  };

  cursor?.mostrar();

  // 2 e 3. Vai até o alvo, mira por um instante e circula.
  let ocupado = alvo;
  if (temAlvo) {
    const circulo = circuloAMao(alvo, o.semente);
    ocupado = caixaDoTraco(circulo);
    await moverCursor(circulo.origem, o.semente);
    await esperar(150);
    await desenhar(`agente-${grupo}-circulo`, circulo, "linha", 820);
    await esperar(140);
  }

  // 4. Lugar da nota: ao lado do círculo, numa área livre da tela. Tamanho pela fonte do quadro.
  const texto = quebrarLinhas(o.nota, POR_LINHA);
  const linhas = texto.split("\n");
  const largura = Math.max(...linhas.map((l) => l.length)) * FONTE * 0.55 + PADDING.x * 2;
  const altura = linhas.length * FONTE * 1.25 + PADDING.y * 2;
  const lugar = posicionarNota(ocupado, { largura, altura }, areaLivre(vistaDe(quadro)));

  if (temAlvo) {
    const seta = setaAMao(lugar.setaPara, lugar.setaDe, o.semente + 1);
    await moverCursor(seta.origem, o.semente + 2);
    await esperar(80);
    await desenhar(`agente-${grupo}-seta`, seta, "seta", 420);
    await esperar(100);
  }

  // 5. A moldura aparece, o texto é escrito dentro dela e o cursor sai de cena.
  await moverCursor({ x: lugar.nota.x + PADDING.x, y: lugar.nota.y + altura - PADDING.y }, o.semente + 3);
  await quadro.agente.emoldurar({
    id: `agente-${grupo}-moldura`,
    grupo,
    x: lugar.nota.x,
    y: lugar.nota.y,
    largura,
    altura,
  });
  await quadro.agente.escrever({
    id: `agente-${grupo}-nota`,
    grupo,
    texto: o.nota,
    x: lugar.nota.x + PADDING.x,
    y: lugar.nota.y + PADDING.y,
    tamanho: FONTE,
    largura: POR_LINHA,
    sinal,
  });
  await esperar(450);
}
