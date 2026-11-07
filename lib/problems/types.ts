/**
 * Pacote de um problema. A parte `public` pode ir pro navegador; a `private` NUNCA.
 * Testes são entrada/saída em JSON pra servir a qualquer linguagem.
 */
export interface ProblemTest {
  input: unknown;
  expected: unknown;
}

export interface ProblemPublic {
  id: string;
  title: string;
  statement: string;
  examples: { input: string; output: string; explanation?: string }[];
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
  /** O que conta como "bom" por critério da rubrica (id do critério → texto). */
  rubricNotes: Record<string, string>;
}

export interface Problem {
  public: ProblemPublic;
  private: ProblemPrivate;
}
