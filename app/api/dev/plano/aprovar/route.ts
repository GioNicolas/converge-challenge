import { aprovarPlanoDevHandler } from "@/lib/agente/rotas/dev-plano";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gera o kit com o modelo final (Opus, raciocínio ligado): ~70-100 s.
export const maxDuration = 300;

export const POST = aprovarPlanoDevHandler;
