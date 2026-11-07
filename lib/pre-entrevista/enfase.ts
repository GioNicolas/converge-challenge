/**
 * Ênfase por fala: o que a recrutadora disse sobre cada área, acumulado no código (sem LLM).
 *
 * O Jev classifica só a última fala dela (com a última pergunta da Totti), com um nível por área (`cobertura.ts`).
 * Quem acumula é `acumularEnfase`, função pura:
 *  - "dispensou" e "central" são declarações explícitas: a mais recente vence e fixa o estado (0 ou 3),
 *    até outra declaração explícita mudar. Guardam a frase que as disparou;
 *  - "respondeu" (2) e "secundaria" (1) valem o máximo observado, e não rebaixam uma área declarada.
 */
import { FocusArea } from "@/lib/contracts";
import { fraseDaArea, limitarPalavras } from "./frases";

/** Nível que o Jev dá a uma área na última fala. */
export const NIVEIS_ENFASE = ["nao_falou", "dispensou", "secundaria", "respondeu", "central"] as const;
export type NivelEnfase = (typeof NIVEIS_ENFASE)[number];

export interface EstadoAreaEnfase {
  /** Se ela já falou da área em alguma fala. */
  falou: boolean;
  /** Maior nível observado (1 secundária, 2 respondeu), sem declaração explícita. */
  maximo: number;
  /** Última declaração explícita: dispensou (0) ou central (3). */
  declarado?: "dispensou" | "central";
  /** Frase da fala que disparou a declaração explícita (só a frase que fala da área; sem ela, não se cita). */
  frase?: string;
}

export type EstadoEnfase = Record<FocusArea, EstadoAreaEnfase>;

export function estadoInicialEnfase(): EstadoEnfase {
  return Object.fromEntries(FocusArea.options.map((area) => [area, { falou: false, maximo: 0 }])) as EstadoEnfase;
}

const VALOR_NIVEL = { secundaria: 1, respondeu: 2 } as const;

/**
 * Acumula o nível de cada área da última fala no estado anterior. Função pura: não muta `anterior`.
 * `fala` é o texto dela, de onde sai a frase que dispara uma declaração explícita.
 */
export function acumularEnfase(anterior: EstadoEnfase, niveis: Partial<Record<FocusArea, NivelEnfase>>, fala: string): EstadoEnfase {
  const novo = { ...anterior };
  for (const area of FocusArea.options) {
    const nivel = niveis[area] ?? "nao_falou";
    const a = anterior[area];
    if (nivel === "nao_falou") continue;
    if (nivel === "dispensou" || nivel === "central") {
      novo[area] = { ...a, falou: true, declarado: nivel, frase: fraseDaArea(fala, area) };
    } else {
      novo[area] = { ...a, falou: true, maximo: Math.max(a.maximo, VALOR_NIVEL[nivel]) };
    }
  }
  return novo;
}

/**
 * Troca de formato por causa de uma área é declaração de central: a área fica central, com a fala que motivou a troca
 * como frase. Se a fala não tem a palavra da área, a fala inteira (limitada), porque é a própria fala da escolha.
 */
export function declararCentral(estado: EstadoEnfase, area: FocusArea, fala: string): EstadoEnfase {
  const frase = fraseDaArea(fala, area) ?? limitarPalavras(fala);
  return { ...estado, [area]: { ...estado[area], falou: true, declarado: "central", frase } };
}

/** Ênfase de uma área pelo estado: undefined se ela nunca falou; 0 se dispensou; 3 se central; senão o máximo. */
export function valorEnfase(a: EstadoAreaEnfase): number | undefined {
  if (!a.falou) return undefined;
  if (a.declarado === "dispensou") return 0;
  if (a.declarado === "central") return 3;
  return a.maximo;
}

/** O que os pesos precisam do estado: ênfase, se falou, áreas dispensadas e a frase que fixou cada declaração. */
export function leituraDoEstado(estado: EstadoEnfase): {
  enfase: Partial<Record<FocusArea, number>>;
  falou: Partial<Record<FocusArea, boolean>>;
  dispensadas: FocusArea[];
  fixou: Partial<Record<FocusArea, string>>;
} {
  const enfase: Partial<Record<FocusArea, number>> = {};
  const falou: Partial<Record<FocusArea, boolean>> = {};
  const fixou: Partial<Record<FocusArea, string>> = {};
  for (const area of FocusArea.options) {
    const a = estado[area];
    falou[area] = a.falou;
    const v = valorEnfase(a);
    if (v !== undefined) enfase[area] = v;
    if (a.declarado && a.frase) fixou[area] = a.frase;
  }
  return { enfase, falou, dispensadas: FocusArea.options.filter((area) => estado[area].declarado === "dispensou"), fixou };
}

/** Frases que disparam "central" nas áreas do foco, na ordem das áreas (até duas). Para "O que mais importa". */
export function frasesImportantes(estado: EstadoEnfase, focus: FocusArea[]): string[] {
  return FocusArea.options
    .filter((area) => focus.includes(area) && estado[area].declarado === "central" && estado[area].frase)
    .map((area) => estado[area].frase as string)
    .slice(0, 2);
}
