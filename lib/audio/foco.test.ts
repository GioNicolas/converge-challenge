import assert from "node:assert/strict";
import { test } from "node:test";
import { FocoAudio } from "./foco";

test("microfone interrompe a reprodução; liberação antiga não remove o dono novo", async () => {
  const foco = new FocoAudio();
  let interrompeu = false;
  const liberarVoz = foco.assumir("saida", () => { interrompeu = true; });
  const liberarMic = foco.assumir("entrada", () => {});
  assert.equal(interrompeu, true);
  liberarVoz();
  assert.throws(() => foco.assumir("saida", () => {}), /ditado/);
  let liberou = false;
  const espera = foco.aguardarMicrofone(new AbortController().signal).then(() => { liberou = true; });
  await Promise.resolve();
  assert.equal(liberou, false);
  liberarMic();
  await espera;
  assert.equal(liberou, true);
});

test("resposta aguardando o microfone pode ser cancelada sem começar áudio", async () => {
  const foco = new FocoAudio();
  const liberar = foco.assumir("entrada", () => {});
  const controle = new AbortController();
  const espera = foco.aguardarMicrofone(controle.signal);
  controle.abort();
  await assert.rejects(espera, { name: "AbortError" });
  liberar();
});

test("um segundo campo de ditado encerra o primeiro sem liberar a segunda captura", async () => {
  const foco = new FocoAudio();
  let cancelou = 0;
  const liberar1 = foco.assumir("entrada", () => { cancelou++; });
  const liberar2 = foco.assumir("entrada", () => {});
  liberar1();
  assert.equal(cancelou, 1);
  assert.throws(() => foco.assumir("saida", () => {}));
  liberar2();
  await foco.aguardarMicrofone(new AbortController().signal);
});
