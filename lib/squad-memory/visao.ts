/**
 * O que a tela "O que o Totti aprendeu" recebe (GET /api/squad-memory). Uma função só, usada pela rota.
 */
import { CRITERIOS_SQUAD } from "./criterios";
import { concordancia, empresaAtual, listarDecisoes, listarMotivosIgnorados, listarRegras } from "./store";
import type { Concordancia, MotivoIgnorado, RegraSquad } from "./tipos";

export interface VisaoMemoria {
  empresaId: string;
  regras: RegraSquad[];
  ignorados: MotivoIgnorado[];
  concordancia: Concordancia;
  /** Quantas decisões o Totti já viu. */
  decisoes: number;
  /** id → nome legível, para a tela e para o seletor de critério ao editar. */
  criterios: { id: string; nome: string }[];
  /** id da vaga → nome, para mostrar a origem das regras. */
  vagas: Record<string, string>;
}

export function visaoDaMemoria(empresaId = empresaAtual()): VisaoMemoria {
  const c = concordancia(empresaId);
  const vagas = Object.fromEntries(c.porVaga.map((v) => [v.vagaId, v.vagaTitulo]));
  return {
    empresaId,
    regras: listarRegras(empresaId),
    ignorados: listarMotivosIgnorados(empresaId),
    concordancia: c,
    decisoes: listarDecisoes(empresaId).length,
    criterios: CRITERIOS_SQUAD.map(({ id, nome }) => ({ id, nome })),
    vagas,
  };
}
