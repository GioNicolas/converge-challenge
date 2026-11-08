// Nota de adaptação à mudança no problema (quadro): só com a mudança anunciada, só com falas reais
// do candidato DEPOIS dela, e fora da nota geral.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventoArmazenado } from "../armazenamento/repositorio";
import { KIT_SYSTEM_DESIGN } from "../kits/system-design";
import { avaliarAdaptacao, extrairFontes, gerarScorecardFalso, montarEntradaDoPrompt } from "../scorecard";
import { estadoInicial, transicionar, type EstadoSessao } from "../sessao/estado";

const T0 = Date.parse("2026-11-08T15:00:00.000Z");
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();
const problema = KIT_SYSTEM_DESIGN.problemas[0];
const mudanca = problema.empecilho!;

function sessao(comMudanca: boolean): { estado: EstadoSessao; eventos: EventoArmazenado[] } {
  let estado: EstadoSessao = { ...estadoInicial({ criterios: KIT_SYSTEM_DESIGN.criterios.map((c) => c.id) }), fase: "ALTO_NIVEL", faseIniciadaEm: T0 };
  estado = transicionar(estado, { tipo: "CANDIDATO_FALOU", texto: "Vou usar um banco só para guardar os links.", fimDeResposta: false }, T0 + 60_000).estado;
  if (comMudanca) {
    estado = transicionar(estado, { tipo: "EMPECILHO_ANUNCIADO", empecilho: { id: mudanca.id, fala: mudanca.fala, requisito: mudanca.requisito, exige: mudanca.exige, forcado: false } }, T0 + 120_000).estado;
    estado = transicionar(estado, { tipo: "CANDIDATO_FALOU", texto: "Com dez vezes mais escrita eu divido os links pelo começo do código.", fimDeResposta: false }, T0 + 150_000).estado;
  }
  const eventos: EventoArmazenado[] = [
    { horario: iso(30), tipo: "desenho", dados: { grafo: "COMPONENTES\n- [r1] Serviço (retângulo)", mudancas: "" }, recebidoEm: 0 },
    { horario: iso(160), tipo: "desenho", dados: { grafo: "COMPONENTES\n- [r1] Serviço (retângulo)\n- [e1] Banco A (elipse)\n- [e2] Banco B (elipse)", mudancas: "" }, recebidoEm: 0 },
  ];
  return { estado, eventos };
}

describe("adaptação à mudança no problema", () => {
  it("o estado guarda a mudança uma vez só e ela entra na conversa", () => {
    const { estado } = sessao(true);
    assert.equal(estado.empecilho?.anunciadoEm, T0 + 120_000);
    const de_novo = transicionar(estado, { tipo: "EMPECILHO_ANUNCIADO", empecilho: { ...estado.empecilho!, id: "outra" } }, T0 + 200_000).estado;
    assert.equal(de_novo.empecilho?.id, mudanca.id);
    assert.equal(estado.conversa.filter((f) => f.texto === mudanca.fala).length, 1);
  });

  it("sem mudança anunciada não há adaptação, mesmo que o modelo invente uma", () => {
    const { estado, eventos } = sessao(false);
    const r = avaliarAdaptacao({ nota: 4, justificativa: "x", evidencias: [] }, estado, extrairFontes(estado, eventos, []));
    assert.equal(r.adaptacao, undefined);
    assert.equal(r.ajustes.length, 1);
  });

  it("só vale fala do candidato depois da mudança; os números vêm da linha do tempo", () => {
    const { estado, eventos } = sessao(true);
    const fontes = extrairFontes(estado, eventos, []);
    const r = avaliarAdaptacao({
      nota: 3,
      justificativa: "Dividiu os links.",
      evidencias: [
        { horario: iso(150), texto: "divido os links pelo começo do código" },
        { horario: iso(60), texto: "Vou usar um banco só" },
      ],
    }, estado, fontes);
    assert.equal(r.adaptacao?.nota, 3);
    assert.equal(r.adaptacao?.evidencias.length, 1, "a fala de antes da mudança não prova adaptação");
    assert.equal(r.adaptacao?.desenhos_depois, 1);
    assert.equal(r.adaptacao?.falas_depois, 1);
    assert.equal(r.adaptacao?.mudanca, mudanca.requisito);
  });

  it("nota sem prova ou fora da escala vira null", () => {
    const { estado, eventos } = sessao(true);
    const fontes = extrairFontes(estado, eventos, []);
    assert.equal(avaliarAdaptacao({ nota: 4, justificativa: "x", evidencias: [{ horario: iso(150), texto: "frase que ninguém disse" }] }, estado, fontes).adaptacao?.nota, null);
    assert.equal(avaliarAdaptacao({ nota: 2.5, justificativa: "x", evidencias: [{ horario: iso(150), texto: "divido os links" }] }, estado, fontes).adaptacao?.nota, null);
  });

  it("o scorecard falso traz a adaptação sem nota e a mudança vai para o prompt do scorecard", () => {
    const { estado, eventos } = sessao(true);
    const sc = gerarScorecardFalso({ kit: KIT_SYSTEM_DESIGN, problema }, { sessaoId: "s", candidatoId: "c", estado, eventos, imagens: [] });
    assert.equal(sc.adaptacao?.nota, null);
    assert.equal(sc.adaptacao?.desenhos_depois, 1);
    const entrada = montarEntradaDoPrompt({ sessaoId: "s", candidatoId: "c", estado, eventos, imagens: [] }, extrairFontes(estado, eventos, []));
    assert.equal(entrada.mudanca?.fala, mudanca.fala);
  });
});
