import assert from "node:assert/strict";
import { test } from "node:test";
import { resumirUso } from "./resumo";

test("agrega eventos de uso do quadro e live coding", () => {
  const r = resumirUso([
    { tipo: "perguntar_uso", dados: { modelo: "m", provedor: "openrouter", custo_usd: .01, tokens_entrada: 100, tokens_cache: 25, reserva_disparada: true } },
    { tipo: "analise_uso", dados: { modelo: "a", provedor: "featherless", custo_usd: .02 } },
    { tipo: "scorecard_uso", dados: { modelo: "r", provedor: "openrouter", custo_usd: .03 } },
    { tipo: "llm_uso", dados: { papel: "filtro", modelo: "f", provedor: "openrouter", custo_usd: .004 } },
    { tipo: "llm_uso", dados: { papel: "analise", modelo: "c", provedor: "openrouter", custo_usd: .005 } },
    { tipo: "llm_uso", dados: { papel: "relatorio", modelo: "r", provedor: "openrouter", custo_usd: .006 } },
    { tipo: "voz_uso", dados: { caracteres: 120 } }, { tipo: "voz_descartada", dados: { caracteres: 20 } },
    { tipo: "transcricao_uso", dados: { escuta_id: "e1", audioEnviadoS: 40, sessaoS: 60 } },
    { tipo: "transcricao_uso", dados: { escuta_id: "e1", audioEnviadoS: 45, sessaoS: 60 } },
    { tipo: "transcricao_uso", dados: { escuta_id: "e2", audioEnviadoS: 10, sessaoS: 30 } },
    { type: "voz_uso", contexto: "coding", caracteres: 9 },
    { type: "voz_descartada", contexto: "coding", caracteres: 3, motivo: "cancelada" },
    { type: "transcricao_uso", contexto: "coding", escuta_id: "e3", audioEnviadoS: 6, sessaoS: 12, conexoes: 1, reconexoes: 0, final: true },
  ]);
  assert.equal(r.papeis["perguntar/fala"].chamadas, 1);
  assert.equal(r.papeis["perguntar/fala"].reserva, 1);
  assert.equal(r.papeis.filtro.custo_usd, .004);
  assert.equal(r.reservas, 1);
  assert.equal(r.taxaCache, .25);
  assert.equal(r.caracteresVoz, 129);
  assert.equal(r.percentualDescartado, 23/129);
  assert.equal(r.papeis["perguntar/fala"].reserva, 1);
  assert.equal(r.audioEnviadoS, 61);
  assert.equal(r.sessaoS, 102);
  assert.equal(r.proporcaoAudio, 61/102);
});

test("papel ausente não cria chamada e cache sem entrada é nulo", () => {
  const r = resumirUso([
    { tipo: "llm_uso", dados: { papel: "outro", custo_usd: 0 } },
    { tipo: "llm_uso", dados: { papel: "fala", modelo: "m", provedor: "openrouter", custo_usd: 0, tokens_cache: 7 } },
  ]);
  assert.equal(r.papeis["perguntar/fala"].chamadas, 1);
  assert.equal(r.papeis["perguntar/fala"].custo_usd, 0);
  assert.equal(r.taxaCache, null);
});
