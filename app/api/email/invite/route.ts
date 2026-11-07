import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { sendInterviewInvite } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await sendInterviewInvite(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "falha ao enviar convite" }, { status: 500 });
  }
}
