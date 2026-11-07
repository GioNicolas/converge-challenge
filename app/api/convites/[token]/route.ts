import { NextResponse } from "next/server";
import { acharConvite } from "@/lib/convites/store";
import { horariosDisponiveis } from "@/lib/convites/horarios";
import { firstName } from "@/lib/email/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dados públicos do convite pra página de agendamento. Sem email nem configId. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const convite = await acharConvite(token);
  if (!convite) return NextResponse.json({ erro: "convite não encontrado" }, { status: 404 });
  return NextResponse.json({
    cargo: convite.cargo,
    mode: convite.mode,
    durationMin: convite.durationMin,
    languages: convite.languages,
    primeiroNome: firstName(convite.candidato.nome),
    status: convite.status,
    agendadoPara: convite.agendadoPara,
    horarios: horariosDisponiveis(),
  });
}
