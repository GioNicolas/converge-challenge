import assert from "node:assert/strict";
import { it } from "node:test";
import { ESPERA_FRASE_CURTA_MS, ESPERA_FRASE_FECHADA_MS, ESPERA_FRASE_PENDURADA_MS, esperaDoFimDaFala } from "./fimDaFala";

it("frase pendurada espera mais; pergunta e frase fechada seguem rápido", () => {
  assert.equal(esperaDoFimDaFala("Aí eu colocaria o cache na frente e"), ESPERA_FRASE_PENDURADA_MS);
  assert.equal(esperaDoFimDaFala("Então, porque a leitura é maior,"), ESPERA_FRASE_PENDURADA_MS);
  assert.equal(esperaDoFimDaFala("deixa eu ver, hmm..."), ESPERA_FRASE_PENDURADA_MS);
  assert.equal(esperaDoFimDaFala("Quanto tempo falta?"), ESPERA_FRASE_FECHADA_MS);
  assert.equal(esperaDoFimDaFala("Coloquei o Redis antes do Postgres pra aliviar as leituras."), ESPERA_FRASE_FECHADA_MS);
  assert.equal(esperaDoFimDaFala("Beleza."), ESPERA_FRASE_CURTA_MS);
});
