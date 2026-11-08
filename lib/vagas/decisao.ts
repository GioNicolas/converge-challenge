// Decisão da recrutadora sobre cada entrevista (Avançar / Não avançar) e o e-mail de feedback ao candidato.
// Só servidor. Fica no kv (Supabase quando configurado), uma chave por sessão; decide-se uma vez.
import { listarConvites } from "@/lib/convites/store";
import { recebeEmail } from "@/lib/convites/teste";
import { sendInterviewFeedback } from "@/lib/email";
import { kvPadrao } from "@/lib/storage/kv";

const NS = "decisoes";

export type Decisao = "avancar" | "nao_avancar";
export type SituacaoDoEmail = "enviado" | "simulado" | "sem_candidato" | "falhou";
export interface DecisaoRegistrada {
  decisao: Decisao;
  em: number;
  email: SituacaoDoEmail;
}

export async function lerDecisoes(): Promise<Map<string, DecisaoRegistrada>> {
  const mapa = new Map<string, DecisaoRegistrada>();
  try {
    for (const l of await kvPadrao().list<DecisaoRegistrada>(NS)) mapa.set(l.key, l.value);
  } catch (err) {
    console.error("[decisao] não leu as decisões:", err instanceof Error ? err.message : "erro");
  }
  return mapa;
}

/** Registra a decisão (a primeira vale) e avisa o candidato por e-mail. Nunca lança por causa do e-mail. */
export async function decidir(sessionId: string, decisao: Decisao): Promise<{ registro: DecisaoRegistrada; jaDecidida: boolean }> {
  const kv = kvPadrao();
  const existente = await kv.get<DecisaoRegistrada>(NS, sessionId);
  if (existente) return { registro: existente, jaDecidida: true };

  const convite = (await listarConvites()).find((c) => c.sessoes?.includes(sessionId));
  let email: SituacaoDoEmail = "sem_candidato";
  if (convite) {
    const { nome, email: para } = convite.candidato;
    if (!recebeEmail(para)) {
      email = "simulado"; // mesma guarda dos convites: só quem está liberado recebe envio de verdade
    } else {
      try {
        const r = await sendInterviewFeedback({ candidateName: nome, to: para, roleTitle: convite.cargo, recommendation: decisao });
        email = r.status === "sent" ? "enviado" : "simulado";
      } catch (err) {
        console.error("[decisao] e-mail de feedback falhou:", err instanceof Error ? err.message : "erro");
        email = "falhou";
      }
    }
  }
  const registro: DecisaoRegistrada = { decisao, em: Date.now(), email };
  await kv.set(NS, sessionId, registro);
  return { registro, jaDecidida: false };
}
