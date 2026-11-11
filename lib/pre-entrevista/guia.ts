/**
 * Guia para o entrevistador: as `recruiterNotes` da config, montadas de forma determinística a partir do estado.
 *
 * Ordem fixa, e cada parte só aparece se houver conteúdo. Quando há, usa as palavras dela: o trecho do critério,
 * a frase do eliminatório, a frase do tom e das dicas. Sem o modelo: o mesmo estado sempre gera o mesmo texto.
 */
import type { FocusArea, InterviewMode } from "@/lib/contracts";
import { nomeAreaFala } from "./cobertura";
import { normalizarTexto, RE_CONTEXTO, RE_REQUISITO, RE_TOM } from "./frases";
import type { Preferencias } from "./preferencias";
import { listar } from "./rascunho";

/** Ênfase a partir da qual a área é "central" (3) no guia. */
export const ENFASE_CENTRAL = 2.5;

export interface EntradaGuia {
  /** Formato da entrevista: muda o nome da área técnica (ver `nomeAreaFala`). */
  mode?: InterviewMode;
  /** Áreas que estão no foco. */
  focus: FocusArea[];
  /** Ênfase final de cada área no foco (0 a 3). Só vale quando não há `pesos`. */
  enfase: Partial<Record<FocusArea, number>>;
  /** Peso final de cada área no foco (soma 1). É ele que decide "O que mais importa" e "Menos importante". */
  pesos?: Partial<Record<FocusArea, number>>;
  /** Áreas que ela dispensou. */
  dispensadas: FocusArea[];
  /** Frase dela que declarou cada área como central: citada no "O que mais importa" quando a área é a de maior peso. */
  frases?: Partial<Record<FocusArea, string>>;
  /** Frases soltas que declararam uma área central (formato antigo, sem a área). Só valem sem `frases`. */
  frasesImportantes?: string[];
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

/** Diferença de peso abaixo da qual duas áreas contam como empatadas. */
const EMPATE = 0.05;

/**
 * Peso de cada área do foco para o guia: o peso final, quando há; senão a ênfase (formato antigo). Sem nenhum dos
 * dois, todas iguais.
 */
function pesoNoGuia(e: EntradaGuia): (a: FocusArea) => number {
  if (e.pesos && Object.keys(e.pesos).length) return (a) => e.pesos?.[a] ?? 0;
  return (a) => e.enfase[a] ?? 0;
}

/**
 * Áreas de maior peso (empate vale, até duas) e as de menor peso. "Menos importante" nunca tem a área de maior peso,
 * nem a área técnica em live coding (o formato é um problema de código: ela segura a entrevista). Com todas empatadas,
 * não há "menos importante" no foco. Sem `pesos`, vale a regra antiga: ênfase de 0,5 a 1,5 é "menos importante".
 */
export function ordemDoGuia(e: EntradaGuia): { mais: FocusArea[]; menos: FocusArea[] } {
  const peso = pesoNoGuia(e);
  const ordenadas = [...e.focus].sort((a, b) => peso(b) - peso(a));
  if (!ordenadas.length) return { mais: [], menos: [] };
  const maior = peso(ordenadas[0]);
  const mais = ordenadas.filter((a) => maior - peso(a) < EMPATE).slice(0, 2);
  const seguraAEntrevista = (a: FocusArea) => a === "tecnico" && e.mode === "live_coding";
  let menos: FocusArea[];
  if (e.pesos && Object.keys(e.pesos).length) {
    const menor = peso(ordenadas[ordenadas.length - 1]);
    menos = maior - menor < EMPATE ? [] : ordenadas.filter((a) => peso(a) - menor < EMPATE);
  } else {
    menos = e.focus.filter((a) => (e.enfase[a] ?? 0) >= 0.5 && (e.enfase[a] ?? 0) < 1.5);
  }
  return { mais, menos: menos.filter((a) => !mais.includes(a) && !seguraAEntrevista(a)) };
}

/** Notas do foco, em seções: "O que mais importa: …. Eliminatório: …. Menos importante: …. Tom …. Dicas …. Contexto …." */
export function montarGuia(e: EntradaGuia): string {
  const partes: string[] = [];
  const { mais, menos: menosNoFoco } = ordemDoGuia(e);

  // O que mais importa: a área de maior peso final (empate vale, até duas). Se ela declarou essa área central,
  // a frase dela; senão o nome da área.
  const frasesCitadas: string[] = [];
  if (e.frases) {
    const itens = mais.map((a) => {
      const frase = e.frases?.[a];
      if (frase) frasesCitadas.push(frase);
      return frase ? citar(frase) : nomeAreaFala(a, e.mode);
    });
    if (itens.length) partes.push(`O que mais importa: ${itens.join("; ")}.`);
  } else if (e.frasesImportantes?.length) {
    frasesCitadas.push(...e.frasesImportantes.slice(0, 2));
    partes.push(`O que mais importa: ${e.frasesImportantes.slice(0, 2).map(citar).join("; ")}.`);
  } else if (mais.length) {
    partes.push(`O que mais importa: ${nomeAreaFala(mais[0], e.mode)}.`);
  }

  if (e.eliminatorios.length) partes.push(`Eliminatório: ${e.eliminatorios.slice(0, 2).map(citar).join("; ")}.`);

  // Menos importante: áreas do foco de menor peso, e as que ela dispensou.
  const menos = [...new Set([...menosNoFoco, ...e.dispensadas.filter((a) => !e.focus.includes(a))])];
  if (menos.length) partes.push(`Menos importante: ${listar(menos.map((a) => nomeAreaFala(a, e.mode)))}.`);

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
  const jaCitado = frasesCitadas.some(
    (f) => normalizarTexto(f).includes(normalizarTexto(e.contexto)) || normalizarTexto(e.contexto).includes(normalizarTexto(f)),
  );
  if (e.contexto && RE_CONTEXTO.test(e.contexto) && !RE_REQUISITO.test(e.contexto) && !jaCitado) {
    partes.push(`Contexto: ${e.contexto.replace(/[.!?…]+$/, "")}.`);
  }

  if (e.naoAvaliado.length) partes.push(`Não avaliado nesta entrevista: ${listar(e.naoAvaliado)}.`);

  return partes.join(" ");
}
