// Coreografia da mão do agente ao fazer uma pergunta:
//   1. a tela desliza até o elemento (se ele não estiver à vista);
//   2. o cursor vem em curva até lá;
//   3. circula o elemento aos poucos (o cursor segue a ponta do traço);
//   4. puxa uma seta da nota até o elemento;
//   5. escreve a nota letra a letra; o cursor sai de cena.
// Tudo que o agente desenha entra no grupo da pergunta, para ele apagar depois.
import type { Quadro } from "@/components/Canvas";
import type { ControleCursor } from "@/components/CursorAgente";
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

export async function apontarEAnotar(o: OpcoesApontar) {
  try {
    await coreografar(o);
  } catch (erro) {
    if (!(erro instanceof Cancelada)) throw erro;
  } finally {
    o.cursor?.esconder();
  }
}

async function coreografar(o: OpcoesApontar) {
  const { quadro, cursor, grupo, sinal } = o;
  const cena = quadro.api.getSceneElements();
  const elementosAlvo = cena.filter((e) => o.alvos.includes(e.id));
  const doCandidato = cena.filter((e) => e.customData?.autor !== "agente");
  const alvo =
    caixaDosElementos(elementosAlvo, 4) ??
    caixaDosElementos(doCandidato, 4) ?? { x: 40, y: 260, largura: 160, altura: 80 };

  // 1. A tela desliza até o alvo, se preciso.
  let vista = vistaDe(quadro);
  if (!estaVisivel(alvo, vista, 80)) {
    const de = { x: vista.scrollX, y: vista.scrollY };
    const para = scrollParaCentralizar(alvo, vista);
    await animar(
      520,
      (p) => {
        const k = suavizar(p);
        quadro.agente.rolar(de.x + (para.scrollX - de.x) * k, de.y + (para.scrollY - de.y) * k);
      },
      sinal,
    );
    vista = vistaDe(quadro);
  }

  const naTela = (p: Ponto) => cenaParaTela(p, vista);
  const moverCursor = async (para: Ponto, semente: number) => {
    if (!cursor) return;
    const de = cursor.posicao() ?? { x: innerWidth - 180, y: innerHeight - 160 }; // sai da janela de chamada
    const destino = naTela(para);
    const movimento = planejarMovimento(de, destino, semente);
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

  // 2 e 3. Vai até o alvo e circula.
  const temAlvo = elementosAlvo.length > 0;
  if (temAlvo) {
    const circulo = circuloAMao(alvo, o.semente);
    await moverCursor(circulo.origem, o.semente);
    await esperar(90);
    await desenhar(`agente-${grupo}-circulo`, circulo, "linha", 900);
    await esperar(120);
  }

  // 4. Seta da nota até o alvo. Tamanho da nota estimado pela fonte do quadro (20px).
  const linhas = Math.ceil(o.nota.length / 28);
  const tamanhoNota = { largura: Math.min(o.nota.length, 28) * 11, altura: linhas * 25 };
  const lugar = posicionarNota(alvo, tamanhoNota, areaVisivel(vista));
  if (temAlvo) {
    const seta = setaAMao(lugar.setaPara, lugar.setaDe, o.semente + 1);
    await moverCursor(seta.origem, o.semente + 2);
    await desenhar(`agente-${grupo}-seta`, seta, "seta", 420);
    await esperar(100);
  }

  // 5. Escreve a nota; o cursor acompanha o começo do texto e depois sai.
  await moverCursor({ x: lugar.nota.x, y: lugar.nota.y + 22 }, o.semente + 3);
  await quadro.agente.escrever({
    id: `agente-${grupo}-nota`,
    grupo,
    texto: o.nota,
    x: lugar.nota.x,
    y: lugar.nota.y,
    largura: 28,
    sinal,
  });
  await esperar(500);
}
