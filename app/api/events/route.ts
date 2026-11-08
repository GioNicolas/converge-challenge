import { after, NextResponse } from "next/server";
import { runAnalyst } from "@/lib/agents/analyst";
import { startEvaluation, waitForEvaluation } from "@/lib/agents/evaluator";
import { decideBlip, enqueueKickoff } from "@/lib/agents/policy";
import { resolveConfig } from "@/lib/config/store";
import { prewarmPyodide } from "@/lib/execution/pyodide-node";
import { EventsResponse, SessionEvent, type InterviewConfig } from "@/lib/contracts";
import { problems } from "@/lib/problems";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";
import { hasProblem } from "@/problems";

export const dynamic = "force-dynamic";
// A avaliação (testes escondidos + LLM) roda depois da resposta e leva de 15 s a 1 min: a função precisa continuar viva.
export const maxDuration = 120;

/**
 * A questão que a IDE está mostrando vence a da config (o `?problema=` dos testes troca a questão na tela):
 * senão o agente perguntaria sobre uma questão e o candidato veria outra.
 */
function withProblem(config: InterviewConfig, problemId: string): InterviewConfig {
  if (problemId === config.problemId || !hasProblem(problemId)) return config;
  return { ...config, problemId, difficulty: problems[problemId]?.difficulty };
}

// A conversa conta como gatilho quando termina (blip_closed), não a cada fala.
const ANALYZED_TRIGGERS = new Set<SessionEvent["type"]>(["pause", "run", "paste", "blip_closed"]);

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = SessionEvent.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const event = parsed.data;

  // A sessão nasce com a config da vaga (saída da pré-entrevista), achada pelo configId do session_started.
  const config = event.type === "session_started" ? withProblem(await resolveConfig(event.configId), event.problemId) : undefined;
  const session = getOrCreateSession(event.sessionId, config);
  appendEvent(session, event);
  if (event.type === "session_started") {
    enqueueKickoff(session, event.t);
    // Carrega o Python agora: quando a sessão acabar e os testes escondidos rodarem, ele já está pronto.
    if (event.language === "python") prewarmPyodide();
  }
  // A avaliação leva de 15 s a 1 min: começa já, em segundo plano, e o GET /api/report busca o resultado.
  if (event.type === "session_ended") {
    startEvaluation(session);
    // Na Vercel, o que roda depois da resposta é interrompido a menos que a plataforma saiba que ainda há trabalho.
    after(() => waitForEvaluation(session).then(() => undefined));
  }
  if (ANALYZED_TRIGGERS.has(event.type)) {
    try {
      await runAnalyst(session, event);
    } catch (err) {
      // Falha do analista não derruba a entrevista: o erro já fica em analyst.lastError.
      console.error("[events] analista falhou:", err);
    }
  }

  const { blip, dismissBlipId } = decideBlip(session, event.t);
  const response: EventsResponse = { blip, dismissBlipId };
  return NextResponse.json(response);
}
