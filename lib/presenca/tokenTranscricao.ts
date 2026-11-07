/** Pede ao servidor um token temporário do Scribe (a chave do ElevenLabs nunca chega ao navegador). */
export async function tokenTranscricao(sessaoId: string): Promise<string> {
  const rota = `/api/stt-token?${new URLSearchParams({ sessao_id: sessaoId })}`;
  const resposta = await fetch(rota, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status} em ${rota}`);
  const dados: unknown = await resposta.json();
  const token = dados && typeof dados === "object" ? (dados as { token?: unknown }).token : undefined;
  if (typeof token !== "string" || !token) throw new Error(`Resposta inesperada de ${rota}.`);
  return token;
}
