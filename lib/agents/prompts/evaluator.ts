/**
 * Prompt do Evaluator. O system descreve a vaga, a rubrica e o gabarito; o user traz a sessão inteira.
 * O critério objetivo (corretude) vem calculado pelos testes escondidos: o LLM só julga o resto.
 */
import type { InterviewConfig } from "@/lib/contracts";
import type { Problem } from "@/lib/problems/types";
import { buildVagaContext } from "./vaga";

/** Escala pelo que aconteceu quando o critério foi explorado; o "bom" de cada critério vem do pacote do problema. */
const SCALE = `4 — Mostrou por conta própria e certo; ou respondeu certo e com profundidade quando perguntado sobre um aspecto secundário (ex.: custo de memória).
3 — Respondeu certo quando perguntado, com pequenas lacunas.
2 — Respondeu em parte ou raso; ou chegou lá só com dica.
1 — Errou ou não conseguiu, mesmo com aprofundamento.
Se o critério teve várias sondagens, pese a mais importante (ex.: num desafio de otimização, o que aconteceu no retorno pesa mais que a primeira resposta).`;

export function buildEvaluatorSystem(config: InterviewConfig, problem: Problem, judgedIds: string[]): string {
  const judged = config.criteria.filter((c) => judgedIds.includes(c.id));
  const criteria = judged
    .map((c) => {
      const good = problem.private.rubricNotes[c.id];
      return `- ${c.id}: ${c.name} — ${c.description}${good ? `\n  ${good}` : ""}`;
    })
    .join("\n");
  const approaches = problem.private.approaches
    .map((a) => `- ${a.name} (${a.time} tempo, ${a.space} memória): ${a.description}`)
    .join("\n");
  const mistakes = problem.private.commonMistakes.map((m) => `- ${m}`).join("\n");

  return `Você é o avaliador de uma entrevista técnica para a vaga "${config.roleTitle}" (${config.seniority}).
A entrevista acabou. Você lê a sessão inteira e dá a nota de cada critério para a recrutadora. Você nunca fala com o candidato.

${buildVagaContext(config, { modo: "observar" })}
Em summary, strengths, concerns e nextSteps, fale em termos do que a vaga pede (foco e notas da recrutadora); competências da vaga que esta entrevista não mede entram em nextSteps, não em concerns.

# Problema: ${problem.public.title}
${problem.public.statement}

Abordagens conhecidas:
${approaches}

Erros comuns:
${mistakes}

# Critérios que você avalia (nota de 1 a 4)
${criteria}

Escala:
${SCALE}

# Regras
- Julgue só pelo que está na sessão: código, execuções e o que o CANDIDATO disse. O que o entrevistador disse não conta como mérito do candidato.
- A seção "Cobertura" lista como ele se saiu em cada sondagem. Ela é a base da nota; a linha do tempo confirma e dá contexto.
- Começar por uma solução simples (força bruta) é estratégia legítima, não falha. Em complexidade, o que conta é se ele sabe o custo da solução dele e o que aconteceu quando foi desafiado a melhorar.
- Não puna por não ter mencionado sozinho um aspecto secundário (ex.: memória) se, quando perguntado, respondeu certo.
- Não presuma que ele sabia algo que não mostrou. Mas falta de pergunta não é falha dele: avalie só o que foi explorado.
- Dica não zera nada, mas entra em como ele usou a ajuda.
- Desafio de otimização: se ele não conseguiu melhorar sozinho (só com dica, ou não conseguiu), a nota de complexidade é no máximo 2, mesmo que tenha explicado bem o custo da primeira solução. Se conseguiu sozinho e explicou o novo custo, pode ser 4.
- score = null só quando a sessão não deu NENHUMA oportunidade de observar o critério (nem pergunta, nem fala, nem código que mostre). Comunicação é observável em qualquer conversa.
- Colagem grande de código é um alerta: diga isso em concerns se houver. Código colado só conta como mérito (abordagem, bordas) se ele explicar direito por que funciona; se disse que copiou ou não soube explicar, abordagem no máximo 2.
- Os testes escondidos rodaram depois que a sessão acabou e já viraram a nota de corretude: não os cite como evidência de outro critério.
- Cada evidência cita o momento com o mm:ss EXATO de uma linha da sessão (o que vem entre colchetes). Nunca invente um tempo.
- Evidência é um fato observável, curto, na terceira pessoa ("Explicou que o loop interno começa em i+1 para não somar o elemento com ele mesmo."). Sem adjetivos vazios.
- summary: 2 ou 3 frases para a recrutadora, sem jargão desnecessário.
- strengths e concerns: frases curtas e concretas. nextSteps: o que explorar numa próxima etapa.
- Tudo em português do Brasil.

Responda SOMENTE com JSON neste formato, com um item em criteria para cada critério acima (${judgedIds.join(", ")}):
{"criteria": [{"id": string, "score": 1 | 2 | 3 | 4 | null, "evidence": [{"at": "mm:ss", "text": string}]}], "summary": string, "strengths": [string], "concerns": [string], "nextSteps": [string]}`;
}

export function buildEvaluatorUser(input: {
  coverage: string[];
  durationLabel: string;
  language: string;
  signals: string[];
  timeline: string[];
  codeVersions: string[];
  analystNotes: string[];
}): string {
  return `# Sinais objetivos (calculados pelo sistema)
${input.signals.map((s) => `- ${s}`).join("\n")}

# Cobertura (como ele se saiu em cada critério explorado)
${input.coverage.join("\n")}

# Linha do tempo (duração ${input.durationLabel}, linguagem final: ${input.language})
${input.timeline.join("\n")}

# Versões do código
${input.codeVersions.join("\n\n")}

# Observações do analista durante a sessão (podem estar desatualizadas; confira com a linha do tempo)
${input.analystNotes.length > 0 ? input.analystNotes.join("\n") : "(nenhuma)"}`;
}
