/**
 * Testador: quem está usando o site deixa o próprio e-mail ao publicar uma vaga e entra na fila como
 * candidato. Para esse endereço o convite (e, no fim, a decisão) sai de verdade, sem precisar estar na
 * lista fixa do time.
 *
 * Como o endereço vem do navegador, o envio é limitado: por IP e por e-mail, numa janela de 24 h. É em
 * memória (por instância, zera a cada cold start): segura abuso casual sem depender de banco.
 */
const JANELA_MS = 24 * 60 * 60 * 1000;
/** Convites reais por IP em 24 h (cada vaga publicada gasta um). */
export const MAX_POR_IP = 6;
/** Convites reais para o mesmo e-mail em 24 h. */
export const MAX_POR_EMAIL = 4;

type Contagem = { n: number; zeraEm: number };
const globalForTestador = globalThis as typeof globalThis & {
  __convergeTestador?: { ip: Map<string, Contagem>; email: Map<string, Contagem> };
};
const contagens = (globalForTestador.__convergeTestador ??= { ip: new Map(), email: new Map() });

function cabe(mapa: Map<string, Contagem>, chave: string, max: number, agora: number): boolean {
  const c = mapa.get(chave);
  return !c || c.zeraEm <= agora || c.n < max;
}

function contar(mapa: Map<string, Contagem>, chave: string, agora: number) {
  if (mapa.size > 5000) for (const [k, v] of mapa) if (v.zeraEm <= agora) mapa.delete(k);
  const c = mapa.get(chave);
  if (!c || c.zeraEm <= agora) mapa.set(chave, { n: 1, zeraEm: agora + JANELA_MS });
  else c.n += 1;
}

/** IP do cliente: prefere x-real-ip (posto pelo proxy) ao primeiro item de x-forwarded-for. */
export function ipDe(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
}

/**
 * Reserva um envio real para o testador. `true` = pode enviar (e já contou); `false` = passou do limite,
 * o convite segue simulado.
 */
export function reservarEnvioTestador(ip: string, email: string, agora = Date.now()): boolean {
  const alvo = email.trim().toLowerCase();
  if (!cabe(contagens.ip, ip, MAX_POR_IP, agora) || !cabe(contagens.email, alvo, MAX_POR_EMAIL, agora)) return false;
  contar(contagens.ip, ip, agora);
  contar(contagens.email, alvo, agora);
  return true;
}

/** Só para testes. */
export function zerarLimitesTestador() {
  contagens.ip.clear();
  contagens.email.clear();
}
