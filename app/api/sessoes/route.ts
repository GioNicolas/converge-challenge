import { criarSessaoHandler } from "@/lib/agente/rotas/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A criação pode esperar a questão da vaga ser gerada (até ESPERA_QUESTAO_MS, ver handlers.ts).
export const maxDuration = 120;

export const POST = criarSessaoHandler;
