/**
 * Ponte entre as decisões do Tech Lead no Slack e a Memória Viva da Squad (`lib/squad-memory/`):
 * cada Aprovar, Reprovar e Pedir ajuste ensina o Totti, e ele responde na thread do card com o que aprendeu.
 */
import { aprenderComAjuste, aprenderComDecisao, type Aprendizado } from "@/lib/squad-memory/aprender";
import { empresaAtual } from "@/lib/squad-memory/store";
import { aprendizadoBlocks } from "./blocks";
import { slackApi } from "./client";
import type { DecisionRecord, StoredPlan } from "./types";

/** Onde o Tech Lead vê o que o Totti aprendeu. */
export function urlDoAprendizado(): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base}/vagas/aprendizado`;
}

/** No hackathon, a empresa é o canal do Slack (o mesmo de `empresaAtual`, quando o card veio de lá). */
function empresaDo(channel?: string): string {
  return channel || empresaAtual();
}

async function responderNaThread(channel: string | undefined, ts: string | undefined, a: Aprendizado): Promise<void> {
  if (!channel || !ts || (a.regras.length === 0 && a.ignorados.length === 0)) return;
  const texto = a.regras.length ? `Aprendi: ${a.regras.map((r) => r.texto).join(" · ")}` : "Ignorei um motivo não técnico";
  await slackApi("chat.postMessage", {
    channel,
    thread_ts: ts,
    text: texto,
    blocks: aprendizadoBlocks(a.regras, a.ignorados, urlDoAprendizado()),
  });
}

/** Depois de Aprovar ou Reprovar: registra a decisão, aprende com o motivo e responde na thread. */
export async function aprenderDaDecisao(r: DecisionRecord): Promise<Aprendizado | undefined> {
  if (r.status === "aguardando") return undefined;
  const aprendizado = await aprenderComDecisao({
    empresaId: empresaDo(r.channel),
    vagaId: r.vagaId ?? r.report.configId,
    vagaTitulo: r.roleTitle,
    candidato: r.candidateName,
    decisao: r.status,
    motivo: r.reason,
    report: r.report,
  });
  await responderNaThread(r.channel, r.ts, aprendizado);
  return aprendizado;
}

/** Depois de um pedido de ajuste no plano: aprende com o comentário e responde na thread do plano. */
export async function aprenderDoAjuste(sp: StoredPlan, comentario: string): Promise<Aprendizado> {
  const aprendizado = await aprenderComAjuste({ empresaId: empresaDo(sp.channel), vagaId: sp.planId, comentario });
  await responderNaThread(sp.channel, sp.ts, aprendizado);
  return aprendizado;
}
