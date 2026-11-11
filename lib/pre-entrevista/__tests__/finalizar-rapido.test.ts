import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { soAprovacaoDesdeAExtracao } from "../sessoes";
import type { Turno } from "../rascunho";

const r = (text: string): Turno => ({ role: "recrutadora", text });
const a = (text: string): Turno => ({ role: "agente", text });

describe("soAprovacaoDesdeAExtracao", () => {
  const base = [a("Oi"), r("Júnior, foco em lógica"), a("Resumo… Posso finalizar?")];
  it("aprovação depois da última extração não pede outra", () => {
    for (const t of ["Pode", "Sim, pode finalizar.", "Tá ótimo!", "Isso mesmo", "Beleza, pode publicar", "ok"]) {
      assert.equal(soAprovacaoDesdeAExtracao([...base, r(t), a("Agora é só revisar.")], 3), true, t);
    }
  });
  it("fala com conteúdo novo pede extração; sem nenhuma extração antes, também", () => {
    assert.equal(soAprovacaoDesdeAExtracao([...base, r("Pode, mas quero que seja no Excalidraw")], 3), false);
    assert.equal(soAprovacaoDesdeAExtracao([...base, r("Comunicação pesa mais")], 3), false);
    assert.equal(soAprovacaoDesdeAExtracao([...base, r("Pode")], 0), false);
  });
  it("fala que o Totti não entendeu não pede extração (ela não vai para a extração)", () => {
    const quebrada: Turno = { role: "recrutadora", text: "Ele diz expresso.", naoEntendida: true };
    assert.equal(soAprovacaoDesdeAExtracao([...base, quebrada, a("Não peguei essa. Posso finalizar?"), r("Pode")], 3), true);
  });
});
