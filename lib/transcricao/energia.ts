/** Energia RMS de um bloco PCM 16 bits little-endian em base64 (o formato que a captura entrega). */
export function energiaPcm16(base64: string): { energia: number; duracaoMs: number } {
  const binario = atob(base64);
  const amostras = Math.floor(binario.length / 2);
  if (!amostras) return { energia: 0, duracaoMs: 0 };
  let soma = 0;
  for (let i = 0; i < amostras; i++) {
    const bruto = binario.charCodeAt(2 * i) | (binario.charCodeAt(2 * i + 1) << 8);
    const valor = (bruto >= 32768 ? bruto - 65536 : bruto) / 32768;
    soma += valor * valor;
  }
  return { energia: Math.sqrt(soma / amostras), duracaoMs: (amostras / 16000) * 1000 };
}
