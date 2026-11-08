import assert from "node:assert/strict";
import test from "node:test";
import { fracaoEntrevistada, prontaParaDecidir, type VagaEmpresa } from "@/lib/vagas/workspace";

const vaga = (funil: VagaEmpresa["funil"], etapa: VagaEmpresa["etapa"] = "entrevistas") => ({ funil, etapa }) as VagaEmpresa;

test("vai para a decisão com relatório esperando e metade dos convidados entrevistada", () => {
  assert.equal(prontaParaDecidir(vaga({ inscritos: 900, convidados: 100, emAndamento: 0, concluiram: 50, novos: 3 })), true);
  assert.equal(prontaParaDecidir(vaga({ inscritos: 900, convidados: 100, emAndamento: 0, concluiram: 49, novos: 3 })), false);
});

test("sem relatório novo, ou encerrada, não pede decisão", () => {
  assert.equal(prontaParaDecidir(vaga({ inscritos: 10, convidados: 10, emAndamento: 0, concluiram: 10, novos: 0 })), false);
  assert.equal(prontaParaDecidir(vaga({ inscritos: 10, convidados: 10, emAndamento: 0, concluiram: 10, novos: 4 }, "encerrada")), false);
});

test("sem convidados a fração é zero", () => {
  assert.equal(fracaoEntrevistada(vaga({ inscritos: 0, convidados: 0, emAndamento: 0, concluiram: 0, novos: 0 })), 0);
});
