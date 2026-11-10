/**
 * Checagens de estilo e medidas de tempo da fala do Totti, usadas pelo simulador (`simular.ts`) e pelos casos fixos
 * de conversa (`validar-conversa.ts`). Funções puras.
 */
import { perguntaObvia } from "@/lib/pre-entrevista/perguntas";
import type { Turno } from "@/lib/pre-entrevista/rascunho";

/** Identificadores internos, sem acento (`pressao` é rótulo; `pressão` é palavra natural). Vale no texto original. */
const IDENTIFICADOR_INTERNO = /\b(tecnico|pressao|escala_produto|uso_ia|criterio_\w+|nara)\b/;
/** Expressões internas, comparadas sem acento. */
const EXPRESSAO_INTERNA = /dominio tecnico|escala e produto|pressao e adaptacao/;

/** Avisos de estilo das falas do Totti numa transcrição: rótulo interno, pergunta óbvia, apresentação repetida, fala longa. */
export function checarEstilo(transcricao: Turno[]): string[] {
  const avisos: string[] = [];
  for (const [i, t] of transcricao.entries()) {
    if (t.role !== "agente") continue;
    const sem = t.text.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (IDENTIFICADOR_INTERNO.test(t.text) || EXPRESSAO_INTERNA.test(sem.toLowerCase()))
      avisos.push(`fala ${i + 1} usa rótulo interno: "${t.text}"`);
    if (perguntaObvia(t.text)) avisos.push(`fala ${i + 1} faz pergunta óbvia (ótimo x fraco): "${t.text}"`);
    if (/^\s*entendi/i.test(t.text)) avisos.push(`fala ${i + 1} começa com "Entendi": "${t.text}"`);
    // A apresentação é só a abertura (índice 0): depois dela, o Totti não se apresenta de novo.
    if (i > 0 && /\bsou (a )?totti\b/i.test(sem)) avisos.push(`fala ${i + 1} se apresenta de novo: "${t.text}"`);
    const frases = t.text.split(/[.!?]+/).filter((s) => s.trim()).length;
    if (i > 0 && frases > 4) avisos.push(`fala ${i + 1} tem ${frases} frases`);
  }
  return avisos;
}

/** Percentil `p` (0 a 100) pelo método do posto mais próximo; `undefined` sem amostras. */
export function percentil(amostras: number[], p: number): number | undefined {
  if (amostras.length === 0) return undefined;
  const ordenadas = [...amostras].sort((a, b) => a - b);
  return ordenadas[Math.max(0, Math.ceil((p / 100) * ordenadas.length) - 1)];
}

/** "p50 X ms | p95 Y ms (n falas)" para o placar de tempo. */
export function descreverTempos(amostras: number[]): string {
  const ms = (v: number | undefined) => (v === undefined ? "-" : `${v} ms`);
  return `p50 ${ms(percentil(amostras, 50))} | p95 ${ms(percentil(amostras, 95))} (${amostras.length} fala(s))`;
}
