// Compila e roda C/C++ com o clang/gcc LOCAL (sem enviar código para fora), isolado em lib/sandbox.ts.
// Só para demo local: em produção fica desligado, a menos que ENABLE_NATIVE_RUN=1.
// Responde em NDJSON: {progress:[feitos,passaram]} a cada caso e, no fim, {result}.
import { NextResponse } from "next/server";
import { isNativeLanguage, runNativeTests } from "@/lib/execution/native";
import { problems } from "@/lib/problems";

export const dynamic = "force-dynamic";

const RUN_TIMEOUT_MS = 1_000; // padrão LeetCode: ~1 s por execução (C/C++)
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

  const code = body.code;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const result = await runNativeTests(lang, problem, code, {
          runTimeoutMs: RUN_TIMEOUT_MS,
          onProgress: (feitos, passaram) => send({ progress: [feitos, passaram] }),
        });
        send({ result });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
