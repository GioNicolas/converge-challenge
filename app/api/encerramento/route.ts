/** POST /api/encerramento: inicia ou retoma o fechamento; com perguntas devolve o balão real da conversa. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { candidatasDoFechamento } from "@/lib/agents/fechamento";
import { criarBlipEncerramento, startClosing } from "@/lib/agents/policy";
import { iniciarFechamento, proximoPasso } from "@/lib/totti/fechamento";
import type { EventsResponse } from "@/lib/contracts";
import { sessionNow } from "@/lib/session/store";
import { guardarSessao, sessaoViva } from "@/lib/session/persistencia";

export const dynamic = "force-dynamic";

const Body = z.object({ sessionId: z.string(), gatilho: z.enum(["concluiu", "tempo", "pediu_encerrar"]).default("concluiu") });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const session = await sessaoViva(parsed.data.sessionId);
  if (!session) return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });

  const now = sessionNow(session);
  const tempoRestanteMs = Math.max(0, session.config.durationMin * 60_000 - now);
  if (!session.fechamento) {
    const candidatas = candidatasDoFechamento(session, now);
    const perguntasJaFeitas = session.events.flatMap((e) => e.type === "speech" && e.role === "agent" ? [e.text] : []);
    session.fechamento = iniciarFechamento({ sala: "codigo", gatilho: parsed.data.gatilho, candidatas, tempoRestanteMs, perguntasJaFeitas });
    session.fechamentoIniciadoEm = now;
    session.fechamentoCodigoInicial = session.codeHistory.at(-1)?.code ?? "";
    if (session.fechamento.etapa !== "despedida") {
      const blip = session.fechamento.fila.length ? startClosing(session, now) ?? criarBlipEncerramento(session, now) : criarBlipEncerramento(session, now);
      session.fechamentoBlipId = blip?.id;
    }
  }
  // Pedido para encerrar (ou o tempo acabou) no meio do fechamento: direto para a despedida.
  if (parsed.data.gatilho === "pediu_encerrar" && session.fechamento.etapa !== "encerrada") session.fechamento = { ...session.fechamento, etapa: "despedida" };
  let response: EventsResponse;
  if (session.fechamento.etapa === "despedida") {
    const passo = proximoPasso(session.fechamento);
    session.fechamento = passo.estado;
    response = { despedida: passo.fala };
  } else if (session.fechamento.etapa === "encerrada") {
    response = { despedida: session.fechamento.ditas.at(-1) ?? "Obrigado pelo seu tempo e pela conversa." };
  } else {
    const blip = session.fechamentoBlipId && session.blips.find((item) => item.id === session.fechamentoBlipId);
    if (!blip) {
      session.fechamento.etapa = "despedida";
      const passo = proximoPasso(session.fechamento);
      session.fechamento = passo.estado;
      response = { despedida: passo.fala };
    } else response = { blip };
  }
  await guardarSessao(session);
  return NextResponse.json(response);
}
