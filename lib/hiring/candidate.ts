/**
 * Candidato (dados fictícios para a demo). Nenhuma pessoa real.
 */
import { z } from "zod";

export const Candidate = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  jobPostingId: z.string(),
  yearsExperience: z.number().int().min(0),
  currentRole: z.string(),
  skills: z.array(z.string()),
  /** Resumo curto do currículo, o que o agente leria. */
  resumeSummary: z.string(),
  stage: z.enum(["triagem", "entrevista_agendada", "entrevistado"]),
});
export type Candidate = z.infer<typeof Candidate>;
