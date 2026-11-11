import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findConfig } from "@/lib/config/store";
import { sendTriagemConvite } from "@/lib/email";
import { criarConvite, salvarConvite } from "@/lib/convites/store";
import { recebeEmail } from "@/lib/convites/teste";
import { ipDe, reservarEnvioTestador } from "@/lib/convites/testador";
import { urlPublica, verificarUrlPublica } from "@/lib/convites/url";

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
        /** O próprio testador do site (deixou o e-mail ao publicar): recebe e-mail de verdade, com limite. */
        testador: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200)
    // Um testador por pedido: o campo é de uma pessoa só, e isso fecha a porta para disparo em massa.
    .refine((l) => l.filter((c) => c.testador).length <= 1, "no máximo um testador por pedido"),
});

type Status = "enviado" | "simulado" | "erro";

/**
 * Cria um convite por candidato. Recebem email de verdade quem `recebeEmail` (o Lucas) e o testador que
 * deixou o próprio e-mail (dentro do limite de lib/convites/testador.ts); os demais são simulados.
 */
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

  let base: string;
  try {
    base = urlPublica(req);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "URL pública inválida";
    console.warn(`[convites] ${mensagem}`);
    return NextResponse.json({ erro: mensagem }, { status: 503 });
  }

  const resultados: { email: string; status: Status; motivo?: string; link?: string }[] = [];
  let urlVerificada = false;
  for (const candidato of body.candidatos) {
    const email = candidato.email.toLowerCase();
    const testador = candidato.testador === true;
    const real = recebeEmail(email) || (testador && reservarEnvioTestador(ipDe(req.headers), email));
    const convite = criarConvite({
      vagaId: body.vagaId,
      configId: body.configId,
      cargo: roleTitle,
      mode,
      durationMin,
      languages,
      candidato: { nome: candidato.nome, email },
      ...(testador ? { testador: true } : {}),
    });
    const link = `${base}/agendar/${convite.token}`;

    // Guarda de segurança: nunca chamar o provedor de email para endereços de demonstração (nem para o
    // resto do time, que fica simulado para não gastar envio).
    if (!real) {
      await salvarConvite({ ...convite, status: "simulado" });
      const motivo = testador ? "limite de e-mails de teste atingido; use o link" : "sem envio de e-mail (demonstração)";
      resultados.push({ email, status: "simulado", motivo, link });
      continue;
    }

    if (!urlVerificada) {
      const verificacao = await verificarUrlPublica(base, new URL(req.url).origin);
      urlVerificada = true;
      if (!verificacao.vivo) {
        const mensagem = `O endereço público configurado não responde: ${verificacao.host}`;
        console.warn(`[convites] endereço público sem resposta host=${verificacao.host}`);
        return NextResponse.json({ erro: mensagem }, { status: 502 });
      }
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
