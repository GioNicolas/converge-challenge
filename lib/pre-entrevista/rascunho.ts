/**
 * Rascunho do InterviewConfig, preenchido aos poucos durante a pré-entrevista.
 *
 * Começa com o que o classificador (Jev) sugeriu. A conversa com a recrutadora
 * vai completando e corrigindo os campos. No fim, `paraInterviewConfig` valida
 * e gera o `InterviewConfig` que o agente entrevistador usa.
 */
import { z } from "zod";
import { Criterion, FocusArea, InterviewConfig, InterviewMode } from "@/lib/contracts";
import type { Classificacao, Vaga } from "./classificador";
import { criteriosIniciais, PROBLEMA_PADRAO } from "./catalogo";

/** Uma fala da conversa de pré-entrevista. */
export type Turno = { role: "recrutadora" | "agente"; text: string };

/** Duração padrão quando a recrutadora não disse nada. */
const DURACAO_PADRAO: Record<InterviewMode, number> = {
  live_coding: 30,
  system_design: 45,
};

/** Os candidatos escolhem a linguagem na IDE. */
const LINGUAGENS = ["python", "cpp"];

export const Foco = z.object({ area: FocusArea, weight: z.number().min(0).max(1) });
export type Foco = z.infer<typeof Foco>;

export const Rascunho = z.object({
  mode: InterviewMode,
  roleTitle: z.string(),
  jobDescription: z.string().optional(),
  seniority: InterviewConfig.shape.seniority,
  focus: z.array(Foco),
  criteria: z.array(Criterion),
  recruiterNotes: z.string().default(""),
  durationMin: z.number().int().positive().optional(),
  problemId: z.string().optional(),
  /** Se a recrutadora já confirmou (ou corrigiu) o que o Jev sugeriu. */
  confirmado: z.object({ mode: z.boolean(), seniority: z.boolean(), focus: z.boolean() }),
  /** Probabilidade máxima já observada de cada tópico estar coberto (ver `cobertura.ts`). Só sobe. */
  cobertura: z.record(z.string(), z.number()).default({}),
  /** Ids de tópicos ainda não cobertos na conversa (derivado de `cobertura`). */
  pendencias: z.array(z.string()),
});
export type Rascunho = z.infer<typeof Rascunho>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Reescala os pesos dos critérios para que a soma de cada área, dividida pela soma total,
 * seja igual ao peso da área no foco. Mantém a proporção entre critérios da mesma área.
 * A soma total fica em N (número de critérios), então a média dos pesos fica perto de 1.
 * Pesos arredondados em 2 casas e nunca abaixo de 0,01. Função pura.
 */
export function alinharPesos(criteria: Criterion[], focus: Foco[]): Criterion[] {
  const n = criteria.length;
  if (n === 0) return criteria;

  const areas = [...new Set(criteria.map((c) => c.focus))];
  const pesoDaArea = (a: FocusArea) => focus.find((f) => f.area === a)?.weight ?? 0;
  // Área de foco sem critério não recebe peso: as outras se dividem o total.
  const somaFoco = areas.reduce((acc, a) => acc + pesoDaArea(a), 0);

  return criteria.map((c) => {
    const somaGrupo = criteria.filter((x) => x.focus === c.focus).reduce((acc, x) => acc + x.weight, 0);
    const alvoGrupo = somaFoco > 0 ? (pesoDaArea(c.focus) / somaFoco) * n : n / areas.length;
    return { ...c, weight: Math.max(0.01, round2((c.weight / somaGrupo) * alvoGrupo)) };
  });
}

/** Para cada área do foco: peso no foco e soma real dos pesos dos critérios / soma total. Para conferência. */
export function somaPorArea(criteria: Criterion[], focus: Foco[]): Array<{ area: FocusArea; noFoco: number; nosCriterios: number }> {
  const total = criteria.reduce((acc, c) => acc + c.weight, 0);
  return focus.map((f) => {
    const soma = criteria.filter((c) => c.focus === f.area).reduce((acc, c) => acc + c.weight, 0);
    return { area: f.area, noFoco: f.weight, nosCriterios: total > 0 ? round2(soma / total) : 0 };
  });
}

/** Pré-preenche o rascunho a partir da classificação da vaga. Nada confirmado ainda. */
export function criarRascunho(vaga: Vaga, c: Classificacao): Rascunho {
  const mode = c.mode.value;
  const focus = c.focus;
  return {
    mode,
    roleTitle: vaga.roleTitle,
    jobDescription: vaga.jobDescription,
    seniority: c.seniority.value,
    focus,
    criteria: alinharPesos(
      criteriosIniciais(
        mode,
        focus.map((f) => f.area),
      ),
      focus,
    ),
    recruiterNotes: "",
    confirmado: { mode: false, seniority: false, focus: false },
    cobertura: {},
    pendencias: [],
  };
}

function gerarId(): string {
  return `cfg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Valida o rascunho e gera o `InterviewConfig`, ou devolve as mensagens de erro. */
export function paraInterviewConfig(r: Rascunho): { ok: true; config: InterviewConfig } | { ok: false; erros: string[] } {
  const erros: string[] = [];

  if (r.focus.length === 0) erros.push("focus: precisa de pelo menos uma área");
  const areas = new Set(r.focus.map((f) => f.area));
  for (const c of r.criteria) {
    if (!areas.has(c.focus)) erros.push(`criteria.${c.id}: foco "${c.focus}" fora das áreas de foco`);
  }

  const candidato = {
    id: gerarId(),
    mode: r.mode,
    roleTitle: r.roleTitle,
    jobDescription: r.jobDescription,
    seniority: r.seniority,
    focus: r.focus,
    recruiterNotes: r.recruiterNotes,
    criteria: r.criteria,
    problemId: r.problemId ?? PROBLEMA_PADRAO[r.mode],
    languages: LINGUAGENS,
    durationMin: r.durationMin ?? DURACAO_PADRAO[r.mode],
  };

  const resultado = InterviewConfig.safeParse(candidato);
  if (!resultado.success) {
    for (const i of resultado.error.issues) erros.push(`${i.path.join(".") || "(raiz)"}: ${i.message}`);
  }
  if (erros.length > 0 || !resultado.success) return { ok: false, erros };
  return { ok: true, config: resultado.data };
}
