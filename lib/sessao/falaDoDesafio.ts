// Fala com que o agente apresenta o desafio. O que se ESCREVE no quadro é o enunciado; o que se FALA
// é a `fala_do_desafio` do cérebro (natural, em português falado), não a leitura do texto escrito.
export type ProblemaPublico = { titulo: string; enunciado: string; fala_do_desafio?: string };

/** A fala natural do cérebro, ou (sem ela) uma montada do título e do enunciado. */
export function montarFalaDoDesafio(problema: ProblemaPublico): string {
  const natural = problema.fala_do_desafio?.trim();
  if (natural) return natural;
  return `Hoje vamos conversar sobre ${problema.titulo}. ${problema.enunciado} Pode perguntar o que quiser antes de desenhar, e vá pensando em voz alta.`;
}
