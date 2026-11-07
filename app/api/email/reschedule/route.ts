import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { sendInterviewReschedule } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await sendInterviewReschedule(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "falha ao enviar reagendamento" }, { status: 500 });
  }
}
