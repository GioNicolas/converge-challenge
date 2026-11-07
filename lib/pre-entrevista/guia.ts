/**
 * Guia para o entrevistador: as `recruiterNotes` da config, montadas de forma determinística a partir do estado.
 *
 * Ordem fixa, e cada parte só aparece se houver conteúdo. Quando há, usa as palavras dela: o trecho do critério,
 * a frase do eliminatório, a frase do tom e das dicas. Sem o modelo: o mesmo estado sempre gera o mesmo texto.
 */
import type { FocusArea } from "@/lib/contracts";
import { NOME_AREA_FALA } from "./cobertura";
import { normalizarTexto, RE_CONTEXTO, RE_REQUISITO, RE_TOM } from "./frases";
import type { Preferencias } from "./preferencias";
import { listar } from "./rascunho";

/** Ênfase a partir da qual a área é "central" (3) no guia. */
export const ENFASE_CENTRAL = 2.5;

export interface EntradaGuia {
  /** Áreas que estão no foco. */
  focus: FocusArea[];
  /** Ênfase final de cada área no foco (0 a 3). */
  enfase: Partial<Record<FocusArea, number>>;
  /** Áreas que ela dispensou. */
  dispensadas: FocusArea[];
  /** Frases dela que declararam uma área como central (até duas): são o "O que mais importa". */
  frasesImportantes: string[];
  /** Frases inteiras em que ela disse que algo reprova o candidato. */
  eliminatorios: string[];
  contexto: string;
  tom: Preferencias["tom"];
  dicas: Preferencias["dicas"];
  /** Frase da fala dela que pediu o tom, e frase que pediu as dicas, se houver. */
  origemTom?: string;
  origemDicas?: string;
  naoAvaliado: string[];
}

/** Trecho entre aspas curvas, sem o ponto final (a seção termina com ponto). */
const citar = (texto: string) => `“${texto.replace(/[.!?…]+$/, "")}”`;

/** Notas do foco, em seções: "O que mais importa: …. Eliminatório: …. Menos importante: …. Tom …. Dicas …. Contexto …." */
export function montarGuia(e: EntradaGuia): string {
  const partes: string[] = [];

  // O que mais importa: as frases que declararam uma área central. Sem nenhuma, a área de maior ênfase.
  if (e.frasesImportantes.length) {
    partes.push(`O que mais importa: ${e.frasesImportantes.slice(0, 2).map(citar).join("; ")}.`);
  } else {
    const ordenadas = [...e.focus].sort((a, b) => (e.enfase[b] ?? 0) - (e.enfase[a] ?? 0));
    if (ordenadas.length) partes.push(`O que mais importa: ${NOME_AREA_FALA[ordenadas[0]]}.`);
  }

  if (e.eliminatorios.length) partes.push(`Eliminatório: ${e.eliminatorios.slice(0, 2).map(citar).join("; ")}.`);

  // Menos importante: áreas do foco com ênfase 1, e as que ela dispensou.
  const menosNoFoco = e.focus.filter((a) => {
    const enfase = e.enfase[a] ?? 0;
    return enfase >= 0.5 && enfase < 1.5;
  });
  const menos = [...new Set([...menosNoFoco, ...e.dispensadas])];
  if (menos.length) partes.push(`Menos importante: ${listar(menos.map((a) => NOME_AREA_FALA[a]))}.`);

  // Tom e dicas: a citação de tom só vale com uma palavra de tom (amigável, tranquilo, desafiador…).
  const tomTxt = e.tom === "desafiador" ? "desafiador" : "amigável";
  const dicasTxt = { leves: "dica leve se travar", nenhuma: "sem dicas", livres: "dica quando ele pedir" }[e.dicas];
  const tomDito = e.origemTom && RE_TOM.test(e.origemTom) ? e.origemTom : undefined;
  const dicasDitas = e.origemDicas;
  if (!tomDito && !dicasDitas) {
    partes.push(`Tom ${tomTxt}, ${dicasTxt} (padrão).`);
  } else if (tomDito && tomDito === dicasDitas) {
    partes.push(`Tom e dicas: ${tomTxt}, ${dicasTxt} (ela disse: ${citar(tomDito)}).`);
  } else {
    partes.push(`Tom: ${tomTxt}${tomDito ? ` (ela disse: ${citar(tomDito)})` : " (padrão)"}.`);
    partes.push(`Dicas: ${dicasTxt}${dicasDitas ? ` (ela disse: ${citar(dicasDitas)})` : " (padrão)"}.`);
  }

  // Contexto: fala do time ou da empresa, sem descrição de requisito ou de candidato, e sem repetir "O que mais importa".
  const jaCitado = e.frasesImportantes.some(
    (f) => normalizarTexto(f).includes(normalizarTexto(e.contexto)) || normalizarTexto(e.contexto).includes(normalizarTexto(f)),
  );
  if (e.contexto && RE_CONTEXTO.test(e.contexto) && !RE_REQUISITO.test(e.contexto) && !jaCitado) {
    partes.push(`Contexto: ${e.contexto.replace(/[.!?…]+$/, "")}.`);
  }

  if (e.naoAvaliado.length) partes.push(`Não avaliado nesta entrevista: ${listar(e.naoAvaliado)}.`);

  return partes.join(" ");
}
