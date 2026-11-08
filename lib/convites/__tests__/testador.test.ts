import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_POR_EMAIL, MAX_POR_IP, reservarEnvioTestador, zerarLimitesTestador } from "@/lib/convites/testador";

describe("reservarEnvioTestador", () => {
  beforeEach(() => zerarLimitesTestador());

  it("libera até o limite por e-mail e depois segura", () => {
    for (let k = 0; k < MAX_POR_EMAIL; k++) assert.equal(reservarEnvioTestador(`ip${k}`, "a@b.com"), true);
    assert.equal(reservarEnvioTestador("ip-novo", "A@B.com "), false);
  });

  it("libera até o limite por IP, mesmo trocando de e-mail", () => {
    for (let k = 0; k < MAX_POR_IP; k++) assert.equal(reservarEnvioTestador("1.2.3.4", `p${k}@b.com`), true);
    assert.equal(reservarEnvioTestador("1.2.3.4", "outro@b.com"), false);
    assert.equal(reservarEnvioTestador("5.6.7.8", "outro@b.com"), true);
  });

  it("zera depois de 24 h", () => {
    const t0 = 1_000_000;
    for (let k = 0; k < MAX_POR_EMAIL; k++) reservarEnvioTestador(`ip${k}`, "a@b.com", t0);
    assert.equal(reservarEnvioTestador("x", "a@b.com", t0 + 1000), false);
    assert.equal(reservarEnvioTestador("x", "a@b.com", t0 + 24 * 60 * 60 * 1000 + 1), true);
  });
});
