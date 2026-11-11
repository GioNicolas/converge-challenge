// Issue #89: o relatório do quadro culpava o candidato por pedir repetição, se contradizia e mostrava jargão.
// O caso real (15 min, encerrado aos 8:43, 3 de 6 critérios com nota) vem de lib/dev/scorecard/cenarios.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALAS_DO_CASO, montarCasoEncerradoPeloCandidato } from "../../dev/scorecard/cenarios";
import { criarClienteFalso } from "../llm/cliente";
import { KIT_SYSTEM_DESIGN } from "../kits/system-design";
import { KIT_DESIGN_PRODUTO } from "../kits/design-produto";
import { criterioIndireto, criterioSoPorFala, kitSemTermosInternos, type Criterio, type Kit } from "../kits/tipos";
import { montarRelatorio } from "../relatorio";
import { aplicarGuardas, duracaoDaSessao, extrairFontes, gerarScorecard, ehItemGenerico, type SaidaScorecardLlm } from "../scorecard";

/** Termos internos que nunca aparecem nos textos que a recrutadora lê (comparados como palavra inteira). */
const TERMOS_INTERNOS = ["plin", "plins", "componentes_fluxo", "dados_consistencia", "e1"];

function temTermoInterno(texto: string): boolean {
  const palavras = new Set<string>();
  let palavra = "";
  for (const ch of `${texto.toLowerCase()} `) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "_") palavra += ch;
    else {
      if (palavra) palavras.add(palavra);
      palavra = "";
    }
  }
  return TERMOS_INTERNOS.some(t => palavras.has(t));
}

async function gerarDoCaso(alterar?: (s: SaidaScorecardLlm) => void) {
  const caso = montarCasoEncerradoPeloCandidato();
  alterar?.(caso.saidaRuim);
  const llm = criarClienteFalso(() => caso.saidaRuim);
  const sc = await gerarScorecard({ llm, kit: caso.kit, problema: caso.problema }, caso.entrada);
  return { ...caso, sc };
}

const texto = (sc: Awaited<ReturnType<typeof gerarDoCaso>>["sc"]) => JSON.stringify(sc);

describe("caso real da issue #89 (encerrada aos 8:43 de 15 min)", () => {
  it("a duração vem da linha do tempo, não do relógio", () => {
    const { entrada } = montarCasoEncerradoPeloCandidato();
    const d = duracaoDaSessao(entrada.estado, entrada.eventos)!;
    assert.equal(d.previstoMin, 15);
    assert.equal(Math.floor(d.decorridoMin), 8);
  });

  it("comunicação não recebe nota baixa com prova de pedido de repetição", async () => {
    const { sc } = await gerarDoCaso();
    const com = sc.criterios.find(c => c.criterio === "comunicacao")!;
    assert.equal(com.nota, null);
    assert.deepEqual(com.evidencias, []);
    assert.ok(sc.ajustes.some(a => a.includes("pedido de repetição")));
    for (const termo of ["repetições", "repeticoes", "dificuldade constante", "abruptamente"]) assert.ok(!texto(sc).toLowerCase().includes(termo), termo);
  });

  it("o que o candidato explicou de verdade continua valendo", async () => {
    const { sc } = await gerarDoCaso(s => {
      const com = s.criterios.find(c => c.criterio === "comunicacao")!;
      com.nota = 3;
      com.justificativa = "Explicou como gera o código curto.";
      com.evidencias = [
        { tipo: "fala", horario: FALAS_DO_CASO.nao_entendi.horario, texto: FALAS_DO_CASO.nao_entendi.texto, elementos: [], imagem: null },
        { tipo: "fala", horario: FALAS_DO_CASO.codigo.horario, texto: FALAS_DO_CASO.codigo.texto, elementos: [], imagem: null },
      ];
    });
    const com = sc.criterios.find(c => c.criterio === "comunicacao")!;
    assert.equal(com.nota, 3);
    assert.deepEqual(com.evidencias.map(e => e.texto), [FALAS_DO_CASO.codigo.texto]);
  });

  it("a observação 'pediu repetições' da análise é descartada antes de virar prova", () => {
    const { entrada } = montarCasoEncerradoPeloCandidato();
    assert.equal(entrada.estado.observacoes.length, 1);
    assert.deepEqual(extrairFontes(entrada.estado, entrada.eventos, []).observacoes, []);
  });

  it("não recomenda 'Não avançar' com poucos critérios e entrevista curta", async () => {
    const { sc } = await gerarDoCaso();
    assert.equal(sc.recomendacao, "evidencia_insuficiente");
  });

  it("o briefing diz o que faltou e por quê, sem 'próxima conversa' junto de 'Não avançar'", async () => {
    const { sc } = await gerarDoCaso();
    assert.ok(sc.briefing_para_proxima_etapa.includes("durou 8 de 15 minutos"), sc.briefing_para_proxima_etapa);
    assert.ok(sc.briefing_para_proxima_etapa.includes("4 de 6 critérios ficaram sem prova"), sc.briefing_para_proxima_etapa);
    assert.ok(sc.briefing_para_proxima_etapa.includes("Sem prova: ") && sc.briefing_para_proxima_etapa.split("Sem prova: ")[1].includes("Comunicação"), sc.briefing_para_proxima_etapa);
    assert.ok(!sc.briefing_para_proxima_etapa.includes("Revisar as evidências por critério"));
  });

  it("nenhum item de 'onde aprofundar' é só 'Aprofundar <critério>.' e todos dizem o que faltou", async () => {
    const { sc } = await gerarDoCaso();
    assert.equal(sc.pontos_a_aprofundar.length, 4);
    for (const item of sc.pontos_a_aprofundar) {
      assert.ok(!ehItemGenerico(item), item);
      assert.ok(!item.startsWith("Aprofundar"), item);
      assert.ok(item.length > 40, item);
    }
    assert.ok(sc.pontos_a_aprofundar.some(i => i.startsWith("Escalabilidade: sem prova")));
    assert.ok(sc.pontos_a_aprofundar.some(i => i.startsWith("Comunicação: não houve fala")));
  });

  it("o resumo da entrevista é factual, sem adjetivo, e nada tem termo interno", async () => {
    const { sc } = await gerarDoCaso();
    assert.ok(sc.resumo_da_entrevista!.includes("Houve prova em 2 de 6 critérios: Requisitos e escopo (2 de 4), Componentes e fluxo (2 de 4)"), sc.resumo_da_entrevista);
    assert.ok(sc.resumo_da_entrevista!.includes("A entrevista durou 8 de 15 minutos"), sc.resumo_da_entrevista);
    // Os ids ficam nos campos estruturados; nos textos que a recrutadora lê não aparece nenhum.
    const lidos = [sc.briefing_para_proxima_etapa, sc.resumo_da_entrevista, sc.resumo_da_solucao, ...sc.pontos_fortes, ...sc.pontos_a_aprofundar,
      ...sc.criterios.map(c => c.justificativa), ...sc.ajustes].join("\n");
    assert.ok(!temTermoInterno(lidos), lidos);
  });

  it("o relatório mostra os critérios sem o termo interno", async () => {
    const { sc, kit, problema, entrada } = await gerarDoCaso();
    const r = montarRelatorio({ sessao: { candidatoId: "c", estado: entrada.estado, criadaEm: 0 } as never, scorecard: sc, kit, problema, eventos: entrada.eventos, imagens: [] });
    assert.ok(r.criterios.some(c => c.nome === "Comunicação"));
    assert.ok(!JSON.stringify(r).toLowerCase().includes("plin"));
  });
});

describe("recomendação 'Não avançar' com cobertura e duração", () => {
  function saidaComNotas(notas: (number | null)[], kit: Pick<Kit, "criterios"> = KIT_SYSTEM_DESIGN) {
    const { entrada } = montarCasoEncerradoPeloCandidato();
    const fontes = extrairFontes(entrada.estado, entrada.eventos, []);
    const saida: SaidaScorecardLlm = {
      nota_geral: 1, recomendacao: "nao_avancar",
      criterios: kit.criterios.map((c, i) => ({
        criterio: c.id, nota: notas[i] ?? null, justificativa: "Explicou o cache e o banco.",
        evidencias: notas[i] ? [{ tipo: "fala" as const, horario: FALAS_DO_CASO.codigo.horario, texto: FALAS_DO_CASO.codigo.texto, elementos: [], imagem: null }] : [],
      })),
      pontos_fortes: [], pontos_a_aprofundar: [], briefing_para_proxima_etapa: "x", resumo_da_solucao: "", resumo_da_entrevista: "",
    };
    return (duracao: { decorridoMin: number; previstoMin: number } | null | undefined) =>
      aplicarGuardas(saida, { sessaoId: "s", candidatoId: "c", problemaId: "p", rubrica: kit.criterios, fontes, origem: "llm", duracao });
  }

  it("3 de 6 com 8,7 de 15 min: evidência insuficiente; com 9 min ou mais: não avançar", () => {
    const g = saidaComNotas([1, 1, 2]);
    assert.equal(g({ decorridoMin: 8.7, previstoMin: 15 }).recomendacao, "evidencia_insuficiente");
    assert.equal(g({ decorridoMin: 9, previstoMin: 15 }).recomendacao, "nao_avancar");
    assert.equal(g({ decorridoMin: 15, previstoMin: 15 }).recomendacao, "nao_avancar");
  });

  it("2/3 dos critérios com nota basta mesmo numa entrevista curta", () => {
    assert.equal(saidaComNotas([1, 1, 2, 1])({ decorridoMin: 3, previstoMin: 15 }).recomendacao, "nao_avancar");
  });

  it("duração desconhecida: só a cobertura vale", () => {
    assert.equal(saidaComNotas([1, 1, 2])(undefined).recomendacao, "evidencia_insuficiente");
    assert.equal(saidaComNotas([1, 1, 2, 1])(null).recomendacao, "nao_avancar");
  });

  it("menos da metade dos critérios continua sendo evidência insuficiente", () => {
    assert.equal(saidaComNotas([1, 1])({ decorridoMin: 15, previstoMin: 15 }).recomendacao, "evidencia_insuficiente");
  });

  it("o texto de 'não avançar' não manda para a próxima conversa", () => {
    const sc = saidaComNotas([1, 1, 2, 1])({ decorridoMin: 15, previstoMin: 15 });
    assert.equal(sc.recomendacao, "nao_avancar");
    assert.ok(!sc.briefing_para_proxima_etapa.toLowerCase().includes("próxima conversa"));
    assert.ok(sc.briefing_para_proxima_etapa.includes("Sem prova: "), sc.briefing_para_proxima_etapa);
  });
});

describe("critério de comunicação sem o termo interno", () => {
  it("os dois kits usam o nome 'Comunicação' e o campo provaSoPorFala", () => {
    for (const kit of [KIT_SYSTEM_DESIGN, KIT_DESIGN_PRODUTO]) {
      const c = kit.criterios.find(x => x.id === "comunicacao")!;
      assert.equal(c.nome, "Comunicação");
      assert.equal(c.provaSoPorFala, true);
      assert.ok(criterioSoPorFala(c) && criterioIndireto(c));
    }
  });

  it("kit salvo com o nome antigo se comporta igual e ganha o nome novo, com o mesmo id", () => {
    const antigo: Criterio = { id: "comunicacao", nome: "Comunicação (medida nas respostas aos plins e nas perguntas de requisito)",
      niveis: { 1: "a", 2: "b", 3: "c", 4: "d" } };
    assert.equal(criterioSoPorFala(antigo), true);
    assert.equal(criterioIndireto(antigo), true);
    const kit = kitSemTermosInternos({ criterios: [antigo, KIT_SYSTEM_DESIGN.criterios[0]] });
    assert.equal(kit.criterios[0].id, "comunicacao");
    assert.equal(kit.criterios[0].nome, "Comunicação");
    assert.equal(kit.criterios[0].provaSoPorFala, true);
    assert.equal(kit.criterios[1], KIT_SYSTEM_DESIGN.criterios[0]);
    const limpo = { criterios: KIT_SYSTEM_DESIGN.criterios };
    assert.equal(kitSemTermosInternos(limpo), limpo);
  });

  it("comunicação gerada ('Comunicação', sem campo) segue fora da cobertura, como antes, mas aceita prova de desenho", () => {
    const gerado: Criterio = { id: "comunicacao", nome: "Comunicação", niveis: { 1: "a", 2: "b", 3: "c", 4: "d" } };
    assert.equal(criterioIndireto(gerado), true);
    assert.equal(criterioSoPorFala(gerado), false);
  });

  it("desenho não vale como prova de critério que só se prova por fala (campo novo e nome antigo)", () => {
    const { entrada } = montarCasoEncerradoPeloCandidato();
    const fontes = extrairFontes(entrada.estado, entrada.eventos, []);
    const desenho = { tipo: "desenho" as const, horario: "2026-11-10T14:04:00.000Z", texto: null, elementos: ["r1"], imagem: null };
    for (const c of [{ id: "comunicacao", nome: "Comunicação", provaSoPorFala: true }, { id: "comunicacao", nome: "Comunicação (medida nas respostas aos plins)" }]) {
      const saida: SaidaScorecardLlm = { nota_geral: 3, recomendacao: "avancar", pontos_fortes: [], pontos_a_aprofundar: [], briefing_para_proxima_etapa: "", resumo_da_solucao: "", resumo_da_entrevista: "",
        criterios: [{ criterio: "comunicacao", nota: 3, justificativa: "ok", evidencias: [desenho] }] };
      const sc = aplicarGuardas(saida, { sessaoId: "s", candidatoId: "c", problemaId: "p", rubrica: [c], fontes, origem: "llm" });
      assert.equal(sc.criterios[0].nota, null);
      assert.ok(sc.ajustes.some(a => a.includes("rubrica exige fala")));
    }
  });
});
