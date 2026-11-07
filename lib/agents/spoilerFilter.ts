/**
 * Filtro de spoilers: checa cada pergunta do Analyst antes de ela entrar na fila.
 * Usa o modelo "fast". Se o filtro falhar, deixa passar (não trava a entrevista).
 */
import { z } from "zod";
import { completeJson } from "@/lib/llm";

const FilterVerdict = z.object({ safe: z.boolean(), reason: z.string() });

const SYSTEM = `Você revisa perguntas que um entrevistador técnico vai fazer a um candidato durante uma entrevista de programação.
Você recebe a PERGUNTA, o TIPO dela e, separado, o TEMA que o entrevistador pode aprofundar depois. O tema não é uma segunda pergunta.
Decida se o conjunto é SEGURO ou INSEGURO.

Tipos: "explicar" (justificar uma decisão), "sondar" (pergunta direta sobre complexidade, casos de borda etc.) e "desafio" (o código do candidato já funciona e o entrevistador pede para ele melhorar).

É INSEGURO só se cair claramente numa destas categorias:
- afirma ou insinua que existe um erro ("você notou que…", "há algum problema em…", "por que X está aí se não é usado?").
- dá uma entrada concreta que expõe um bug ("testa com [3, 2, 4]").
- sugere a solução, um algoritmo ou uma estrutura de dados que NEM o código NEM as falas do candidato mencionam ("dá pra usar um dicionário?"). Citar o que já está no código ou o que ele mesmo disse é SEGURO.
- pede para o candidato bolar testes ou escolher entradas ("como você testaria?", "que entradas usaria?").
- a PERGUNTA em si pede duas coisas diferentes.
- fora do tipo "desafio", insinua que existe uma alternativa melhor ("em vez de alguma alternativa", "não teria um jeito mais rápido?").
- o TEMA cita o erro, o caso que quebra ou a solução.

No tipo "desafio", pedir para melhorar é o objetivo e é SEGURO ("Dá pra melhorar a complexidade de tempo disso?", "Consegue fazer em uma passada só?", "E se o array tiver um milhão de itens, dá pra ser mais rápido?"). Continua INSEGURO se disser COMO melhorar: nomear estrutura de dados, algoritmo ou técnica ("com um dicionário", "ordenando antes", "com dois ponteiros", "usando hash").

Pedir para explicar ou justificar uma decisão do candidato é SEGURO, mesmo que essa decisão seja justamente onde está o erro: o candidato precisa descobrir sozinho. Perguntar sobre cenário genérico (entrada grande, entrada vazia) também é SEGURO. Na dúvida, SEGURO.

Perguntas de PROCESSO sobre o jeito de trabalhar do candidato (como prioriza com pouco tempo, o que faz quando trava, como pensaria em escala, como usa e confere uma ferramenta de IA) também são SEGURAS, desde que não toquem no erro nem na solução do problema.

Exemplos SEGUROS:
- "Com o tempo que resta, como você decide o que fazer primeiro?"
- "Quando você trava num problema, o que costuma fazer pra destravar?"
- "Se você usasse um assistente de IA aqui, como conferiria o que ele devolve?"
- "Por que você escolheu esse caminho?"
- "Me explica o que esse trecho faz."
- "Me explica o que esse return dentro dos loops está fazendo."
- "Me fala um pouco desse loop. Por que o j começa onde começa?"
- "E quando não tiver entrada nenhuma? Por que ele vai funcionar?"

Exemplos INSEGUROS:
- "Você notou que o loop interno começa em zero?"
- "Por que o dicionário está aí se os loops não usam ele?"
- "Testa com nums = [3, 2, 4] e target = 6, o que acontece?"
- "Dá pra resolver isso com um dicionário de complementos?"
- "Como você testaria isso? Que entradas usaria?"
- PERGUNTA "Por que o j começa onde começa?" com TEMA "o que acontece quando i e j caem no mesmo elemento" — a pergunta é boa, mas o tema entrega o bug.

Responda SOMENTE com um objeto JSON, sem markdown: {"safe": boolean, "reason": string}. O reason tem no máximo uma frase.`;

export async function checkQuestion(
  question: string,
  followUpTopic: string,
  kind: "explicar" | "sondar" | "desafio" = "explicar",
  context: { code: string; candidateSaid: string[] } = { code: "", candidateSaid: [] },
): Promise<{ safe: boolean; reason: string; costUsd: number }> {
  try {
    const result = await completeJson({
      role: "fast",
      system: SYSTEM,
      user: `CÓDIGO DO CANDIDATO:\n${context.code || "(vazio)"}\n\nO QUE O CANDIDATO JÁ DISSE:\n${context.candidateSaid.length ? context.candidateSaid.join("\n") : "(nada)"}\n\nPERGUNTA: ${question}\nTIPO: ${kind}\nTEMA para aprofundar depois: ${followUpTopic}`,
      schema: FilterVerdict,
    });
    return { safe: result.data.safe, reason: result.data.reason, costUsd: result.costUsd };
  } catch (err) {
    console.warn("[spoilerFilter] indisponível, deixando a pergunta passar:", errorMessage(err));
    return { safe: true, reason: "filtro indisponível", costUsd: 0 };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const REPLY_SYSTEM = `Você revisa a fala de um entrevistador técnico ANTES de ela chegar ao candidato, numa entrevista de programação.
Você recebe a FALA e as últimas falas do candidato. Decida se a fala é SEGURA ou INSEGURA.

É INSEGURA só se cair claramente numa destas categorias:
- aponta um erro, ou descreve o que o código faz de errado ("mas aí ele vai comparar o número com ele mesmo", "isso não trata repetidos").
- dá uma entrada concreta que expõe um bug ("e com [3, 3]?", "olha quando i e j são iguais").
- diz a solução, o algoritmo ou a estrutura de dados que NEM o código NEM as falas do candidato mencionam ("dá pra usar um dicionário").
- confirma que a resposta está CERTA ou elogia ("isso", "exato", "isso mesmo", "correto", "boa justificativa", "perfeito", "ótimo", "código bem enxuto").

É SEGURA:
- reconhecer de forma neutra, mesmo ao encerrar: "Entendi.", "Faz sentido.", "Beleza.", "Tá.", "Entendi seu raciocínio.", "Pode seguir.", "Fica à vontade." (isso NÃO é confirmar acerto).
- repetir com as palavras do candidato o que ELE já disse ("você falou de um hash map, por que ele ajuda?").
- citar o que já está no CÓDIGO do candidato ("esse dicionário", "o loop interno").
- citar o resultado dos testes visíveis, que o candidato já vê na tela ("os testes passaram", "rodou tudo"). Isso não é confirmar que a solução está certa.
- perguntar sobre cenários GENÉRICOS: array vazio, sem par, números repetidos, negativos, zero, entrada muito grande.
- pedir para explicar ou justificar; pedir para melhorar a complexidade sem dizer como.
- oferecer ou dar a DICA OFICIAL (texto abaixo), mesmo que ela fale de "estrutura de dados" de forma genérica.
Na dúvida, SEGURA.

Responda SOMENTE com JSON: {"safe": boolean, "reason": string}. O reason tem no máximo uma frase.`;

/** Confere a fala do entrevistador antes de ela sair. Se o filtro falhar, deixa passar. */
export async function checkReply(
  reply: string,
  candidateLines: string[],
  officialHint?: string,
  code?: string,
): Promise<{ safe: boolean; reason: string; costUsd: number }> {
  try {
    const result = await completeJson({
      role: "fast",
      system: REPLY_SYSTEM,
      user: `DICA OFICIAL (permitida): ${officialHint ?? "(nenhuma)"}\n\nCÓDIGO DO CANDIDATO:\n${code || "(vazio)"}\n\nÚLTIMAS FALAS DO CANDIDATO:\n${candidateLines.length ? candidateLines.join("\n") : "(nenhuma)"}\n\nFALA DO ENTREVISTADOR: ${reply}`,
      schema: FilterVerdict,
    });
    return { safe: result.data.safe, reason: result.data.reason, costUsd: result.costUsd };
  } catch (err) {
    console.warn("[spoilerFilter] filtro de fala indisponível, deixando passar:", errorMessage(err));
    return { safe: true, reason: "filtro indisponível", costUsd: 0 };
  }
}
