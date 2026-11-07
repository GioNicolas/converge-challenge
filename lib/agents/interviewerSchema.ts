/** Saída estruturada do Interviewer: uma fala por turno. */
import { z } from "zod";

export const InterviewerOutput = z.object({
  /** A fala, como um entrevistador humano falaria: 1–2 frases curtas. */
  reply: z.string(),
  /** Linhas pra grifar junto com a fala, ou null quando não fala de um trecho. */
  highlight: z.object({ startLine: z.number().int().min(1), endLine: z.number().int().min(1) }).nullable(),
  /** true quando a conversa terminou (assunto respondido, ou o candidato quer voltar a codar). */
  end: z.boolean(),
  /** true se esta fala entregou a dica leve disponível. */
  gaveHint: z.boolean(),
  /** Observação curta pra rubrica sobre a última resposta do candidato, ou null. */
  evidence: z.object({ criterionId: z.string(), note: z.string() }).nullable(),
});
export type InterviewerOutput = z.infer<typeof InterviewerOutput>;
