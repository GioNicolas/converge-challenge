import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { firstName, formatDateTime, greeting } from "@/lib/email/format";

const env = process.env as Record<string, string | undefined>;
const saved = env.EMAIL_TIMEZONE;
afterEach(() => {
  if (saved === undefined) delete env.EMAIL_TIMEZONE;
  else env.EMAIL_TIMEZONE = saved;
});

describe("greeting", () => {
  it("usa o primeiro nome", () => {
    assert.equal(greeting("Oi", "Maria Silva"), "Oi, Maria");
  });
  it("tolera espaços extras", () => {
    assert.equal(greeting("Oi", "   Maria    Silva  "), "Oi, Maria");
    assert.equal(firstName("\tJoão\n"), "João");
  });
  it("sem nome utilizável devolve só o prefixo", () => {
    assert.equal(greeting("Oi", ""), "Oi");
    assert.equal(greeting("Oi", "   "), "Oi");
  });
});

describe("formatDateTime", () => {
  const iso = "2026-05-10T17:00:00Z";
  it("mostra ano e fuso (padrão São Paulo)", () => {
    delete env.EMAIL_TIMEZONE;
    const s = formatDateTime(iso);
    assert.match(s, /2026/);
    assert.match(s, /14:00/);
    assert.match(s, /BRT|GMT-3/);
  });
  it("respeita EMAIL_TIMEZONE", () => {
    env.EMAIL_TIMEZONE = "UTC";
    const s = formatDateTime(iso);
    assert.match(s, /17:00/);
    assert.match(s, /UTC/);
    assert.match(s, /2026/);
  });
});
