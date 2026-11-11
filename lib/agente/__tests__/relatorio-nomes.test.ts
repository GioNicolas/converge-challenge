import assert from "node:assert/strict";
import { describe, it } from "node:test";
import quadro from "../../excalidraw/fixtures/quadro-clientes.json";
import { criarConversor } from "../../excalidraw/conversor";
import type { ExcalidrawElement } from "../../excalidraw/tipos";
import { nomesDosElementos } from "../relatorio";
import type { EventoArmazenado } from "../armazenamento/repositorio";

function desenho(grafo: string): EventoArmazenado {
  return { tipo: "desenho", dados: { grafo } } as unknown as EventoArmazenado;
}

describe("nomesDosElementos: conexões", () => {
  it("caso real (#81): nome legível, sem '?' e sem as marcas internas", () => {
    const { texto } = criarConversor().converter(quadro as unknown as readonly ExcalidrawElement[]);
    const nomes = nomesDosElementos([desenho(texto)]);
    assert.equal(nomes.get("s1"), "Entrada dos clientes → QUADRO DE CLIENTES (Os dados)");
    assert.equal(nomes.get("s2"), "Entrada dos dados → QUADRO DE CLIENTES (Os dados)");
    assert.equal(nomes.get("r4"), "QUADRO DE CLIENTES (Os dados)");
    for (const nome of nomes.values()) assert.ok(!nome.includes("?") && !nome.includes("sem encostar"), nome);
  });

  it("pontas sem caixa viram 'seta de X' e 'seta para X'", () => {
    const nomes = nomesDosElementos([desenho([
      "- [s1] Entrada dos dados → (sem destino)",
      '- [s2] (sem origem) → API ("lê") (tracejada)',
    ].join("\n"))]);
    assert.equal(nomes.get("s1"), "seta de Entrada dos dados");
    assert.equal(nomes.get("s2"), "seta para API");
  });

  it("grafos antigos já gravados ('?' e '(seta solta)') também saem sem '?'", () => {
    const nomes = nomesDosElementos([desenho("- [s1] Entrada dos dados → ? (seta solta)\n- [s2] ? → API (seta solta)")]);
    assert.equal(nomes.get("s1"), "seta de Entrada dos dados");
    assert.equal(nomes.get("s2"), "seta para API");
  });
});
