/**
 * Filtro de spoilers: checa cada pergunta do Analyst antes de ela entrar na fila.
 * Usa o modelo "fast". Se o filtro falhar, deixa passar (não trava a entrevista).
 */
import { z } from "zod";
import { completeJson } from "@/lib/llm";

const FilterVerdict = z.object({ safe: z.boolean(), reason: z.string() });

const SYSTEM = `Você revisa perguntas que um entrevistador técnico vai fazer a um candidato durante uma entrevista de programação.
Você recebe a PERGUNTA e, separado, o TEMA que o entrevistador pode aprofundar depois. O tema não é uma segunda pergunta.
Decida se o conjunto é SEGURO ou INSEGURO.

É INSEGURO só se cair claramente numa destas categorias:
- afirma ou insinua que existe um erro ("você notou que…", "há algum problema em…", "por que X está aí se não é usado?").
- dá uma entrada concreta que expõe um bug ("testa com [3, 2, 4]").
- sugere a solução, um algoritmo ou uma estrutura de dados ("dá pra usar um dicionário?").
- pede para o candidato bolar testes ou escolher entradas ("como você testaria?", "que entradas usaria?").
- a PERGUNTA em si pede duas coisas diferentes.
- insinua que existe uma alternativa melhor ("em vez de alguma alternativa", "não teria um jeito mais rápido?").
- o TEMA cita o erro, o caso que quebra ou a solução.

Pedir para explicar ou justificar uma decisão do candidato é SEGURO, mesmo que essa decisão seja justamente onde está o erro: o candidato precisa descobrir sozinho. Perguntar sobre cenário genérico (entrada grande, entrada vazia) também é SEGURO. Na dúvida, SEGURO.

Exemplos SEGUROS:
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
): Promise<{ safe: boolean; reason: string; costUsd: number }> {
  try {
    const result = await completeJson({
      role: "fast",
      system: SYSTEM,
      user: `PERGUNTA: ${question}\nTEMA para aprofundar depois: ${followUpTopic}`,
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
