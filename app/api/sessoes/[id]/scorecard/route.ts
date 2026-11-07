import { scorecardGetHandler } from "@/lib/agente/rotas/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = scorecardGetHandler;
