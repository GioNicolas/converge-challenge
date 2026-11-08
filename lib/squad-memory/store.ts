/**
 * Store da Memória Viva da Squad, em memória. Fica em globalThis para sobreviver ao hot reload do Next
 * Em serverless NÃO persiste entre instâncias: trocar por banco quando precisar.
 *
 * Usada pela F4 (decisões do Tech Lead) e pela F5 (resultado aos 90 dias). Uma empresa nova
 * começa vazia; a empresa da demo começa com a semente de `semente.ts` (vagas anteriores já decididas).
 */
import { randomUUID } from "crypto";
import { kvPadrao } from "@/lib/storage/kv";
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

/** Empresa da demo. Uma empresa só, por enquanto. */
export const EMPRESA_DEMO = "empresa-demo";

/** A empresa de quem está usando (por enquanto, sempre a da demo). */
export function empresaAtual(): string {
  return EMPRESA_DEMO;
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

// ---------------------------------------------------------------------------
// Persistência (Supabase, quando configurado). As funções abaixo continuam síncronas sobre o Map local;
// cada mudança dispara a gravação do estado da empresa (fire-and-forget) e `hidratarSquadMemory()` traz o
// que outras instâncias gravaram. O estado gravado inclui a semente, então hidratar nunca a duplica.
// ---------------------------------------------------------------------------

const NS_KV = "squad-memory";
/** Quanto tempo uma hidratação vale antes de consultar o KV de novo (outras instâncias podem ter gravado). */
const VALIDADE_HIDRATACAO_MS = 5_000;

const h = globalThis as unknown as { __squadMemoryHidratacao?: { em: number; emAndamento?: Promise<void> } };
const hidratacao = (h.__squadMemoryHidratacao ??= { em: 0 });
const filas = new Map<string, Promise<void>>();

function persistir(empresaId: string): void {
  try {
    const kv = kvPadrao();
    if (kv.nome !== "supabase") return;
    const e = store.empresas.get(empresaId);
    if (!e) return;
    const anterior = filas.get(empresaId) ?? Promise.resolve();
    filas.set(
      empresaId,
      anterior
        .then(() => kv.set(NS_KV, empresaId, structuredClone(e)))
        .catch((err) => console.error("[squad-memory] não gravou:", err instanceof Error ? err.message : "erro")),
    );
  } catch (err) {
    console.error("[squad-memory] não gravou:", err instanceof Error ? err.message : "erro");
  }
}

/** Carrega do KV o estado das empresas e troca o local por ele. Idempotente; falha do KV não derruba. */
export async function hidratarSquadMemory(): Promise<void> {
  const kv = kvPadrao();
  if (kv.nome !== "supabase") return;
  if (hidratacao.emAndamento) return hidratacao.emAndamento;
  if (Date.now() - hidratacao.em < VALIDADE_HIDRATACAO_MS) return;
  hidratacao.emAndamento = (async () => {
    try {
      for (const l of await kv.list<EstadoEmpresa>(NS_KV)) {
        const v = l.value;
        if (!v || !Array.isArray(v.regras) || !Array.isArray(v.decisoes) || !Array.isArray(v.ignorados)) continue;
        const pendente = filas.get(l.key);
        let base = v;
        if (pendente) {
          await pendente; // o que é local sobe antes de ler de volta
          base = (await kv.get<EstadoEmpresa>(NS_KV, l.key)) ?? v;
        }
        store.empresas.set(l.key, { regras: base.regras, decisoes: base.decisoes, ignorados: base.ignorados });
      }
      hidratacao.em = Date.now();
    } catch (err) {
      console.error("[squad-memory] não hidratou:", err instanceof Error ? err.message : "erro");
    } finally {
      hidratacao.emAndamento = undefined;
    }
  })();
  return hidratacao.emAndamento;
}

/** Espera as gravações em curso no KV. As rotas que mudam a memória chamam antes de responder: na Vercel a
 * instância pode congelar logo depois da resposta e levar junto o que ainda não subiu. */
export async function gravacoesPendentesSquadMemory(): Promise<void> {
  await Promise.all([...filas.values()]);
}

/** Só para testes: esquece que já hidratou. */
export function reiniciarHidratacaoSquadMemory(): void {
  hidratacao.em = 0;
  hidratacao.emAndamento = undefined;
  filas.clear();
}

function empresaDaRegra(id: string): string | undefined {
  for (const [empresaId, e] of store.empresas) if (e.regras.some((r) => r.id === id)) return empresaId;
  return undefined;
}

function persistirDaRegra(id: string): void {
  const empresaId = empresaDaRegra(id);
  if (empresaId) persistir(empresaId);
}

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
  persistir(regra.empresaId);
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
  persistirDaRegra(id);
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
  persistirDaRegra(id);
  return achada.regra;
}

export function apagarRegra(id: string): boolean {
  const achada = acharRegra(id);
  if (!achada) return false;
  const empresaId = empresaDaRegra(id);
  achada.empresa.regras = achada.empresa.regras.filter((r) => r.id !== id);
  if (empresaId) persistir(empresaId);
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
  persistir(input.empresaId);
  return item;
}

/** Tira um trecho ignorado (ex.: ao desfazer a resposta dos 90 dias num ensaio da demo). */
export function apagarMotivoIgnorado(id: string): boolean {
  for (const [empresaId, e] of store.empresas) {
    const i = e.ignorados.findIndex((m) => m.id === id);
    if (i >= 0) {
      e.ignorados.splice(i, 1);
      persistir(empresaId);
      return true;
    }
  }
  return false;
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
  persistir(input.empresaId);
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
