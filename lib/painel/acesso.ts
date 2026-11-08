// Senha única do painel da recrutadora (opcional). Funções puras: valem no middleware (Edge) e nos testes.
//
// Liga quando PAINEL_SENHA está definida; sem ela nada muda. O navegador pede usuário e senha (HTTP Basic; o
// usuário é qualquer um, só a senha vale) e, acertando, guarda um cookie para as chamadas seguintes da tela, que
// não repetem o cabeçalho. As páginas e rotas do candidato nunca passam por aqui.

export const NOME_DO_COOKIE = "painel-acesso";
/** O cookie vale meio dia: uma jornada de trabalho. */
export const VALIDADE_DO_COOKIE_S = 12 * 60 * 60;

/** Cabeçalho que o middleware põe (e só ele) quando o acesso foi validado; as páginas leem. */
export const CABECALHO_AUTENTICADO = "x-painel-autenticado";

/** Comparação que não vaza, pelo tempo, em que posição as senhas diferem. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ta = new TextEncoder().encode(a);
  const tb = new TextEncoder().encode(b);
  let diferenca = ta.length ^ tb.length;
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) diferenca |= (ta[i] ?? 0) ^ (tb[i] ?? 0);
  return diferenca === 0;
}

/** A senha de um cabeçalho `Authorization: Basic ...`; o usuário é ignorado. undefined se não for Basic ou vier torto. */
export function senhaDoBasic(cabecalho: string | null): string | undefined {
  if (!cabecalho) return undefined;
  const [esquema, valor] = cabecalho.split(" ");
  if (esquema?.toLowerCase() !== "basic" || !valor) return undefined;
  try {
    const bytes = Uint8Array.from(atob(valor), (c) => c.charCodeAt(0));
    const texto = new TextDecoder().decode(bytes);
    const i = texto.indexOf(":");
    return i < 0 ? undefined : texto.slice(i + 1);
  } catch {
    return undefined;
  }
}

/** O valor do cookie: um resumo da senha (nunca a senha), para a próxima chamada provar que já passou. */
export async function valorDoCookie(senha: string): Promise<string> {
  const bytes = new TextEncoder().encode(`painel-acesso:v1:${senha}`);
  const resumo = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...resumo].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type EntradaDoAcesso = { authorization: string | null; cookie: string | undefined };

/**
 * A requisição pode ver o painel? `senha` é PAINEL_SENHA (vazia/ausente = o painel está aberto).
 * Devolve também se é preciso (re)gravar o cookie: quando entrou pelo Basic.
 */
export async function validarAcesso(
  senha: string | undefined,
  entrada: EntradaDoAcesso,
): Promise<{ liberado: boolean; gravarCookie: boolean }> {
  if (!senha) return { liberado: true, gravarCookie: false };
  const dada = senhaDoBasic(entrada.authorization);
  if (dada !== undefined && iguaisEmTempoConstante(dada, senha)) return { liberado: true, gravarCookie: true };
  if (entrada.cookie && iguaisEmTempoConstante(entrada.cookie, await valorDoCookie(senha))) {
    return { liberado: true, gravarCookie: false };
  }
  return { liberado: false, gravarCookie: false };
}
