import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { EmailDeliveryError } from "@/lib/email/send";
import type { EmailSendResult } from "@/lib/email/types";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Rate limit simples em memória, por IP (por instância; não é distribuído). */
function rateLimited(req: NextRequest): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (hits.size > 1000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

/** Retorna uma resposta de erro se a requisição não for autorizada; senão null. */
function guard(req: NextRequest): NextResponse | null {
  const secret = process.env.EMAIL_API_SECRET;
  const provided = req.headers.get("x-api-key");
  // Fail closed: sem segredo configurado, nada passa.
  if (!secret || !provided || !constantTimeEqual(provided, secret)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (rateLimited(req)) {
    return NextResponse.json({ error: "muitas requisições" }, { status: 429 });
  }
  return null;
}

/** Handler compartilhado das rotas /api/email/*: guard, JSON, validação e erros. */
export async function handleEmailRoute(
  req: NextRequest,
  send: (input: unknown) => Promise<EmailSendResult>,
  label: string,
): Promise<NextResponse> {
  const denied = guard(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    return NextResponse.json(await send(body));
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    if (err instanceof EmailDeliveryError) {
      return NextResponse.json({ error: `falha ao enviar ${label}` }, { status: 502 });
    }
    console.error(`[email:${label}] erro inesperado`, err);
    return NextResponse.json({ error: `falha ao enviar ${label}` }, { status: 500 });
  }
}
