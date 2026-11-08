/**
 * Cliente mínimo de LLM, sem dependência nova. Fala a API compatível com OpenAI de dois provedores:
 *  - Featherless (principal): chave em `FEATHERLESS_API_KEY`.
 *  - OpenRouter (plano B): chave em `OPENROUTER_API_KEY`.
 * Só roda no servidor.
 */

const URLS = {
  featherless: "https://api.featherless.ai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;

const CHAVES = {
  featherless: "FEATHERLESS_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
} as const;

export type Provedor = keyof typeof URLS;

/** Esperas entre tentativas quando o provedor responde 503 (modelo frio ou cheio). */
const ESPERAS_503_MS = [2000, 4000];
/** Tempo máximo por tentativa HTTP. */
const TIMEOUT_PADRAO_MS = 60_000;
/**
 * Alvo que falhou de forma recuperável (timeout, 5xx, 429, rede) fica de fora por este tempo: sem isso, cada chamada
 * esperava o timeout inteiro dele (15 s na extração) antes de cair no próximo, que responde em 2 s.
 */
const DESCANSO_MS = 2 * 60_000;
/** Até quando cada alvo (`provedor/modelo`) fica de fora. Por instância do servidor. */
const descansoAte = new Map<string, number>();
const chaveAlvo = (a: Alvo) => `${a.provedor}/${a.model}`;

export interface Mensagem {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Um provedor + modelo da lista ordenada de tentativas. */
export interface Alvo {
  provedor: Provedor;
  model: string;
  /** Campos extras mesclados no corpo do request deste alvo (ex.: desligar o raciocínio). */
  extraBody?: Record<string, unknown>;
  /** Timeout só deste alvo; se ausente, vale o `timeoutMs` geral. */
  timeoutMs?: number;
}

export interface ChatOpcoes {
  /** Alvos em ordem de preferência. Passa para o próximo só em falha recuperável. */
  alvos: Alvo[];
  messages: Mensagem[];
  /**
   * Modelos de raciocínio gastam tokens pensando antes de responder: com `max_tokens`
   * baixo o `content` vem vazio.
   */
  maxTokens?: number;
  temperature?: number;
  /** Timeout por tentativa HTTP, em ms. */
  timeoutMs?: number;
}

/** Uma tentativa contra um provedor/modelo. Quem não respondeu traz `erro`. */
export interface Tentativa {
  provedor: Provedor;
  model: string;
  ms: number;
  erro?: string;
}

export interface ChatResposta {
  /** Resposta crua do modelo, sem o trim de espaços das bordas. */
  content: string;
  /** Tempo total, somando todas as tentativas e alvos. */
  ms: number;
  /** Provedor e modelo que de fato responderam. */
  provedor: Provedor;
  model: string;
  /** Todas as tentativas, na ordem: as que falharam antes da que respondeu. */
  tentativas: Tentativa[];
}

/** Nenhum alvo respondeu (ou um alvo falhou sem recuperação). Carrega as tentativas feitas. */
export class ErroChat extends Error {
  constructor(
    mensagem: string,
    readonly tentativas: Tentativa[],
  ) {
    super(mensagem);
    this.name = "ErroChat";
  }
}

interface RespostaChat {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
}

/** Falha que justifica tentar o próximo alvo: 503 persistente, 429, 5xx, timeout, rede ou chave ausente. */
class FalhaRecuperavel extends Error {}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tentarAlvo(
  alvo: Alvo,
  o: Required<Pick<ChatOpcoes, "messages" | "maxTokens" | "timeoutMs">> & Pick<ChatOpcoes, "temperature">,
): Promise<string> {
  const chave = process.env[CHAVES[alvo.provedor]];
  if (!chave) throw new FalhaRecuperavel(`${CHAVES[alvo.provedor]} não definida`);

  const limite = alvo.timeoutMs ?? o.timeoutMs;
  for (let tentativa = 0; ; tentativa++) {
    let res: Response;
    let corpo: string;
    // Cabeçalhos e corpo entram no mesmo try: o timeout pode disparar durante a leitura do corpo.
    try {
      res = await fetch(URLS[alvo.provedor], {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
        body: JSON.stringify({
          model: alvo.model,
          messages: o.messages,
          max_tokens: o.maxTokens,
          temperature: o.temperature,
          ...alvo.extraBody,
        }),
        signal: AbortSignal.timeout(limite),
      });
      if (res.status === 503 && tentativa < ESPERAS_503_MS.length) {
        await esperar(ESPERAS_503_MS[tentativa]);
        continue;
      }
      corpo = await res.text();
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new FalhaRecuperavel(`sem resposta completa em ${limite} ms`);
      }
      // Erro de rede ou corpo interrompido (fetch e o stream lançam TypeError).
      throw new FalhaRecuperavel(`erro de rede: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (res.status === 429 || res.status >= 500) throw new FalhaRecuperavel(`HTTP ${res.status}: ${corpo.slice(0, 300)}`);
    // 4xx que não seja 429 é erro nosso (request malformado, chave, modelo): não adianta trocar de provedor.
    if (!res.ok) throw new Error(`${alvo.provedor} HTTP ${res.status} (${alvo.model}): ${corpo.slice(0, 500)}`);

    let json: RespostaChat;
    try {
      json = JSON.parse(corpo) as RespostaChat;
    } catch {
      throw new FalhaRecuperavel(`corpo não é JSON válido (${corpo.length} caracteres)`);
    }
    const escolha = json.choices?.[0];
    const content = escolha?.message?.content?.trim() ?? "";
    if (!content) {
      throw new Error(
        `${alvo.provedor} devolveu content vazio (${alvo.model}, finish_reason=${escolha?.finish_reason ?? "?"}). Se for raciocínio, aumente maxTokens.`,
      );
    }
    return content;
  }
}

/** Tenta cada alvo em ordem. Erro recuperável passa para o próximo; os demais saem direto. */
export async function chat({
  alvos,
  messages,
  maxTokens = 4000,
  temperature,
  timeoutMs = TIMEOUT_PADRAO_MS,
}: ChatOpcoes): Promise<ChatResposta> {
  if (alvos.length === 0) throw new ErroChat("chat: nenhum alvo configurado", []);
  const inicio = Date.now();
  const tentativas: Tentativa[] = [];
  const falhas: string[] = [];
  // Alvos em descanso ficam de fora; se todos estiverem, tenta todos (melhor tentar do que falhar sem tentar).
  const agora = Date.now();
  const disponiveis = alvos.filter((a) => (descansoAte.get(chaveAlvo(a)) ?? 0) <= agora);

  for (const alvo of disponiveis.length > 0 ? disponiveis : alvos) {
    const inicioAlvo = Date.now();
    try {
      const content = await tentarAlvo(alvo, { messages, maxTokens, timeoutMs, temperature });
      const ms = Date.now() - inicioAlvo;
      descansoAte.delete(chaveAlvo(alvo));
      tentativas.push({ provedor: alvo.provedor, model: alvo.model, ms });
      return { content, ms: Date.now() - inicio, provedor: alvo.provedor, model: alvo.model, tentativas };
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      tentativas.push({ provedor: alvo.provedor, model: alvo.model, ms: Date.now() - inicioAlvo, erro: mensagem });
      // Erro não recuperável (ex.: 4xx que não é 429): não adianta tentar o próximo alvo.
      if (!(err instanceof FalhaRecuperavel)) throw new ErroChat(mensagem, tentativas);
      descansoAte.set(chaveAlvo(alvo), Date.now() + DESCANSO_MS);
      falhas.push(`${alvo.provedor}/${alvo.model}: ${mensagem}`);
    }
  }
  throw new ErroChat(`nenhum provedor respondeu. ${falhas.join(" | ")}`, tentativas);
}

/** Houve fallback quando alguma tentativa anterior falhou antes da que respondeu. */
export function houveFallback(tentativas: Tentativa[]): boolean {
  return tentativas.some((t) => t.erro !== undefined);
}

/** Pega o objeto JSON de uma resposta do modelo, tirando cercas de código e texto em volta. */
export function extrairJson(texto: string): unknown {
  const semCerca = texto.replace(/```(?:json)?/gi, "");
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) throw new Error(`Nenhum objeto JSON na resposta: ${texto.slice(0, 200)}`);
  return JSON.parse(semCerca.slice(inicio, fim + 1));
}
