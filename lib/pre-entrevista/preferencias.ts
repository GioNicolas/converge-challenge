/**
 * Preferências da recrutadora sobre o clima da entrevista: tom e dicas.
 *
 * Ficam num estado estruturado (e não só no texto de `recruiterNotes`), para que a frase do resumo e as
 * notas finais reflitam sempre o mesmo. Atualizam-se a cada fala pelos sinais do Jev (ver `cobertura.ts`):
 * só a última fala da recrutadora conta, e, se dois sinais de um mesmo eixo passarem do limiar, vence o maior.
 */
import { LIMIAR } from "./cobertura";

export interface Preferencias {
  tom: "amigavel" | "desafiador";
  dicas: "leves" | "nenhuma" | "livres";
  /** Duração que ela disse na última fala em que falou de tempo (ver `duracao.ts`). Tem prioridade sobre o extrator. */
  duracaoMin?: number;
}

export const PREFERENCIAS_PADRAO: Preferencias = { tom: "amigavel", dicas: "leves" };

/** Atualiza as preferências com os sinais do último turno. Função pura. */
export function atualizarPreferencias(p: Preferencias, sinais: Record<string, number>): Preferencias {
  const sinal = (id: string) => sinais[id] ?? 0;

  let tom = p.tom;
  const desafiador = sinal("quer_tom_desafiador");
  const amigavel = sinal("quer_tom_amigavel");
  if (desafiador >= LIMIAR || amigavel >= LIMIAR) tom = desafiador >= amigavel ? "desafiador" : "amigavel";

  let dicas = p.dicas;
  const semDicas = sinal("quer_sem_dicas");
  const comDicas = sinal("quer_dicas");
  if (semDicas >= LIMIAR || comDicas >= LIMIAR) dicas = semDicas >= comDicas ? "nenhuma" : "leves";

  return { ...p, tom, dicas };
}
