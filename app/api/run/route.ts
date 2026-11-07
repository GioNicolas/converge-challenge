// Compila e roda C/C++ com o clang/gcc LOCAL (sem enviar código para fora).
// Só para demo local: executa código do candidato na máquina do servidor.
// Em produção fica desligado, a menos que ENABLE_NATIVE_RUN=1.
import { NextResponse } from "next/server";
import { isNativeLanguage, runNativeTests } from "@/lib/execution/native";
import { problems } from "@/lib/problems";

export const dynamic = "force-dynamic";

const RUN_TIMEOUT_MS = 5_000;
const MAX_CODE_CHARS = 20_000;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_NATIVE_RUN !== "1") {
    return NextResponse.json({ error: "Execução de C/C++ desligada neste ambiente." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    language?: string;
    code?: string;
    problemId?: string;
  } | null;
  const lang = body?.language;
  const problem = body?.problemId ? problems[body.problemId] : undefined;
  if (!body?.code || !lang || !isNativeLanguage(lang) || !problem) {
    return NextResponse.json({ error: "requisição inválida" }, { status: 400 });
  }
  if (body.code.length > MAX_CODE_CHARS) {
    return NextResponse.json({ error: "código grande demais" }, { status: 413 });
  }

  return NextResponse.json(await runNativeTests(lang, problem, body.code, { runTimeoutMs: RUN_TIMEOUT_MS }));
}
