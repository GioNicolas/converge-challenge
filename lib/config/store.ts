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
import { pastaDados } from "@/lib/dados";
import { CATALOGO } from "@/lib/pre-entrevista/catalogo";

const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;

const globalForConfigs = globalThis as typeof globalThis & { __convergeConfigs?: Map<string, InterviewConfig> };
const configs = (globalForConfigs.__convergeConfigs ??= new Map<string, InterviewConfig>());

const pasta = () => pastaDados("configs");

/**
 * Config com questão que o agente não pode usar: id desconhecido, formato sem IDE (system design) ou
 * questão de nível diferente do `difficulty` da config. Em vez de derrubar a sessão, escolhe do banco pela
 * própria config (senioridade e foco da vaga). O aviso fica no log do servidor.
 *
 * IDE e agente recebem a config já normalizada; a questão de cada entrevista sai de `comQuestaoSorteada`.
 */
export function normalizarConfig(config: InterviewConfig): InterviewConfig {
  // System design não usa o banco de questões da IDE: o problemId é do catálogo da pré-entrevista.
  if (config.mode !== "live_coding") return config;
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

type FocoVitrine = InterviewConfig["focus"];
function configDeVitrine(c: {
  id: string;
  vagaId: string;
  mode: InterviewConfig["mode"];
  roleTitle: string;
  seniority: InterviewConfig["seniority"];
  focus: FocoVitrine;
  problemId: string;
  difficulty?: "facil" | "medio";
  durationMin: number;
}): InterviewConfig {
  return InterviewConfig.parse({ ...c, criteria: CATALOGO[c.mode], languages: ["python"] });
}

/**
 * Configs das vagas da vitrine de /vagas (`lib/vagas/workspace.ts`): abrir qualquer uma delas não cai na vaga padrão.
 * Uma config salva com o mesmo id (pré-entrevista) tem prioridade.
 */
const CONFIGS_DE_VITRINE: Record<string, InterviewConfig> = Object.fromEntries(
  [
    configDeVitrine({
      id: "config-staff-plataforma", vagaId: "staff-plataforma", mode: "system_design", roleTitle: "Staff Engineer · Plataforma",
      seniority: "senior", problemId: "pagamentos-instantaneos", durationMin: 60,
      focus: [{ area: "escala_produto", weight: 0.6 }, { area: "tecnico", weight: 0.4 }],
    }),
    configDeVitrine({
      id: "config-ia-pleno", vagaId: "ia-pleno", mode: "system_design", roleTitle: "Engenheiro(a) de IA Pleno",
      seniority: "pleno", problemId: "chatbot-atendimento-ia", durationMin: 50,
      focus: [{ area: "uso_ia", weight: 0.5 }, { area: "tecnico", weight: 0.35 }, { area: "escala_produto", weight: 0.15 }],
    }),
    configDeVitrine({
      id: "config-backend-links", vagaId: "backend-links", mode: "system_design",
      roleTitle: "Desenvolvedor(a) Backend Pleno · Links", seniority: "pleno", problemId: "encurtador-de-url", durationMin: 40,
      focus: [{ area: "escala_produto", weight: 0.5 }, { area: "pressao", weight: 0.3 }, { area: "uso_ia", weight: 0.2 }],
    }),
    configDeVitrine({
      id: "config-frontend-junior", vagaId: "frontend-junior", mode: "live_coding", roleTitle: "Desenvolvedor(a) Frontend Júnior",
      seniority: "junior", problemId: "valid-parentheses", difficulty: "facil", durationMin: 45,
      focus: [{ area: "tecnico", weight: 0.6 }, { area: "pressao", weight: 0.25 }, { area: "uso_ia", weight: 0.15 }],
    }),
    configDeVitrine({
      id: "config-fullstack-startup", vagaId: "fullstack-startup", mode: "live_coding", roleTitle: "Desenvolvedor(a) Fullstack · Startup",
      seniority: "pleno", problemId: "longest-substring-no-repeat", difficulty: "medio", durationMin: 45,
      focus: [{ area: "pressao", weight: 0.45 }, { area: "tecnico", weight: 0.4 }, { area: "uso_ia", weight: 0.15 }],
    }),
    configDeVitrine({
      id: "config-backend-pagamentos", vagaId: "backend-pagamentos", mode: "live_coding", roleTitle: "Backend Pleno · Pagamentos",
      seniority: "pleno", problemId: "top-k-frequent", difficulty: "medio", durationMin: 45,
      focus: [{ area: "tecnico", weight: 0.55 }, { area: "pressao", weight: 0.3 }, { area: "uso_ia", weight: 0.15 }],
    }),
  ].map((c) => [c.id, c]),
);

/** Config pelo id (memória, depois arquivo). Inexistente ou inválida: undefined. */
export async function findConfig(id: string): Promise<InterviewConfig | undefined> {
  if (id === DEFAULT_CONFIG.id) return DEFAULT_CONFIG;
  if (!ID_VALIDO.test(id)) return undefined;
  const cached = configs.get(id);
  if (cached) return cached;
  try {
    const kv = kvRemoto();
    const bruto = kv ? await kv.get("config", id) : JSON.parse(await readFile(join(pasta(), `${id}.json`), "utf8"));
    if (bruto === null) return CONFIGS_DE_VITRINE[id];
    const parsed = InterviewConfig.safeParse(bruto);
    if (!parsed.success) return CONFIGS_DE_VITRINE[id];
    configs.set(id, parsed.data);
    return parsed.data;
  } catch {
    return CONFIGS_DE_VITRINE[id];
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
