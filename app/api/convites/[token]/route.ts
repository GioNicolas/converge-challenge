import { NextResponse } from "next/server";
import { acharConvite, linkDaEntrevista } from "@/lib/convites/store";
import { horariosDeTeste, horariosDeTesteLigados, horariosDisponiveis } from "@/lib/convites/horarios";
import { firstName } from "@/lib/email/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dados públicos do convite pra página de agendamento. Sem email; o configId só vai dentro do link, depois de agendado. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const convite = await acharConvite(token);
  if (!convite) return NextResponse.json({ erro: "convite não encontrado" }, { status: 404 });
  // Mesmo "agora" nas duas listas: senão uma virada de minuto entre as chamadas desalinha os de teste.
  const agora = new Date();
  return NextResponse.json({
    cargo: convite.cargo,
    mode: convite.mode,
    durationMin: convite.durationMin,
    languages: convite.languages,
    primeiroNome: firstName(convite.candidato.nome),
    status: convite.status,
    agendadoPara: convite.agendadoPara,
    // Só depois de agendado (o mesmo link que o POST de agendar já devolve a quem tem o token):
    // quem recarrega a página continua com o botão de entrar.
    joinUrl: convite.status === "agendado" ? linkDaEntrevista(process.env.APP_URL || new URL(req.url).origin, convite) : undefined,
    horarios: horariosDisponiveis(agora),
    // Quais da lista são de teste (ligados, salvo HORARIOS_DE_TESTE=0), pra página marcar com o rótulo "teste".
    horariosTeste: horariosDeTesteLigados() ? horariosDeTeste(agora) : [],
  });
}
