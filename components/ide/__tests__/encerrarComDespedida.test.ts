import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEncerrarComDespedida } from "../encerrarComDespedida";

function deps(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  return {
    events,
    d: {
      dizer: async () => { events.push("audio"); return true; },
      registrarFala: async () => { events.push("speech"); },
      endSession: () => { events.push("end"); }, navegar: () => { events.push("navigate"); },
      pedirEncerramento: async () => "tchau", mostrarTexto: async () => { events.push("text"); },
      reserva: "reserva", ...overrides,
    },
  };
}

test("registra speech antes de endSession e navega", async () => {
  const { d, events } = deps();
  await criarEncerrarComDespedida(d as never)("button", "tchau");
  assert.deepEqual(events, ["speech", "audio", "end", "navigate"]);
});

test("espera o áudio terminar", async () => {
  const { d, events } = deps({ dizer: () => new Promise<boolean>((resolve) => setTimeout(() => { events.push("audio-end"); resolve(true); }, 15)) });
  await criarEncerrarComDespedida(d as never)("button", "tchau");
  assert.ok(events.indexOf("audio-end") < events.indexOf("end"));
});

test("teto no áudio pendurado mostra texto e encerra", async () => {
  const { d, events } = deps({ dizer: () => new Promise<boolean>(() => {}), tetoMs: 5 });
  await criarEncerrarComDespedida(d as never)("button", "tchau");
  assert.ok(events.includes("text")); assert.ok(events.includes("end"));
});

test("voz indisponível mostra texto", async () => {
  const { d, events } = deps({ dizer: async () => false });
  await criarEncerrarComDespedida(d as never)("button", "tchau");
  assert.ok(events.includes("text"));
});

test("rota falhando usa despedida reserva", async () => {
  const { d, events } = deps({ pedirEncerramento: async () => { throw new Error("offline"); }, dizer: async (text: string) => { events.push(text); return true; } });
  await criarEncerrarComDespedida(d as never)("button");
  assert.ok(events.includes("reserva"));
});

test("chamada dupla não encerra duas vezes", async () => {
  const { d, events } = deps(); const encerrar = criarEncerrarComDespedida(d as never);
  await Promise.all([encerrar("button", "tchau"), encerrar("button", "tchau")]);
  assert.equal(events.filter((e) => e === "end").length, 1);
});
