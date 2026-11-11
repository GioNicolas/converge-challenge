import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acharConvite, linkDaEntrevista, novoEntrevistaId, salvarConvite } from "@/lib/convites/store";
import { horarioAceito } from "@/lib/convites/horarios";
import { urlPublica } from "@/lib/convites/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ horario: z.string().max(40) });

/**
 * Marca o horário do candidato. Não manda um segundo e-mail: a página do convite vira "Entrevista marcada",
 * com o botão do Google Agenda (o evento leva o link) e o botão de entrar, que só abre no horário.
 */
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

  let base: string;
  try {
    base = urlPublica(req);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "URL pública inválida";
    return NextResponse.json({ erro: mensagem }, { status: 503 });
  }
  // O link carrega o id da entrevista: é por ele que o painel sabe quem fez cada entrevista.
  const agendado = { ...convite, status: "agendado" as const, agendadoPara: horario, entrevistaId: novoEntrevistaId() };
  const joinUrl = linkDaEntrevista(base, agendado);

  await salvarConvite(agendado);

  console.log(`[convites] agendado vaga=${convite.vagaId}`);
  return NextResponse.json({ ok: true, agendadoPara: horario, joinUrl });
}
