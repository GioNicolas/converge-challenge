/** Formata milissegundos como mm:ss (valores negativos viram 00:00). */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Prefixa cada linha com o número, alinhado à direita (igual ao do servidor). */
export function numberCode(code: string): string {
  const lines = code.split("\n");
  const width = String(lines.length).length + 2;
  return lines.map((line, i) => `${String(i + 1).padStart(width)} | ${line}`).join("\n");
}
