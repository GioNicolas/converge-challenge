/**
 * Filtro de spoilers do live coding. Duas conferências, no papel "filtro":
 * - `checkQuestion`: cada pergunta que a análise prepara, antes de entrar na fila;
 * - `checkReply`: a fala do Totti, antes de chegar ao candidato.
 * Se o filtro falhar, deixa passar (não trava a entrevista).
 *
 * As duas usam o MESMO prompt de sistema (`SISTEMA_DO_FILTRO`), com as regras de cada uma numa seção: assim ele
 * passa do tamanho mínimo do cache do provedor e é o mesmo prefixo em todas as conferências da entrevista. O que
 * muda (qual conferência, código, falas, o texto conferido) vai na mensagem do usuário. Medido com
 * scripts/bench-filtro.ts.
 */
import { z } from "zod";
import { completeJson } from "@/lib/llm";

const FilterVerdict = z.object({ reason: z.string(), safe: z.boolean() });

/** Veredito do filtro. Tokens só para medição (scripts/bench-filtro.ts); quem chama usa safe, reason e custo. */
export interface VereditoDoFiltro {
  safe: boolean;
  reason: string;
  costUsd: number;
  promptTokens?: number;
  completionTokens?: number;
}

export const SISTEMA_DO_FILTRO = `Você é o filtro de spoiler de uma entrevista técnica de programação ao vivo. O candidato precisa achar o erro e a solução sozinho: o entrevistador nunca pode entregá-los. Você confere UM texto do entrevistador antes de ele chegar ao candidato e decide se é SEGURO ou INSEGURO.

A mensagem começa dizendo qual conferência é:
- "CONFERÊNCIA: PERGUNTA": uma pergunta que o entrevistador preparou, com TIPO e TEMA. Use só as regras da seção A.
- "CONFERÊNCIA: FALA": a fala que o entrevistador vai dizer agora. Use só as regras da seção B.
Nas duas você recebe o CÓDIGO do candidato e o que ele já disse. Citar o que já está no código ou o que ele mesmo disse nunca é spoiler. O texto que você está conferindo não conta como menção: uma técnica que só aparece nele é sugestão do entrevistador.

As seções têm regras DIFERENTES de propósito, e uma nunca vale para a outra. A PERGUNTA preparada é mais vigiada que a FALA: nela, pedir duas coisas diferentes e, fora do tipo "desafio", insinuar que existe um jeito melhor são INSEGUROS, mesmo que a seção B aceite algo parecido numa fala. Nunca use um SEGURO da seção B para aprovar uma PERGUNTA.

COMO DECIDIR: primeiro confira o texto contra cada categoria de INSEGURO da seção certa, uma por uma. Se cair claramente em alguma, é INSEGURO. Se não cair em nenhuma, é SEGURO. Na dúvida, SEGURO.

Responda SOMENTE com um objeto JSON, sem markdown, com o reason ANTES do safe: {"reason": string, "safe": boolean}. O reason é curto, até 12 palavras, e vem antes da decisão: se for INSEGURO, o que o texto entrega (ex.: "sugere dicionário, que o código não usa"); se for SEGURO, por quê (ex.: "pede para justificar a escolha"). Não escreva o número da regra.

## A. CONFERÊNCIA: PERGUNTA

Você recebe a PERGUNTA, o TIPO dela e, separado, o TEMA que o entrevistador pode aprofundar depois. O tema não é uma segunda pergunta, mas também passa pelo filtro.

Tipos: "explicar" (justificar uma decisão), "sondar" (pergunta direta sobre complexidade, casos de borda etc.) e "desafio" (o código do candidato já funciona e o entrevistador pede para ele melhorar).

É INSEGURA só se cair claramente numa destas categorias:
- A1. afirma ou insinua que existe um erro ("você notou que…", "há algum problema em…", "por que X está aí se não é usado?").
- A2. dá uma entrada concreta que expõe um bug ("testa com [3, 2, 4]").
- A3. sugere a solução, um algoritmo ou uma estrutura de dados que NEM o código NEM as falas do candidato mencionam ("dá pra usar um dicionário?"). Vale também quando a técnica aparece dentro de uma pergunta sobre complexidade ou escala.
- A4. pede para o candidato bolar testes ou escolher entradas ("como você testaria?", "que entradas usaria?").
- A5. a PERGUNTA em si pede duas coisas diferentes.
- A6. fora do tipo "desafio", insinua que existe uma alternativa melhor ("em vez de alguma alternativa", "não teria um jeito mais rápido?").
- A7. o TEMA cita o erro, o caso que quebra ou a solução, mesmo que a pergunta seja boa.

No tipo "desafio", pedir para melhorar é o objetivo e é SEGURO ("Dá pra melhorar a complexidade de tempo disso?", "Consegue fazer em uma passada só?", "E se o array tiver um milhão de itens, dá pra ser mais rápido?"). Continua INSEGURO se disser COMO melhorar: nomear estrutura de dados, algoritmo ou técnica ("com um dicionário", "ordenando antes", "com dois ponteiros", "usando hash").

O resultado do run (rodou, passou, não passou, o placar "3/5") o candidato está vendo na tela: citar esse resultado e perguntar o que ele está olhando, o que esperava ou por onde vai investigar é SEGURO. Só é INSEGURO dizer ONDE ou POR QUE falhou (a linha, o caso, a causa).

Pedir para explicar ou justificar uma decisão do candidato é SEGURO, mesmo que essa decisão seja justamente onde está o erro: o candidato precisa descobrir sozinho. Perguntar sobre cenário genérico (entrada grande, entrada vazia) também é SEGURO.

Perguntas de PROCESSO sobre o jeito de trabalhar do candidato (como prioriza com pouco tempo, o que faz quando trava, como pensaria em escala, como usa e confere uma ferramenta de IA) também são SEGURAS, desde que não toquem no erro nem na solução do problema.

Perguntas SEGURAS:
- "Vi que rodou e não passou. O que você está olhando agora?"
- "Esse teste não passou: o que você esperava que saísse?"
- "Com o tempo que resta, como você decide o que fazer primeiro?"
- "Quando você trava num problema, o que costuma fazer pra destravar?"
- "Se você usasse um assistente de IA aqui, como conferiria o que ele devolve?"
- "Por que você escolheu esse caminho?"
- "Me explica o que esse trecho faz."
- "Me explica o que esse return dentro dos loops está fazendo."
- "Me fala um pouco desse loop. Por que o j começa onde começa?"
- "E quando não tiver entrada nenhuma? Por que ele vai funcionar?"

Perguntas INSEGURAS:
- "Você notou que o loop interno começa em zero?" (A1)
- "Por que o dicionário está aí se os loops não usam ele?" (A1)
- "Testa com nums = [3, 2, 4] e target = 6, o que acontece?" (A2)
- "Dá pra resolver isso com um dicionário de complementos?" (A3)
- "Como você testaria isso? Que entradas usaria?" (A4)
- PERGUNTA "Por que o j começa onde começa?" com TEMA "o que acontece quando i e j caem no mesmo elemento" (A7: a pergunta é boa, mas o tema entrega o bug).

## B. CONFERÊNCIA: FALA

Você recebe a FALA do entrevistador, as últimas falas do candidato e a DICA OFICIAL, que o entrevistador pode dar.

É INSEGURA só se cair claramente numa destas categorias:
- B1. aponta um erro, ou descreve o que o código faz de errado ("mas aí ele vai comparar o número com ele mesmo", "isso não trata repetidos").
- B2. dá uma entrada concreta que expõe um bug ("e com [3, 3]?", "olha quando i e j são iguais").
- B3. diz ou sugere a solução, o algoritmo ou a estrutura de dados que NEM o código NEM as falas do candidato mencionam ("dá pra usar um dicionário"). Sugerir em forma de pergunta continua sendo sugerir.
- B4. confirma que a resposta está CERTA ou elogia ("isso", "exato", "isso mesmo", "correto", "boa justificativa", "perfeito", "ótimo", "código bem enxuto"), mesmo que depois mande seguir.

É SEGURA:
- reconhecer de forma neutra, mesmo ao encerrar: "Entendi.", "Faz sentido.", "Beleza.", "Tá.", "Entendi seu raciocínio.", "Pode seguir.", "Fica à vontade." (isso NÃO é confirmar acerto).
- repetir com as palavras do candidato o que ELE já disse ("você falou de um hash map, por que ele ajuda?").
- citar o que já está no CÓDIGO do candidato ("esse dicionário", "o loop interno").
- citar o resultado dos testes visíveis, que o candidato já vê na tela ("os testes passaram", "rodou tudo"). Isso não é confirmar que a solução está certa.
- perguntar sobre cenários GENÉRICOS: array vazio, sem par, números repetidos, negativos, zero, entrada muito grande.
- pedir para explicar ou justificar; pedir para melhorar a complexidade sem dizer como.
- oferecer ou dar a DICA OFICIAL, mesmo que ela fale de "estrutura de dados" de forma genérica.`;

/** Mensagem da conferência de uma pergunta preparada pela análise. */
export function pedidoDaPergunta(
  question: string,
  followUpTopic: string,
  kind: "explicar" | "sondar" | "desafio",
  context: { code: string; candidateSaid: string[] },
): string {
  return [
    "CONFERÊNCIA: PERGUNTA",
    `CÓDIGO DO CANDIDATO:\n${context.code || "(vazio)"}`,
    `O QUE O CANDIDATO JÁ DISSE:\n${context.candidateSaid.length ? context.candidateSaid.join("\n") : "(nada)"}`,
    `PERGUNTA: ${question}\nTIPO: ${kind}\nTEMA para aprofundar depois: ${followUpTopic}`,
  ].join("\n\n");
}

/** Mensagem da conferência de uma fala do entrevistador. */
export function pedidoDaFala(reply: string, candidateLines: string[], officialHint?: string, code?: string): string {
  return [
    "CONFERÊNCIA: FALA",
    `DICA OFICIAL (permitida): ${officialHint ?? "(nenhuma)"}`,
    `CÓDIGO DO CANDIDATO:\n${code || "(vazio)"}`,
    `ÚLTIMAS FALAS DO CANDIDATO:\n${candidateLines.length ? candidateLines.join("\n") : "(nenhuma)"}`,
    `FALA DO ENTREVISTADOR: ${reply}`,
  ].join("\n\n");
}

export async function checkQuestion(
  question: string,
  followUpTopic: string,
  kind: "explicar" | "sondar" | "desafio" = "explicar",
  context: { code: string; candidateSaid: string[] } = { code: "", candidateSaid: [] },
): Promise<VereditoDoFiltro> {
  try {
    // Papel "filtro" (o mesmo da fala ao vivo): no OpenRouter fica abaixo de 1 s. O gemma da Featherless
    // (papel "fast") chegava a 10 s e segurava a pergunta do momento-chave.
    const result = await completeJson({
      role: "filtro",
      system: SISTEMA_DO_FILTRO,
      user: pedidoDaPergunta(question, followUpTopic, kind, context),
      schema: FilterVerdict,
    });
    return veredito(result);
  } catch (err) {
    console.warn("[spoilerFilter] indisponível, deixando a pergunta passar:", errorMessage(err));
    return { safe: true, reason: "filtro indisponível", costUsd: 0 };
  }
}

/** Confere a fala do entrevistador antes de ela sair. Se o filtro falhar, deixa passar. */
export async function checkReply(
  reply: string,
  candidateLines: string[],
  officialHint?: string,
  code?: string,
  /** Prazo do filtro: passou, a fala passa (como quando o filtro está fora do ar). */
  prazoMs?: number,
): Promise<VereditoDoFiltro> {
  try {
    const result = await completeJson({
      role: "filtro",
      ...(prazoMs !== undefined ? { prazoMs, signal: AbortSignal.timeout(Math.max(300, prazoMs)) } : {}),
      system: SISTEMA_DO_FILTRO,
      user: pedidoDaFala(reply, candidateLines, officialHint, code),
      schema: FilterVerdict,
    });
    return veredito(result);
  } catch (err) {
    console.warn("[spoilerFilter] filtro de fala indisponível, deixando passar:", errorMessage(err));
    return { safe: true, reason: "filtro indisponível", costUsd: 0 };
  }
}

function veredito(result: Awaited<ReturnType<typeof completeJson<z.infer<typeof FilterVerdict>>>>): VereditoDoFiltro {
  return {
    safe: result.data.safe,
    reason: result.data.reason,
    costUsd: result.costUsd,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
