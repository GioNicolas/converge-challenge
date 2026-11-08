import { test } from "node:test";
import assert from "node:assert/strict";
import { escolherVozPt } from "./escolherVoz";

const v = (name: string, lang: string) => ({ name, lang });

test("no Mac, não pega a Luciana (primeira da lista): prefere uma voz masculina pt-BR", () => {
  const mac = [
    v("Samantha", "en-US"), v("Luciana", "pt-BR"), v("Eddy (português (Brasil))", "pt-BR"),
    v("Flo (português (Brasil))", "pt-BR"), v("Joana", "pt-PT"), v("Reed (português (Brasil))", "pt-BR"),
  ];
  assert.equal(escolherVozPt(mac)?.name, "Reed (português (Brasil))");
});

test("no Edge, prefere o Antonio", () => {
  const edge = [
    v("Microsoft Francisca Online (Natural) - Portuguese (Brazil)", "pt-BR"),
    v("Microsoft Antonio Online (Natural) - Portuguese (Brazil)", "pt-BR"),
  ];
  assert.match(escolherVozPt(edge)?.name ?? "", /Antonio/);
});

test("Daniel em inglês não conta: só vozes pt-BR", () => {
  assert.equal(escolherVozPt([v("Daniel", "en-GB"), v("Luciana", "pt-BR")])?.name, "Luciana");
});

test("pt-BR desconhecida ganha das femininas conhecidas", () => {
  assert.equal(escolherVozPt([v("Google português do Brasil", "pt-BR"), v("Voz X", "pt_BR")])?.name, "Voz X");
});

test("sem pt-BR, cai em qualquer pt; sem pt, nenhuma", () => {
  assert.equal(escolherVozPt([v("Joana", "pt-PT")])?.name, "Joana");
  assert.equal(escolherVozPt([v("Samantha", "en-US")]), undefined);
});

test("só a voz feminina do Google é descartada, não qualquer voz Google", () => {
  assert.equal(escolherVozPt([v("Google português do Brasil", "pt-BR"), v("Google masculino", "pt-BR")])?.name, "Google masculino");
});
