/**
 * Liga a memória da squad à config da entrevista: as regras ATIVAS da vaga no momento em que a entrevista começa
 * vão para `config.squadRules`. Desligar uma regra vale já para a próxima entrevista.
 *
 * Uma regra só vale na vaga de onde veio (`origem.vagaId`): o que o Tech Lead ensinou na vaga de Dados não entra
 * na entrevista de Backend. Uma vaga nova começa sem regras.
 */
import type { InterviewConfig, SquadRule } from "@/lib/contracts";
import { empresaAtual, regrasAtivas } from "./store";
import type { RegraSquad } from "./tipos";

export function paraContrato(r: RegraSquad): SquadRule {
  return { id: r.id, text: r.texto, effect: r.efeito, criterion: r.criterio };
}

/** A vaga de uma config: o `vagaId` dela, ou o próprio id quando a config é a vaga. É o id que as regras gravam. */
export function vagaDaConfig(config: Pick<InterviewConfig, "id" | "vagaId">): string {
  return config.vagaId ?? config.id;
}

/** As regras ativas que vieram desta vaga. Sem vaga: nenhuma. */
export function regrasAtivasDaVaga(vagaId: string | undefined, empresaId = empresaAtual()): RegraSquad[] {
  if (!vagaId) return [];
  return regrasAtivas(empresaId).filter((r) => r.origem.vagaId === vagaId);
}

/** As regras ativas da vaga, no formato do contrato (o que vai para os prompts e o relatório). */
export function regrasDaVaga(vagaId: string | undefined, empresaId = empresaAtual()): SquadRule[] {
  return regrasAtivasDaVaga(vagaId, empresaId).map(paraContrato);
}

/** A config com as regras ativas da vaga dela. Sem regras, a config volta sem `squadRules`. */
export function comRegrasDaSquad(config: InterviewConfig, empresaId = empresaAtual()): InterviewConfig {
  const regras = regrasDaVaga(vagaDaConfig(config), empresaId);
  if (regras.length === 0) {
    if (!config.squadRules) return config;
    const { squadRules: _semRegras, ...resto } = config;
    void _semRegras;
    return resto;
  }
  return { ...config, squadRules: regras };
}
