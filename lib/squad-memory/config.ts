/**
 * Liga a memória da squad à config da entrevista: as regras ATIVAS no momento em que a entrevista começa
 * vão para `config.squadRules`. Desligar uma regra vale já para a próxima entrevista.
 */
import type { InterviewConfig, SquadRule } from "@/lib/contracts";
import { empresaAtual, regrasAtivas } from "./store";
import type { RegraSquad } from "./tipos";

export function paraContrato(r: RegraSquad): SquadRule {
  return { id: r.id, text: r.texto, effect: r.efeito, criterion: r.criterio };
}

export function regrasDaEmpresa(empresaId = empresaAtual()): SquadRule[] {
  return regrasAtivas(empresaId).map(paraContrato);
}

/** A config com as regras ativas da empresa. Sem regras, a config volta como estava. */
export function comRegrasDaSquad(config: InterviewConfig, empresaId = empresaAtual()): InterviewConfig {
  const regras = regrasDaEmpresa(empresaId);
  if (regras.length === 0) {
    if (!config.squadRules) return config;
    const { squadRules: _semRegras, ...resto } = config;
    void _semRegras;
    return resto;
  }
  return { ...config, squadRules: regras };
}
