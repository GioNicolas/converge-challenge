/**
 * Falas de reserva do Totti quando a conversa falha (o modelo estourou o prazo, a rede caiu, a fala não chegou).
 * São falha do sistema, nunca do candidato: o relatório não pode ler "pode repetir?" como fala pouco clara dele.
 */
export const FALAS_DE_REPETICAO = [
  "Desculpa, me perdi aqui. Pode repetir?",
  "Opa, não peguei essa. Fala de novo?",
  "Perdi o fio aqui, pode repetir pra mim?",
];

/** A fala do entrevistador é uma das falas de reserva (falha técnica). */
export function ehFalaDeReserva(texto: string): boolean {
  const t = texto.trim();
  return FALAS_DE_REPETICAO.includes(t);
}
