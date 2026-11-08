import { finalizarHandler } from "@/lib/agente/rotas/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O scorecard com raciocínio leva de 20 s a mais de 1 min (ver TIMEOUT_SCORECARD_MS): a rota precisa de folga.
export const maxDuration = 300;

export const POST = finalizarHandler;
