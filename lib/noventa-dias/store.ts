/**
 * As contratações de cada empresa e a resposta do gestor aos 90 dias. Em memória, no `globalThis` (como a
 * memória da squad): a empresa da demo nasce com a semente.
 */
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
  return c;
}

export function registrarResultado(id: string, resultado: ResultadoNoventaDias): Contratacao | undefined {
  const c = obterContratacao(id);
  if (!c) return undefined;
  c.resultado = resultado;
  return c;
}

/** Tira a resposta (só para ensaiar a demo). Quem chama apaga as regras que ela criou. */
export function limparResultado(id: string): ResultadoNoventaDias | undefined {
  const c = obterContratacao(id);
  const antes = c?.resultado;
  if (c) delete c.resultado;
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
