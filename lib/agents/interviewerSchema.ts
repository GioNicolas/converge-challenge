/** Saída estruturada do Interviewer: uma fala por turno. */
import { z } from "zod";

export const ProbeKindSchema = z.enum([
  "espontaneo",
  "respondeu_bem",
  "parcial",
  "errou",
  "nao_conseguiu",
  "com_dica",
  "recusou",
]);

export const InterviewerOutput = z.object({
  /**
   * false quando a fala do candidato não pede resposta (ele está pensando em voz alta, ainda explicando,
   * ou só confirmou): o entrevistador continua ouvindo e reply fica "". Ausente vale true.
   */
  respond: z.boolean().optional(),
  /** O candidato avisou que concluiu uma etapa do trabalho e quer avançar (pela intenção, não por palavra fixa). */
  concluded: z.boolean().optional(),
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
  /** Num desafio: o candidato topou tentar agora. `summary` diz o que ele vai tentar ("melhorar a complexidade de tempo"). */
  challenge: z.object({ accepted: z.boolean(), summary: z.string() }).nullable().optional(),
  /** Como ele se saiu no critério sondado. Preencher ao fechar (ou quando a resposta já mostrar). */
  probeOutcome: z.object({ criterionId: z.string(), kind: ProbeKindSchema, note: z.string() }).nullable().optional(),
});
export type InterviewerOutput = z.infer<typeof InterviewerOutput>;
