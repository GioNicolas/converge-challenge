/**
 * Liga a memória da squad à config da entrevista: as regras ATIVAS da vaga no momento em que a entrevista começa
 * vão para `config.squadRules`. Desligar uma regra vale já para a próxima entrevista.
 *
 * Entram as regras da vaga (`origem.vagaId`) e as ativas da empresa que afetam algum critério da rubrica dela
 * (`regraAfeta`): o resultado dos 90 dias de uma contratação chega à próxima entrevista que mede o mesmo critério.
 * Regra de outra vaga sobre critério que esta rubrica não usa fica de fora.
 */
import type { InterviewConfig, SquadRule } from "@/lib/contracts";
import { regraAfeta } from "./criterios";
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

/** Todas as regras ativas da empresa (de qualquer vaga). */
export function regrasAtivasDaEmpresa(empresaId = empresaAtual()): RegraSquad[] {
  return regrasAtivas(empresaId);
}

/** As regras da vaga mais as ativas da empresa que afetam algum dos critérios dados. */
export function regrasParaOsCriterios(
  vagaId: string | undefined,
  criterios: string[],
  empresaId = empresaAtual(),
): SquadRule[] {
  const vistas = new Set<string>();
  const regras: RegraSquad[] = [];
  const candidatas = [
    ...regrasAtivasDaVaga(vagaId, empresaId),
    ...regrasAtivasDaEmpresa(empresaId).filter((r) => criterios.some((c) => regraAfeta(r, c))),
  ];
  for (const r of candidatas) {
    if (vistas.has(r.id)) continue;
    vistas.add(r.id);
    regras.push(r);
  }
  return regras.map(paraContrato);
}

/** A config com as regras ativas da vaga dela. Sem regras, a config volta sem `squadRules`. */
export function comRegrasDaSquad(config: InterviewConfig, empresaId = empresaAtual()): InterviewConfig {
  const regras = regrasParaOsCriterios(
    vagaDaConfig(config),
    (config.criteria ?? []).map((c) => c.id),
    empresaId,
  );
  if (regras.length === 0) {
    if (!config.squadRules) return config;
    const { squadRules: _semRegras, ...resto } = config;
    void _semRegras;
    return resto;
  }
  return { ...config, squadRules: regras };
}
