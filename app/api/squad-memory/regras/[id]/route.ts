// O Tech Lead edita, liga/desliga ou apaga uma regra que o Totti aprendeu. O aprendizado nunca fica escondido.
import { NextResponse } from "next/server";
import { z } from "zod";
import { criterioValido } from "@/lib/squad-memory/criterios";
import { motivoNaoTecnico } from "@/lib/squad-memory/guarda";
import { alternarRegra, apagarRegra, editarRegra, obterRegra } from "@/lib/squad-memory/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Mudanca = z.object({
  ativa: z.boolean().optional(),
  texto: z.string().trim().min(3).max(160).optional(),
  efeito: z.enum(["valoriza", "penaliza"]).optional(),
  criterio: z.string().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!obterRegra(id)) return NextResponse.json({ error: "regra não encontrada" }, { status: 404 });
  const parsed = Mudanca.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "mudança inválida" }, { status: 400 });
  const { ativa, ...edicao } = parsed.data;
  if (edicao.criterio && !criterioValido(edicao.criterio)) {
    return NextResponse.json({ error: "critério desconhecido" }, { status: 400 });
  }
  // O guarda-corpo vale também para o que o humano escreve: regra é sempre técnica.
  const porque = edicao.texto ? motivoNaoTecnico(edicao.texto) : undefined;
  if (porque) return NextResponse.json({ error: `O Totti só guarda critério técnico: ${porque}.` }, { status: 422 });
  if (Object.keys(edicao).length) editarRegra(id, edicao);
  const regra = ativa === undefined ? obterRegra(id) : alternarRegra(id, ativa);
  return NextResponse.json(regra);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!apagarRegra(id)) return NextResponse.json({ error: "regra não encontrada" }, { status: 404 });
  return new Response(null, { status: 204 });
}
