import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
const { createElement } = React;
import { render } from "@react-email/render";
import { horariosDisponiveis } from "@/lib/convites/horarios";
import { candidatosTeste, ehCandidatoTeste } from "@/lib/convites/teste";
import { acharConvite } from "@/lib/convites/store";
import { TriagemConviteEmail } from "@/lib/email/templates/TriagemConvite";
import type { TriagemConvitePayload } from "@/lib/email/types";

// Os templates usam JSX; o tsx compila com o JSX clássico, que espera React global (o Next não precisa).
Object.assign(globalThis, { React });

const env = process.env as Record<string, string | undefined>;
const saved = env.CANDIDATOS_TESTE;
afterEach(() => {
  if (saved === undefined) delete env.CANDIDATOS_TESTE;
  else env.CANDIDATOS_TESTE = saved;
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

describe("candidatosTeste", () => {
  it("lê nome e email, normaliza o email e ignora entradas inválidas", () => {
    env.CANDIDATOS_TESTE = "  Ana Souza <Ana@Exemplo.com> ; Bruno <bruno@exemplo.com>; Carla <carla-sem-arroba>;;";
    assert.deepEqual(candidatosTeste(), [
      { nome: "Ana Souza", email: "ana@exemplo.com" },
      { nome: "Bruno", email: "bruno@exemplo.com" },
    ]);
  });

  it("env vazio ou ausente vira lista vazia", () => {
    env.CANDIDATOS_TESTE = "   ";
    assert.deepEqual(candidatosTeste(), []);
    delete env.CANDIDATOS_TESTE;
    assert.deepEqual(candidatosTeste(), []);
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
    assert.match(texto, /boa notícia, maria/i);
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
