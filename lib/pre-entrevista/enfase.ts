/**
 * Ênfase por fala: o que a recrutadora disse sobre cada área, acumulado no código (sem LLM).
 *
 * O Jev classifica só a última fala dela (com a última pergunta do Totti), com um nível por área (`cobertura.ts`).
 * Quem acumula é `acumularEnfase`, função pura:
 *  - "dispensou", "reduzir" e "central" são declarações explícitas: a mais recente vence e fixa o estado (0, 1 ou 3),
 *    até outra declaração explícita mudar. Guardam a frase que as disparou;
 *  - "reduzir" é pesar menos sem tirar: a área fica no foco com ênfase baixa. Só "dispensou" tira;
 *  - "respondeu" (2) e "secundaria" (1) valem o máximo observado, e não rebaixam uma área declarada;
 *  - em live coding, dispensar a área técnica fica pendente até ela confirmar (o formato é um problema de código).
 *
 * A divisão (`Divisao`) é o pedido dela sobre a proporção entre as áreas: equilíbrio ("deixa mais equilibrado") ou
 * proporção dita ("setenta trinta"). É declaração explícita: vale sobre a ênfase até ela pedir outra divisão.
 */
import { FocusArea, type InterviewMode } from "@/lib/contracts";
import { fraseDaArea, limitarPalavras, normalizarTexto, PALAVRAS_AREA } from "./frases";

/** Nível que o Jev dá a uma área na última fala. */
export const NIVEIS_ENFASE = ["nao_falou", "dispensou", "reduzir", "secundaria", "respondeu", "central"] as const;
export type NivelEnfase = (typeof NIVEIS_ENFASE)[number];

/** Declaração explícita sobre uma área: tirar (0), pesar menos (1) ou o principal (3). */
export type Declaracao = "dispensou" | "reduzir" | "central";

export interface EstadoAreaEnfase {
  /** Se ela já falou da área em alguma fala. */
  falou: boolean;
  /** Maior nível observado (1 secundária, 2 respondeu), sem declaração explícita. */
  maximo: number;
  /** Última declaração explícita: dispensou (0), reduzir (1) ou central (3). */
  declarado?: Declaracao;
  /**
   * Dispensa que ainda espera a confirmação dela (área técnica em live coding). Enquanto pendente, a área fica no foco
   * com ênfase baixa, como "reduzir".
   */
  pendente?: boolean;
  /** Frase da fala que disparou a declaração explícita (só a frase que fala da área; sem ela, não se cita). */
  frase?: string;
}

/**
 * O que ela pediu sobre a proporção entre as áreas. "equilibrio": as áreas do foco ficam com o mesmo peso, inclusive
 * as que entrarem depois. "proporcao": a fração que ela disse para cada área (soma 1).
 */
export type Divisao =
  | { tipo: "equilibrio"; frase?: string }
  | { tipo: "proporcao"; pesos: Partial<Record<FocusArea, number>>; frase?: string };

export type EstadoEnfase = Record<FocusArea, EstadoAreaEnfase> & { divisao?: Divisao };

export function estadoInicialEnfase(): EstadoEnfase {
  return Object.fromEntries(FocusArea.options.map((area) => [area, { falou: false, maximo: 0 }])) as unknown as EstadoEnfase;
}

const VALOR_NIVEL = { secundaria: 1, respondeu: 2 } as const;

/** Em live coding, a área técnica é o próprio problema de código: tirar precisa da confirmação dela. */
export function dispensaPrecisaConfirmar(area: FocusArea, mode?: InterviewMode): boolean {
  return area === "tecnico" && mode === "live_coding";
}

export interface OpcoesAcumulo {
  /** Formato do plano agora: em live coding, dispensar a área técnica fica pendente (ver `dispensaPrecisaConfirmar`). */
  mode?: InterviewMode;
  /** Divisão que ela pediu nesta fala (ver `lerDivisao`). Substitui a anterior. */
  divisao?: Divisao;
}

/**
 * Acumula o nível de cada área da última fala no estado anterior. Função pura: não muta `anterior`.
 * `fala` é o texto dela, de onde sai a frase que dispara uma declaração explícita.
 * Dispensar de novo uma área com dispensa pendente confirma a dispensa (ela insistiu em tirar); falar do que espera
 * dela ("secundaria", "respondeu") desfaz a dispensa pendente, e a área fica pesando menos.
 */
export function acumularEnfase(
  anterior: EstadoEnfase,
  niveis: Partial<Record<FocusArea, NivelEnfase>>,
  fala: string,
  opcoes: OpcoesAcumulo = {},
): EstadoEnfase {
  const novo: EstadoEnfase = { ...anterior };
  for (const area of FocusArea.options) {
    const nivel = niveis[area] ?? "nao_falou";
    const a = anterior[area];
    if (nivel === "nao_falou") continue;
    if (nivel === "dispensou") {
      const pendente = dispensaPrecisaConfirmar(area, opcoes.mode) && !(a.declarado === "dispensou");
      novo[area] = { ...a, falou: true, declarado: "dispensou", pendente, frase: fraseDaArea(fala, area) ?? a.frase };
    } else if (nivel === "reduzir" || nivel === "central") {
      novo[area] = { ...a, falou: true, declarado: nivel, pendente: false, frase: fraseDaArea(fala, area) };
    } else if (a.pendente) {
      // Dispensa pendente e, agora, ela fala do que espera da área: a área conta, só pesa menos.
      novo[area] = { ...a, falou: true, declarado: "reduzir", pendente: false, maximo: Math.max(a.maximo, VALOR_NIVEL[nivel]) };
    } else {
      novo[area] = { ...a, falou: true, maximo: Math.max(a.maximo, VALOR_NIVEL[nivel]) };
    }
  }
  if (opcoes.divisao) novo.divisao = opcoes.divisao;
  else if (novo.divisao?.tipo === "equilibrio" && FocusArea.options.some((area) => niveis[area] === "central" || niveis[area] === "reduzir")) {
    // Equilíbrio é vago e cede a uma ênfase nova ("o foco é pressão"). Proporção com números fica até ela dizer outra.
    delete novo.divisao;
  }
  return novo;
}

/**
 * Ela confirmou, quando o Totti perguntou, que a área pode sair: a área fica dispensada (sai do foco), tenha ou não
 * uma dispensa pendente antes. Função pura.
 */
export function confirmarDispensa(estado: EstadoEnfase, area: FocusArea): EstadoEnfase {
  const a = estado[area];
  if (a.declarado === "dispensou" && !a.pendente) return estado;
  return { ...estado, [area]: { ...a, falou: true, declarado: "dispensou", pendente: false } };
}

/**
 * Ela não confirmou a dispensa pendente (disse que a área conta): a dispensa vira "pesar menos", e a área fica.
 * Sem dispensa pendente, nada muda. Função pura.
 */
export function recusarDispensa(estado: EstadoEnfase, area: FocusArea): EstadoEnfase {
  if (!estado[area].pendente) return estado;
  return { ...estado, [area]: { ...estado[area], declarado: "reduzir", pendente: false } };
}

/** Áreas com dispensa esperando a confirmação dela. */
export function dispensasPendentes(estado: EstadoEnfase): FocusArea[] {
  return FocusArea.options.filter((area) => estado[area].declarado === "dispensou" && estado[area].pendente === true);
}

/**
 * Troca de formato por causa de uma área é declaração de central: a área fica central, com a fala que motivou a troca
 * como frase. Se a fala não tem a palavra da área, a fala inteira (limitada), porque é a própria fala da escolha.
 */
export function declararCentral(estado: EstadoEnfase, area: FocusArea, fala: string): EstadoEnfase {
  const frase = fraseDaArea(fala, area) ?? limitarPalavras(fala);
  return { ...estado, [area]: { ...estado[area], falou: true, declarado: "central", pendente: false, frase } };
}

/**
 * Ênfase de uma área pelo estado: undefined se ela nunca falou; 0 se dispensou; 1 se pediu para pesar menos (ou se a
 * dispensa ainda espera confirmação); 3 se central; senão o máximo.
 */
export function valorEnfase(a: EstadoAreaEnfase): number | undefined {
  if (!a.falou) return undefined;
  if (a.declarado === "dispensou") return a.pendente ? 1 : 0;
  if (a.declarado === "reduzir") return 1;
  if (a.declarado === "central") return 3;
  return a.maximo;
}

/** O que os pesos precisam do estado: ênfase, se falou, áreas dispensadas, a frase que fixou cada declaração e a divisão. */
export function leituraDoEstado(estado: EstadoEnfase): {
  enfase: Partial<Record<FocusArea, number>>;
  falou: Partial<Record<FocusArea, boolean>>;
  dispensadas: FocusArea[];
  fixou: Partial<Record<FocusArea, string>>;
  divisao?: Divisao;
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
  const dispensadas = FocusArea.options.filter((area) => estado[area].declarado === "dispensou" && !estado[area].pendente);
  return { enfase, falou, dispensadas, fixou, ...(estado.divisao ? { divisao: estado.divisao } : {}) };
}

/** Frase que declarou cada área como central (para "O que mais importa"), só das áreas do foco. */
export function frasesCentrais(estado: EstadoEnfase, focus: FocusArea[]): Partial<Record<FocusArea, string>> {
  return Object.fromEntries(
    FocusArea.options
      .filter((area) => focus.includes(area) && estado[area].declarado === "central" && estado[area].frase)
      .map((area) => [area, estado[area].frase as string]),
  );
}

/** Frases que disparam "central" nas áreas do foco, na ordem das áreas (até duas). */
export function frasesImportantes(estado: EstadoEnfase, focus: FocusArea[]): string[] {
  return Object.values(frasesCentrais(estado, focus)).slice(0, 2) as string[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Divisão dita na fala: equilíbrio ("meio a meio") ou proporção ("setenta trinta", "mais técnico que pressão").
// ---------------------------------------------------------------------------------------------------------------------

/** Pedido de equilíbrio entre as áreas, sem número. */
const RE_EQUILIBRIO = new RegExp(
  "\\b(" +
    [
      "mais equilibrad\\w*",
      "deix\\w* equilibrad\\w*",
      "equilibrad\\w* entre",
      "equilibr\\w* (os pesos|as areas|melhor|mais|isso|o foco|a avaliacao|as duas|as coisas)",
      "meio a meio",
      "metade (e|pra|para) metade",
      "metade (pra|para|de) cada",
      "divid\\w* (igual|por igual|igualmente)",
      "(mesmo|igual) peso",
      "pesos? iguais",
      "um terco (pra|para) cada",
    ].join("|") +
    ")\\b",
);

/** Palavras que nomeiam cada área numa proporção. Inclui "técnico", que não é palavra de frase da área técnica. */
const AREA_NA_PROPORCAO: Record<FocusArea, RegExp> = {
  tecnico: new RegExp(`tecnic|${PALAVRAS_AREA.tecnico.source}`, "i"),
  pressao: PALAVRAS_AREA.pressao,
  escala_produto: PALAVRAS_AREA.escala_produto,
  uso_ia: /\b(ia|llms?|agentes?|rag|prompts?)\b/i,
};

const DEZENAS: Record<string, number> = {
  dez: 10, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};
const UNIDADES: Record<string, number> = { cinco: 5 };

/** Troca números por extenso de proporção ("setenta e cinco", "trinta") por algarismos, no texto normalizado. */
function comAlgarismos(normalizado: string): string {
  const dezenas = Object.keys(DEZENAS).join("|");
  const unidades = Object.keys(UNIDADES).join("|");
  return normalizado
    .replace(new RegExp(`\\b(${dezenas}) e (${unidades})\\b`, "g"), (_, d: string, u: string) => String(DEZENAS[d] + UNIDADES[u]))
    .replace(new RegExp(`\\b(${dezenas})\\b`, "g"), (_, d: string) => String(DEZENAS[d]));
}

/** Áreas citadas no trecho, na ordem em que aparecem. */
function areasCitadas(trecho: string): FocusArea[] {
  const achadas = FocusArea.options
    .map((area) => ({ area, i: trecho.search(AREA_NA_PROPORCAO[area]) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  return achadas.map((x) => x.area);
}

/** Atribui as duas frações às áreas: as citadas, na ordem; completa com as do foco, da mais pesada para a menos. */
function atribuir(fracoes: [number, number], citadas: FocusArea[], foco: FocusArea[]): Partial<Record<FocusArea, number>> | undefined {
  let areas: FocusArea[] | undefined;
  if (citadas.length >= 2) areas = citadas.slice(0, 2);
  else if (citadas.length === 1) {
    // Com só uma área citada, o resto fica com a outra do foco, se for uma só.
    const outras = foco.filter((a) => a !== citadas[0]);
    if (outras.length === 1) areas = [citadas[0], outras[0]];
  } else if (foco.length === 2) areas = foco;
  if (!areas) return undefined;
  return { [areas[0]]: fracoes[0], [areas[1]]: fracoes[1] };
}

/** Fração do "mais X que Y": X pesa mais, sem número dito. */
const FRACAO_COMPARATIVO: [number, number] = [0.6, 0.4];

/**
 * A divisão que a fala pede, se pede. Função pura, sem LLM.
 *  - "deixa mais equilibrado", "meio a meio", "divide igual": equilíbrio;
 *  - "setenta trinta", "70/30", "70% técnico e 30% pressão": proporção. As áreas são as citadas, na ordem; sem área
 *    citada, as duas do foco (`foco`, da mais pesada para a menos), a primeira com o primeiro número;
 *  - "mais técnico que pressão": proporção de 60/40 para a primeira.
 * `foco` são as áreas do foco agora, da mais pesada para a menos pesada.
 */
export function lerDivisao(fala: string, foco: FocusArea[]): Divisao | undefined {
  const texto = comAlgarismos(normalizarTexto(fala));
  const frase = limitarPalavras(fala);

  // Dois números seguidos, com até 30 letras entre eles ("70 30", "70 por cento tecnico e 30 pressao"), somando 100.
  const numeros = [...texto.matchAll(/\b\d{1,3}\b/g)];
  for (let i = 0; i + 1 < numeros.length; i++) {
    const [x, y] = [numeros[i], numeros[i + 1]];
    const a = Number(x[0]);
    const b = Number(y[0]);
    if (a + b !== 100 || a === 0 || b === 0) continue;
    const fimX = (x.index ?? 0) + x[0].length;
    if ((y.index ?? 0) - fimX > 30) continue;
    // "60 e 40 minutos" é duração, não proporção.
    if (/^ (minutos?|min|horas?|h|segundos?|dias?|semanas?|meses|anos?)\b/.test(texto.slice((y.index ?? 0) + y[0].length))) continue;
    if (a === b) return { tipo: "equilibrio", frase };
    const pesos = atribuir([a / 100, b / 100], areasCitadas(texto), foco);
    if (pesos) return { tipo: "proporcao", pesos, frase };
  }

  if (RE_EQUILIBRIO.test(texto)) return { tipo: "equilibrio", frase };

  // Uma ou duas palavras de cada lado: "mais técnico que pressão", "mais código do que escala".
  const comparativo = texto.match(/\bmais (\w+(?: \w+)?) (?:do )?que (?:o |a |os |as |de |em )?(\w+(?: \w+)?)\b/);
  if (comparativo) {
    const primeira = areasCitadas(comparativo[1])[0];
    const segunda = areasCitadas(comparativo[2]).find((x) => x !== primeira);
    if (primeira && segunda) {
      return { tipo: "proporcao", pesos: { [primeira]: FRACAO_COMPARATIVO[0], [segunda]: FRACAO_COMPARATIVO[1] }, frase };
    }
  }
  return undefined;
}
