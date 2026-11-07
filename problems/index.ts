/** Só servidor: importa a parte privada dos problemas. */
import type { Problem } from "@/lib/problems/types";
import { BEST_TIME_STOCK } from "./best-time-stock";
import { BINARY_SEARCH } from "./binary-search";
import { CLIMBING_STAIRS } from "./climbing-stairs";
import { DAILY_TEMPERATURES } from "./daily-temperatures";
import { LONGEST_SUBSTRING_NO_REPEAT } from "./longest-substring-no-repeat";
import { MAXIMUM_SUBARRAY } from "./maximum-subarray";
import { SEARCH_ROTATED } from "./search-rotated";
import { TOP_K_FREQUENT } from "./top-k-frequent";
import { TWO_SUM } from "./two-sum";
import { VALID_PARENTHESES } from "./valid-parentheses";

const PROBLEMS: Record<string, Problem> = Object.fromEntries(
  [
    TWO_SUM,
    BEST_TIME_STOCK,
    VALID_PARENTHESES,
    BINARY_SEARCH,
    CLIMBING_STAIRS,
    TOP_K_FREQUENT,
    MAXIMUM_SUBARRAY,
    DAILY_TEMPERATURES,
    LONGEST_SUBSTRING_NO_REPEAT,
    SEARCH_ROTATED,
  ].map((p) => [p.public.id, p]),
);

export function hasProblem(id: string): boolean {
  return id in PROBLEMS;
}

export function getProblem(id: string): Problem {
  const problem = PROBLEMS[id];
  if (!problem) throw new Error(`Problema desconhecido: ${id}`);
  return problem;
}
