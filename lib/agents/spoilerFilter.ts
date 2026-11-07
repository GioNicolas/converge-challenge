/**
 * Filtro de spoilers: checa cada pergunta do Analyst antes de ela entrar na fila.
 * Usa o modelo "fast". Se o filtro falhar, deixa passar (não trava a entrevista).
 */
import { z } from "zod";
import { completeJson } from "@/lib/llm";

const FilterVerdict = z.object({ safe: z.boolean(), reason: z.string() });

const SYSTEM = `Você revisa perguntas que um entrevistador técnico vai fazer a um candidato durante uma entrevista de programação.
Decida se a pergunta é SEGURA ou INSEGURA.

É INSEGURA se:
- insinua que existe um erro ("você notou que…", "há algum problema em…").
- dá uma entrada concreta que expõe um bug ("testa com [3, 2, 4]").
- sugere a solução, um algoritmo ou uma estrutura de dados ("dá pra usar um dicionário?").
- pede para o candidato bolar testes ou escolher entradas ("como você testaria?", "que entradas usaria?").
- faz duas perguntas numa só.

É SEGURA se:
- só pede para explicar ou justificar decisões que o candidato já tomou.
- pergunta sobre um cenário genérico, como entrada grande ou entrada vazia.

Só marque como insegura quando a pergunta cair numa das categorias acima.

Exemplos SEGURAS:
- "Por que você escolheu esse caminho?"
- "Me explica o que esse trecho faz."
- "E quando não tiver entrada nenhuma? Por que ele vai funcionar?"

Exemplos INSEGURAS:
- "Você notou que o loop interno começa em zero?"
- "Testa com nums = [3, 2, 4] e target = 6, o que acontece?"
- "Dá pra resolver isso com um dicionário de complementos?"
- "Como você testaria isso? Que entradas usaria?"

Responda SOMENTE com um objeto JSON, sem markdown: {"safe": boolean, "reason": string}. O reason tem no máximo uma frase.`;

export async function checkQuestion(
  question: string,
): Promise<{ safe: boolean; reason: string; costUsd: number }> {
  try {
    const result = await completeJson({
      role: "fast",
      system: SYSTEM,
      user: `Pergunta: ${question}`,
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
