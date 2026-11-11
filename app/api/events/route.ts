import { after, NextResponse } from "next/server";
import { runAnalyst } from "@/lib/agents/analyst";
import { disparaAnalise } from "@/lib/agents/gatilhos";
import { startEvaluation, waitForEvaluation } from "@/lib/agents/evaluator";
import { decideBlip, enqueueCola, enqueueKickoff } from "@/lib/agents/policy";
import { resolveConfig } from "@/lib/config/store";
import { prewarmPyodide } from "@/lib/execution/pyodide-node";
import { EventsResponse, SessionEvent, type InterviewConfig } from "@/lib/contracts";
import { problems } from "@/lib/problems";
import { guardarSessao, sessaoViva } from "@/lib/session/persistencia";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";
import { comRegrasDaSquad } from "@/lib/squad-memory/config";
import { hidratarSquadMemory } from "@/lib/squad-memory/store";
import { hasProblem } from "@/problems";

export const dynamic = "force-dynamic";
// A avaliação (testes escondidos + LLM) roda depois da resposta e leva de 15 s a 1 min: a função precisa continuar viva.
// O relatório roda depois da resposta (after) e leva alguns minutos na Featherless: o teto de 300 s da Vercel.
export const maxDuration = 300;

/**
 * A questão que a IDE está mostrando vence a da config (o `?problema=` dos testes troca a questão na tela):
 * senão o agente perguntaria sobre uma questão e o candidato veria outra.
 */
function withProblem(config: InterviewConfig, problemId: string): InterviewConfig {
  if (problemId === config.problemId || !hasProblem(problemId)) return config;
  return { ...config, problemId, difficulty: problems[problemId]?.difficulty };
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = SessionEvent.safeParse(body);
  if (parsed.success && parsed.data.type === "llm_uso") {
    return NextResponse.json({ error: "Evento reservado ao servidor" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const event = parsed.data;

  // A sessão nasce com a config da vaga (saída da pré-entrevista), achada pelo configId do session_started,
  // e com as regras ativas aprendidas nesta vaga (não as de outras vagas da empresa).
  if (event.type === "session_started") await hidratarSquadMemory();
  const config = event.type === "session_started" ? comRegrasDaSquad(withProblem(await resolveConfig(event.configId), event.problemId)) : undefined;
  // Outra instância pode ter a sessão (Vercel): restaura antes de criar uma nova por cima.
  if (event.type !== "session_started") await sessaoViva(event.sessionId);
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
    await guardarSessao(session);
    // Na Vercel, o que roda depois da resposta é interrompido a menos que a plataforma saiba que ainda há trabalho.
    after(() => waitForEvaluation(session).then(() => guardarSessao(session)));
  }
  // Colou um bloco: a pergunta sobre ele entra na fila na hora, sem LLM. A análise do código novo roda depois da
  // resposta: esperar por ela (6 a 15 s) atrasava a pergunta que já está pronta.
  const colou = event.type === "paste" && enqueueCola(session, event);
  if (colou) {
    after(() => runAnalyst(session, event).then(() => guardarSessao(session)).catch((err) => console.error("[events] analista falhou:", err)));
  } else if (disparaAnalise(event, session)) {
    try {
      await runAnalyst(session, event);
    } catch (err) {
      // Falha do analista não derruba a entrevista: o erro já fica em analyst.lastError.
      console.error("[events] analista falhou:", err);
    }
  }

  const { blip, dismissBlipId } = decideBlip(session, event.t);
  // Snapshots e pausas são frequentes: gravam depois da resposta. Início e fim já gravaram antes.
  after(() => guardarSessao(session));
  const response: EventsResponse = { blip, dismissBlipId };
  return NextResponse.json(response);
}
