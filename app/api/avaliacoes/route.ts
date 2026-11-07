import { criarAvaliacaoHandler } from "@/lib/agente/rotas/avaliacoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A geração usa um modelo grande com raciocínio: pode levar até ~90 s.
export const maxDuration = 120;

export const POST = criarAvaliacaoHandler;
