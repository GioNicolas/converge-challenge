import assert from "node:assert/strict";
import { test } from "node:test";
import { criarDespedida } from "./despedida";

const pendente = () => {
  let resolver!: () => void;
  const promessa = new Promise<void>((resolve) => { resolver = resolve; });
  return { promessa, resolver };
};
const microtarefas = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("finaliza no início, espera áudio e fecha uma vez mesmo com entradas simultâneas", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const audio = pendente();
  const relatorio = pendente();
  const eventos: string[] = [];
  const despedir = criarDespedida({ bloquear: () => eventos.push("bloquear"), finalizar: () => { eventos.push("finalizar"); return relatorio.promessa; },
    falar: () => { eventos.push("falar"); return audio.promessa; }, pararVoz: () => eventos.push("parar"), concluir: () => eventos.push("concluir") });
  const a = despedir("Obrigado pela conversa.");
  assert.equal(despedir("outra despedida"), a);
  await microtarefas();
  assert.deepEqual(eventos, ["bloquear", "finalizar", "falar"]);
  t.mock.timers.tick(5000); await microtarefas();
  assert.equal(eventos.includes("concluir"), false);
  audio.resolver(); await a;
  assert.deepEqual(eventos, ["bloquear", "finalizar", "falar", "parar", "concluir"]);
});

test("sem voz, mantém texto por quatro segundos mesmo se o relatório falhar", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let concluiu = false;
  const despedir = criarDespedida({ bloquear: () => {}, finalizar: async () => { throw new Error("rede"); },
    falar: async () => { throw new Error("voz"); }, pararVoz: () => {}, concluir: () => { concluiu = true; } });
  const tarefa = despedir("Obrigado."); await microtarefas();
  t.mock.timers.tick(3999); await microtarefas(); assert.equal(concluiu, false);
  t.mock.timers.tick(1); await tarefa; assert.equal(concluiu, true);
});

test("áudio travado tem teto, é cancelado e permite abrir a página final", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const eventos: string[] = [];
  const despedir = criarDespedida({ bloquear: () => {}, finalizar: () => {}, falar: () => new Promise(() => {}),
    pararVoz: () => eventos.push("parar"), concluir: () => eventos.push("concluir"), tetoMs: 5000 });
  const tarefa = despedir("Obrigado."); await microtarefas();
  t.mock.timers.tick(5000); await tarefa;
  assert.deepEqual(eventos, ["parar", "concluir"]);
});
