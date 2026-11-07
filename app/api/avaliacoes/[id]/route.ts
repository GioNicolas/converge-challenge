import { obterAvaliacaoHandler, substituirAvaliacaoHandler } from "@/lib/agente/rotas/avaliacoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = obterAvaliacaoHandler;
export const PUT = substituirAvaliacaoHandler;
