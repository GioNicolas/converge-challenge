import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
const { createElement } = React;
import { render } from "@react-email/render";
import {
  ehHorarioDeTesteValido,
  horarioAceito,
  horariosDeTeste,
  horariosDisponiveis,
} from "@/lib/convites/horarios";
import { candidatosTeste, ehCandidatoTeste, recebeEmail } from "@/lib/convites/teste";
import { acharConvite } from "@/lib/convites/store";
import { TriagemConviteEmail } from "@/lib/email/templates/TriagemConvite";
import type { TriagemConvitePayload } from "@/lib/email/types";

// Os templates usam JSX; o tsx compila com o JSX clássico, que espera React global (o Next não precisa).
Object.assign(globalThis, { React });

const env = process.env as Record<string, string | undefined>;
const saved = { CANDIDATOS_TESTE: env.CANDIDATOS_TESTE, HORARIOS_DE_TESTE: env.HORARIOS_DE_TESTE };
// A flag do shell não pode vazar pros testes de horários regulares: começam com os de teste desligados.
beforeEach(() => {
  env.HORARIOS_DE_TESTE = "0";
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

const diaDaSemana = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();

describe("horariosDisponiveis", () => {
  it("de sexta, oferece a próxima semana útil (seg a sex)", () => {
    const slots = horariosDisponiveis(new Date("2026-11-06T15:00:00-03:00"));
    assert.equal(slots.length, 20);
    const dias = [...new Set(slots.map((s) => s.slice(0, 10)))];
    assert.deepEqual(dias, ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    assert.equal(slots[0], "2026-11-09T09:00:00-03:00");
    assert.equal(slots[3], "2026-11-09T16:00:00-03:00");
  });

  it("nunca oferece sábado nem domingo e usa offset -03:00", () => {
    for (const slot of horariosDisponiveis(new Date("2026-11-03T10:00:00-03:00"))) {
      assert.ok(slot.endsWith("-03:00"), slot);
      const dia = diaDaSemana(slot);
      assert.notEqual(dia, 0, slot);
      assert.notEqual(dia, 6, slot);
    }
  });

  it("usa o dia civil de Brasília, não o UTC", () => {
    // 2026-11-05 01:00 UTC ainda é 4/11 à noite em Brasília: "amanhã" é quinta, dia 5.
    const slots = horariosDisponiveis(new Date("2026-11-05T01:00:00Z"));
    assert.equal(slots[0], "2026-11-05T09:00:00-03:00");
  });
});

describe("horários de teste (ligados salvo HORARIOS_DE_TESTE=0)", () => {
  // 10:00:20 em Brasília: arredonda pra cima até 10:01, então +3 e +5 dão 10:04 e 10:06.
  const agora = new Date("2026-11-06T10:00:20-03:00");

  it("com HORARIOS_DE_TESTE=0, a lista não tem horários de teste", () => {
    env.HORARIOS_DE_TESTE = "0";
    assert.equal(horariosDisponiveis(agora)[0], "2026-11-09T09:00:00-03:00");
    assert.equal(horariosDisponiveis(agora).length, 20);
  });

  it("sem a variável, os horários de teste vêm ligados", () => {
    delete env.HORARIOS_DE_TESTE;
    assert.equal(horariosDisponiveis(agora).length, 22);
  });

  it("com a flag, os dois horários de teste vêm primeiro, no minuto cheio e com -03:00", () => {
    env.HORARIOS_DE_TESTE = "1";
    assert.deepEqual(horariosDeTeste(agora), ["2026-11-06T10:04:00-03:00", "2026-11-06T10:06:00-03:00"]);
    const lista = horariosDisponiveis(agora);
    assert.equal(lista.length, 22);
    assert.deepEqual(lista.slice(0, 2), horariosDeTeste(agora));
  });

  it("usa o relógio de Brasília mesmo quando o UTC já virou o dia", () => {
    env.HORARIOS_DE_TESTE = "1";
    // 23:58 de 6/11 em Brasília = 02:58Z de 7/11.
    assert.deepEqual(horariosDeTeste(new Date("2026-11-07T02:58:00Z")), [
      "2026-11-07T00:01:00-03:00",
      "2026-11-07T00:03:00-03:00",
    ]);
  });

  it("o POST aceita o horário de teste mostrado minutos antes, mesmo com a lista já diferente", () => {
    env.HORARIOS_DE_TESTE = "1";
    const [primeiro] = horariosDeTeste(agora);
    const doisMinutosDepois = new Date(agora.getTime() + 2 * 60_000);
    assert.ok(!horariosDisponiveis(doisMinutosDepois).includes(primeiro));
    assert.equal(horarioAceito(primeiro, doisMinutosDepois), true);
    // Até 5 min depois do horário (quem demorou pra confirmar) ainda vale.
    assert.equal(horarioAceito(primeiro, new Date(Date.parse(primeiro) + 4 * 60_000)), true);
  });

  it("recusa horário de teste fora da janela, fora do formato ou com a flag desligada", () => {
    env.HORARIOS_DE_TESTE = "1";
    assert.equal(ehHorarioDeTesteValido("2026-11-06T10:30:00-03:00", agora), false); // +30 min
    assert.equal(ehHorarioDeTesteValido("2026-11-06T09:50:00-03:00", agora), false); // 10 min atrás
    assert.equal(ehHorarioDeTesteValido("2026-11-06T10:04:30-03:00", agora), false); // segundos
    assert.equal(ehHorarioDeTesteValido("2026-11-06T13:04:00Z", agora), false); // outro offset
    env.HORARIOS_DE_TESTE = "0";
    assert.equal(horarioAceito("2026-11-06T10:04:00-03:00", agora), false);
  });

  it("horários regulares continuam aceitos com ou sem a flag", () => {
    delete env.HORARIOS_DE_TESTE;
    assert.equal(horarioAceito("2026-11-09T14:00:00-03:00", agora), true);
    assert.equal(horarioAceito("2026-11-09T14:15:00-03:00", agora), false);
    env.HORARIOS_DE_TESTE = "1";
    assert.equal(horarioAceito("2026-11-09T14:00:00-03:00", agora), true);
  });
});

describe("candidatosTeste", () => {
  it("lê nome e email, normaliza o email e ignora entradas inválidas", () => {
    env.CANDIDATOS_TESTE = "  Ana Souza <Ana@Exemplo.com> ; Bruno <bruno@exemplo.com>; Carla <carla-sem-arroba>;;";
    assert.deepEqual(candidatosTeste(), [
      { nome: "Ana Souza", email: "ana@exemplo.com" },
      { nome: "Bruno", email: "bruno@exemplo.com" },
    ]);
  });

  it("env vazio ou ausente usa o time (Lucas, Sofia, Henrique e Giorgio)", () => {
    env.CANDIDATOS_TESTE = "   ";
    assert.equal(candidatosTeste().length, 4);
    delete env.CANDIDATOS_TESTE;
    assert.deepEqual(
      candidatosTeste().map((c) => c.nome.split(" ")[0]),
      ["Lucas", "Sofia", "Henrique", "Giorgio"],
    );
  });

  it("só o Lucas recebe e-mail de verdade", () => {
    delete env.CANDIDATOS_TESTE;
    assert.equal(recebeEmail(" LTodaroSouza@gmail.com "), true);
    assert.equal(recebeEmail("sofiaomarques26@gmail.com"), false);
    assert.equal(recebeEmail("henrique.guimaa08@gmail.com"), false);
    assert.equal(recebeEmail("alguem@exemplo.com"), false);
  });

  it("ehCandidatoTeste ignora caixa e espaços", () => {
    env.CANDIDATOS_TESTE = "Ana Souza <ana@exemplo.com>";
    assert.equal(ehCandidatoTeste("  ANA@exemplo.com "), true);
    assert.equal(ehCandidatoTeste("outra@exemplo.com"), false);
  });
});

describe("acharConvite", () => {
  it("token fora do formato hex de 32 caracteres nunca chega ao filesystem", async () => {
    assert.equal(await acharConvite("../../package"), undefined);
    assert.equal(await acharConvite("A".repeat(32)), undefined);
  });
});

const base: TriagemConvitePayload = {
  candidateName: "Maria Silva",
  to: "maria@exemplo.com",
  roleTitle: "Engenheira de Software",
  mode: "live_coding",
  durationMin: 30,
  languages: ["python", "cpp"],
  scheduleUrl: "https://exemplo.com/agendar/abc",
};

describe("TriagemConvite", () => {
  it("live_coding cita as linguagens e a duração e não revela o conteúdo da prova", async () => {
    const texto = await render(createElement(TriagemConviteEmail, base), { plainText: true });
    assert.match(texto, /Python ou C\+\+/);
    assert.match(texto, /30 minutos/);
    assert.match(texto, /Escolher meu horário/);
    assert.match(texto, /oi, maria,/i);
    assert.match(texto, /https:\/\/exemplo.com\/agendar\/abc/);
    assert.doesNotMatch(texto, /critério|two-sum|foco/i);
  });

  it("system_design fala de quadro e não de editor", async () => {
    const texto = await render(
      createElement(TriagemConviteEmail, { ...base, mode: "system_design", languages: [] }),
      { plainText: true },
    );
    assert.match(texto, /quadro/);
    assert.doesNotMatch(texto, /editor/);
  });
});
