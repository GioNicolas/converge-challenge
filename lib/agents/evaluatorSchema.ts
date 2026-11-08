/** Saída estruturada do Evaluator. O LLM responde só com JSON nesse formato. */
import { z } from "zod";

export const EvaluatorCriterion = z.object({
  id: z.string(),
  /** null: a sessão não deu oportunidade de observar o critério. */
  score: z.number().int().min(1).max(4).nullable(),
  /** `at` é um mm:ss que aparece na linha do tempo; evidência com tempo inventado é descartada. */
  evidence: z.array(z.object({ at: z.string(), text: z.string() })).max(3),
});

export const EvaluatorOutput = z.object({
  criteria: z.array(EvaluatorCriterion),
  /** Só quando houve empecilho: como ele se adaptou à mudança. Fica fora da nota geral. */
  adaptation: z
    .object({
      score: z.number().int().min(1).max(4).nullable(),
      evidence: z.array(z.object({ at: z.string(), text: z.string() })).max(3),
    })
    .nullish(),
  /** Só quando houve dica, travamento ou mudança: como ele destravou e usou a ajuda. Fica fora da nota geral. */
  learning: z
    .object({
      score: z.number().int().min(1).max(4).nullable(),
      evidence: z.array(z.object({ at: z.string(), text: z.string() })).max(3),
    })
    .nullish(),
  summary: z.string(),
  strengths: z.array(z.string()).max(4),
  concerns: z.array(z.string()).max(4),
  nextSteps: z.array(z.string()).max(3),
});
export type EvaluatorOutput = z.infer<typeof EvaluatorOutput>;
