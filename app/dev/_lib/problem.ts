import { DEFAULT_CONFIG } from "@/lib/config/default";
import type { RunResult } from "@/lib/contracts";

export const PROBLEM = {
  title: "Two Sum",
  statement:
    "Dado um array de inteiros nums e um inteiro target, retorne os índices de dois números cuja soma seja igual a target.\nCada entrada tem exatamente uma solução, e você não pode usar o mesmo elemento duas vezes. A resposta pode vir em qualquer ordem.",
  example: "Exemplo: nums = [2, 7, 11, 15], target = 9  ->  [0, 1]",
};

export const STARTERS: Record<string, string> = {
  python: "def two_sum(nums, target):\n    pass",
  cpp: "#include <vector>\nusing namespace std;\n\nvector<int> twoSum(vector<int>& nums, int target) {\n    \n}",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  python: "Python",
  cpp: "C++",
};

export const INITIAL_LANGUAGE: string = DEFAULT_CONFIG.languages[0] ?? "python";

export type FakeRunKind = "passou" | "falhou";

/** Resultado falso de execução, só pra exercitar o contrato RunResult. */
export function fakeRunResult(kind: FakeRunKind): RunResult {
  if (kind === "passou") {
    return {
      passed: 3,
      total: 3,
      durationMs: 12,
      stdout: "",
      stderr: "",
      cases: [
        { name: "caso 1", passed: true, input: "[2, 7, 11, 15], 9", expected: "[0, 1]", got: "[0, 1]" },
        { name: "caso 2", passed: true, input: "[3, 2, 4], 6", expected: "[1, 2]", got: "[1, 2]" },
        { name: "caso 3", passed: true, input: "[3, 3], 6", expected: "[0, 1]", got: "[0, 1]" },
      ],
    };
  }
  return {
    passed: 1,
    total: 3,
    durationMs: 15,
    stdout: "",
    stderr: "",
    cases: [
      { name: "caso 1", passed: true, input: "[2, 7, 11, 15], 9", expected: "[0, 1]", got: "[0, 1]" },
      { name: "caso 2", passed: false, input: "[3, 3], 6", expected: "[0, 1]", got: "[0, 0]" },
      { name: "caso 3", passed: false, input: "[], 0", error: "IndexError: list index out of range" },
    ],
  };
}
