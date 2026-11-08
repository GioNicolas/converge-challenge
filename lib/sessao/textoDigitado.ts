// Texto digitado pelo candidato na aba "Conversa". Lógica pura, para testar sem React.

/** Limite de caracteres por mensagem digitada. */
export const LIMITE_TEXTO_DIGITADO = 2000;

/** Apara as pontas, normaliza quebras de linha e corta no limite. Devolve "" se não sobrar nada. */
export function limparTextoDigitado(bruto: string): string {
  return bruto.replace(/\r\n?/g, "\n").trim().slice(0, LIMITE_TEXTO_DIGITADO).trim();
}
