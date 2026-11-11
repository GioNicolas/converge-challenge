import { criarAvaliacaoHandler } from "@/lib/agente/rotas/avaliacoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A geração usa um modelo grande com raciocínio e pode tentar 2 vezes, cada uma com até TIMEOUT_KIT_MS (150 s,
// lib/agente/kits/gerar.ts). Com 120 s a Vercel derrubava a função antes de o prazo do kit agir, sem resposta.
export const maxDuration = 300;

export const POST = criarAvaliacaoHandler;
