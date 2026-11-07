import type { ProblemPublic, ProblemTest } from "@/lib/problems/types";
import { problems as IDE_PROBLEMS } from "@/lib/problems";

/**
 * Parte pública de um problema, derivada do banco da IDE (mesmo enunciado, starters e exemplos),
 * para o pacote do agente nunca divergir do que o candidato vê.
 */
export function publicFromIde(id: string): ProblemPublic {
  const p = IDE_PROBLEMS[id];
  if (!p) throw new Error(`Problema ${id} não existe no banco da IDE`);
  const toTest = (t: { args: unknown[]; expected: unknown }): ProblemTest => ({
    input: Object.fromEntries(p.native.params.map((param, i) => [param.name, t.args[i]])),
    expected: t.expected,
  });
  return {
    id: p.id,
    title: p.title,
    statement: p.statement,
    examples: p.examples.map((e) => ({ input: e.input, output: e.output, explanation: e.note })),
    constraints: p.constraints,
    starters: p.starters,
    visibleTests: p.visibleTests.map(toTest),
  };
}
