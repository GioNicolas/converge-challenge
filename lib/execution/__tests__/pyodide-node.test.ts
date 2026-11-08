import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { runHiddenTests } from "../../agents/hiddenTests";
import type { PublicProblem } from "../../problems";
import { getProblem } from "../../../problems";
import { encerrarPyodideParaTestes, runPythonTestsPyodide } from "../pyodide-node";

const problema = {
  functionName: "soma",
  compare: "exact",
} as unknown as PublicProblem;
const testes = [
  { name: "um", args: [1, 2], expected: 3 },
  { name: "dois", args: [10, -4], expected: 6 },
];

after(async () => {
  await encerrarPyodideParaTestes();
});

describe("runPythonTestsPyodide", () => {
  it("passa e falha caso a caso", async () => {
    const r = await runPythonTestsPyodide(problema, "def soma(a, b):\n    return a + b + (1 if a == 10 else 0)\n", { tests: testes, runTimeoutMs: 5000 });
    assert.equal(r.total, 2);
    assert.equal(r.passed, 1);
    assert.deepEqual(r.cases.map((c) => c.passed), [true, false]);
    assert.equal(r.cases[1].got, "7");
  });

  it("erro de sintaxe vira erro fatal, sem lançar", async () => {
    const r = await runPythonTestsPyodide(problema, "def soma(a, b)\n    return a + b\n", { tests: testes, runTimeoutMs: 5000 });
    assert.equal(r.passed, 0);
    assert.match(r.stderr, /SyntaxError/);
  });

  it("função com outro nome: avisa para manter a assinatura", async () => {
    const r = await runPythonTestsPyodide(problema, "def outra(a, b):\n    return a + b\n", { tests: testes, runTimeoutMs: 5000 });
    assert.equal(r.passed, 0);
    assert.match(r.stderr, /Função 'soma' não encontrada/);
  });

  it("laço infinito estoura o tempo, e o worker continua útil na chamada seguinte", async () => {
    const r = await runPythonTestsPyodide(problema, "def soma(a, b):\n    while True:\n        pass\n", { tests: testes, runTimeoutMs: 800 });
    assert.equal(r.passed, 0);
    assert.match(r.stderr, /^Tempo esgotado/);
    const depois = await runPythonTestsPyodide(problema, "def soma(a, b):\n    return a + b\n", { tests: testes, runTimeoutMs: 5000 });
    assert.equal(depois.passed, 2);
  });

  it("código que engole a interrupção também termina (o worker é recriado)", async () => {
    const r = await runPythonTestsPyodide(
      problema,
      "def soma(a, b):\n    while True:\n        try:\n            while True:\n                pass\n        except BaseException:\n            pass\n",
      { tests: testes, runTimeoutMs: 500 },
    );
    assert.equal(r.passed, 0);
    assert.match(r.stderr, /^Tempo esgotado/);
    const depois = await runPythonTestsPyodide(problema, "def soma(a, b):\n    return a + b\n", { tests: testes, runTimeoutMs: 20000 });
    assert.equal(depois.passed, 2);
  });
});

describe("testes escondidos do Two Sum (Pyodide)", () => {
  const two = getProblem("two-sum");
  const hashmap = "def two_sum(nums, target):\n    visto = {}\n    for i, n in enumerate(nums):\n        if target - n in visto:\n            return [visto[target - n], i]\n        visto[n] = i\n";
  const forcaBruta = "def two_sum(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n";

  it("hashmap passa tudo, inclusive o caso grande", async () => {
    const r = await runHiddenTests(two, hashmap, "python");
    assert.equal(r.ran, true);
    if (r.ran) assert.equal(r.passed, r.total);
  });

  it("força bruta passa os pequenos e estoura só o grande", async () => {
    const r = await runHiddenTests(two, forcaBruta, "python");
    assert.equal(r.ran, true);
    if (r.ran) {
      const grandes = r.cases.filter((c) => c.large);
      assert.ok(grandes.length > 0 && grandes.every((c) => !c.passed && c.detail === "tempo esgotado"));
      assert.ok(r.cases.filter((c) => !c.large).every((c) => c.passed));
    }
  });

  it("laço infinito: os casos grandes nem rodam (não gasta mais tempo esperando)", async () => {
    const t = Date.now();
    const r = await runHiddenTests(two, "def two_sum(nums, target):\n    while True:\n        pass\n", "python");
    assert.equal(r.ran, true);
    if (r.ran) assert.equal(r.passed, 0);
    assert.ok(Date.now() - t < 9000, `levou ${Date.now() - t} ms`);
  });
});
