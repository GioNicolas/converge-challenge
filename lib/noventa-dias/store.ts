/**
 * As contratações de cada empresa e a resposta do gestor aos 90 dias. Em memória, no `globalThis` (como a
 * memória da squad): a empresa da demo nasce com a semente.
 */
import { kvPadrao } from "@/lib/storage/kv";
import { EMPRESA_DEMO, empresaAtual } from "@/lib/squad-memory/store";
import { sementeDasContratacoes } from "./semente";
import { DIAS_DA_EXPERIENCIA, type Contratacao, type Garantia, type ResultadoNoventaDias } from "./tipos";

export * from "./tipos";

type Estado = { contratacoes: Map<string, Contratacao[]> };

const g = globalThis as typeof globalThis & { __noventaDias?: Estado };
const estado: Estado = (g.__noventaDias ??= { contratacoes: new Map() });

function daEmpresa(empresaId: string): Contratacao[] {
  let lista = estado.contratacoes.get(empresaId);
  if (!lista) {
    const semear = empresaId === empresaAtual() || empresaId === EMPRESA_DEMO;
    lista = semear ? sementeDasContratacoes().map((c) => ({ ...c, empresaId })) : [];
    estado.contratacoes.set(empresaId, lista);
  }
  return lista;
}

// Persistência no KV (Supabase), no mesmo desenho da memória da squad: Map local síncrono, gravação
// fire-and-forget por empresa (a lista inclui a semente) e hidratação que troca o local pelo gravado.
const NS_KV = "noventa-dias";
const VALIDADE_HIDRATACAO_MS = 5_000;
const hid = g as typeof g & { __noventaDiasHidratacao?: { em: number; emAndamento?: Promise<void> } };
const hidratacao = (hid.__noventaDiasHidratacao ??= { em: 0 });
const filas = new Map<string, Promise<void>>();

function persistir(empresaId: string): void {
  try {
    const kv = kvPadrao();
    if (kv.nome !== "supabase") return;
    const lista = estado.contratacoes.get(empresaId);
    if (!lista) return;
    const anterior = filas.get(empresaId) ?? Promise.resolve();
    filas.set(
      empresaId,
      anterior
        .then(() => kv.set(NS_KV, empresaId, structuredClone(lista)))
        .catch((err) => console.error("[noventa-dias] não gravou:", err instanceof Error ? err.message : "erro")),
    );
  } catch (err) {
    console.error("[noventa-dias] não gravou:", err instanceof Error ? err.message : "erro");
  }
}

/** Carrega do KV as contratações das empresas e troca o local por elas. Idempotente; falha do KV não derruba. */
export async function hidratarNoventaDias(): Promise<void> {
  const kv = kvPadrao();
  if (kv.nome !== "supabase") return;
  if (hidratacao.emAndamento) return hidratacao.emAndamento;
  if (Date.now() - hidratacao.em < VALIDADE_HIDRATACAO_MS) return;
  hidratacao.emAndamento = (async () => {
    try {
      for (const l of await kv.list<Contratacao[]>(NS_KV)) {
        let lista = l.value;
        const pendente = filas.get(l.key);
        if (pendente) {
          await pendente;
          lista = (await kv.get<Contratacao[]>(NS_KV, l.key)) ?? lista;
        }
        if (Array.isArray(lista)) estado.contratacoes.set(l.key, lista);
      }
      hidratacao.em = Date.now();
    } catch (err) {
      console.error("[noventa-dias] não hidratou:", err instanceof Error ? err.message : "erro");
    } finally {
      hidratacao.emAndamento = undefined;
    }
  })();
  return hidratacao.emAndamento;
}

/** Espera as gravações em curso no KV (ver `gravacoesPendentesSquadMemory`). */
export async function gravacoesPendentesNoventaDias(): Promise<void> {
  await Promise.all([...filas.values()]);
}

/** Só para testes. */
export function reiniciarHidratacaoNoventaDias(): void {
  hidratacao.em = 0;
  hidratacao.emAndamento = undefined;
  filas.clear();
}

const DIA = 24 * 60 * 60 * 1000;

/** Dias desde a contratação (inteiro, para baixo). */
export function diasDeCasa(c: Pick<Contratacao, "contratadoEm">, agora = Date.now()): number {
  return Math.floor((agora - Date.parse(c.contratadoEm)) / DIA);
}

/** Passou da experiência: já dá para perguntar "como foi?". */
export function venceu(c: Pick<Contratacao, "contratadoEm">, agora = Date.now()): boolean {
  return diasDeCasa(c, agora) >= DIAS_DA_EXPERIENCIA;
}

/** Contratações da empresa (de uma vaga, se pedir): primeiro as que esperam resposta, depois as mais recentes. */
export function listarContratacoes(empresaId: string, vagaId?: string, agora = Date.now()): Contratacao[] {
  const peso = (c: Contratacao) => (venceu(c, agora) && !c.resultado ? 0 : 1);
  return daEmpresa(empresaId)
    .filter((c) => !vagaId || c.vagaId === vagaId)
    .sort((a, b) => peso(a) - peso(b) || Date.parse(b.contratadoEm) - Date.parse(a.contratadoEm));
}

export function obterContratacao(id: string): Contratacao | undefined {
  for (const lista of estado.contratacoes.values()) {
    const c = lista.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

export function adicionarContratacao(c: Contratacao): Contratacao {
  daEmpresa(c.empresaId).push(c);
  persistir(c.empresaId);
  return c;
}

export function registrarResultado(id: string, resultado: ResultadoNoventaDias): Contratacao | undefined {
  const c = obterContratacao(id);
  if (!c) return undefined;
  c.resultado = resultado;
  persistir(c.empresaId);
  return c;
}

/** Tira a resposta (só para ensaiar a demo). Quem chama apaga as regras que ela criou. */
export function limparResultado(id: string): ResultadoNoventaDias | undefined {
  const c = obterContratacao(id);
  const antes = c?.resultado;
  if (c) {
    delete c.resultado;
    persistir(c.empresaId);
  }
  return antes;
}

export function garantiaDe(lista: Contratacao[], agora = Date.now()): Garantia {
  const vencidas = lista.filter((c) => venceu(c, agora));
  return {
    aprovadas: vencidas.filter((c) => c.resultado?.deuCerto).length,
    respondidas: vencidas.filter((c) => c.resultado).length,
    vencidas: vencidas.length,
    emExperiencia: lista.length - vencidas.length,
  };
}

/** Só para testes. */
export function limparContratacoes(): void {
  estado.contratacoes.clear();
}
