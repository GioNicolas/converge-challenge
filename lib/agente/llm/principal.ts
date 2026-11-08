// Cliente do cérebro do quadro sobre o `lib/llm` (o mesmo do agente de live coding): Featherless como
// primária, OpenRouter de reserva, com hedge e breaker por papel. Aqui só se traduz a interface do
// cérebro (`LlmCliente`) para a do `lib/llm` (`completeJson`). Só servidor.
//
// O que o `lib/llm` decide, e este adaptador respeita: o modelo (por papel, nas variáveis ANALYST_MODEL,
// INTERVIEWER_MODEL, EVALUATOR_MODEL e as de reserva) e o raciocínio. Por isso `modelo` e `raciocinio`
// dos chamadores são ignorados.
import { z } from "zod";
import { completeJson, type LlmRole } from "../../llm";
import { NOME_SCHEMA_ABERTURA } from "../prompts/abertura";
import { NOME_SCHEMA_ANALISE } from "../prompts/avaliador";
import { NOME_SCHEMA_PERGUNTAR } from "../prompts/entrevistador";
import { NOME_SCHEMA_PERGUNTAR_V2 } from "../prompts/entrevistador-v2";
import { NOME_SCHEMA_KIT } from "../prompts/gerador-kit";
import { NOME_SCHEMA_PLANEJADOR } from "../prompts/planejador";
import { NOME_SCHEMA_SCORECARD } from "../prompts/scorecard";
import { ErroLlm, type LlmArgs, type LlmCliente, type LlmResultado } from "./cliente";
import { paraJsonSchema } from "./jsonschema";

/** Papel do `lib/llm` de cada chamada do cérebro. */
const PAPEL: Record<string, LlmRole> = {
  [NOME_SCHEMA_ANALISE]: "quadro", // análise do desenho, ao vivo (prazo de 8 s)
  [NOME_SCHEMA_PLANEJADOR]: "analyst", // conversa de plano com a recrutadora
  // Fala com o candidato, ao vivo: modelo sem raciocínio. O GLM fica para a análise e o relatório.
  [NOME_SCHEMA_PERGUNTAR]: "conversa",
  [NOME_SCHEMA_PERGUNTAR_V2]: "conversa_quadro", // Totti 2 no quadro (TOTTI_QUADRO=v2)
  [NOME_SCHEMA_ABERTURA]: "conversa", // apresentação e despedida
  [NOME_SCHEMA_SCORECARD]: "evaluator", // relatório final
  [NOME_SCHEMA_KIT]: "evaluator", // geração do kit a partir da vaga
};
const PAPEL_PADRAO: LlmRole = "evaluator";

/**
 * Papéis cujo formato só existia no `response_format` do cliente antigo: o `lib/llm` não manda o schema, e o
 * GLM sozinho inventava o formato (campos faltando, texto no lugar de lista, objeto embrulhado) e o scorecard
 * falhava mesmo depois do reparo. Para eles o JSON Schema vai no fim do sistema. Os papéis ao vivo já
 * descrevem o formato no próprio prompt e ficam como estão.
 */
const PAPEIS_COM_SCHEMA_NO_PROMPT: ReadonlySet<LlmRole> = new Set(["analyst", "evaluator"]);

/** O formato da resposta, para o modelo que não recebe `response_format`. */
export function blocoDoFormato(schema: LlmArgs<unknown>["schema"]): string {
  return [
    "FORMATO DA RESPOSTA: um único objeto JSON que valide neste JSON Schema. Todos os campos são obrigatórios,",
    "com os nomes exatos; sem valor, use null ou []. Não embrulhe o objeto em outra chave.",
    JSON.stringify(paraJsonSchema(schema)),
  ].join("\n");
}

/** Prazo padrão de uma chamada ao vivo, o mesmo do quadro (o handler também corta em 8 s). */
const PRAZO_PADRAO_MS = 8000;
/**
 * Abaixo disto o limite de tokens do chamador fica de fora: os limites do quadro (200 a 400) foram feitos para
 * modelos sem raciocínio, e um modelo que raciocina gasta tudo nele e devolve texto vazio. Sem valor, vale o
 * limite do papel no `lib/llm`.
 */
const MIN_TOKENS_RESPEITADOS = 1000;

export type OpcoesPrincipal = {
  /** Troca o `completeJson` do `lib/llm` (testes). */
  completar?: typeof completeJson;
};

/**
 * Espera a promessa até `ms` ou até o sinal de quem chama. Nos dois casos `cancelar` aborta a chamada por
 * baixo: sem isso ela continuaria segurando a vaga do provedor e a próxima fala esperaria na fila.
 */
function comLimite<T>(promessa: Promise<T>, ms: number, cancelar: AbortController, sinal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const limpar = () => {
      clearTimeout(prazo);
      sinal?.removeEventListener("abort", abortar);
    };
    const abortar = () => {
      limpar();
      cancelar.abort();
      rejeitar(new ErroLlm("abortado", "chamada abortada"));
    };
    const prazo = setTimeout(() => {
      limpar();
      cancelar.abort();
      rejeitar(new ErroLlm("timeout", `LLM passou de ${ms} ms`));
    }, ms);
    if (sinal?.aborted) return abortar();
    sinal?.addEventListener("abort", abortar, { once: true });
    promessa.then(
      (v) => {
        limpar();
        resolver(v);
      },
      (e) => {
        limpar();
        rejeitar(e);
      },
    );
  });
}

/** Junta as mensagens numa só (o `lib/llm` recebe um único `user`). Uma mensagem só passa direto. */
function juntarMensagens(mensagens: LlmArgs<unknown>["mensagens"]): string {
  if (mensagens.length === 1) return mensagens[0].content;
  return mensagens
    .map((m) => `${m.role === "user" ? "Usuário" : "Você (resposta anterior)"}: ${m.content}`)
    .join("\n\n");
}

export function criarClientePrincipal(opcoes: OpcoesPrincipal = {}): LlmCliente {
  const completar = opcoes.completar ?? completeJson;
  return {
    async completarJson<T>(args: LlmArgs<T>): Promise<LlmResultado<T>> {
      const inicio = Date.now();
      // O `lib/llm` valida a saída com o schema e só diz que falhou. Um espião no schema deixa saber que a
      // causa foi saída fora do formato (código "invalido", que os chamadores usam para pedir de novo).
      let foraDoSchema = false;
      const espiao = z.any().transform((valor, ctx): T => {
        const r = args.schema.safeParse(valor);
        if (!r.success) {
          foraDoSchema = true;
          for (const issue of r.error.issues) ctx.addIssue(issue);
          return z.NEVER;
        }
        return r.data;
      });
      const papel = PAPEL[args.nomeSchema] ?? PAPEL_PADRAO;
      const formato = PAPEIS_COM_SCHEMA_NO_PROMPT.has(papel) ? blocoDoFormato(args.schema) : undefined;
      const sistema = [args.sistema.estatico, args.sistema.dinamico, formato].filter(Boolean).join("\n\n");
      const prazoMs = args.timeoutMs ?? PRAZO_PADRAO_MS;
      const cancelar = new AbortController();
      try {
        const r = await comLimite(
          completar<T>({
            role: papel,
            system: sistema,
            user: juntarMensagens(args.mensagens),
            schema: espiao,
            maxTokens: args.maxTokens !== undefined && args.maxTokens >= MIN_TOKENS_RESPEITADOS ? args.maxTokens : undefined,
            signal: cancelar.signal,
            prazoMs,
            ...(args.imagem ? { imageDataUrl: args.imagem } : {}),
          }),
          prazoMs,
          cancelar,
          args.sinal,
        );
        return {
          dados: r.data,
          ms: r.durationMs ?? Date.now() - inicio,
          modelo: r.model,
          uso: { entrada: r.promptTokens, saida: r.completionTokens, custo: r.costUsd },
        };
      } catch (e) {
        if (e instanceof ErroLlm) throw e;
        if (foraDoSchema) throw new ErroLlm("invalido", "saída do LLM fora do schema");
        // A mensagem do `lib/llm` traz o provedor e o motivo, nunca a chave.
        throw new ErroLlm("http", (e instanceof Error ? e.message : String(e)).slice(0, 300));
      }
    },
  };
}
