import { NextRequest } from "next/server";
import { sendInterviewReschedule } from "@/lib/email";
import { handleEmailRoute } from "@/lib/email/api";

export async function POST(req: NextRequest) {
  return handleEmailRoute(req, sendInterviewReschedule, "reagendamento");
}
