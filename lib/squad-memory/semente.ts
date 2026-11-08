/**
 * Semente da demo: o que a empresa da demo já tem na memória antes da primeira decisão ao vivo.
 * O `empresaId` de cada item é trocado pelo da empresa na hora de semear (ver `estadoDa` em `store.ts`).
 */
import type { DecisaoRegistrada, MotivoIgnorado, RegraSquad } from "./tipos";

export const SEMENTE: { regras: RegraSquad[]; decisoes: DecisaoRegistrada[]; ignorados: MotivoIgnorado[] } = {
  regras: [],
  decisoes: [],
  ignorados: [],
};
