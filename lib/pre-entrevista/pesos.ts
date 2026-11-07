/**
 * Pesos do foco pela ênfase que a recrutadora deu, e evidência de cada critério.
 *
 * O foco não sai mais do extrator (LLM). Sai de `pesosPelaEnfase`, que lê, para cada área:
 *  - se ela falou da área: a ênfase que o Jev deu pelas falas dela (0 a 3);
 *  - se não falou: a nota da vaga (classificador, 0 a 3) × 0,5, limitada a 1.
 *
 * Cada critério precisa de uma fala dela que o justifique (`acharEvidencia`). Sem isso, volta ao catálogo.
 */
import { FocusArea, type InterviewMode } from "@/lib/contracts";
import { CATALOGO, mede } from "./catalogo";
import { leituraDoEstado, frasesImportantes, type EstadoEnfase } from "./enfase";
import { montarGuia, type EntradaGuia } from "./guia";
import { limitarPalavras, normalizarTexto } from "./frases";

export { limitarPalavras, normalizarTexto };
import type { Preferencias } from "./preferencias";
import { alinharPesos, type DecisoesTradeoff, type Foco, type Origem, type Rascunho, type Turno } from "./rascunho";

const AREAS = FocusArea.options;
/** Nota a partir da qual a área entra no foco (ou fica, quando já estava). */
const CORTE_FOCO = 0.75;
/** Peso mínimo de uma área que fica no foco. Área que só ficou por proteção pesa pouco, mas não zero. */
const PESO_MINIMO = 0.5;

export interface EntradaPesos {
  mode: InterviewMode;
  /** Foco antes desta leitura. Área que já estava nele só sai se ela dispensou ou se a troca de formato a deixou de fora. */
  focoAnterior: Foco[];
  /** Ênfase acumulada por área (0 a 3), vinda de `enfase.ts`. Ausente = ela nunca falou da área. */
  enfase: Partial<Record<FocusArea, number>>;
  /** Se ela já falou da área em alguma fala. */
  falou: Partial<Record<FocusArea, boolean>>;
  /** Frase que fixou a declaração explícita (central ou dispensou) de cada área. */
  fixou: Partial<Record<FocusArea, string>>;
  /** Áreas que ela dispensou (declaração explícita). Saem do foco, sem proteção. */
  dispensadas: FocusArea[];
  /** Ênfase da vaga pelo classificador (0 a 3). Vale para as áreas de que ela não falou. */
  notaVaga: Partial<Record<FocusArea, number>>;
  decisoes: DecisoesTradeoff;
}

/** Como cada área entrou ou ficou de fora: para a tela e para o log. */
export interface DetalhePeso {
  area: FocusArea;
  /** "ela falou" quando a ênfase veio da conversa; "pela vaga" quando veio do classificador. */
  origem: "ela falou" | "pela vaga";
  /** Ênfase usada, de 0 a 3. */
  enfase: number;
  /** Nota final da área, antes de normalizar. */
  nota: number;
  /** Peso no foco, somando 1 entre as áreas que ficaram. Zero se a área saiu. */
  peso: number;
  noFoco: boolean;
  motivo: string;
  /** Frase dela que fixou a declaração (central ou dispensou), se houver. */
  fixou?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pesos do foco a partir da ênfase. Função pura.
 *
 * Regras, nesta ordem:
 *  1. área que o formato não mede nunca entra;
 *  2. área deixada para a próxima etapa ou seguida sem é tirada (decisão de troca de formato);
 *  3. área que ela dispensou (acima do limiar) sai;
 *  4. área marcada como trocada entra;
 *  5. nota ≥ 0,75 entra. Nota menor só fica se já estava no foco (proteção: só sai se dispensou);
 *  6. o peso de quem fica é a nota, com piso de 0,5. O foco é normalizado para somar 1, com 2 casas.
 * Se nenhuma área passar, fica a de maior nota entre as que o formato mede.
 */
export function pesosPelaEnfase(e: EntradaPesos): { focus: Foco[]; detalhe: DetalhePeso[] } {
  // Enquanto ela não falou de nenhuma área (e não houve decisão de troca), o foco é o do classificador.
  // Sem fala, todas as áreas cairiam em "pela vaga" e o foco embaralharia antes de ela responder.
  const ninguemFalou = !AREAS.some((a) => e.falou[a] === true) && Object.keys(e.decisoes).length === 0;
  if (ninguemFalou && e.focoAnterior.length > 0) {
    const focus = e.focoAnterior.map((f) => ({ area: f.area, weight: f.weight }));
    const detalhe: DetalhePeso[] = AREAS.map((area) => {
      const peso = focus.find((f) => f.area === area)?.weight ?? 0;
      const enfase = e.notaVaga[area] ?? 0;
      return {
        area,
        origem: "pela vaga",
        enfase,
        nota: Math.min(1, enfase * 0.5),
        peso,
        noFoco: peso > 0,
        motivo: peso > 0 ? "foco do classificador (ela ainda não falou de nenhuma área)" : "fora do foco do classificador",
      };
    });
    return { focus, detalhe };
  }

  const estavaNoFoco = new Set(e.focoAnterior.map((f) => f.area));

  const detalhe: DetalhePeso[] = AREAS.map((area) => {
    const falou = e.falou[area] === true;
    const enfase = falou ? (e.enfase[area] ?? 0) : (e.notaVaga[area] ?? 0);
    const nota = falou ? enfase : Math.min(1, enfase * 0.5);
    const base = { area, origem: falou ? ("ela falou" as const) : ("pela vaga" as const), enfase, nota, peso: 0 };
    const decisao = e.decisoes[area];

    if (!mede(e.mode, area)) return { ...base, noFoco: false, motivo: "o formato não mede esta área" };
    if (decisao === "proxima_etapa" || decisao === "seguir_sem") {
      return { ...base, noFoco: false, motivo: "deixada de fora pela troca de formato" };
    }
    if (e.dispensadas.includes(area)) return { ...base, noFoco: false, motivo: "ela dispensou", fixou: e.fixou[area] };
    if (decisao === "trocou") return { ...base, noFoco: true, motivo: "trocou de formato para medir esta área" };
    if (nota >= CORTE_FOCO) return { ...base, noFoco: true, motivo: "ênfase acima do corte", fixou: e.fixou[area] };
    if (estavaNoFoco.has(area)) {
      return { ...base, noFoco: true, motivo: "estava no foco e ela não dispensou (proteção)", fixou: e.fixou[area] };
    }
    return { ...base, noFoco: false, motivo: "ênfase abaixo do corte e não estava no foco", fixou: e.fixou[area] };
  });

  if (!detalhe.some((d) => d.noFoco)) {
    const melhor = detalhe.filter((d) => mede(e.mode, d.area)).sort((a, b) => b.nota - a.nota)[0];
    if (melhor) {
      melhor.noFoco = true;
      melhor.motivo = "nenhuma área passou: ficou a de maior ênfase entre as que o formato mede";
    }
  }

  const escolhidas = detalhe.filter((d) => d.noFoco);
  const brutos = escolhidas.map((d) => Math.max(d.nota, PESO_MINIMO));
  const soma = brutos.reduce((acc, p) => acc + p, 0);
  const pesos = brutos.map((p) => round2(p / soma));
  // O arredondamento vai na área de maior peso, para a soma dar exatamente 1.
  const ordem = escolhidas.map((d, i) => ({ d, peso: pesos[i] })).sort((a, b) => b.peso - a.peso);
  const diff = round2(1 - ordem.reduce((acc, o) => acc + o.peso, 0));
  ordem[0].peso = round2(ordem[0].peso + diff);
  for (const o of ordem) o.d.peso = o.peso;

  const focus: Foco[] = ordem.map((o) => ({ area: o.d.area, weight: o.peso }));
  return { focus, detalhe };
}

/**
 * Procura o trecho nas falas da recrutadora, ignorando acento e caixa. Devolve a fala mais recente que o contém e
 * o número dela na transcrição (1 = abertura da Totti). Trecho de menos de 3 palavras não serve como prova.
 * Trecho que não aparece em nenhuma fala dela: undefined. Função pura.
 */
export function acharEvidencia(trecho: string, transcricao: Turno[]): { fala: string; turno: number } | undefined {
  const alvo = normalizarTexto(trecho);
  if (alvo.split(" ").filter(Boolean).length < 3) return undefined;
  for (let i = transcricao.length - 1; i >= 0; i--) {
    const t = transcricao[i];
    if (t.role !== "recrutadora") continue;
    if (` ${normalizarTexto(t.text)} `.includes(` ${alvo} `)) return { fala: trecho.trim(), turno: i + 1 };
  }
  return undefined;
}

/** O que a leitura de pesos precisa além do rascunho: o estado da ênfase por fala, as decisões e a vaga. */
export interface ContextoPesos {
  estado: EstadoEnfase;
  notaVaga: Partial<Record<FocusArea, number>>;
  decisoes: DecisoesTradeoff;
}

/** O que o guia precisa além do foco: preferências, as falas que as justificam, eliminatórios e o que fica de fora. */
export interface ContextoGuiaPesos {
  preferencias: Preferencias;
  origemTom?: string;
  origemDicas?: string;
  /** Eliminatórios de fallback (falas inteiras), usados quando o extrator não trouxe trecho. */
  eliminatoriosFalas: string[];
  naoAvaliado: string[];
}

/**
 * Refaz o foco, os critérios e as notas a partir do estado. Função pura. Não muta `r`.
 *  - o foco vem de `pesosPelaEnfase`;
 *  - critério de área que saiu do foco some; área que entrou (ou ficou sem critério) recebe os do catálogo;
 *  - critério que não tem origem registrada fica como "catalogo";
 *  - as notas do guia são montadas por `montarGuia`.
 */
export function recalcularRascunho(r: Rascunho, cp: ContextoPesos, cg: ContextoGuiaPesos): { rascunho: Rascunho; detalhe: DetalhePeso[] } {
  const leitura = leituraDoEstado(cp.estado);
  const { focus, detalhe } = pesosPelaEnfase({
    mode: r.mode,
    focoAnterior: r.focus,
    enfase: leitura.enfase,
    falou: leitura.falou,
    fixou: leitura.fixou,
    dispensadas: leitura.dispensadas,
    notaVaga: cp.notaVaga,
    decisoes: cp.decisoes,
  });
  const areas = focus.map((f) => f.area);

  const mantidos = r.criteria.filter((c) => areas.includes(c.focus));
  const doCatalogo = areas
    .filter((a) => !mantidos.some((c) => c.focus === a))
    .flatMap((a) => CATALOGO[r.mode].filter((c) => c.focus === a))
    .map((c) => ({ ...c }));
  const criteria = alinharPesos([...mantidos, ...doCatalogo], focus);

  const origens: Record<string, Origem> = {};
  for (const c of criteria) origens[c.id] = r.origens[c.id] ?? "catalogo";

  const guia: EntradaGuia = {
    focus: areas,
    enfase: Object.fromEntries(detalhe.filter((d) => d.noFoco).map((d) => [d.area, d.enfase])),
    dispensadas: leitura.dispensadas,
    frasesImportantes: frasesImportantes(cp.estado, areas),
    eliminatorios: r.eliminatorios.length ? r.eliminatorios : cg.eliminatoriosFalas.map(limitarPalavras),
    contexto: r.contexto,
    tom: cg.preferencias.tom,
    dicas: cg.preferencias.dicas,
    origemTom: cg.origemTom,
    origemDicas: cg.origemDicas,
    naoAvaliado: cg.naoAvaliado,
  };

  return {
    rascunho: { ...r, focus, criteria, origens, recruiterNotes: montarGuia(guia) },
    detalhe,
  };
}
