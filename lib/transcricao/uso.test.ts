import assert from "node:assert/strict";
import { test } from "node:test";
import { criarMedidorUsoTranscricao } from "./uso";

test("envia transcricao_uso a cada minuto e no fim, com áudio medido pelo tempo aberto", () => {
  let agora = 10_000;
  let tick = () => {};
  let cancelado = false;
  const envios: { corpo: Record<string, unknown>; final: boolean }[] = [];
  const medidor = criarMedidorUsoTranscricao("sessao-pre", {
    agora: () => agora,
    agendar: (callback) => { tick = callback; return 1 as unknown as ReturnType<typeof setInterval>; },
    cancelar: () => { cancelado = true; },
    enviar: (corpo, final) => envios.push({ corpo: JSON.parse(corpo), final }),
  });
  agora += 60_000;
  tick();
  agora += 12_000;
  medidor.finalizar();
  medidor.finalizar();
  assert.equal(envios.length, 2);
  assert.equal(envios[0].final, false);
  assert.equal(envios[0].corpo.tipo, "transcricao_uso");
  assert.equal((envios[0].corpo.dados as { audioEnviadoS: number }).audioEnviadoS, 60);
  assert.equal(envios[1].final, true);
  assert.equal((envios[1].corpo.dados as { audioEnviadoS: number }).audioEnviadoS, 72);
  assert.equal(cancelado, true);
});
