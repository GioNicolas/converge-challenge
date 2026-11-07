/** Saída estruturada do Evaluator. O LLM responde só com JSON nesse formato. */
import { z } from "zod";

export const EvaluatorCriterion = z.object({
  id: z.string(),
  score: z.number().int().min(1).max(4),
  /** `at` é um mm:ss que aparece na linha do tempo; evidência com tempo inventado é descartada. */
  evidence: z.array(z.object({ at: z.string(), text: z.string() })).max(3),
});

export const EvaluatorOutput = z.object({
  criteria: z.array(EvaluatorCriterion),
  summary: z.string(),
  strengths: z.array(z.string()).max(4),
  concerns: z.array(z.string()).max(4),
  nextSteps: z.array(z.string()).max(3),
});
export type EvaluatorOutput = z.infer<typeof EvaluatorOutput>;
