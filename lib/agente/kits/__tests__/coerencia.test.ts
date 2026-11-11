import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InterviewConfig } from "@/lib/contracts";
import { criarClienteFalso } from "../../llm/cliente";
import { JOB_POSTINGS } from "../../../hiring/mocks/job-postings";
import { gerarKitDetalhado } from "../gerar";
import { gerarProblema } from "../questao-da-vaga";
import { casoReal } from "../caso-real-issue-90";
import { kitFalso } from "../falso";
import { KIT_DESIGN_PRODUTO } from "../design-produto";
import { KIT_SYSTEM_DESIGN } from "../system-design";
import { KIT_SYSTEM_DESIGN_IA } from "../system-design-ia";
import { criterioIndireto, criterioSoPorFala, kitSemTermosInternos, type Kit, type Problema } from "../tipos";
import { errosDeConcordancia, errosDeCoerencia, errosDoProblema, errosDoTitulo, MAX_FALA_DO_DESAFIO, MAX_FALA_DO_DESAFIO_EDICAO, validarKit } from "../validar";

const base = (): Kit => ({ ...kitFalso("entregas"), id: "obra_x", problemas: [{ ...kitFalso("entregas").problemas[0], id: "obra_x_p1" }] });
const comProblema = (mudanca: Partial<Problema>): Problema => ({ ...base().problemas[0], ...mudanca });

describe("provaSoPorFala sobrevive ao validarKit", () => {
  it("copia o booleano do critério de entrada de volta ao critério validado", () => {
    const k = base();
    const bruto = structuredClone(k) as unknown as { criterios: Record<string, unknown>[] };
    bruto.criterios[1].provaSoPorFala = true;
    bruto.criterios[2].provaSoPorFala = false;
    bruto.criterios[3].provaSoPorFala = "sim"; // não é booleano: ignorado
    const r = validarKit(bruto);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.kit.criterios[1].provaSoPorFala, true);
    assert.equal(r.kit.criterios[2].provaSoPorFala, false);
    assert.equal(r.kit.criterios[3].provaSoPorFala, undefined);
    assert.equal(r.kit.criterios[0].provaSoPorFala, undefined);
  });
});

describe("criterioSoPorFala", () => {
  it("o campo manda quando existe; sem ele, nome novo não é só por fala", () => {
    assert.equal(criterioSoPorFala({ id: "comunicacao", nome: "Comunicação" }), false);
    assert.equal(criterioIndireto({ id: "comunicacao", nome: "Comunicação" }), true);
    assert.equal(criterioSoPorFala({ id: "comunicacao", nome: "Comunicação", provaSoPorFala: false }), false);
    assert.equal(criterioSoPorFala({ id: "escala", nome: "Escalabilidade" }), false);
    assert.equal(criterioSoPorFala({ id: "x", nome: "Algo", provaSoPorFala: true }), true);
  });

  it("reconhece o nome antigo sem regex", () => {
    assert.equal(criterioSoPorFala({ id: "x", nome: "Comunicação (PLINS)" }), true);
    assert.equal(criterioSoPorFala({ id: "x", nome: "Comunicação oral" }), true);
    assert.equal(criterioSoPorFala({ id: "x", nome: "Expressão Verbal" }), true);
    assert.equal(criterioSoPorFala({ id: "x", nome: "Comunicação nas respostas" }), true);
    assert.equal(criterioSoPorFala({ id: "x", nome: "Respostas e comunicação" }), false);
    assert.equal(criterioSoPorFala({ id: "x", nome: "Oralidade" }), false);
  });

  it("kitSemTermosInternos tira o parêntese do termo interno e marca o critério", () => {
    const k = base();
    k.criterios[3] = { ...k.criterios[3], nome: "Comunicação (PLINS)" };
    const novo = kitSemTermosInternos(k);
    assert.equal(novo.criterios[3].nome, "Comunicação");
    assert.equal(novo.criterios[3].provaSoPorFala, true);
    assert.equal(kitSemTermosInternos(base()).criterios.length, 6);
  });
});

describe("teto da fala do desafio: geração x edição", () => {
  const longa = "a".repeat(MAX_FALA_DO_DESAFIO + 100);

  it("problema recém-gerado: acima de 300 reprova", () => {
    const es = errosDoProblema(comProblema({ falaDoDesafio: longa }));
    assert.ok(es.some((e) => e.includes(`o máximo é ${MAX_FALA_DO_DESAFIO}`)), JSON.stringify(es));
  });

  it("edição de avaliação salva: até 600 passa, acima de 600 reprova", () => {
    assert.deepEqual(errosDoProblema(comProblema({ falaDoDesafio: longa }), { edicao: true }), []);
    const k = base();
    k.problemas[0].falaDoDesafio = longa;
    assert.equal(validarKit(k).ok, false);
    assert.equal(validarKit(k, { edicao: true }).ok, true);
    k.problemas[0].falaDoDesafio = "a".repeat(MAX_FALA_DO_DESAFIO_EDICAO + 1);
    assert.equal(validarKit(k, { edicao: true }).ok, false);
  });

  it("edição não trava questão antiga com título ou concordância ruins", () => {
    const k = base();
    k.problemas = [{ ...casoReal(), falaDoDesafio: "Hoje o tema é o andamento dos pedidos." }];
    assert.equal(validarKit(k).ok, false);
    assert.equal(validarKit(k, { edicao: true }).ok, true);
  });
});

describe("título coerente com o enunciado", () => {
  it("compartilha uma palavra de conteúdo (singular/plural, acento)", () => {
    assert.deepEqual(errosDoTitulo(comProblema({ titulo: "Rastreio de Pedido", enunciado: "Mostre o status dos pedidos." })), []);
    assert.deepEqual(errosDoTitulo(comProblema({ titulo: "Roteirização", enunciado: "Desenhe a roteirizacao das rotas." })), []);
  });

  it("aceita palavra em comum com a primeira linha da ficha", () => {
    const ficha = [{ pergunta: "Quantos motoristas?", resposta: "Cerca de 5 mil." }, ...base().problemas[0].ficha.slice(1)];
    assert.deepEqual(errosDoTitulo(comProblema({ titulo: "Frota de Motoristas", enunciado: "Desenhe o sistema.", ficha })), []);
  });

  it("reprova e diz o que achou", () => {
    const es = errosDoTitulo(comProblema({ titulo: "Painel de Vendas em Tempo Real", enunciado: "Mostre o status das entregas dos pedidos aos clientes." }));
    assert.equal(es.length, 1);
    assert.ok(es[0].includes('o título fala de "vendas"'), es[0]);
    assert.ok(es[0].includes('o enunciado, de "mostre", "status", "entregas"'), es[0]);
  });

  it("sigla em maiúsculas do título conta se aparece no enunciado", () => {
    assert.deepEqual(errosDoTitulo(comProblema({ titulo: "Encurtador de URL", enunciado: "Receba uma URL longa e devolva uma curta." })), []);
    assert.equal(errosDoTitulo(comProblema({ titulo: "Encurtador de URL", enunciado: "Receba um link longo." })).length, 1);
  });

  it("título só com palavras vazias não reprova (nada a comparar)", () => {
    assert.deepEqual(errosDoTitulo(comProblema({ titulo: "Sistema em Tempo Real" })), []);
  });
});

describe("concordância de gênero barata", () => {
  const ficha = (resposta: string) => [{ pergunta: "Quantos pedidos por dia?", resposta }, ...base().problemas[0].ficha.slice(1)];

  it("o caso da issue: 'das suas pedidos' contra 'quantos pedidos'", () => {
    const p = comProblema({ enunciado: "Mostre o status das entregas das suas pedidos.", ficha: ficha("Muitos.") });
    const es = errosDeConcordancia(p);
    assert.equal(es.length, 1, JSON.stringify(es));
    assert.ok(es[0].includes('"suas pedidos"'), es[0]);
  });

  it("o contrário: masculino antes de substantivo feminino", () => {
    const p = comProblema({ enunciado: "Mostre os entregas aos clientes.", ficha: ficha("Cada entrega muda de status; as entregas são enviadas.") });
    // 'as entregas' (fem) x 'os entregas' (masc)
    assert.ok(errosDeConcordancia(p).some((e) => e.includes('"as entregas"') && e.includes('"os entregas"')));
  });

  it("texto correto, ou palavra de dois gêneros, não reprova", () => {
    assert.deepEqual(errosDeConcordancia(comProblema({ enunciado: "Mostre o status das entregas dos seus pedidos. Todos os clientes e todas as clientes veem.", ficha: ficha("Os pedidos e as entregas.") })), []);
    assert.deepEqual(errosDeConcordancia(comProblema({ enunciado: "Cada pedido chega a pedido do cliente: o pedido e a pedido." })), [] /* 'a' sozinho não conta */);
  });

  it("não pareia entre campos de uma palavra com determinantes de outro campo vizinho sem relação", () => {
    assert.deepEqual(errosDeConcordancia(comProblema({ enunciado: "Mostre os pedidos.", falaDoDesafio: "Hoje o tema é como mostrar as entregas." })), []);
  });
});

describe("geração aceita problema que só falha na coerência", () => {
  const config = InterviewConfig.parse({
    id: "cfg-coer", mode: "system_design", roleTitle: "Backend", jobDescription: "Entregas de pedidos.",
    seniority: "senior", focus: [{ area: "escala_produto", weight: 1 }],
    criteria: [{ id: "c1", name: "Falhas", description: "x", weight: 1, focus: "escala_produto" }],
    problemId: "encurtador-de-url", languages: ["python"],
  });
  const doModelo = (p: Problema) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...resto } = p;
    return resto;
  };
  const ok = () => ({ ...base().problemas[0], titulo: "Painel de Vendas", enunciado: "Mostre o status das entregas dos pedidos." });

  it("2 respostas só com erro de título: aceita", async () => {
    const llm = criarClienteFalso([doModelo(ok()), doModelo(ok())]);
    const r = await gerarProblema(config, llm);
    assert.equal(r.tentativas, 2);
    assert.equal(r.problema.titulo, "Painel de Vendas");
  });

  it("2 respostas com enunciado vazio: lança", async () => {
    const ruim = { ...ok(), enunciado: "" };
    const llm = criarClienteFalso([doModelo(ruim), doModelo(ruim)]);
    await assert.rejects(gerarProblema(config, llm), (e: Error) => e.message.includes("inválida"));
  });
});

describe("kit inteiro: só coerência falha", () => {
  const vaga = JOB_POSTINGS[0];
  const comTitulo = (): Kit => ({ ...kitFalso(vaga.title), problemas: [{ ...kitFalso(vaga.title).problemas[0], titulo: "Painel de Vendas", enunciado: "Mostre o status das entregas." }] });

  it("aceita na 2ª tentativa", async () => {
    const r = await gerarKitDetalhado({ llm: criarClienteFalso([comTitulo(), comTitulo()]), vaga, revisar: false });
    assert.equal(r.tentativas, 2);
  });

  it("outro erro continua lançando", async () => {
    const ruim = comTitulo();
    ruim.problemas[0].enunciado = "";
    await assert.rejects(gerarKitDetalhado({ llm: criarClienteFalso([ruim, ruim]), vaga, revisar: false }));
  });
});

describe("caso real da issue #90", () => {
  it("reprova por título E por concordância", () => {
    const es = errosDeCoerencia(casoReal());
    assert.ok(es.some((e) => e.includes('o título fala de "vendas"')), JSON.stringify(es));
    assert.ok(es.some((e) => e.includes("concordância") && e.includes("suas pedidos")), JSON.stringify(es));
  });
});

describe("problemas dos kits fixos passam nas checagens de coerência", () => {
  for (const kit of [KIT_SYSTEM_DESIGN, KIT_SYSTEM_DESIGN_IA, KIT_DESIGN_PRODUTO]) {
    for (const p of kit.problemas) {
      it(`${kit.id} / ${p.id}`, () => {
        assert.deepEqual(errosDoTitulo(p), []);
        assert.deepEqual(errosDeConcordancia(p), []);
      });
    }
  }
});
