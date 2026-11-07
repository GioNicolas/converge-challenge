/**
 * Prompt do Evaluator. O system descreve a vaga, a rubrica e o gabarito; o user traz a sessão inteira.
 * O critério objetivo (corretude) vem calculado pelos testes escondidos: o LLM só julga o resto.
 */
import type { InterviewConfig } from "@/lib/contracts";
import type { Problem } from "@/lib/problems/types";

/** Âncoras genéricas de 1 a 4; o "bom" específico de cada critério vem do pacote do problema. */
const ANCHORS = `1 — Não demonstrou, ou demonstrou errado, mesmo quando perguntado.
2 — Demonstrou em parte: só quando provocado, de forma rasa ou com erros importantes.
3 — Demonstrou bem, com pequenas lacunas ou precisando de algum estímulo.
4 — Demonstrou por conta própria, com clareza e profundidade.`;

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
${config.recruiterNotes ? `\nNotas da recrutadora: ${config.recruiterNotes}\n` : ""}
# Problema: ${problem.public.title}
${problem.public.statement}

Abordagens conhecidas:
${approaches}

Erros comuns:
${mistakes}

# Critérios que você avalia (nota de 1 a 4)
${criteria}

Escala:
${ANCHORS}

# Regras
- Julgue só pelo que está na sessão: código, execuções e o que o CANDIDATO disse. O que o entrevistador disse não conta como mérito do candidato.
- Sem evidência, a nota é baixa. Não presuma que ele sabia algo que não mostrou.
- Resposta dada só depois de o entrevistador perguntar vale menos que iniciativa própria (no máximo 3).
- Dica pedida não zera nada, mas entra em como ele usou a ajuda.
- Colagem grande de código é um alerta: diga isso em concerns se houver.
- Os testes escondidos rodaram depois que a sessão acabou e já viraram a nota de corretude: não os cite como evidência de outro critério.
- Cada evidência cita o momento com o mm:ss EXATO de uma linha da sessão (o que vem entre colchetes). Nunca invente um tempo.
- Evidência é um fato observável, curto, na terceira pessoa ("Explicou que o loop interno começa em i+1 para não somar o elemento com ele mesmo."). Sem adjetivos vazios.
- summary: 2 ou 3 frases para a recrutadora, sem jargão desnecessário.
- strengths e concerns: frases curtas e concretas. nextSteps: o que explorar numa próxima etapa.
- Tudo em português do Brasil.

Responda SOMENTE com JSON neste formato, com um item em criteria para cada critério acima (${judgedIds.join(", ")}):
{"criteria": [{"id": string, "score": 1 | 2 | 3 | 4, "evidence": [{"at": "mm:ss", "text": string}]}], "summary": string, "strengths": [string], "concerns": [string], "nextSteps": [string]}`;
}

export function buildEvaluatorUser(input: {
  durationLabel: string;
  language: string;
  signals: string[];
  timeline: string[];
  codeVersions: string[];
  analystNotes: string[];
}): string {
  return `# Sinais objetivos (calculados pelo sistema)
${input.signals.map((s) => `- ${s}`).join("\n")}

# Linha do tempo (duração ${input.durationLabel}, linguagem final: ${input.language})
${input.timeline.join("\n")}

# Versões do código
${input.codeVersions.join("\n\n")}

# Observações do analista durante a sessão (podem estar desatualizadas; confira com a linha do tempo)
${input.analystNotes.length > 0 ? input.analystNotes.join("\n") : "(nenhuma)"}`;
}
