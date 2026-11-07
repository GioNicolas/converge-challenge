// Camada do agente no quadro: tudo que o agente escreve ou desenha passa por aqui.
//
// Regras:
// - todo elemento do agente leva customData.autor = "agente" e um grupo (ex.: "enunciado", "pergunta:3");
// - entra travado (locked) e fora do histórico (Ctrl+Z do candidato não desfaz);
// - só o agente apaga: se o candidato conseguir apagar ou mudar algo do agente
//   (ex.: "Limpar tela"), a camada restaura na hora.
//
// Usa o runtime do Excalidraw, então só pode ser importado por código que roda no navegador
// (o Canvas é carregado com ssr: false). Fora dele, importe só os tipos.
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawImperativeAPI } from "@/lib/excalidraw/tipos";

export const AUTOR_AGENTE = "agente";

export function ehDoAgente(elemento: ExcalidrawElement) {
  return elemento.customData?.autor === AUTOR_AGENTE;
}

export type OpcoesEscrita = {
  id: string;
  grupo: string;
  texto: string;
  x: number;
  y: number;
  tamanho?: number;
  /** Máximo de caracteres por linha antes de quebrar. */
  largura?: number;
  /** Caracteres por segundo. */
  velocidade?: number;
};

export type CamadaAgente = {
  /** Escreve um texto letra a letra, com ritmo humano. Resolve quando termina. */
  escrever(opcoes: OpcoesEscrita): Promise<void>;
  /** Apaga (com esmaecer) todos os elementos de um grupo. */
  apagarGrupo(grupo: string): Promise<void>;
  /** Chamar a cada onChange: restaura o que o candidato tiver mexido. */
  proteger(cena: readonly ExcalidrawElement[]): void;
};

function corDoAgente() {
  const cor = getComputedStyle(document.documentElement).getPropertyValue("--agente").trim();
  return cor || "#0071e3";
}

export function quebrarLinhas(texto: string, largura: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    if (atual && (atual + " " + palavra).length > largura) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.join("\n");
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O candidato apagou, destravou, moveu ou alterou um elemento do agente? */
function foiMexido(oficial: ExcalidrawElement, atual: ExcalidrawElement) {
  return (
    atual.isDeleted !== oficial.isDeleted ||
    atual.locked !== oficial.locked ||
    Math.round(atual.x) !== Math.round(oficial.x) ||
    Math.round(atual.y) !== Math.round(oficial.y) ||
    atual.angle !== oficial.angle ||
    atual.opacity !== oficial.opacity ||
    atual.strokeColor !== oficial.strokeColor ||
    ("text" in atual && "text" in oficial && atual.text !== oficial.text)
  );
}

export function criarCamadaAgente(api: ExcalidrawImperativeAPI): CamadaAgente {
  // Cópia oficial dos elementos do agente: é ela que vale se a cena divergir.
  const oficiais = new Map<string, ExcalidrawElement>();
  let restaurando = false;

  function aplicar(novos: ExcalidrawElement[], removidos: string[] = []) {
    const porId = new Map(novos.map((e) => [e.id, e]));
    const cena = api.getSceneElementsIncludingDeleted();
    const resultado = cena
      .filter((e) => !removidos.includes(e.id))
      .map((e) => porId.get(e.id) ?? e);
    for (const e of novos) if (!cena.some((c) => c.id === e.id)) resultado.push(e);

    api.updateScene({ elements: resultado, captureUpdate: CaptureUpdateAction.NEVER });

    // Guarda a versão que ficou na cena, para comparar no proteger().
    for (const id of removidos) oficiais.delete(id);
    const depois = api.getSceneElementsIncludingDeleted();
    for (const e of depois) if (porId.has(e.id)) oficiais.set(e.id, e);
  }

  function criarTexto(o: OpcoesEscrita, texto: string, versao: number) {
    const [el] = convertToExcalidrawElements(
      [
        {
          type: "text",
          id: o.id,
          x: o.x,
          y: o.y,
          text: texto,
          fontSize: o.tamanho ?? 20,
          fontFamily: FONT_FAMILY.Excalifont,
          strokeColor: corDoAgente(),
          locked: true,
          version: versao,
          customData: { autor: AUTOR_AGENTE, grupo: o.grupo },
        },
      ],
      { regenerateIds: false },
    );
    return el;
  }

  return {
    async escrever(o) {
      const completo = quebrarLinhas(o.texto, o.largura ?? 48);
      const cps = o.velocidade ?? 38;
      let versao = (oficiais.get(o.id)?.version ?? 0) + 1;
      for (let i = 1; i <= completo.length; i++) {
        aplicar([criarTexto(o, completo.slice(0, i), versao++)]);
        const letra = completo[i - 1];
        // Ritmo humano: variação pequena e pausas em pontuação e quebra de linha.
        let pausa = (1000 / cps) * (0.6 + Math.random() * 0.8);
        if (/[.,:;!?]/.test(letra)) pausa += 140;
        if (letra === "\n") pausa += 90;
        await esperar(pausa);
      }
    },

    async apagarGrupo(grupo) {
      const doGrupo = [...oficiais.values()].filter((e) => e.customData?.grupo === grupo);
      if (doGrupo.length === 0) return;
      const passos = 8;
      for (let p = passos - 1; p >= 0; p--) {
        aplicar(doGrupo.map((e) => newElementWith(e, { opacity: Math.round((100 * p) / passos) })));
        await esperar(30);
      }
      aplicar([], doGrupo.map((e) => e.id));
    },

    proteger(cena) {
      if (restaurando || oficiais.size === 0) return;
      const atuais = new Map(cena.map((e) => [e.id, e]));
      const mexidos: ExcalidrawElement[] = [];
      for (const oficial of oficiais.values()) {
        const atual = atuais.get(oficial.id);
        if (!atual || foiMexido(oficial, atual)) mexidos.push(oficial);
        // Mudança interna do Excalidraw (ex.: remedir o texto quando a fonte carrega): aceita.
        else if (atual.version !== oficial.version) oficiais.set(atual.id, atual);
      }
      if (mexidos.length === 0) return;

      // Fora do ciclo do onChange, para não atualizar a cena no meio de outra atualização.
      restaurando = true;
      queueMicrotask(() => {
        aplicar(mexidos.map((e) => newElementWith(e, { isDeleted: false, locked: true })));
        restaurando = false;
      });
    },
  };
}
