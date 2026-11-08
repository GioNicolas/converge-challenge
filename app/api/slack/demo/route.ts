import { postCandidateDecision, postPlanForReview } from "@/lib/slack/notify";
import type { Report } from "@/lib/contracts";
import { CANDIDATES } from "@/lib/hiring/mocks/candidates";
import type { InterviewPlan } from "@/lib/hiring/job-posting";

export const runtime = "nodejs";

/**
 * Só desenvolvimento: posta no Slack um plano e um candidato de exemplo, para
 * ver os botões funcionando. Roda dentro do servidor porque o estado é em memória.
 *   curl -X POST localhost:3000/api/slack/demo
 */
const PLAN: InterviewPlan = {
  jobPostingId: "demo-backend-pleno",
  stages: [
    {
      tool: "code_editor",
      minutes: 30,
      challenge: { title: "Rate limiter", brief: "Implemente um limitador de requisições por janela deslizante." },
      rationale: "A vaga pede APIs de alto volume e atenção a concorrência.",
    },
  ],
  focusPoints: [
    { topic: "Concorrência e consistência", evidenceFromPosting: "APIs de alto volume", weight: 0.6 },
    { topic: "Complexidade e estruturas de dados", evidenceFromPosting: "Otimização de consultas", weight: 0.4 },
  ],
  outOfScope: ["Perguntas comportamentais"],
  summary: "Plano de uma etapa técnica focada em concorrência e estruturas de dados (exemplo).",
};

const REPORT: Report = {
  sessionId: "demo-session",
  configId: "demo-config",
  roleTitle: "Backend Pleno",
  recommendation: "avancar",
  overallScore: 3.2,
  criteria: [],
  summary: "Resolveu com janela deslizante e explicou bem os trade-offs (exemplo).",
  strengths: ["Boa análise de complexidade", "Pensou em casos de borda sozinho"],
  concerns: ["Hesitou ao falar de concorrência"],
  nextSteps: ["Aprofundar locking distribuído"],
  signals: { testsPassed: 4, testsTotal: 5, hintsUsed: 1, pastes: 0, durationMs: 1_500_000 },
};

export async function POST() {
  if (process.env.NODE_ENV === "production") return new Response("não disponível", { status: 404 });

  // Os botões do Slack mandam email de verdade: tudo da demo vai para DEMO_EMAIL.
  const demoEmail = process.env.DEMO_EMAIL;
  if (!demoEmail) return new Response("defina DEMO_EMAIL no .env para rodar a demo", { status: 400 });

  // O agendamento convida os candidatos cuja vaga bate com o id do plano.
  // Registra um candidato de demo (com o seu email) para o convite chegar até você.
  if (!CANDIDATES.some((c) => c.id === "demo-c01")) {
    CANDIDATES.push({
      id: "demo-c01",
      name: "Rafael Moura (demo)",
      email: demoEmail,
      jobPostingId: PLAN.jobPostingId,
      yearsExperience: 4,
      currentRole: "Dev Backend",
      skills: ["Python", "PostgreSQL"],
      resumeSummary: "Candidato fictício para a demo do Slack.",
      stage: "triagem",
    });
  }

  await postPlanForReview({ jobPostingId: PLAN.jobPostingId, jobTitle: "Backend Pleno (demo)", plan: PLAN });
  await postCandidateDecision({
    sessionId: `demo-${Date.now()}`,
    candidateId: "demo-c01",
    candidateName: "Rafael Moura (demo)",
    candidateEmail: demoEmail,
    roleTitle: "Backend Pleno",
    report: REPORT,
    vagaId: PLAN.jobPostingId,
  });
  return Response.json({ ok: true });
}
