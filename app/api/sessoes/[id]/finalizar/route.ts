import { finalizarHandler } from "@/lib/agente/rotas/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = finalizarHandler;
