import type { ConceitoEmpecilho, EmpecilhoKind } from "@/lib/contracts";

/**
 * Pacote de um problema. A parte `public` pode ir pro navegador; a `private` NUNCA.
 * Testes são entrada/saída em JSON pra servir a qualquer linguagem.
 */
export interface ProblemTest {
  /** Nos testes escondidos: chaves = nomes dos parâmetros da função. */
  input: unknown;
  expected: unknown;
  /** Nome no relatório ("Caso grande"). */
  name?: string;
  /** Caso de desempenho: roda separado, com tempo próprio (força bruta estoura). */
  large?: boolean;
}

export interface ProblemPublic {
  id: string;
  title: string;
  statement: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  /** Código inicial por linguagem ("python", "cpp", ...). */
  starters: Record<string, string>;
  visibleTests: ProblemTest[];
}

/**
 * Mudança que o Totti traz no meio da entrevista. Regra para escrever um: a mudança só SOMA casos ao problema,
 * nunca contradiz um teste original (visível ou escondido), e cabe na mesma assinatura da função.
 */
export interface Empecilho {
  id: string;
  kind: EmpecilhoKind;
  /** O que ele exige do candidato (vocabulário fixo, a F2 agrupa por isso). */
  concept: ConceitoEmpecilho;
  /** Título do bloco "Mudança" no enunciado. */
  title: string;
  /** A regra nova, como vai no enunciado. */
  statement: string;
  /** A fala do Totti ao anunciar: natural, curta, com um motivo de negócio. Diz O QUE mudou, nunca COMO adaptar. */
  announcement: string;
  /** Testes que a IDE passa a mostrar (input por nome de parâmetro, como os escondidos). Nome sem prefixo. */
  tests: ProblemTest[];
  /** Testes extras da mudança, só no servidor ao fim. */
  hiddenTests?: ProblemTest[];
  /** Respostas oficiais para dúvidas sobre a mudança. */
  clarifications: { question: string; answer: string }[];
  /** O que conta como boa adaptação neste caso (vai para o Evaluator). */
  rubricNote: string;
}

export interface ProblemPrivate {
  /** Mudanças que podem entrar no meio da entrevista. Uma por sessão. */
  empecilhos?: Empecilho[];
  hiddenTests: ProblemTest[];
  approaches: { name: string; time: string; space: string; description: string }[];
  commonMistakes: string[];
  /** Dicas leves, usadas só quando o candidato pede ajuda. Nunca dizem a solução. */
  hints: string[];
  /** Respostas pra perguntas de esclarecimento do candidato sobre o enunciado. Nunca falam da solução. */
  clarifications: { question: string; answer: string }[];
  /** O que conta como "bom" por critério da rubrica (id do critério → texto). */
  rubricNotes: Record<string, string>;
  /** O que vale sondar neste problema, por critério (sem a resposta). Vai para o Analyst e o entrevistador. */
  probeGuides?: Record<string, string>;
}

export interface Problem {
  public: ProblemPublic;
  private: ProblemPrivate;
}
