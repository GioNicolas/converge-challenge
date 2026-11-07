/**
 * Contexto da vaga: o que a recrutadora combinou na pré-entrevista, traduzido em instruções
 * para Analyst, Interviewer e Evaluator. É o único lugar que sabe transformar `InterviewConfig`
 * em texto de prompt, então os três agentes personalizam a entrevista do mesmo jeito.
 */
import type { FocusArea, InterviewConfig } from "@/lib/contracts";

const FOCUS_LABELS: Record<FocusArea, string> = {
  tecnico: "domínio técnico (algoritmo, complexidade, corretude)",
  pressao: "como lida com pressão, tempo curto e travadas",
  escala_produto: "pensamento de escala e trade-offs de produto",
  uso_ia: "uso de IA como ferramenta de trabalho",
};

/** Como cada foco muda o que vale perguntar e observar (sem nunca quebrar as regras de não entregar a solução). */
const FOCUS_GUIDANCE: Record<FocusArea, { perguntar: string; observar: string }> = {
  tecnico: {
    perguntar: "peça para justificar a abordagem, o custo de tempo/memória e o tratamento de bordas",
    observar: "corretude, complexidade e clareza do código",
  },
  pressao: {
    perguntar: "pergunte como ele decide o que fazer primeiro com o tempo que resta, o que faria se travasse e como prioriza",
    observar: "como reage a testes falhando, a travadas e ao relógio: se mantém a calma, comunica, ajusta o plano",
  },
  escala_produto: {
    perguntar: "pergunte o que muda com muito mais dados ou usuários e que trade-off ele aceitou (tempo x memória, simplicidade x desempenho)",
    observar: "se enxerga limites da solução e consegue falar de evolução sem que seja pedido",
  },
  uso_ia: {
    perguntar: "pergunte como ele usaria uma ferramenta de IA nesse problema e como conferiria o que ela devolve (sem pedir para usar agora)",
    observar: "senso crítico sobre código gerado, colagens grandes e capacidade de explicar o que escreveu",
  },
};

const SENIORITY_GUIDANCE: Record<InterviewConfig["seniority"], string> = {
  junior: "Júnior: valorize clareza do raciocínio e aprendizado com as dicas; não cobre profundidade de trade-offs que a senioridade não exige.",
  pleno: "Pleno: espere autonomia, justificativa das escolhas e noção de complexidade sem ser puxado.",
  senior: "Sênior: espere que ele traga trade-offs, limites e evolução da solução por iniciativa própria; seja mais exigente com profundidade.",
};

/** Foco em ordem de peso, só o que tem peso > 0. */
function orderedFocus(config: InterviewConfig) {
  return [...config.focus].filter((f) => f.weight > 0).sort((a, b) => b.weight - a.weight);
}

export interface VagaContextOptions {
  /** Inclui orientação de "o que perguntar" (Analyst/Interviewer) e/ou "o que observar" (Evaluator). */
  modo: "perguntar" | "observar";
}

/** Bloco "# Contexto da vaga" pronto para entrar no system prompt. Nunca vazio: sempre tem cargo e senioridade. */
export function buildVagaContext(config: InterviewConfig, { modo }: VagaContextOptions): string {
  const focus = orderedFocus(config);
  const linhas: string[] = [`# Contexto da vaga (definido pela recrutadora)`, `Cargo: ${config.roleTitle} (${config.seniority}). Duração: ${config.durationMin} min.`];

  if (config.jobDescription?.trim()) {
    linhas.push(`Descrição da vaga:\n${config.jobDescription.trim().slice(0, 2000)}`);
  }
  if (config.recruiterNotes.trim()) {
    linhas.push(`Notas da recrutadora: ${config.recruiterNotes.trim()}`);
  }
  if (focus.length > 0) {
    linhas.push(
      `Foco da entrevista, do mais importante ao menos:\n` +
        focus
          .map((f) => `- ${FOCUS_LABELS[f.area]} (peso ${f.weight}): ${modo === "perguntar" ? FOCUS_GUIDANCE[f.area].perguntar : FOCUS_GUIDANCE[f.area].observar}`)
          .join("\n"),
    );
  }
  linhas.push(SENIORITY_GUIDANCE[config.seniority]);
  if (modo === "perguntar" && focus.length > 1) {
    linhas.push(`Distribua as perguntas pelos focos acima, favorecendo os de maior peso, e sempre ligadas ao código que o candidato escreveu.`);
  }
  return linhas.join("\n");
}
