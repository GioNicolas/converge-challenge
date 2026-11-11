import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InterviewConfig } from "@/lib/contracts";
import { ErroLlm, criarClienteFalso } from "../../llm/cliente";
import { criarClientePrincipal } from "../../llm/principal";
import { NOME_SCHEMA_REVISAO } from "../../prompts/revisor-problema";
import { kitFalso } from "../falso";
import { casoReal } from "../caso-real-issue-90";
import { gerarKitDetalhado } from "../gerar";
import { JOB_POSTINGS } from "../../../hiring/mocks/job-postings";
import { gerarQuestaoDaVaga } from "../questao-da-vaga";
import { aplicarRevisao, camposComNumeroAlterado, numerosDoTexto, revisarProblema, type RevisaoDoProblema } from "../revisar";
import { criarRepositorioAvaliacoesEmMemoria } from "../repositorio";
import type { Problema } from "../tipos";
import { errosDoProblema, MAX_FALA_DO_DESAFIO } from "../validar";

/** O que um bom revisor devolveria para o caso real. */
const revisaoBoa = (p: Problema): RevisaoDoProblema => ({
  problemas: ["concordância: \"das suas pedidos\"", "concordância: \"das pedidos deles\"", "título fala de vendas; o enunciado, de entregas", "fala longa"],
  titulo: "Status de Entrega de Pedidos em Tempo Real",
  enunciado: p.enunciado.replace("das suas pedidos", "dos seus pedidos"),
  falaDoDesafio: "Hoje o tema é o andamento dos pedidos de um app de logística, do ponto de vista do cliente e da operação. Antes de desenhar, pode me perguntar o que precisar.",
  ficha: p.ficha.map((f) => ({ ...f, resposta: f.resposta.replace("próprias pedidos", "próprios pedidos") })),
});

describe("o caso real da issue #90", () => {
  it("o original é válido no validador de tamanhos, exceto pela fala longa", () => {
    const es = errosDoProblema(casoReal());
    assert.equal(es.length, 1, JSON.stringify(es));
    assert.match(es[0], /falaDoDesafio com \d+ caracteres/);
    assert.ok(casoReal().falaDoDesafio!.length > 350);
  });

  it("a revisão corrige concordância, título e fala, e os números ficam idênticos", async () => {
    const original = casoReal();
    const llm = criarClienteFalso([revisaoBoa(original)]);
    const r = await revisarProblema(original, llm);
    assert.equal(r.aceita, true, r.descartada);
    assert.equal(r.mudou, true);
    assert.equal(r.problema.titulo, "Status de Entrega de Pedidos em Tempo Real");
    assert.ok(r.problema.enunciado.includes("dos seus pedidos"));
    assert.ok(!r.problema.enunciado.includes("das suas pedidos"));
    assert.ok(r.problema.ficha[3].resposta.includes("próprios pedidos"));
    assert.ok(r.problema.falaDoDesafio!.length <= 220);
    assert.deepEqual(camposComNumeroAlterado(original, r.problema), []);
    assert.deepEqual(errosDoProblema(r.problema), []);
    assert.equal(r.problemas.length, 4);
    // O que a revisão não toca continua igual, e o id é o do servidor.
    assert.deepEqual(r.problema.sinaisEsperados, original.sinaisEsperados);
    assert.deepEqual(r.problema.armadilhas, original.armadilhas);
    assert.deepEqual(r.problema.perguntasSugeridas, original.perguntasSugeridas);
    assert.equal(r.problema.id, original.id);
    assert.equal(llm.chamadas[0].nomeSchema, NOME_SCHEMA_REVISAO);
  });
});

describe("guardas da revisão (sem modelo)", () => {
  it("numerosDoTexto acha todos os números, ordenados, com separador", () => {
    assert.deepEqual(numerosDoTexto("de 3 a 99,5% em 1.000 casos, 2h"), ["1.000", "2", "3", "99,5"]);
  });

  it("camposComNumeroAlterado: mesma lista em outra ordem é igual; troca de valor, não", () => {
    const o = casoReal();
    const igual = { ...o, enunciado: "em 5 s e 30 mil" };
    assert.deepEqual(camposComNumeroAlterado({ ...o, enunciado: "30 mil em 5 s" }, igual), []);
    const mexida = { ...o, ficha: o.ficha.map((f, i) => (i === 1 ? { ...f, resposta: f.resposta.replace("120", "150") } : f)) };
    assert.deepEqual(camposComNumeroAlterado(o, mexida), ["ficha[1].resposta"]);
  });

  it("descarta se um número da ficha mudou (e fica o original)", async () => {
    const o = casoReal();
    const rev = revisaoBoa(o);
    rev.ficha[1] = { ...rev.ficha[1], resposta: rev.ficha[1].resposta.replace("120 mil", "150 mil") };
    const r = await revisarProblema(o, criarClienteFalso([rev]));
    assert.equal(r.aceita, false);
    assert.match(r.descartada!, /número alterado em ficha\[1\]\.resposta/);
    assert.deepEqual(r.problema, o);
  });

  it("descarta se um número foi apagado ou acrescentado em campo público", () => {
    const o = casoReal();
    const a = aplicarRevisao(o, { ...revisaoBoa(o), enunciado: o.enunciado + " Pense em 10 mil clientes." });
    assert.equal(a.ok, false);
    const b = aplicarRevisao(o, { ...revisaoBoa(o), ficha: revisaoBoa(o).ficha.map((f, i) => (i === 0 ? { ...f, resposta: f.resposta.replace("30 mil", "muitos") } : f)) });
    assert.equal(b.ok, false);
  });

  it("descarta se a ficha mudou de tamanho", () => {
    const o = casoReal();
    const a = aplicarRevisao(o, { ...revisaoBoa(o), ficha: revisaoBoa(o).ficha.slice(0, 7) });
    assert.deepEqual(a, { ok: false, motivo: "a ficha mudou de 8 para 7 linhas" });
  });

  it("descarta se o resultado reprova no validador (fala acima do teto, campo vazio)", () => {
    const o = casoReal();
    const longa = aplicarRevisao(o, { ...revisaoBoa(o), falaDoDesafio: "a".repeat(MAX_FALA_DO_DESAFIO + 1) });
    assert.equal(longa.ok, false);
    assert.match((longa as { motivo: string }).motivo, /validador/);
    const vazio = aplicarRevisao(o, { ...revisaoBoa(o), titulo: "  " });
    assert.equal(vazio.ok, false);
  });

  it("aceita revisão sem mudança, sem marcar como mudou", () => {
    const o = { ...casoReal(), falaDoDesafio: "Hoje o tema é o andamento dos pedidos. Pode me perguntar o que precisar." };
    const a = aplicarRevisao(o, { problemas: [], titulo: o.titulo, enunciado: o.enunciado, falaDoDesafio: o.falaDoDesafio!, ficha: o.ficha });
    assert.ok(a.ok && !a.mudou);
  });

  it("sem fala no original, a revisão não cria uma", () => {
    const o = { ...casoReal(), falaDoDesafio: undefined };
    const a = aplicarRevisao(o, revisaoBoa(o));
    assert.ok(a.ok);
    assert.equal(a.ok && a.problema.falaDoDesafio, undefined);
  });
});

describe("a revisão nunca bloqueia", () => {
  const o = casoReal();
  for (const [nome, resposta] of [
    ["erro de rede", new ErroLlm("rede", "caiu")],
    ["timeout", new ErroLlm("timeout", "passou do prazo")],
    ["saída fora do schema", { titulo: "só isso" }],
    ["erro qualquer", new Error("boom")],
  ] as const) {
    it(`${nome}: fica o original, sem lançar`, async () => {
      const r = await revisarProblema(o, criarClienteFalso([resposta]));
      assert.equal(r.aceita, false);
      assert.equal(r.mudou, false);
      assert.deepEqual(r.problema, o);
      assert.ok(r.descartada);
    });
  }
});

describe("revisão na questão da vaga e no papel do modelo", () => {
  const config = InterviewConfig.parse({
    id: "cfg-logistica",
    mode: "system_design",
    roleTitle: "Engenheiro(a) Backend Sênior · Logística",
    jobDescription: "Entregas de última milha com rastreio em tempo real.",
    seniority: "senior",
    focus: [{ area: "escala_produto", weight: 1 }],
    criteria: [{ id: "c1", name: "Falhas", description: "Pensa em falhas", weight: 1, focus: "escala_produto" }],
    problemId: "encurtador-de-url",
    languages: ["python"],
  });
  const doModelo = (p: Problema) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...resto } = p;
    return resto;
  };
  // A questão real, mas com a fala curta o bastante para passar na geração (a revisão trata o resto).
  const geradaComErro = (): Problema => ({ ...casoReal(), falaDoDesafio: "Hoje o tema é o andamento das pedidos deles. Pergunte o que precisar e pense em voz alta." });

  it("salva o texto revisado", async () => {
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    const gerada = geradaComErro();
    const llm = criarClienteFalso([doModelo(gerada), { ...revisaoBoa(gerada), enunciado: gerada.enunciado }]);
    const id = await gerarQuestaoDaVaga(config, { llm, repositorio });
    const salvo = await repositorio.obter(id!);
    assert.equal(salvo?.problema.titulo, "Status de Entrega de Pedidos em Tempo Real");
    assert.equal(salvo?.kit.problemas[0].titulo, "Status de Entrega de Pedidos em Tempo Real");
    assert.deepEqual(llm.chamadas.map((c) => c.nomeSchema), ["problema_quadro", NOME_SCHEMA_REVISAO]);
    assert.ok(salvo?.aprovado);
  });

  it("revisão que mexe em número: salva o texto original e aprova do mesmo jeito", async () => {
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    const gerada = geradaComErro();
    const ruim = revisaoBoa(gerada);
    ruim.ficha[5] = { ...ruim.ficha[5], resposta: "100 dias online." };
    const llm = criarClienteFalso([doModelo(gerada), ruim]);
    const id = await gerarQuestaoDaVaga(config, { llm, repositorio });
    const salvo = await repositorio.obter(id!);
    assert.equal(salvo?.problema.titulo, gerada.titulo);
    assert.equal(salvo?.problema.ficha[5].resposta, gerada.ficha[5].resposta);
    assert.ok(salvo?.aprovado);
  });

  it("o papel da revisão no lib/llm é o de fundo (analyst: Featherless primeiro)", async () => {
    let papel: string | undefined;
    const llm = criarClientePrincipal({
      completar: (async (o: { role: string }) => {
        papel = o.role;
        return { data: { problemas: [], ...kitFalso().problemas[0] }, promptTokens: 0, completionTokens: 0, model: "m", provider: "featherless", durationMs: 1 };
      }) as never,
    });
    await revisarProblema(casoReal(), llm);
    assert.equal(papel, "analyst");
  });

  it("no kit inteiro: revisa o problema depois de validar e mantém o resto do kit", async () => {
    const vaga = JOB_POSTINGS[0];
    const kit = { ...kitFalso(vaga.title), problemas: [{ ...geradaComErro(), id: "x" }] };
    const llm = criarClienteFalso([kit, { ...revisaoBoa(geradaComErro()) }]);
    const r = await gerarKitDetalhado({ llm, vaga });
    assert.equal(r.revisao?.aceita, true, r.revisao?.descartada);
    assert.equal(r.kit.problemas[0].titulo, "Status de Entrega de Pedidos em Tempo Real");
    assert.equal(r.kit.criterios.length, kit.criterios.length);
    assert.deepEqual(llm.chamadas.map((c) => c.nomeSchema), ["kit_avaliacao", NOME_SCHEMA_REVISAO]);
  });

  it("no kit inteiro: revisão que falha não derruba a geração", async () => {
    const vaga = JOB_POSTINGS[0];
    const kit = { ...kitFalso(vaga.title), problemas: [{ ...geradaComErro(), id: "x" }] };
    const llm = criarClienteFalso([kit, new ErroLlm("timeout", "lento")]);
    const r = await gerarKitDetalhado({ llm, vaga });
    assert.equal(r.revisao?.aceita, false);
    assert.equal(r.kit.problemas[0].titulo, "Painel de Vendas em Tempo Real");
  });
});
