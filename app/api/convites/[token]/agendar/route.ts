import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendInterviewInvite } from "@/lib/email";
import { acharConvite, linkDaEntrevista, novoEntrevistaId, salvarConvite } from "@/lib/convites/store";
import { horarioAceito } from "@/lib/convites/horarios";
import { recebeEmail } from "@/lib/convites/teste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ horario: z.string().max(40) });

/** Marca o horário do candidato e manda a confirmação com o link da entrevista (só candidatos de teste). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const convite = await acharConvite(token);
  if (!convite) return NextResponse.json({ erro: "convite não encontrado" }, { status: 404 });
  if (convite.status === "agendado") {
    return NextResponse.json({ erro: "horário já escolhido" }, { status: 409 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success || !horarioAceito(parsed.data.horario)) {
    return NextResponse.json({ erro: "horário indisponível" }, { status: 400 });
  }
  const horario = parsed.data.horario;

  const base = process.env.APP_URL || new URL(req.url).origin;
  // O link carrega o id da entrevista: é por ele que o painel sabe quem fez cada entrevista.
  const agendado = { ...convite, status: "agendado" as const, agendadoPara: horario, entrevistaId: novoEntrevistaId() };
  const joinUrl = linkDaEntrevista(base, agendado);

  // Salva antes de enviar: se o email falhar, o horário escolhido continua valendo.
  await salvarConvite(agendado);

  const { nome, email } = convite.candidato;
  let emailStatus: "enviado" | "simulado" | "erro" = "simulado";
  if (recebeEmail(email)) {
    try {
      const envio = await sendInterviewInvite({
        candidateName: nome,
        to: email,
        roleTitle: convite.cargo,
        scheduledAt: horario,
        durationMin: convite.durationMin,
        joinUrl,
      });
      emailStatus = envio.status === "sent" ? "enviado" : "simulado";
    } catch {
      emailStatus = "erro";
    }
  }

  console.log(`[convites] agendado vaga=${convite.vagaId} email=${emailStatus}`);
  return NextResponse.json({ ok: true, agendadoPara: horario, joinUrl, emailStatus });
}
