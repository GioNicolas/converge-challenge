import { NextResponse } from "next/server";
import { z } from "zod";
import { contexto as contextoAgente } from "@/lib/agente/rotas/contexto";
import { criarLimitador, ipDe } from "@/lib/agente/rotas/http";
import { getSessao } from "@/lib/pre-entrevista/sessoes";
import { registrarEvento } from "@/lib/pre-entrevista/log";
import { guardarSessao, sessaoViva } from "@/lib/session/persistencia";
import { appendEvent, sessionNow } from "@/lib/session/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Contexto = z.enum(["quadro", "coding", "pre"]);
const Base = z.object({ sessao_id: z.string().trim().min(1).max(80), contexto: Contexto });
const Corpo = z.discriminatedUnion("tipo", [
  Base.extend({ tipo: z.literal("transcricao_uso"), dados: z.object({ escuta_id: z.string().min(1).max(80), audioEnviadoS: z.number().finite().nonnegative().max(86_400), sessaoS: z.number().finite().nonnegative().max(86_400), conexoes: z.number().int().nonnegative().max(10_000), reconexoes: z.number().int().nonnegative().max(10_000), final: z.boolean() }) }),
  Base.extend({ tipo: z.literal("voz_descartada"), dados: z.object({ caracteres: z.number().int().nonnegative().max(2000), fala_id: z.string().max(100).optional(), motivo: z.enum(["substituida", "cancelada"]) }) }),
]);
const porIp = criarLimitador(65, 60_000);

export async function POST(req: Request) {
  // Content-Length declarado acima do teto nem é lido; sem ele, o tamanho é conferido depois da leitura.
  if (Number(req.headers.get("content-length")) > 12_000) return NextResponse.json({ erro: "corpo muito grande" }, { status: 400 });
  let texto: string;
  try {
    texto = await req.text();
    if (texto.length > 12_000) return NextResponse.json({ erro: "corpo muito grande" }, { status: 400 });
  } catch { return NextResponse.json({ erro: "JSON inválido" }, { status: 400 }); }
  let bruto: unknown;
  try { bruto = JSON.parse(texto); } catch { return NextResponse.json({ erro: "JSON inválido" }, { status: 400 }); }
  const validado = Corpo.safeParse(bruto);
  if (!validado.success) return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  if (porIp.estourou(ipDe(req))) return NextResponse.json({ erro: "limite de uso atingido" }, { status: 429 });
  const { sessao_id, contexto, tipo, dados } = validado.data;
  const horario = new Date().toISOString();
  if (contexto === "quadro") {
    const repo = contextoAgente().repositorio;
    if (!(await repo.obter(sessao_id))) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
    await repo.anexarEventos(sessao_id, [{ horario, tipo, dados: { contexto, ...dados } }]);
  } else if (contexto === "coding") {
    const sessao = await sessaoViva(sessao_id);
    if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
    const base = { sessionId: sessao_id, t: sessionNow(sessao), contexto };
    appendEvent(sessao, tipo === "transcricao_uso" ? { ...base, type: tipo, ...dados } : { ...base, type: tipo, ...dados });
    await guardarSessao(sessao);
  } else {
    const sessao = getSessao(sessao_id);
    if (!sessao) return NextResponse.json({ erro: "sessão não encontrada" }, { status: 404 });
    registrarEvento(sessao, { tipo: "aviso", resumo: tipo, dados: { tipo, contexto, ...dados } });
  }
  return NextResponse.json({ ok: true });
}
