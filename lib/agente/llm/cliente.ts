// Cliente de LLM do cérebro. Só servidor: a chave vem de OPENROUTER_API_KEY (nunca de NEXT_PUBLIC_*)
// e nunca vai para log nem para mensagem de erro.
//
// OpenRouter é compatível com a API da OpenAI (chat/completions). Saída estruturada via
// response_format json_schema; o bloco estático do prompt leva cache_control (cache do prompt
// para modelos Anthropic; para os demais o campo é ignorado).
import type { ZodType } from "zod";
import { paraJsonSchema } from "./jsonschema";

export type LlmArgs<T> = {
  /** `estatico` é igual em toda a sessão (cache). `dinamico` muda a cada chamada. */
  sistema: { estatico: string; dinamico?: string };
  mensagens: { role: "user" | "assistant"; content: string }[];
  schema: ZodType<T>;
  nomeSchema: string;
  modelo?: string;
  maxTokens?: number;
  /**
   * Raciocínio interno do modelo. Padrão: desligado (loop ao vivo). Ligado, ele consome
   * centenas de tokens de `max_tokens` antes da resposta (medido: ~450 de 600 no Haiku 5.5)
   * e a resposta pode ser cortada; ao ligar, aumente `maxTokens`.
   */
  raciocinio?: boolean;
  /** Orçamento de tempo desta chamada (inclui o retry). Padrão: o do cliente (8000 ms, loop ao vivo). */
  timeoutMs?: number;
  sinal?: AbortSignal;
};

export type LlmResultado<T> = {
  dados: T;
  uso?: { entrada: number; saida: number; cache?: number; /** USD, se o provedor informar (usage.cost). */ custo?: number };
  ms: number;
  /** Modelo que de fato respondeu, quando o cliente sabe (o `lib/llm` escolhe por papel). */
  modelo?: string;
};

export interface LlmCliente {
  completarJson<T>(args: LlmArgs<T>): Promise<LlmResultado<T>>;
}

export type CodigoErroLlm = "sem_chave" | "timeout" | "abortado" | "http" | "rede" | "invalido";

/** Erro tipado do cliente. A mensagem nunca contém a chave nem o corpo da requisição. */
export class ErroLlm extends Error {
  constructor(
    readonly codigo: CodigoErroLlm,
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroLlm";
  }
}

// ---------------------------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------------------------

export const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
/** Confira o id no catálogo da OpenRouter (https://openrouter.ai/models) antes de usar. */
export const MODELO_AO_VIVO_PADRAO = "anthropic/claude-haiku-5.5";
export const TIMEOUT_PADRAO_MS = 8000;
/** Só tenta de novo se sobrar pelo menos isto do orçamento de tempo. */
const ORCAMENTO_MINIMO_RETRY_MS = 2500;
const ESPERA_RETRY_MS = 250;

export type OpcoesOpenRouter = {
  apiKey?: string;
  modeloPadrao?: string;
  timeoutMs?: number;
  /** Para testes. */
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  /** Recebe só metadados (status, ms, modelo). Nunca a chave, o prompt ou a resposta. */
  log?: (evento: string, meta: Record<string, unknown>) => void;
};

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tirarCercaDeCodigo(texto: string): string {
  const m = texto.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : texto.trim();
}

type RespostaOpenRouter = {
  choices?: { message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    cost?: number;
  };
};

/**
 * Motivo do erro segundo o provedor (`error.message`), truncado. Ajuda a diagnosticar 400/402/404
 * sem registrar o corpo inteiro: não repassa nada além desse campo e a chave nunca aparece nele.
 */
async function detalheDoErro(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: unknown } };
    const m = typeof j?.error?.message === "string" ? j.error.message.replace(/\s+/g, " ").trim() : "";
    return m ? ` — ${m.slice(0, 300)}` : "";
  } catch {
    return "";
  }
}

/** Modelos que recusaram raciocínio desligado nesta instância do servidor. */
const exigemRaciocinio = new Set<string>();

export function criarClienteOpenRouter(opcoes: OpcoesOpenRouter = {}): LlmCliente {
  const chave = opcoes.apiKey ?? process.env.OPENROUTER_API_KEY;
  const modeloPadrao =
    opcoes.modeloPadrao ?? (process.env.AGENTE_MODELO_AO_VIVO || MODELO_AO_VIVO_PADRAO);
  const timeoutBase = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const chamar = opcoes.fetch ?? fetch;
  const esperar = opcoes.esperar ?? dormir;
  const log = opcoes.log ?? (() => {});

  return {
    async completarJson<T>(args: LlmArgs<T>): Promise<LlmResultado<T>> {
      if (!chave) throw new ErroLlm("sem_chave", "OPENROUTER_API_KEY não configurada");
      const inicio = Date.now();
      const modelo = args.modelo ?? modeloPadrao;
      const timeoutPadrao = args.timeoutMs ?? timeoutBase;

      // Orçamento total (inclui o retry): estoura = timeout.
      const orcamento = AbortSignal.timeout(timeoutPadrao);
      const sinal = args.sinal ? AbortSignal.any([orcamento, args.sinal]) : orcamento;

      const sistema: Record<string, unknown>[] = [
        { type: "text", text: args.sistema.estatico, cache_control: { type: "ephemeral" } },
      ];
      if (args.sistema.dinamico) sistema.push({ type: "text", text: args.sistema.dinamico });

      // Alguns modelos (ex.: Sonnet 5.5) recusam raciocínio desligado: "Reasoning is mandatory for
      // this endpoint and cannot be disabled" (HTTP 400). Nesse caso o raciocínio entra em esforço
      // baixo e o limite de tokens sobe (ele consome `max_tokens` antes da resposta). Lembramos por
      // modelo para não repetir a tentativa que falha.
      const montarCorpo = (raciocinioObrigatorio: boolean) =>
        JSON.stringify({
          model: modelo,
          messages: [{ role: "system", content: sistema }, ...args.mensagens],
          max_tokens: raciocinioObrigatorio ? Math.max(args.maxTokens ?? 800, 4000) : (args.maxTokens ?? 800),
          reasoning: raciocinioObrigatorio ? { effort: "low" } : { enabled: args.raciocinio ?? false },
          // Sem `temperature`: os modelos Claude 5.x não aceitam o parâmetro e, com
          // provider.require_parameters, o OpenRouter filtra todos os provedores (404).
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: { name: args.nomeSchema, strict: true, schema: paraJsonSchema(args.schema) },
          },
          // Só provedores que suportam saída estruturada.
          provider: { require_parameters: true },
        });
      let corpo = montarCorpo(exigemRaciocinio.has(modelo) && !args.raciocinio);

      let ultimo: ErroLlm | null = null;
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        if (tentativa > 0) {
          const restante = timeoutPadrao - (Date.now() - inicio);
          if (restante < ORCAMENTO_MINIMO_RETRY_MS) break;
          await esperar(ESPERA_RETRY_MS);
        }
        let res: Response;
        try {
          res = await chamar(URL_OPENROUTER, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              Authorization: `Bearer ${chave}`,
              "X-Title": "convergechallenge-agente",
            },
            body: corpo,
            signal: sinal,
          });
        } catch {
          // Mensagem do fetch pode conter detalhes da requisição: não repassamos.
          if (args.sinal?.aborted) throw new ErroLlm("abortado", "requisição abortada pelo chamador");
          if (orcamento.aborted) {
            log("llm_timeout", { modelo, ms: Date.now() - inicio });
            throw new ErroLlm("timeout", `LLM passou de ${timeoutPadrao}ms`);
          }
          ultimo = new ErroLlm("rede", "falha de rede ao chamar o LLM");
          log("llm_rede", { modelo, tentativa, ms: Date.now() - inicio });
          continue;
        }

        if (!res.ok) {
          log("llm_http", { modelo, status: res.status, tentativa, ms: Date.now() - inicio });
          const detalhe = await detalheDoErro(res);
          ultimo = new ErroLlm("http", `LLM respondeu HTTP ${res.status}${detalhe}`, res.status);
          if (res.status === 400 && /reasoning is mandatory/i.test(detalhe) && !exigemRaciocinio.has(modelo)) {
            exigemRaciocinio.add(modelo);
            corpo = montarCorpo(true);
            log("llm_raciocinio_obrigatorio", { modelo });
            continue;
          }
          if (res.status === 429 || res.status >= 500) continue;
          throw ultimo;
        }

        let json: RespostaOpenRouter;
        try {
          json = (await res.json()) as RespostaOpenRouter;
        } catch {
          if (orcamento.aborted) throw new ErroLlm("timeout", `LLM passou de ${timeoutPadrao}ms`);
          throw new ErroLlm("invalido", "resposta do LLM não é JSON");
        }
        const conteudo = json.choices?.[0]?.message?.content;
        if (typeof conteudo !== "string" || !conteudo.trim()) {
          throw new ErroLlm("invalido", "resposta do LLM sem conteúdo");
        }
        let bruto: unknown;
        try {
          bruto = JSON.parse(tirarCercaDeCodigo(conteudo));
        } catch {
          throw new ErroLlm("invalido", "conteúdo do LLM não é JSON válido");
        }
        const validado = args.schema.safeParse(bruto);
        if (!validado.success) {
          const campos = validado.error.issues.map((i) => i.path.join(".") || "(raiz)").join(", ");
          throw new ErroLlm("invalido", `saída do LLM fora do schema (${campos})`);
        }
        const ms = Date.now() - inicio;
        const u = json.usage;
        return {
          dados: validado.data,
          uso: u
            ? {
                entrada: u.prompt_tokens ?? 0,
                saida: u.completion_tokens ?? 0,
                cache: u.prompt_tokens_details?.cached_tokens,
                ...(typeof u.cost === "number" ? { custo: u.cost } : {}),
              }
            : undefined,
          ms,
        };
      }
      throw ultimo ?? new ErroLlm("rede", "falha ao chamar o LLM");
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Falso (testes e harness sem chave)
// ---------------------------------------------------------------------------------------------

/** Uma resposta pronta, um Error (a chamada falha) ou uma função que decide pelos argumentos. */
export type RespostaFalsa = unknown | Error | ((args: LlmArgs<unknown>) => unknown);

export type ClienteFalso = LlmCliente & { chamadas: LlmArgs<unknown>[] };

/**
 * Cliente falso. `respostas` é uma fila (cada chamada consome uma; a última se repete) ou uma
 * função única. A saída passa pelo schema, como no cliente real.
 */
export function criarClienteFalso(
  respostas: RespostaFalsa[] | ((args: LlmArgs<unknown>) => unknown),
): ClienteFalso {
  const chamadas: LlmArgs<unknown>[] = [];
  let i = 0;
  return {
    chamadas,
    async completarJson<T>(args: LlmArgs<T>): Promise<LlmResultado<T>> {
      chamadas.push(args as LlmArgs<unknown>);
      let item: unknown;
      if (typeof respostas === "function") item = respostas(args as LlmArgs<unknown>);
      else {
        if (respostas.length === 0) throw new ErroLlm("invalido", "cliente falso sem respostas");
        item = respostas[Math.min(i++, respostas.length - 1)];
        if (typeof item === "function") item = (item as (a: LlmArgs<unknown>) => unknown)(args as LlmArgs<unknown>);
      }
      if (item instanceof Error) throw item;
      const validado = args.schema.safeParse(item);
      if (!validado.success) throw new ErroLlm("invalido", "saída do LLM fora do schema");
      return { dados: validado.data, ms: 1 };
    },
  };
}
