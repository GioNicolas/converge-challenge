/**
 * Store das configs de entrevista (saída da pré-entrevista com a recrutadora). Só servidor.
 *
 * Memória + `data/configs/<id>.json` (mesma pasta que a pré-entrevista usa), então uma config
 * salva por qualquer lado sobrevive a restart e é achada pelo `configId` do `session_started`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { InterviewConfig } from "@/lib/contracts";
import { selecionarProblema } from "@/lib/problems/selecao";
import { hasProblem } from "@/problems";

const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;

const globalForConfigs = globalThis as typeof globalThis & { __convergeConfigs?: Map<string, InterviewConfig> };
const configs = (globalForConfigs.__convergeConfigs ??= new Map<string, InterviewConfig>());

const pasta = () => join(process.cwd(), "data", "configs");

/**
 * Config com questão que o agente não tem (id desconhecido, ou formato sem IDE, como system design):
 * em vez de derrubar a sessão, escolhe do banco pela própria config (senioridade e foco da vaga).
 * O aviso fica no log do servidor.
 */
export function normalizarConfig(config: InterviewConfig): InterviewConfig {
  if (hasProblem(config.problemId)) return config;
  const escolhida = selecionarProblema({ seniority: config.seniority, focus: config.focus, difficulty: config.difficulty, semente: config.roleTitle });
  console.warn(`[config] ${config.id}: problema "${config.problemId}" não existe no banco do agente; usando "${escolhida.id}"`);
  return { ...config, problemId: escolhida.id, difficulty: escolhida.difficulty };
}

export async function saveConfig(config: InterviewConfig): Promise<void> {
  if (!ID_VALIDO.test(config.id)) throw new Error(`id de config inválido: ${config.id}`);
  configs.set(config.id, config);
  await mkdir(pasta(), { recursive: true });
  await writeFile(join(pasta(), `${config.id}.json`), JSON.stringify(config, null, 2), "utf8");
}

/** Config pelo id (memória, depois arquivo). Inexistente ou inválida: undefined. */
export async function findConfig(id: string): Promise<InterviewConfig | undefined> {
  if (id === DEFAULT_CONFIG.id) return DEFAULT_CONFIG;
  if (!ID_VALIDO.test(id)) return undefined;
  const cached = configs.get(id);
  if (cached) return cached;
  try {
    const parsed = InterviewConfig.safeParse(JSON.parse(await readFile(join(pasta(), `${id}.json`), "utf8")));
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
