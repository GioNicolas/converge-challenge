import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lerFormato } from "../formato";

describe("lerFormato", () => {
  it("quadro, Excalidraw e desenho de arquitetura são system design", () => {
    for (const t of ["Vamo de quadro", "Vamos com quadro", "Eu quero que seja no excalidraw", "Prefiro que ele desenhe a arquitetura", "Faz system design", "quadro branco mesmo"]) {
      assert.equal(lerFormato(t), "system_design", t);
    }
  });
  it("código ao vivo, codar e construir algoritmo são live coding", () => {
    for (const t of ["Vamos de live coding", "Quero código ao vivo", "Prefiro que ele code ao vivo", "Melhor ele codar", "Quero ver ele construir um algoritmo", "Na IDE mesmo", "Quero que ele escreva código"]) {
      assert.equal(lerFormato(t), "live_coding", t);
    }
  });
  it("pergunta, negação, os dois formatos ou nada de formato não contam", () => {
    for (const t of ["O que é o quadro?", "Não quero quadro", "Nada de código ao vivo", "Esquece o Excalidraw", "Quadro ou código ao vivo, tanto faz", "Pode seguir", "Comunicação pesa mais", ""]) {
      assert.equal(lerFormato(t), undefined, t);
    }
  });
});
