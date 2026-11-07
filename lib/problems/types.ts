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

export interface ProblemPrivate {
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
