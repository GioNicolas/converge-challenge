/**
 * Store da Memória Viva da Squad, em memória. Fica em globalThis para sobreviver ao hot reload do Next
 * (como `lib/slack/store.ts`). Em serverless NÃO persiste entre instâncias: trocar por banco quando precisar.
 *
 * Usada pela F4 (decisões do Tech Lead no Slack) e pela F5 (resultado aos 90 dias). Uma empresa nova
 * começa vazia; a empresa da demo começa com a semente de `semente.ts` (vagas anteriores já decididas).
 */
import { randomUUID } from "crypto";
import { SEMENTE } from "./semente";
import type {
  Concordancia,
  ConcordanciaVaga,
  DecisaoRegistrada,
  FatiaConcordancia,
  MotivoIgnorado,
  NovaDecisao,
  NovaRegra,
  OrigemRegra,
  RegraSquad,
} from "./tipos";

export * from "./tipos";

/** Empresa da demo. No hackathon, uma empresa por canal do Slack. */
export const EMPRESA_DEMO = "empresa-demo";

/** A empresa de quem está usando: o canal do Slack configurado, ou a da demo. */
export function empresaAtual(): string {
  return process.env.SLACK_CHANNEL_ID || EMPRESA_DEMO;
}

interface EstadoEmpresa {
  regras: RegraSquad[];
  decisoes: DecisaoRegistrada[];
  ignorados: MotivoIgnorado[];
}

interface Store {
  empresas: Map<string, EstadoEmpresa>;
}

const g = globalThis as unknown as { __squadMemory?: Store };
const store: Store = (g.__squadMemory ??= { empresas: new Map() });

const agora = () => new Date().toISOString();

/** Estado da empresa, criado na primeira consulta. A empresa atual nasce com a semente da demo. */
function estadoDa(empresaId: string): EstadoEmpresa {
  let e = store.empresas.get(empresaId);
  if (!e) {
    e = { regras: [], decisoes: [], ignorados: [] };
    if (empresaId === empresaAtual() || empresaId === EMPRESA_DEMO) {
      e.regras.push(...SEMENTE.regras.map((r) => ({ ...r, empresaId })));
      e.decisoes.push(...SEMENTE.decisoes.map((d) => ({ ...d, empresaId })));
      e.ignorados.push(...SEMENTE.ignorados.map((i) => ({ ...i, empresaId })));
    }
    store.empresas.set(empresaId, e);
  }
  return e;
}

/** Acha a regra em qualquer empresa (os ids são únicos). */
function acharRegra(id: string): { regra: RegraSquad; empresa: EstadoEmpresa } | undefined {
  for (const empresa of store.empresas.values()) {
    const regra = empresa.regras.find((r) => r.id === id);
    if (regra) return { regra, empresa };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export function adicionarRegra(nova: NovaRegra): RegraSquad {
  const regra: RegraSquad = {
    ...nova,
    id: nova.id ?? `regra-${randomUUID().slice(0, 8)}`,
    ativa: nova.ativa ?? true,
    criadaEm: nova.criadaEm ?? agora(),
  };
  estadoDa(regra.empresaId).regras.push(regra);
  return regra;
}

/** Todas as regras da empresa (ativas e desligadas), da mais recente para a mais antiga. */
export function listarRegras(empresaId: string): RegraSquad[] {
  return [...estadoDa(empresaId).regras].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

/** Só as ativas: o que entra no plano e na avaliação da próxima entrevista. */
export function regrasAtivas(empresaId: string): RegraSquad[] {
  return listarRegras(empresaId).filter((r) => r.ativa);
}

export function obterRegra(id: string): RegraSquad | undefined {
  return acharRegra(id)?.regra;
}

/** Liga ou desliga. Sem `ativa`, inverte. Devolve a regra atualizada, ou undefined se não existe. */
export function alternarRegra(id: string, ativa?: boolean): RegraSquad | undefined {
  const achada = acharRegra(id);
  if (!achada) return undefined;
  achada.regra.ativa = ativa ?? !achada.regra.ativa;
  return achada.regra;
}

/** O Tech Lead reescreve a regra. A origem não muda: continua rastreável. */
export function editarRegra(
  id: string,
  mudanca: Partial<Pick<RegraSquad, "texto" | "efeito" | "criterio">>,
): RegraSquad | undefined {
  const achada = acharRegra(id);
  if (!achada) return undefined;
  Object.assign(achada.regra, mudanca);
  return achada.regra;
}

export function apagarRegra(id: string): boolean {
  const achada = acharRegra(id);
  if (!achada) return false;
  achada.empresa.regras = achada.empresa.regras.filter((r) => r.id !== id);
  return true;
}

// ---------------------------------------------------------------------------
// Motivos ignorados pelo guarda-corpo (não técnicos)
// ---------------------------------------------------------------------------

export function registrarMotivoIgnorado(input: {
  empresaId: string;
  trecho: string;
  porque: string;
  origem: OrigemRegra;
}): MotivoIgnorado {
  const item: MotivoIgnorado = { ...input, id: `ignorado-${randomUUID().slice(0, 8)}`, criadoEm: agora() };
  estadoDa(input.empresaId).ignorados.push(item);
  return item;
}

export function listarMotivosIgnorados(empresaId: string): MotivoIgnorado[] {
  return [...estadoDa(empresaId).ignorados].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

// ---------------------------------------------------------------------------
// Decisões e concordância Totti × Tech Lead
// ---------------------------------------------------------------------------

export function registrarDecisao(input: NovaDecisao): DecisaoRegistrada {
  const decisao: DecisaoRegistrada = {
    ...input,
    id: `decisao-${randomUUID().slice(0, 8)}`,
    decididaEm: input.decididaEm ?? agora(),
  };
  estadoDa(input.empresaId).decisoes.push(decisao);
  return decisao;
}

/** Decisões da empresa, da mais antiga para a mais recente. */
export function listarDecisoes(empresaId: string): DecisaoRegistrada[] {
  return [...estadoDa(empresaId).decisoes].sort((a, b) => a.decididaEm.localeCompare(b.decididaEm));
}

/** O Totti concordou quando recomendou avançar e o Tech Lead aprovou, ou não avançar e ele reprovou. */
export function concordou(d: Pick<DecisaoRegistrada, "recomendacaoTotti" | "decisaoTechLead">): boolean | null {
  if (d.recomendacaoTotti === "talvez") return null;
  return (d.recomendacaoTotti === "avancar") === (d.decisaoTechLead === "aprovado");
}

function fatia(decisoes: DecisaoRegistrada[]): FatiaConcordancia {
  const comPosicao = decisoes.map(concordou).filter((c): c is boolean => c !== null);
  const sim = comPosicao.filter(Boolean).length;
  return {
    concordou: sim,
    total: comPosicao.length,
    semPosicao: decisoes.length - comPosicao.length,
    pct: comPosicao.length ? Math.round((sim / comPosicao.length) * 100) : null,
  };
}

/** Concordância geral e por vaga, em ordem de tempo. É o número que prova o aprendizado. */
export function concordancia(empresaId: string): Concordancia {
  const decisoes = listarDecisoes(empresaId);
  const porVagaId = new Map<string, DecisaoRegistrada[]>();
  for (const d of decisoes) porVagaId.set(d.vagaId, [...(porVagaId.get(d.vagaId) ?? []), d]);
  const porVaga: ConcordanciaVaga[] = [...porVagaId.entries()]
    .map(([vagaId, ds]) => ({
      vagaId,
      vagaTitulo: ds.find((d) => d.vagaTitulo)?.vagaTitulo ?? vagaId,
      inicio: ds[0].decididaEm,
      ...fatia(ds),
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  return { geral: fatia(decisoes), porVaga };
}

/** Só para testes: zera a memória. */
export function limparMemoria(): void {
  store.empresas.clear();
}
