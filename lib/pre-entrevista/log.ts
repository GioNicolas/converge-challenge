/**
 * Log de eventos da pré-entrevista. Cada evento vai para a sessão (e para o download .json)
 * e sai no console do servidor numa linha:
 *
 *   [pre-entrevista] <sessionId> +<t>ms <tipo> <resumo>
 *
 * Em `dados` vai tudo o que é preciso para reproduzir o evento: prompts enviados, respostas cruas,
 * patches, avisos e, para o Jev, o request e as answers.
 */

export type TipoEvento =
  | "sessao_criada"
  | "classificacao"
  | "fala_recrutadora"
  | "fala_agente"
  | "extracao"
  | "cobertura"
  | "plano"
  | "rascunho_atualizado"
  | "finalizacao"
  | "erro"
  | "aviso";

export type NivelEvento = "info" | "aviso" | "erro";

export interface EventoLog {
  id: number;
  /** Milissegundos desde o início da sessão. */
  t: number;
  /** Momento do evento, em ISO. */
  em: string;
  tipo: TipoEvento;
  /** Uma linha só. */
  resumo: string;
  ms?: number;
  provedor?: string;
  model?: string;
  fallback?: boolean;
  nivel: NivelEvento;
  dados: unknown;
}

/** O mínimo que o log precisa de uma sessão. Evita importar `sessoes.ts` aqui. */
export interface AlvoLog {
  id: string;
  criadaEm: number;
  logs: EventoLog[];
}

export interface NovoEvento {
  tipo: TipoEvento;
  resumo: string;
  nivel?: NivelEvento;
  ms?: number;
  provedor?: string;
  model?: string;
  fallback?: boolean;
  dados: unknown;
}

/** Grava o evento na sessão e imprime a linha no console do servidor. */
export function registrarEvento(sessao: AlvoLog, novo: NovoEvento): EventoLog {
  const agora = Date.now();
  const t = agora - sessao.criadaEm;
  const resumo = novo.resumo.replace(/\s+/g, " ").trim();
  const evento: EventoLog = {
    id: sessao.logs.length + 1,
    t,
    em: new Date(agora).toISOString(),
    tipo: novo.tipo,
    resumo,
    nivel: novo.nivel ?? "info",
    dados: novo.dados,
  };
  if (novo.ms !== undefined) evento.ms = novo.ms;
  if (novo.provedor !== undefined) evento.provedor = novo.provedor;
  if (novo.model !== undefined) evento.model = novo.model;
  if (novo.fallback !== undefined) evento.fallback = novo.fallback;
  sessao.logs.push(evento);

  const linha = `[pre-entrevista] ${sessao.id} +${t}ms ${evento.tipo} ${resumo}`;
  if (evento.nivel === "erro") console.error(linha);
  else if (evento.nivel === "aviso") console.warn(linha);
  else console.log(linha);
  return evento;
}

export interface MudancaCampo {
  /** Caminho pontilhado; itens de lista usam o id (ou area) quando existe: `criteria[id=abordagem].weight`. */
  caminho: string;
  antes: unknown;
  depois: unknown;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Chave estável de um item de lista: `id`, `area` ou, na falta, o índice. */
function chaveDoItem(item: unknown, indice: number): string {
  if (ehObjeto(item) && typeof item.id === "string") return `id=${item.id}`;
  if (ehObjeto(item) && typeof item.area === "string") return `area=${item.area}`;
  return `${indice}`;
}

/**
 * Diff simples de dois valores JSON. Devolve a lista de caminhos que mudaram, com antes e depois.
 * Objetos são comparados chave a chave; listas casam itens pelo `id`/`area` quando possível.
 * Campo que surge ou some aparece com `null` no lado vazio.
 */
export function diff(antes: unknown, depois: unknown, caminho = ""): MudancaCampo[] {
  if (JSON.stringify(antes) === JSON.stringify(depois)) return [];

  if (ehObjeto(antes) && ehObjeto(depois)) {
    const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    return [...chaves].flatMap((k) => diff(antes[k], depois[k], caminho ? `${caminho}.${k}` : k));
  }

  if (Array.isArray(antes) && Array.isArray(depois)) {
    const mapa = (lista: unknown[]) => new Map(lista.map((item, i) => [chaveDoItem(item, i), item]));
    const a = mapa(antes);
    const b = mapa(depois);
    const chaves = new Set([...a.keys(), ...b.keys()]);
    return [...chaves].flatMap((k) => diff(a.get(k) ?? null, b.get(k) ?? null, `${caminho}[${k}]`));
  }

  return [{ caminho: caminho || "(raiz)", antes: antes ?? null, depois: depois ?? null }];
}
