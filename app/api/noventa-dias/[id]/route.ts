// "Como foi essa contratação?": o gestor responde aos 90 dias e o Totti ajusta a memória da squad.
//   POST   { deuCerto, criterioErrado?, surpresa? } → a contratação com o ajuste
//   DELETE (só desenvolvimento) desfaz a resposta e apaga o que ela criou, para ensaiar a demo de novo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ajustarComResultado } from "@/lib/noventa-dias/ajuste";
import { gravacoesPendentesNoventaDias, hidratarNoventaDias, limparResultado, obterContratacao, registrarResultado } from "@/lib/noventa-dias/store";
import { vistaDa } from "@/lib/noventa-dias/visao";
import { criterioValido } from "@/lib/squad-memory/criterios";
import { apagarMotivoIgnorado, apagarRegra, gravacoesPendentesSquadMemory, hidratarSquadMemory } from "@/lib/squad-memory/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Resposta = z.object({
  deuCerto: z.boolean(),
  criterioErrado: z.string().nullish(),
  surpresa: z.string().trim().max(500).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  await Promise.all([hidratarNoventaDias(), hidratarSquadMemory()]);
  const c = obterContratacao(id);
  if (!c) return NextResponse.json({ error: "contratação não encontrada" }, { status: 404 });
  const vista = vistaDa(c);
  if (!vista.vencida) return NextResponse.json({ error: "a experiência ainda não terminou" }, { status: 409 });
  if (c.resultado) return NextResponse.json({ error: "essa contratação já foi respondida" }, { status: 409 });

  const lido = Resposta.safeParse(await req.json().catch(() => null));
  if (!lido.success) return NextResponse.json({ error: "resposta inválida" }, { status: 400 });
  const { deuCerto, criterioErrado, surpresa } = lido.data;
  if (criterioErrado && !criterioValido(criterioErrado))
    return NextResponse.json({ error: "critério desconhecido" }, { status: 400 });

  const ajuste = await ajustarComResultado(c, { deuCerto, criterioErrado: criterioErrado ?? undefined, surpresa });
  registrarResultado(id, {
    deuCerto,
    ...(criterioErrado ? { criterioErrado } : {}),
    ...(surpresa ? { surpresa } : {}),
    respondidoEm: new Date().toISOString(),
    regras: ajuste.regras.map((r) => r.id),
    ignorados: ajuste.ignorados.map((i) => i.id),
  });
  await Promise.all([gravacoesPendentesNoventaDias(), gravacoesPendentesSquadMemory()]);
  return NextResponse.json(vistaDa(c));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (process.env.NODE_ENV === "production") return new Response("não disponível", { status: 404 });
  const { id } = await params;
  await Promise.all([hidratarNoventaDias(), hidratarSquadMemory()]);
  const c = obterContratacao(id);
  if (!c) return NextResponse.json({ error: "contratação não encontrada" }, { status: 404 });
  const antes = limparResultado(id);
  antes?.regras.forEach(apagarRegra);
  antes?.ignorados.forEach(apagarMotivoIgnorado);
  await Promise.all([gravacoesPendentesNoventaDias(), gravacoesPendentesSquadMemory()]);
  return NextResponse.json(vistaDa(c));
}
