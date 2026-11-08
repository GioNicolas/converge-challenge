// Gera as falas de apresentação e despedida da entrevista (uma chamada ao criar a sessão).
// Nunca lança por causa do LLM: em erro/timeout devolve null (o quadro simplesmente não fala).
import { limitarFrases } from "./guardas";
import type { LlmCliente } from "./llm/cliente";
import type { Kit, Problema } from "./kits/tipos";
import { EsquemaAbertura, montarPromptAbertura, NOME_SCHEMA_ABERTURA, type Abertura, type ContextoAbertura } from "./prompts/abertura";
import { logPadrao, type LogMeta } from "./analisar";

export type DepsAbertura = {
  llm: LlmCliente;
  kit: Kit;
  problema: Problema;
  modelo?: string;
  log?: LogMeta;
} & ContextoAbertura;

const MAX_FRASES_APRESENTACAO = 4;
const MAX_FRASES_DESPEDIDA = 3;
export const PRAZO_ABERTURA_MS = 6000;

export async function gerarAbertura(deps: DepsAbertura, sinal?: AbortSignal): Promise<Abertura | null> {
  const log = deps.log ?? logPadrao;
  try {
    const r = await deps.llm.completarJson({
      sistema: montarPromptAbertura(deps.kit, deps.problema, { duracaoMin: deps.duracaoMin, etapas: deps.etapas }),
      mensagens: [{ role: "user", content: "Escreva a apresentação e a despedida agora, somente com o JSON." }],
      schema: EsquemaAbertura,
      nomeSchema: NOME_SCHEMA_ABERTURA,
      modelo: deps.modelo,
      maxTokens: 400,
      timeoutMs: PRAZO_ABERTURA_MS,
      sinal,
    });
    const apresentacao = limitarFrases(r.dados.apresentacao, MAX_FRASES_APRESENTACAO);
    const despedida = limitarFrases(r.dados.despedida, MAX_FRASES_DESPEDIDA);
    if (!apresentacao || !despedida) return null;
    return { apresentacao, despedida };
  } catch (e) {
    log("abertura_falhou", { kit: deps.kit.id, codigo: (e as { codigo?: string }).codigo ?? "desconhecido" });
    return null;
  }
}
