import { getSessao } from "@/lib/pre-entrevista/sessoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download da sessão inteira (transcrição, rascunhos, logs com prompts e respostas) em JSON. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = getSessao(id);
  if (!sessao) return Response.json({ erro: "sessão não encontrada" }, { status: 404 });

  const corpo = JSON.stringify({ exportadoEm: new Date().toISOString(), sessao }, null, 2);
  return new Response(corpo, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pre-entrevista-${id}.json"`,
    },
  });
}
