/**
 * Campos que a recrutadora editou na revisão e que o automático (extração em segundo plano, pesos, leitura da fala)
 * não pode sobrescrever. Um campo fixado só volta a ser automático quando ela fala daquele campo de novo.
 * Na dúvida, a edição manual vence: sinal que não aponta um campo não solta nada.
 *
 * Mapeamento sinal -> campo solto (ver `camposFalados`):
 *  - quer_<área>, dispensa_<área>, disse_equilibrio, disse_divisao, pediu_equilibrio, decisão de troca de formato
 *    (escolheu_trocar_formato, escolheu_proxima_etapa, escolheu_seguir_sem)      -> focus e criteria
 *  - pediu_system_design, pediu_live_coding (e formato lido da fala)               -> mode, focus e criteria
 *  - quer_tom_*, quer_sem_dicas, quer_dicas, disse_eliminatorio                    -> recruiterNotes (o guia traz tom, dicas e eliminatório)
 *  - nível dito na fala (`nivelDito`, vira `seniority` no rascunho)                -> seniority
 *  - duração dita na fala (`lerDuracao`)                                           -> durationMin
 *  - pediu_mudanca sozinho não aponta campo nenhum: não solta nada.
 */
import { alinharPesos, type CampoFixado, type Rascunho } from "./rascunho";

const CAMPOS: CampoFixado[] = ["mode", "seniority", "focus", "criteria", "recruiterNotes", "durationMin"];
const AREAS = ["tecnico", "escala_produto", "pressao", "uso_ia"];

/** Recorte comparável de cada campo (pesos em 2 casas, para a tela e o servidor concordarem). */
function valorDe(r: Rascunho, campo: CampoFixado): unknown {
  const duas = (n: number) => Math.round(n * 100) / 100;
  switch (campo) {
    case "focus":
      return [...r.focus].map((f) => ({ area: f.area, weight: duas(f.weight) })).sort((a, b) => a.area.localeCompare(b.area));
    case "criteria":
      return r.criteria.map((c) => ({ ...c, weight: duas(c.weight) }));
    default:
      return r[campo] ?? null;
  }
}

/**
 * Campos que `novo` mudou em relação a `atual`. Trocar o formato mexe nos critérios e no foco (a revisão os refaz),
 * e mudar o foco mexe nos critérios: entram juntos.
 */
export function camposMudados(atual: Rascunho, novo: Rascunho): CampoFixado[] {
  const mudou = new Set(CAMPOS.filter((c) => JSON.stringify(valorDe(atual, c)) !== JSON.stringify(valorDe(novo, c))));
  if (mudou.has("mode")) {
    mudou.add("focus");
    mudou.add("criteria");
  }
  if (mudou.has("focus")) mudou.add("criteria");
  return CAMPOS.filter((c) => mudou.has(c));
}

/** Soma `campos` aos fixados do rascunho. Função pura. */
export function fixarCampos(r: Rascunho, campos: CampoFixado[]): Rascunho {
  return { ...r, fixados: CAMPOS.filter((c) => r.fixados.includes(c) || campos.includes(c)) };
}

/** Do que ela falou nesta fala, fora dos sinais: o nível dito e a duração dita. */
export interface FalaDela {
  nivelDito?: boolean;
  duracaoDita?: boolean;
}

/** Campos de que a fala (pelos sinais do turno) tratou. `limiar` é o `LIMIAR` de `cobertura.ts`. Função pura. */
export function camposFalados(sinais: Record<string, number>, fala: FalaDela, limiar: number): Set<CampoFixado> {
  const tem = (id: string) => (sinais[id] ?? 0) >= limiar;
  const soltos = new Set<CampoFixado>();
  const soltar = (...c: CampoFixado[]) => c.forEach((x) => soltos.add(x));
  if (
    AREAS.some((a) => tem(`quer_${a}`) || tem(`dispensa_${a}`)) ||
    ["disse_equilibrio", "disse_divisao", "pediu_equilibrio", "escolheu_trocar_formato", "escolheu_proxima_etapa", "escolheu_seguir_sem"].some(tem)
  ) {
    soltar("focus", "criteria");
  }
  if (tem("pediu_system_design") || tem("pediu_live_coding")) soltar("mode", "focus", "criteria");
  if (["quer_tom_desafiador", "quer_tom_amigavel", "quer_sem_dicas", "quer_dicas", "disse_eliminatorio"].some(tem)) soltar("recruiterNotes");
  if (fala.nivelDito) soltar("seniority");
  if (fala.duracaoDita) soltar("durationMin");
  return soltos;
}

/** Tira dos fixados do rascunho os campos que ela voltou a falar. Função pura. */
export function soltarCampos(r: Rascunho, soltos: Set<CampoFixado>): Rascunho {
  if (soltos.size === 0) return r;
  return { ...r, fixados: r.fixados.filter((c) => !soltos.has(c)) };
}

/**
 * Devolve a `novo` o valor de cada campo fixado em `base` (o rascunho de antes da escrita automática) e mantém os
 * fixados de `base`. Critérios fixados só valem nas áreas que ainda estão no foco; área nova no foco fica com os
 * critérios que `novo` trouxe. Função pura.
 */
export function reaplicarFixados(base: Rascunho, novo: Rascunho): Rascunho {
  const fixados = base.fixados;
  if (fixados.length === 0) return { ...novo, fixados: [] };
  const r: Rascunho = { ...novo, fixados };
  if (fixados.includes("mode")) {
    r.mode = base.mode;
    if (base.mode !== novo.mode) {
      r.problemId = base.problemId;
      r.pedidoProblema = base.pedidoProblema;
    }
  }
  if (fixados.includes("seniority")) r.seniority = base.seniority;
  if (fixados.includes("recruiterNotes")) r.recruiterNotes = base.recruiterNotes;
  if (fixados.includes("durationMin")) r.durationMin = base.durationMin;
  if (fixados.includes("focus")) r.focus = base.focus;
  if (fixados.includes("criteria")) {
    const areas = new Set(r.focus.map((f) => f.area));
    const dela = base.criteria.filter((c) => areas.has(c.focus));
    const areasDela = new Set(dela.map((c) => c.focus));
    const doAutomatico = novo.criteria.filter((c) => !areasDela.has(c.focus) && areas.has(c.focus));
    r.criteria = alinharPesos([...dela, ...doAutomatico], r.focus);
    r.origens = { ...novo.origens, ...Object.fromEntries(dela.map((c) => [c.id, base.origens[c.id] ?? "catalogo"] as const)) };
  }
  return r;
}
