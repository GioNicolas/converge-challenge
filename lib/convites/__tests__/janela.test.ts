import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ABRE_ANTES_MS, FECHA_DEPOIS_MS, janelaDaSala, situacaoDaSala } from "@/lib/convites/janela";

describe("janela da sala", () => {
  const horario = "2026-11-09T14:00:00-03:00";
  const inicio = Date.parse(horario);
  const janela = janelaDaSala(horario, 45);

  it("abre dois minutos antes e fecha 15 minutos depois do fim previsto", () => {
    assert.equal(janela.abre, inicio - ABRE_ANTES_MS);
    assert.equal(janela.fecha, inicio + 45 * 60_000 + FECHA_DEPOIS_MS);
  });

  it("antes de abrir é cedo; dentro da janela, aberta; depois, encerrada", () => {
    assert.equal(situacaoDaSala(janela, inicio - 10 * 60_000), "cedo");
    assert.equal(situacaoDaSala(janela, janela.abre - 1), "cedo");
    assert.equal(situacaoDaSala(janela, janela.abre), "aberta");
    assert.equal(situacaoDaSala(janela, inicio + 30 * 60_000), "aberta");
    assert.equal(situacaoDaSala(janela, janela.fecha), "aberta");
    assert.equal(situacaoDaSala(janela, janela.fecha + 1), "encerrada");
  });
});
