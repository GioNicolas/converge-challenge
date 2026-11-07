import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitDemo } from "../../kits/demo";
import { criteriosSemEvidencia, estadoInicial, type EstadoSessao } from "../../sessao/estado";
import type { PedidoAnalise } from "../../sessao/tipos";
import { montarPromptAvaliador, montarSistemaEstatico } from "../avaliador";

const problema = kitDemo.problemas[0];
const AGORA = 5_000_000;

function pedido(extra: Partial<PedidoAnalise> = {}): PedidoAnalise {
  return {
    sessao_id: "s1",
    fase: "APROFUNDAMENTO",
    grafo: "COMPONENTES\n- [r1] Cliente (retângulo)\n- [e1] Postgres (elipse)\nCONEXÕES\n- [s1] Cliente → Postgres",
    mudancas: "+ adicionou [e1] Postgres",
    conversa_recente: [{ quem: "candidato", texto: "Vou usar Postgres" }],
    perguntas_feitas: 1,
    imagem_url: null,
    ...extra,
  };
}

const estado: EstadoSessao = {
  ...estadoInicial({ criterios: kitDemo.criterios.map((c) => c.id) }),
  fase: "APROFUNDAMENTO",
  faseIniciadaEm: AGORA - 60_000,
  perguntasFeitas: 1,
  ultimaPerguntaEm: AGORA - 10_000,
  perguntas: [
    { numero: 1, status: "duvida", pergunta: "Por que um banco só?", nota: null, elementos: ["e1"], degrau: 1, fase: "APROFUNDAMENTO", feitaEm: AGORA - 10_000 },
  ],
  cobertura: { requisitos: { positivo: 1, negativo: 0, neutro: 0 }, escalabilidade: { positivo: 0, negativo: 0, neutro: 0 } },
};

describe("bloco estático", () => {
  const e = montarSistemaEstatico(kitDemo, problema);

  it("explica a notação do grafo", () => {
    for (const trecho of [
      "COMPONENTES", "CONEXÕES", "ANOTAÇÕES SOLTAS", "SEÇÕES", "DESENHOS SEM TEXTO", "ORDEM NA TELA",
      "r retângulo", "e elipse", "l losango", "s seta", "t texto", "m moldura", "f desenho", "i imagem",
      "\"A → B\" é uma seta com direção, de A para B", "\"A — B\" é uma linha sem direção",
      "\"?\"", "(seta solta)", "— dentro de [x]", "rótulo",
      "NÃO implica protocolo", "NUNCA infira uma conexão ou um destino",
      "fato sobre o desenho",
    ]) {
      assert.ok(e.includes(trecho), `faltou: ${trecho}`);
    }
  });

  it("traz os princípios, a tabela de ações e as regras de saída", () => {
    for (const trecho of [
      "O candidato conduz", "Não valide nem corrija", "espontaneo", "Escada de ajuda", "degrau",
      "\"ok\"", "\"duvida\"", "\"redirecionar\"", "\"dica\"", "40 caracteres", "UMA pergunta por vez",
      "1 ou 2 áreas", "justo e igual",
    ]) {
      assert.ok(e.toLowerCase().includes(trecho.toLowerCase()), `faltou: ${trecho}`);
    }
  });

  it("traz persona, enunciado, ficha, sinais, armadilhas e ids da rubrica", () => {
    assert.ok(e.includes(kitDemo.persona));
    assert.ok(e.includes(problema.enunciado));
    assert.ok(e.includes(problema.ficha[0].resposta));
    assert.ok(e.includes(problema.armadilhas[0]));
    assert.ok(e.includes(problema.sinaisEsperados[0]));
    for (const c of kitDemo.criterios) assert.ok(e.includes(`- ${c.id} (`));
  });

  it("é determinístico e não depende do estado", () => {
    assert.equal(montarSistemaEstatico(kitDemo, problema), e);
    const a = montarPromptAvaliador(kitDemo, problema, estado, pedido(), AGORA);
    const b = montarPromptAvaliador(kitDemo, problema, estadoInicial(), pedido({ grafo: "COMPONENTES\n- [r9] Outro (retângulo)" }), AGORA + 99_000);
    assert.equal(a.sistema.estatico, b.sistema.estatico);
  });

  it("não contém nada do grafo nem da sessão", () => {
    assert.ok(!e.includes("Postgres (elipse)"));
    assert.ok(!e.includes("Vou usar Postgres"));
  });
});

describe("bloco dinâmico", () => {
  const d = montarPromptAvaliador(kitDemo, problema, estado, pedido(), AGORA).sistema.dinamico;

  it("traz fase, tempo, grafo, mudanças e conversa", () => {
    assert.ok(d.includes("Fase: APROFUNDAMENTO"));
    assert.ok(d.includes("14 min 0 s restantes"));
    assert.ok(d.includes("- [e1] Postgres (elipse)"));
    assert.ok(d.includes("+ adicionou [e1] Postgres"));
    assert.ok(d.includes("Candidato: Vou usar Postgres"));
    assert.ok(d.includes("Perguntas feitas até agora: 1"));
  });

  it("traz critérios sem evidência e perguntas já feitas com elementos", () => {
    const esperados = criteriosSemEvidencia(estado);
    assert.ok(esperados.length > 0);
    assert.ok(d.includes(`SEM evidência: ${esperados.join(", ")}`));
    assert.ok(!d.includes("SEM evidência: requisitos"));
    assert.ok(d.includes('"Por que um banco só?" (elementos: e1)'));
    assert.ok(d.includes("degrau 1"));
  });

  it("lista os status permitidos pela fase", () => {
    assert.ok(d.includes("Status permitidos agora: ok, duvida, redirecionar, dica"));
    const alto = montarPromptAvaliador(kitDemo, problema, { ...estado, fase: "ALTO_NIVEL" }, pedido(), AGORA).sistema.dinamico;
    assert.ok(alto.includes("Status permitidos agora: ok, redirecionar"));
  });

  it("avisa quando o plin está bloqueado por intervalo (mas a análise continua)", () => {
    assert.ok(d.includes("NÃO pode ser levantado agora (INTERVALO_ENTRE_PERGUNTAS)"));
    const livre = montarPromptAvaliador(kitDemo, problema, { ...estado, ultimaPerguntaEm: null }, pedido(), AGORA).sistema.dinamico;
    assert.ok(livre.includes("Um plin pode ser levantado agora"));
  });

  it("mostra a dúvida pendente para o modelo não repetir", () => {
    const comPendente: EstadoSessao = {
      ...estado,
      plin: "PLIN_PENDENTE",
      perguntaPendente: { status: "duvida", pergunta: "E se o cache cair?", nota: null, elementos: ["e1"], degrau: null, observacoes: [], criadoEm: AGORA - 1000 },
    };
    const dp = montarPromptAvaliador(kitDemo, problema, comPendente, pedido(), AGORA).sistema.dinamico;
    assert.ok(dp.includes('"E se o cache cair?"'));
  });

  it("o bloco dinâmico não carrega a ficha nem a rubrica", () => {
    assert.ok(!d.includes(problema.ficha[0].resposta));
    assert.ok(!d.includes(kitDemo.criterios[0].niveis[1]));
  });
});
