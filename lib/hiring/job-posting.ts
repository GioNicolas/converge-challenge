/**
 * Vaga -> plano de entrevista sugerido pelo agente -> aprovação do gestor da área.
 *
 * Escopo: só entrevista TÉCNICA. A voz é o canal de toda entrevista (não é uma
 * ferramenta). Conversa sem artefato técnico (comportamental etc.) está fora.
 *
 * Arquivo separado de `lib/contracts.ts` de propósito: ainda não decidimos como
 * o plano aprovado vira um `InterviewConfig`.
 */
import { z } from "zod";

/**
 * Ferramentas que o produto sabe montar. Lista FECHADA: cada item exige UI e
 * eventos próprios. Formato novo de entrevista = combinação delas; só vira
 * código aqui se for uma ferramenta nova (ex.: terminal, editor de SQL).
 */
export const InterviewTool = z.enum([
  "code_editor", // Monaco + execução de testes (live coding)
  "whiteboard", // Excalidraw (system design, fluxos, cronogramas, layouts, diagramas)
]);
export type InterviewTool = z.infer<typeof InterviewTool>;

export const JobPosting = z.object({
  id: z.string(),
  title: z.string(),
  seniority: z.enum(["junior", "pleno", "senior", "staff"]),
  /** Texto da vaga como a empresa publicaria. É isso que o agente interpreta. */
  description: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string()),
  niceToHave: z.array(z.string()).default([]),
  stack: z.array(z.string()),
});
export type JobPosting = z.infer<typeof JobPosting>;

// ---------------------------------------------------------------------------
// Plano sugerido pelo agente
// ---------------------------------------------------------------------------

export const PlanStage = z.object({
  tool: InterviewTool,
  minutes: z.number().int().positive(),
  /** Desafio proposto: título curto + enunciado, para o gestor da área avaliar. */
  challenge: z.object({ title: z.string(), brief: z.string() }),
  /** Por que esta etapa, ligando à descrição da vaga. */
  rationale: z.string(),
});

export const FocusPoint = z.object({
  /** O que observar ("raciocínio sobre consistência vs. disponibilidade"). */
  topic: z.string(),
  /** Trecho/requisito da vaga que justifica o foco. */
  evidenceFromPosting: z.string(),
  weight: z.number().min(0).max(1),
});

export const InterviewPlan = z
  .object({
    jobPostingId: z.string(),
    stages: z.array(PlanStage).min(1),
    focusPoints: z.array(FocusPoint).min(1),
    /** O que o agente decidiu NÃO cobrir e por quê. */
    outOfScope: z.array(z.string()).default([]),
    summary: z.string(),
  })
  .refine((p) => Math.abs(p.focusPoints.reduce((sum, f) => sum + f.weight, 0) - 1) <= 0.01, {
    message: "Os pesos de focusPoints devem somar 1 (tolerância 0.01)",
    path: ["focusPoints"],
  });
export type InterviewPlan = z.infer<typeof InterviewPlan>;

// ---------------------------------------------------------------------------
// Aprovação do gestor da área
// ---------------------------------------------------------------------------

export const PlanReview = z
  .object({
    jobPostingId: z.string(),
    status: z.enum(["pendente", "aprovado", "ajustes_pedidos"]),
    reviewer: z.string().optional(),
    comment: z.string().default(""),
    reviewedAt: z.string().datetime().optional(),
  })
  .refine((r) => r.status === "pendente" || (!!r.reviewer && !!r.reviewedAt), {
    message: "reviewer e reviewedAt são obrigatórios quando status não é pendente",
    path: ["reviewer"],
  });
export type PlanReview = z.infer<typeof PlanReview>;
