import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findConfig } from "@/lib/config/store";
import { sendTriagemConvite } from "@/lib/email";
import { criarConvite, salvarConvite } from "@/lib/convites/store";
import { ehCandidatoTeste } from "@/lib/convites/teste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  vagaId: z.string().trim().min(1).max(120),
  cargo: z.string().trim().min(1).max(160),
  configId: z.string().trim().min(1).max(80),
  formato: z.enum(["live_coding", "system_design"]),
  duracaoMin: z.number().int().positive().max(480),
  candidatos: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(254),
      }),
    )
    .min(1)
    .max(200),
});

type Status = "enviado" | "simulado" | "erro";

/** Cria um convite por candidato. Só candidatos de teste recebem email; os demais são demonstração. */
export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ erro: "corpo inválido", detalhes: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  // Config da vaga manda no formato, na duração e no cargo; o corpo é só fallback.
  const config = await findConfig(body.configId);
  const mode = config?.mode ?? body.formato;
  const durationMin = config?.durationMin ?? body.duracaoMin;
  const roleTitle = config?.roleTitle ?? body.cargo;
  const languages = config?.languages ?? ["python", "cpp"];

  // Link público: APP_URL quando definido (emails saem com a URL de produção), senão a origem da requisição.
  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

  const resultados: { email: string; status: Status; motivo?: string; link?: string }[] = [];
  for (const candidato of body.candidatos) {
    const email = candidato.email.toLowerCase();
    const teste = ehCandidatoTeste(email);
    const convite = criarConvite({
      vagaId: body.vagaId,
      configId: body.configId,
      cargo: roleTitle,
      mode,
      durationMin,
      languages,
      candidato: { nome: candidato.nome, email },
    });
    const link = `${base}/agendar/${convite.token}`;

    // Guarda de segurança: nunca chamar o provedor de email para endereços de demonstração.
    if (!teste) {
      await salvarConvite({ ...convite, status: "simulado" });
      resultados.push({ email, status: "simulado", motivo: "candidato de demonstração (sem envio)" });
      continue;
    }

    try {
      await salvarConvite(convite);
      const envio = await sendTriagemConvite({
        candidateName: candidato.nome,
        to: email,
        roleTitle,
        mode,
        durationMin,
        languages,
        scheduleUrl: link,
      });
      if (envio.status === "simulated") {
        await salvarConvite({ ...convite, status: "simulado" });
        resultados.push({ email, status: "simulado", motivo: envio.reason, link });
      } else {
        resultados.push({ email, status: "enviado", link });
      }
    } catch (err) {
      // Convite fica salvo como "enviado" (não há estado de erro no tipo); o resultado informa a falha.
      const motivo = err instanceof Error ? err.message.slice(0, 160) : "falha desconhecida";
      resultados.push({ email, status: "erro", motivo, link });
    }
  }

  const contagem = (s: Status) => resultados.filter((r) => r.status === s).length;
  console.log(
    `[convites] vaga=${body.vagaId} total=${resultados.length} enviados=${contagem("enviado")} simulados=${contagem("simulado")} erros=${contagem("erro")}`,
  );
  return NextResponse.json({ resultados });
}
