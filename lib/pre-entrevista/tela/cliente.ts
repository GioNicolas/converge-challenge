// Único ponto de acesso da tela da pré-entrevista ao servidor.
// Com NEXT_PUBLIC_USAR_SERVIDOR=1 usa as rotas reais (/api/pre-entrevista/...); sem, a demonstração roteirizada.
import type { InterviewConfig } from "@/lib/contracts";
import type { Vaga } from "../classificador";
import type { Rascunho } from "../rascunho";
import type { EstadoSessao } from "../sessoes";
import { estadoInicialDemo, responderDemo } from "./demo";

const API = "/api/pre-entrevista/sessoes";

export const usarServidor = () => process.env.NEXT_PUBLIC_USAR_SERVIDOR === "1";

type CorpoErro = { erro?: string; detalhe?: string; erros?: string[] };

async function erroDe(r: Response) {
  const j = (await r.json().catch(() => ({}))) as CorpoErro;
  return [j.erro, j.detalhe, ...(j.erros ?? [])].filter(Boolean).join(" — ") || `HTTP ${r.status}`;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Na demonstração, as sessões ficam na memória da página.
const sessoesDemo = new Map<string, EstadoSessao>();

export async function criarSessao(vaga: Vaga): Promise<EstadoSessao> {
  if (!usarServidor()) {
    await esperar(2600); // o tempo da Totti "lendo" a vaga
    const estado = estadoInicialDemo(vaga);
    sessoesDemo.set(estado.id, estado);
    return estado;
  }
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vaga),
  });
  if (!r.ok) throw new Error(await erroDe(r));
  return (await r.json()) as EstadoSessao;
}

export async function enviarFala(sessaoId: string, texto: string): Promise<EstadoSessao> {
  if (!usarServidor()) {
    const anterior = sessoesDemo.get(sessaoId);
    if (!anterior) throw new Error("Sessão de demonstração não encontrada.");
    await esperar(1100 + Math.random() * 700);
    const estado = responderDemo(anterior, texto);
    sessoesDemo.set(sessaoId, estado);
    return estado;
  }
  const r = await fetch(`${API}/${sessaoId}/mensagem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto }),
  });
  if (!r.ok) throw new Error(await erroDe(r));
  return (await r.json()) as EstadoSessao;
}

/** Estado mais recente (a extração do rascunho roda em segundo plano no servidor). */
export async function buscarSessao(sessaoId: string): Promise<EstadoSessao | null> {
  if (!usarServidor()) return sessoesDemo.get(sessaoId) ?? null;
  const r = await fetch(`${API}/${sessaoId}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await erroDe(r));
  return (await r.json()) as EstadoSessao;
}

export type ResultadoFinal = { config: InterviewConfig } | { erros: string[] };

export async function finalizar(sessaoId: string, rascunho: Rascunho): Promise<ResultadoFinal> {
  if (!usarServidor()) {
    await esperar(900);
    const config = {
      id: `config-${sessaoId}`,
      mode: rascunho.mode,
      roleTitle: rascunho.roleTitle,
      jobDescription: rascunho.jobDescription,
      seniority: rascunho.seniority,
      focus: rascunho.focus,
      recruiterNotes: rascunho.recruiterNotes,
      criteria: rascunho.criteria,
      problemId: rascunho.problemId ?? "encurtador-de-url",
      languages: ["python"],
      durationMin: rascunho.durationMin ?? 45,
    } as InterviewConfig;
    return { config };
  }
  const r = await fetch(`${API}/${sessaoId}/finalizar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rascunho }),
  });
  const j = (await r.json().catch(() => ({}))) as CorpoErro & { ok?: boolean; config?: InterviewConfig };
  if (r.ok && j.ok && j.config) return { config: j.config };
  if (r.status === 422) return { erros: j.erros ?? ["configuração inválida"] };
  throw new Error([j.erro, j.detalhe].filter(Boolean).join(" — ") || `HTTP ${r.status}`);
}
