import { eventosHandler } from "@/lib/agente/rotas/handlers";

export const runtime = "nodejs";
// No fim da entrevista, o scorecard é gerado depois da resposta (after) e leva de 20 s a mais de 1 min.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const POST = eventosHandler;
