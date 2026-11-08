/**
 * Store das configs de entrevista (saída da pré-entrevista com a recrutadora). Só servidor.
 *
 * Memória + (Supabase, quando configurado; senão `data/configs/<id>.json`, a mesma pasta que a pré-entrevista
 * usa), então uma config salva por qualquer lado sobrevive a restart e a outra instância e é achada pelo
 * `configId` do `session_started`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { InterviewConfig } from "@/lib/contracts";
import { kvRemoto } from "@/lib/storage/kv";
import { selecionarProblema, sortearProblema } from "@/lib/problems/selecao";
import { problems } from "@/lib/problems";
import { hasProblem } from "@/problems";

const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;

const globalForConfigs = globalThis as typeof globalThis & { __convergeConfigs?: Map<string, InterviewConfig> };
const configs = (globalForConfigs.__convergeConfigs ??= new Map<string, InterviewConfig>());

const pasta = () => join(process.cwd(), "data", "configs");

/**
 * Config com questão que o agente não pode usar: id desconhecido, formato sem IDE (system design) ou
 * questão de nível diferente do `difficulty` da config. Em vez de derrubar a sessão, escolhe do banco pela
 * própria config (senioridade e foco da vaga). O aviso fica no log do servidor.
 *
 * IDE e agente recebem a config já normalizada; a questão de cada entrevista sai de `comQuestaoSorteada`.
 */
export function normalizarConfig(config: InterviewConfig): InterviewConfig {
  const existe = hasProblem(config.problemId);
  if (existe && (!config.difficulty || problems[config.problemId]?.difficulty === config.difficulty)) return config;
  const escolhida = selecionarProblema({ seniority: config.seniority, focus: config.focus, difficulty: config.difficulty, semente: config.roleTitle });
  const motivo = existe ? `é de nível ${problems[config.problemId]?.difficulty}, e a config pede ${config.difficulty}` : "não existe no banco do agente";
  console.warn(`[config] ${config.id}: problema "${config.problemId}" ${motivo}; usando "${escolhida.id}"`);
  return { ...config, problemId: escolhida.id, difficulty: escolhida.difficulty };
}

export async function saveConfig(config: InterviewConfig): Promise<void> {
  if (!ID_VALIDO.test(config.id)) throw new Error(`id de config inválido: ${config.id}`);
  configs.set(config.id, config);
  const kv = kvRemoto();
  if (kv) {
    await kv.set("config", config.id, config);
    return;
  }
  await mkdir(pasta(), { recursive: true });
  await writeFile(join(pasta(), `${config.id}.json`), JSON.stringify(config, null, 2), "utf8");
}

/**
 * A questão desta entrevista: sorteada entre as que servem ao nível e ao foco da vaga (ver `sortearProblema`).
 * Só a página da entrevista chama: ela passa a questão para a IDE, e a IDE manda o id no `session_started`,
 * então o agente fala da mesma questão que o candidato vê (`withProblem` em /api/events).
 */
export function comQuestaoSorteada(config: InterviewConfig): InterviewConfig {
  if (config.mode !== "live_coding") return config;
  const sorteada = sortearProblema({ seniority: config.seniority, focus: config.focus, difficulty: config.difficulty });
  if (!hasProblem(sorteada.id)) return config;
  return { ...config, problemId: sorteada.id, difficulty: sorteada.difficulty };
}

/** Config pelo id (memória, depois arquivo). Inexistente ou inválida: undefined. */
export async function findConfig(id: string): Promise<InterviewConfig | undefined> {
  if (id === DEFAULT_CONFIG.id) return DEFAULT_CONFIG;
  if (!ID_VALIDO.test(id)) return undefined;
  const cached = configs.get(id);
  if (cached) return cached;
  try {
    const kv = kvRemoto();
    const bruto = kv ? await kv.get("config", id) : JSON.parse(await readFile(join(pasta(), `${id}.json`), "utf8"));
    if (bruto === null) return undefined;
    const parsed = InterviewConfig.safeParse(bruto);
    if (!parsed.success) return undefined;
    configs.set(id, parsed.data);
    return parsed.data;
  } catch {
    return undefined;
  }
}

/** Config da sessão: a da vaga, ou a padrão (com aviso) se o id não existir. */
export async function resolveConfig(id: string): Promise<InterviewConfig> {
  const found = await findConfig(id);
  if (!found) {
    console.warn(`[config] "${id}" não encontrada; sessão usa a config padrão`);
    return DEFAULT_CONFIG;
  }
  return normalizarConfig(found);
}
