import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventoArmazenado } from "../armazenamento/repositorio";
import { KIT_SYSTEM_DESIGN } from "../kits/system-design";
import {
  aplicarGuardas,
  citacaoExiste,
  extrairFontes,
  gerarScorecardFalso,
  normalizar,
  SEM_EVIDENCIA,
  type SaidaScorecardLlm,
} from "../scorecard";
import { estadoInicial, transicionar } from "../sessao/estado";

const RUBRICA = KIT_SYSTEM_DESIGN.criterios;
const T1 = "2026-11-07T15:00:00.000Z";
const T2 = "2026-11-07T15:01:00.000Z";
const GRAFO = "COMPONENTES\n- [r1] Cliente (retângulo)\n- [e1] Postgres (elipse)\nCONEXÕES\n- [s1] Cliente → Postgres";

function ev(horario: string, tipo: string, dados: unknown): EventoArmazenado {
  return { horario, tipo, dados, recebidoEm: 0 };
}

function fontes() {
  let e = estadoInicial({ criterios: RUBRICA.map((c) => c.id) });
  e = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "Acho que um Postgres aguenta, é só criar um índice!", fimDeResposta: false }, Date.parse(T2)).estado;
  return {
    estado: e,
    f: extrairFontes(
      e,
      [ev(T1, "desenho", { grafo: GRAFO, mudancas: "+ x" }), ev(T2, "fala", { quem: "candidato", texto: "Vou usar cache na leitura" })],
      [{ numero: 1, horario: T1 }],
    ),
  };
}

function saida(parcial: Partial<SaidaScorecardLlm> = {}): SaidaScorecardLlm {
  return {
    nota_geral: 4,
    recomendacao: "avancar",
    criterios: RUBRICA.map((c) => ({
      criterio: c.id,
      nota: 3,
      justificativa: "ok",
      evidencias: [{ tipo: "fala" as const, horario: T2, texto: "cache na leitura", elementos: [], imagem: null }],
    })),
    pontos_fortes: ["a"],
    pontos_a_aprofundar: ["b"],
    briefing_para_proxima_etapa: "x",
    ...parcial,
  };
}

function guardas(s: SaidaScorecardLlm) {
  return aplicarGuardas(s, { sessaoId: "s1", candidatoId: "c1", problemaId: "p1", rubrica: RUBRICA, fontes: fontes().f, origem: "llm" });
}

describe("scorecard: guardas", () => {
  it("todo critério da rubrica aparece exatamente uma vez (faltante vira sem nota, extra e repetido somem)", () => {
    const s = saida();
    s.criterios = [
      ...s.criterios.slice(0, 3),
      { ...s.criterios[0], nota: 1 },
      { criterio: "inventado", nota: 4, justificativa: "", evidencias: [] },
    ];
    const sc = guardas(s);
    assert.deepEqual(sc.criterios.map((c) => c.criterio), RUBRICA.map((c) => c.id));
    assert.equal(sc.criterios[0].nota, 3, "usa o primeiro repetido");
    assert.equal(sc.criterios[4].nota, null);
    assert.equal(sc.criterios[4].justificativa, SEM_EVIDENCIA);
  });

  it("nota sem evidência vira null com justificativa 'sem evidência suficiente'", () => {
    const s = saida();
    s.criterios[0] = { criterio: RUBRICA[0].id, nota: 4, justificativa: "ótimo", evidencias: [] };
    const sc = guardas(s);
    assert.equal(sc.criterios[0].nota, null);
    assert.match(sc.criterios[0].justificativa, /sem evidência suficiente/i);
  });

  it("fala precisa existir na conversa (normalizada); inventada é descartada e leva a nota junto", () => {
    const s = saida();
    s.criterios[0].evidencias = [{ tipo: "fala", horario: T2, texto: "ACHO que um postgres aguenta...", elementos: [], imagem: null }];
    s.criterios[1].evidencias = [{ tipo: "fala", horario: T2, texto: "frase que ninguém disse", elementos: [], imagem: null }];
    const sc = guardas(s);
    assert.equal(sc.criterios[0].evidencias.length, 1);
    assert.equal(sc.criterios[0].nota, 3);
    assert.equal(sc.criterios[1].evidencias.length, 0);
    assert.equal(sc.criterios[1].nota, null);
    assert.ok(sc.ajustes.some((a) => a.includes("citação não encontrada")));
  });

  it("desenho: ids inexistentes são removidos; sem referência válida é descartada", () => {
    const s = saida();
    s.criterios[0].evidencias = [{ tipo: "desenho", horario: T1, texto: null, elementos: ["e1", "zz9"], imagem: null }];
    s.criterios[1].evidencias = [{ tipo: "desenho", horario: "2020-01-01T00:00:00.000Z", texto: null, elementos: ["zz9"], imagem: null }];
    s.criterios[2].evidencias = [{ tipo: "desenho", horario: "2020-01-01T00:00:00.000Z", texto: null, elementos: ["r1"], imagem: "snap_1.png" }];
    s.criterios[3].evidencias = [{ tipo: "desenho", horario: T1, texto: null, elementos: [], imagem: "snap_7.png" }];
    const sc = guardas(s);
    assert.deepEqual(sc.criterios[0].evidencias[0].elementos, ["e1"]);
    assert.equal(sc.criterios[1].nota, null);
    assert.equal(sc.criterios[2].evidencias[0].horario, T1, "horário falso é trocado pelo do desenho em que o id apareceu");
    assert.equal(sc.criterios[2].evidencias[0].imagem, "/api/sessoes/s1/imagens/1");
    assert.equal(sc.criterios[3].evidencias[0].imagem, undefined, "imagem inexistente removida; horário válido mantém a prova");
  });

  it("nota_geral é recalculada como média das notas não nulas (1 casa)", () => {
    const s = saida({ nota_geral: 1 });
    s.criterios[0].nota = 4;
    s.criterios[1].nota = 2;
    s.criterios[2].nota = 2.4; // arredonda para 2
    const sc = guardas(s);
    assert.equal(sc.nota_geral, 2.8); // (4+2+2+3+3+3)/6 = 2.83
  });

  it("recomendação neutra quando menos da metade dos critérios tem evidência", () => {
    const s = saida({ recomendacao: "avancar" });
    for (let i = 0; i < 4; i++) s.criterios[i].evidencias = [];
    assert.equal(guardas(s).recomendacao, "evidencia_insuficiente");
    assert.equal(guardas(saida({ recomendacao: "avancar" })).recomendacao, "avancar");
  });

  it("sem nenhuma nota: nota_geral null", () => {
    const s = saida();
    s.criterios = s.criterios.map((c) => ({ ...c, evidencias: [] }));
    assert.equal(guardas(s).nota_geral, null);
  });
});

describe("scorecard: auxiliares", () => {
  it("normalizar tira acentos, pontuação e caixa", () => {
    assert.equal(normalizar("  Você, AGORA!! "), "voce agora");
  });
  it("citacaoExiste exige trechos de 4+ caracteres", () => {
    assert.equal(citacaoExiste("ok", [{ texto: "ok tudo bem" }]).ok, false);
    assert.equal(citacaoExiste("tudo ... bem", [{ texto: "ok tudo bem" }]).ok, true);
  });
  it("scorecard falso passa pelas mesmas guardas e cobre toda a rubrica", () => {
    const { estado } = fontes();
    const comObs = {
      ...estado,
      observacoes: [
        { criterio: "escalabilidade", sinal: "negativo" as const, espontaneo: false, evidencia: "banco único", em: Date.parse(T2), fase: "APROFUNDAMENTO" as const },
      ],
    };
    const sc = gerarScorecardFalso(
      { kit: KIT_SYSTEM_DESIGN, problema: KIT_SYSTEM_DESIGN.problemas[0] },
      { sessaoId: "s1", candidatoId: "c1", estado: comObs, eventos: [ev(T1, "desenho", { grafo: GRAFO })], imagens: [] },
    );
    assert.equal(sc.origem, "fake");
    assert.equal(sc.criterios.length, RUBRICA.length);
    const esc = sc.criterios.find((c) => c.criterio === "escalabilidade");
    assert.equal(esc?.nota, 1);
    assert.ok((esc?.evidencias.length ?? 0) > 0);
    assert.equal(sc.recomendacao, "evidencia_insuficiente");
  });
});
