/** Só servidor: importa a parte privada dos problemas. */
import type { Problem } from "@/lib/problems/types";
import { TWO_SUM } from "./two-sum";

const PROBLEMS: Record<string, Problem> = { [TWO_SUM.public.id]: TWO_SUM };

export function getProblem(id: string): Problem {
  const problem = PROBLEMS[id];
  if (!problem) throw new Error(`Problema desconhecido: ${id}`);
  return problem;
}
