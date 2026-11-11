/** Falha do pedido de token; `permanente` = repetir não adianta (sem chave, sessão inexistente ou encerrada). */
export class ErroTokenTranscricao extends Error {
  constructor(mensagem: string, readonly permanente: boolean) {
    super(mensagem);
  }
}

/** Token de uso único e o vocabulário da sessão (keyterms), montado no servidor a partir do kit ou do problema. */
export type CredencialTranscricao = { token: string; termos: string[] };

/** Pede ao servidor um token temporário do Scribe (a chave do ElevenLabs nunca chega ao navegador). */
export async function tokenTranscricao(sessaoId: string, contexto: "coding" | "quadro" = "coding"): Promise<CredencialTranscricao> {
  const parametros = new URLSearchParams({ sessao_id: sessaoId });
  if (contexto !== "coding") parametros.set("contexto", contexto);
  const rota = `/api/stt-token?${parametros}`;
  const resposta = await fetch(rota, { cache: "no-store" });
  if (!resposta.ok) {
    const permanente = resposta.status === 503 || (resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429);
    throw new ErroTokenTranscricao(`Erro HTTP ${resposta.status} em ${rota}`, permanente);
  }
  const dados: unknown = await resposta.json();
  const { token, termos } = (dados && typeof dados === "object" ? dados : {}) as { token?: unknown; termos?: unknown };
  if (typeof token !== "string" || !token) throw new Error(`Resposta inesperada de ${rota}.`);
  return { token, termos: Array.isArray(termos) ? termos.filter((t): t is string => typeof t === "string") : [] };
}
