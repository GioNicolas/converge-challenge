// Fala com que o agente apresenta o desafio. O que se ESCREVE no quadro é o enunciado; o que se FALA
// é a `fala_do_desafio` do cérebro (natural, em português falado), não a leitura do texto escrito.
export type ProblemaPublico = { titulo: string; enunciado: string; fala_do_desafio?: string };

/**
 * Fecho fixo da apresentação do desafio: o candidato sabe que tem tempo para ler antes de o Totti puxar conversa
 * (a primeira pergunta espera SILENCIO_INICIAL_S, em lib/contracts.ts).
 */
export const CONVITE_PARA_LER = "O enunciado está no quadro: dá uma lida com calma.";

/** A fala natural do cérebro, ou (sem ela) uma montada do título e do enunciado. Sempre com o convite para ler. */
export function montarFalaDoDesafio(problema: ProblemaPublico): string {
  const natural = problema.fala_do_desafio?.trim();
  const fala = natural || `Hoje vamos conversar sobre ${problema.titulo}. ${problema.enunciado} Pode perguntar o que quiser antes de desenhar, e vá pensando em voz alta.`;
  return /com calma/i.test(fala) ? fala : `${fala} ${CONVITE_PARA_LER}`;
}
