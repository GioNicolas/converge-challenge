// Testes das rotas do cérebro: chamam os handlers exportados com Request de verdade, sem rede e sem LLM real.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { criarRepositorioEmMemoria, type RepositorioSessoes } from "../../../lib/agente/armazenamento";
import { resolverAvaliacao } from "../../../lib/agente/kits";
import { criarClienteFalso } from "../../../lib/agente/llm/cliente";
import { definirContextoParaTestes } from "../../../lib/agente/rotas/contexto";
import { eventosDaMaquina, limitadorCriacao } from "../../../lib/agente/rotas/handlers";
import { criarLlmFalsoDeterministico } from "../../../lib/agente/rotas/llm-falso";
import { POST as criar } from "../sessoes/route";
import { POST as analisarPost } from "../sessoes/[id]/analisar/route";
import { POST as perguntarPost } from "../sessoes/[id]/perguntar/route";
import { POST as eventosPost } from "../sessoes/[id]/eventos/route";
import { POST as imagemPost } from "../sessoes/[id]/imagens/route";
import { GET as imagemGet } from "../sessoes/[id]/imagens/[n]/route";
import { NextRequest } from "next/server";
import { POST as falarPost } from "../falar/route";
import { GET as sttGet } from "../stt-token/route";

const GRAFO = "COMPONENTES\n- [r1] Cliente (retângulo)\n- [r2] API (retângulo)\n- [e1] Postgres (elipse)\nCONEXÕES\n- [s1] Cliente → API\n- [s2] API → Postgres";

let repo: RepositorioSessoes;
let relogio = 1_000_000;

function post(url: string, corpo: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x" + url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function novaSessao(): Promise<{ sessao_id: string; corpo: Record<string, unknown> }> {
  const r = await criar(post("/api/sessoes", { avaliacao_id: "demo", candidato_id: "c1" }));
  assert.equal(r.status, 200);
  const corpo = await r.json();
  return { sessao_id: corpo.sessao_id, corpo };
}

function pedido(id: string, extra: Record<string, unknown> = {}) {
  return {
    sessao_id: id,
    fase: "APROFUNDAMENTO",
    grafo: GRAFO,
    mudancas: "+ adicionou [e1] Postgres",
    conversa_recente: [{ quem: "agente", texto: "Projete um serviço." }],
    perguntas_feitas: 0,
    imagem_url: null,
    ...extra,
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
function formImagem(bytes: Uint8Array, horario = "2026-11-07T15:00:00.000Z", campo = "imagem"): Request {
  const f = new FormData();
  f.append(campo, new Blob([bytes as BlobPart], { type: "image/png" }), "quadro.png");
  f.append("horario", horario);
  return new Request("http://x/api/sessoes/i/imagens", { method: "POST", body: f });
}

beforeEach(() => {
  repo = criarRepositorioEmMemoria();
  relogio = 1_000_000;
  limitadorCriacao.reiniciar();
  definirContextoParaTestes({ repositorio: repo, llm: criarLlmFalsoDeterministico(), agora: () => relogio });
});
afterEach(() => definirContextoParaTestes(null));

describe("POST /api/sessoes", () => {
  it("cria a sessão com o formato do contrato e só dados públicos do problema", async () => {
    const { corpo, sessao_id } = await novaSessao();
    assert.deepEqual(Object.keys(corpo).sort(), ["apresentacao", "area", "despedida", "problema", "sessao_id", "tempos"]);
    assert.deepEqual(Object.keys(corpo.problema as object).filter((k) => k !== "fala_do_desafio").sort(), ["enunciado", "titulo"]);
    assert.match(sessao_id, /^[0-9a-f-]{36}$/);
    assert.equal(corpo.area, "system design");
    assert.ok((corpo.tempos as Record<string, number>).REQUISITOS > 0);
    assert.equal((await repo.obter(sessao_id))?.estado.fase, "APRESENTACAO");
  });
  it("a abertura (apresentação e despedida) vem do modelo; sem LLM ou com erro vem null", async () => {
    const { corpo } = await novaSessao();
    assert.equal(typeof corpo.apresentacao, "string");
    assert.equal(typeof corpo.despedida, "string");
    assert.ok((corpo.apresentacao as string).length > 0);

    definirContextoParaTestes({ repositorio: repo, llm: null, agora: () => relogio });
    const semLlm = (await novaSessao()).corpo;
    assert.equal(semLlm.apresentacao, null);
    assert.equal(semLlm.despedida, null);

    const quebrado = criarClienteFalso([new Error("fora do ar")]);
    definirContextoParaTestes({ repositorio: repo, llm: quebrado, agora: () => relogio });
    const comErro = (await novaSessao()).corpo;
    assert.equal(comErro.apresentacao, null);
    assert.equal(comErro.despedida, null);
    assert.ok(comErro.sessao_id, "a sessão é criada mesmo sem a abertura");
  });
  it("a abertura é guardada por kit+problema: a 2ª sessão não chama o modelo de novo", async () => {
    const llm = criarClienteFalso([{ apresentacao: "Olá, tudo bem? Vamos começar.", despedida: "Obrigado. Daremos retorno." }]);
    definirContextoParaTestes({ repositorio: repo, llm, agora: () => relogio });
    const a = (await novaSessao()).corpo;
    const b = (await novaSessao()).corpo;
    assert.equal(a.apresentacao, "Olá, tudo bem? Vamos começar.");
    assert.equal(b.apresentacao, a.apresentacao);
    assert.equal(llm.chamadas.filter((c) => c.nomeSchema === "abertura_entrevista").length, 1);
  });
  it("avaliação desconhecida: 404 {erro}", async () => {
    const r = await criar(post("/api/sessoes", { avaliacao_id: "nao-existe", candidato_id: "c" }));
    assert.equal(r.status, 404);
    assert.deepEqual(Object.keys(await r.json()), ["erro"]);
  });
  it("corpo inválido: 400 com detalhes; JSON quebrado: 400", async () => {
    const r = await criar(post("/api/sessoes", { avaliacao_id: 1 }));
    assert.equal(r.status, 400);
    const c = await r.json();
    assert.ok(c.erro && Array.isArray(c.detalhes));
    assert.equal((await criar(post("/api/sessoes", "{quebrado"))).status, 400);
  });
  it("corpo grande demais: 413", async () => {
    const r = await criar(post("/api/sessoes", { avaliacao_id: "demo", candidato_id: "x".repeat(100_000) }));
    assert.equal(r.status, 413);
  });
  it("limita a 10 criações por minuto por IP", async () => {
    const h = { "x-real-ip": "1.2.3.4" };
    for (let i = 0; i < 10; i++) {
      assert.equal((await criar(post("/api/sessoes", { avaliacao_id: "demo", candidato_id: "c" }, h))).status, 200);
    }
    assert.equal((await criar(post("/api/sessoes", { avaliacao_id: "demo", candidato_id: "c" }, h))).status, 429);
    assert.equal(
      (await criar(post("/api/sessoes", { avaliacao_id: "demo", candidato_id: "c" }, { "x-real-ip": "9.9.9.9" }))).status,
      200,
    );
  });
});

describe("POST /api/sessoes/[id]/analisar", () => {
  it("sincroniza a fase do quadro e devolve EXATAMENTE os campos de RespostaAnalise", async () => {
    const { sessao_id } = await novaSessao();
    const r = await analisarPost(post(`/api/sessoes/${sessao_id}/analisar`, pedido(sessao_id)), params(sessao_id));
    assert.equal(r.status, 200);
    const c = await r.json();
    assert.deepEqual(Object.keys(c).sort(), ["degrau", "elementos", "nota", "observacoes", "pergunta", "status"]);
    assert.equal(c.status, "duvida");
    assert.deepEqual(c.elementos, ["e1"]);
    assert.ok(c.pergunta && c.nota.length <= 40);
    const estado = (await repo.obter(sessao_id))!.estado;
    assert.equal(estado.fase, "APROFUNDAMENTO");
    assert.equal(estado.plin, "PLIN_PENDENTE");
    assert.equal(estado.observacoes.length, 1);
  });
  it("sem Postgres no grafo devolve ok", async () => {
    const { sessao_id } = await novaSessao();
    const r = await analisarPost(
      post(`/api/sessoes/${sessao_id}/analisar`, pedido(sessao_id, { grafo: "COMPONENTES\n- [r1] Cliente (retângulo)" })),
      params(sessao_id),
    );
    const c = await r.json();
    assert.equal(c.status, "ok");
    assert.equal(c.pergunta, null);
  });
  it("a fase só avança: o quadro atrasado não faz o servidor voltar", async () => {
    const { sessao_id } = await novaSessao();
    await analisarPost(post("/x", pedido(sessao_id, { fase: "ALTO_NIVEL" })), params(sessao_id));
    assert.equal((await repo.obter(sessao_id))!.estado.fase, "ALTO_NIVEL");
    await analisarPost(post("/x", pedido(sessao_id, { fase: "REQUISITOS" })), params(sessao_id));
    assert.equal((await repo.obter(sessao_id))!.estado.fase, "ALTO_NIVEL");
  });
  it("404 para sessão desconhecida; 400 para pedido inválido, sessao_id divergente e grafo enorme", async () => {
    const { sessao_id } = await novaSessao();
    assert.equal((await analisarPost(post("/x", pedido("fantasma")), params("fantasma"))).status, 404);
    assert.equal((await analisarPost(post("/x", { sessao_id }), params(sessao_id))).status, 400);
    assert.equal((await analisarPost(post("/x", pedido("outra")), params(sessao_id))).status, 400);
    const grande = await analisarPost(post("/x", pedido(sessao_id, { grafo: "a".repeat(60_001) })), params(sessao_id));
    assert.equal(grande.status, 400);
    const conversa = Array.from({ length: 41 }, () => ({ quem: "candidato", texto: "oi" }));
    assert.equal(
      (await analisarPost(post("/x", pedido(sessao_id, { conversa_recente: conversa })), params(sessao_id))).status,
      400,
    );
  });
  it("sem LLM (sem chave): responde ok, nunca 500", async () => {
    definirContextoParaTestes({ repositorio: repo, llm: null, agora: () => relogio });
    const { sessao_id } = await novaSessao();
    const r = await analisarPost(post("/x", pedido(sessao_id)), params(sessao_id));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "ok");
  });
  it("LLM que estoura erro: ok", async () => {
    definirContextoParaTestes({
      repositorio: repo,
      llm: criarClienteFalso([new Error("falhou")]),
      agora: () => relogio,
    });
    const { sessao_id } = await novaSessao();
    const r = await analisarPost(post("/x", pedido(sessao_id)), params(sessao_id));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "ok");
  });
  it("limita o número de análises por sessão", async () => {
    const { sessao_id } = await novaSessao();
    for (let i = 0; i < 200; i++) await repo.contarAnalise(sessao_id);
    const r = await analisarPost(post("/x", pedido(sessao_id)), params(sessao_id));
    assert.equal(r.status, 429);
  });
});

describe("POST /api/sessoes/[id]/perguntar", () => {
  it("responde no formato do contrato e guarda a conversa", async () => {
    const { sessao_id } = await novaSessao();
    const r = await perguntarPost(
      post("/x", { sessao_id, fase: "REQUISITOS", texto: "Quantos acessos por segundo?" }),
      params(sessao_id),
    );
    assert.equal(r.status, 200);
    const c = await r.json();
    assert.deepEqual(Object.keys(c).sort(), ["concluiu", "requisito", "responder", "texto"]);
    assert.equal(c.responder, true);
    const e = (await repo.obter(sessao_id))!.estado;
    assert.equal(e.fase, "REQUISITOS");
    assert.deepEqual(e.conversa.map((f) => f.quem), ["candidato", "agente"]);
  });
  it("fala que não pede resposta: responder false", async () => {
    const { sessao_id } = await novaSessao();
    const c = await (
      await perguntarPost(post("/x", { sessao_id, fase: "REQUISITOS", texto: "hmm deixa eu ver" }), params(sessao_id))
    ).json();
    assert.deepEqual(c, { responder: false, texto: "", requisito: null, concluiu: false });
  });
  it("404 e 400", async () => {
    const { sessao_id } = await novaSessao();
    assert.equal((await perguntarPost(post("/x", { sessao_id: "z", fase: "REQUISITOS", texto: "a?" }), params("z"))).status, 404);
    assert.equal((await perguntarPost(post("/x", { sessao_id, fase: "NADA", texto: "a?" }), params(sessao_id))).status, 400);
    assert.equal((await perguntarPost(post("/x", { sessao_id, fase: "REQUISITOS", texto: "" }), params(sessao_id))).status, 400);
  });
});

describe("POST /api/sessoes/[id]/eventos", () => {
  const ev = (tipo: string, dados: unknown, horario = "2026-11-07T15:00:00.000Z") => ({ horario, tipo, dados });

  it("guarda a linha do tempo e é idempotente no reenvio", async () => {
    const { sessao_id } = await novaSessao();
    const lote = { eventos: [ev("fala", { quem: "agente", texto: "oi" }), ev("analise", { status: "ok" })] };
    const r1 = await eventosPost(post("/x", lote), params(sessao_id));
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).novos, 2);
    const r2 = await eventosPost(post("/x", lote), params(sessao_id));
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).novos, 0);
    assert.equal((await repo.listarEventos(sessao_id)).length, 2);
  });
  it("mesmo horário e tipo com dados diferentes não são duplicata", async () => {
    const { sessao_id } = await novaSessao();
    await eventosPost(post("/x", { eventos: [ev("fala", { texto: "a" }), ev("fala", { texto: "b" })] }), params(sessao_id));
    assert.equal((await repo.listarEventos(sessao_id)).length, 2);
  });
  it("segue o cliente: fase, pergunta (plin), resposta e desenho", async () => {
    const { sessao_id } = await novaSessao();
    await eventosPost(post("/x", { eventos: [ev("fase", { fase: "APROFUNDAMENTO" })] }), params(sessao_id));
    assert.equal((await repo.obter(sessao_id))!.estado.fase, "APROFUNDAMENTO");

    await analisarPost(post("/x", pedido(sessao_id)), params(sessao_id));
    assert.equal((await repo.obter(sessao_id))!.estado.plin, "PLIN_PENDENTE");

    await eventosPost(post("/x", { eventos: [ev("pergunta", { numero: 1 }, "2026-11-07T15:00:01.000Z")] }), params(sessao_id));
    let e = (await repo.obter(sessao_id))!.estado;
    assert.equal(e.plin, "PERGUNTA_ATIVA");
    assert.equal(e.perguntasFeitas, 1);

    await eventosPost(post("/x", { eventos: [ev("resposta", { numero: 1 }, "2026-11-07T15:00:02.000Z")] }), params(sessao_id));
    e = (await repo.obter(sessao_id))!.estado;
    assert.equal(e.plin, "LIVRE");
    assert.equal(e.perguntaAtiva, null);
  });
  it("desenho que mexe no elemento citado expira o plin pendente", async () => {
    const { sessao_id } = await novaSessao();
    await analisarPost(post("/x", pedido(sessao_id)), params(sessao_id));
    await eventosPost(
      post("/x", { eventos: [ev("desenho", { grafo: GRAFO, mudancas: "~ moveu [e1] Postgres" })] }),
      params(sessao_id),
    );
    assert.equal((await repo.obter(sessao_id))!.estado.plin, "LIVRE");
  });
  it("tipo desconhecido só é guardado", async () => {
    assert.deepEqual(eventosDaMaquina("coisa-nova", {}), []);
    const { sessao_id } = await novaSessao();
    const antes = (await repo.obter(sessao_id))!.estado;
    const r = await eventosPost(post("/x", { eventos: [ev("coisa-nova", { x: 1 })] }), params(sessao_id));
    assert.equal(r.status, 200);
    assert.deepEqual((await repo.obter(sessao_id))!.estado, antes);
    assert.equal((await repo.listarEventos(sessao_id)).length, 1);
  });
  it("400 para entrada inválida, 404 para sessão desconhecida", async () => {
    const { sessao_id } = await novaSessao();
    assert.equal((await eventosPost(post("/x", { eventos: [{ tipo: "x" }] }), params(sessao_id))).status, 400);
    assert.equal((await eventosPost(post("/x", { eventos: [ev("x", {}, "ontem")] }), params(sessao_id))).status, 400);
    assert.equal((await eventosPost(post("/x", "nao-json"), params(sessao_id))).status, 400);
    assert.equal((await eventosPost(post("/x", { eventos: [] }), params("fantasma"))).status, 404);
  });
});

describe("imagens", () => {
  it("guarda o PNG, devolve a url e serve de volta com image/png", async () => {
    const { sessao_id } = await novaSessao();
    const r = await imagemPost(formImagem(PNG), params(sessao_id));
    assert.equal(r.status, 200);
    const c = await r.json();
    assert.deepEqual(Object.keys(c), ["url"]);
    assert.equal(c.url, `/api/sessoes/${sessao_id}/imagens/1`);
    const g = await imagemGet(new Request("http://x" + c.url), { params: Promise.resolve({ id: sessao_id, n: "1" }) });
    assert.equal(g.status, 200);
    assert.equal(g.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await g.arrayBuffer()), PNG);
    const r2 = await imagemPost(formImagem(PNG), params(sessao_id));
    assert.equal((await r2.json()).url, `/api/sessoes/${sessao_id}/imagens/2`);
  });
  it("rejeita o que não é PNG, grande demais, sem campo, sessão ou imagem inexistentes", async () => {
    const { sessao_id } = await novaSessao();
    assert.equal((await imagemPost(formImagem(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), params(sessao_id))).status, 400);
    const grande = new Uint8Array(4 * 1024 * 1024 + 1);
    grande.set(PNG);
    assert.equal((await imagemPost(formImagem(grande), params(sessao_id))).status, 413);
    assert.equal((await imagemPost(formImagem(PNG, "2026-11-07T15:00:00Z", "outro"), params(sessao_id))).status, 400);
    assert.equal((await imagemPost(formImagem(PNG), params("fantasma"))).status, 404);
    const g = await imagemGet(new Request("http://x"), { params: Promise.resolve({ id: sessao_id, n: "7" }) });
    assert.equal(g.status, 404);
    const g2 = await imagemGet(new Request("http://x"), { params: Promise.resolve({ id: sessao_id, n: "abc" }) });
    assert.equal(g2.status, 404);
  });
});

describe("voz e transcrição (sem chave do ElevenLabs)", () => {
  it("/falar responde 501 e /stt-token responde 503, ambos com {erro}", async () => {
    const chave = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    try {
      const a = await falarPost(new NextRequest("http://localhost/api/falar", { method: "POST", body: JSON.stringify({ texto: "oi" }) }));
      const b = await sttGet(new NextRequest("http://localhost/api/stt-token?sessao_id=s1"));
      assert.equal(a.status, 501);
      assert.equal(b.status, 503);
      for (const r of [a, b]) assert.equal(typeof (await r.json()).erro, "string");
    } finally {
      if (chave !== undefined) process.env.ELEVENLABS_API_KEY = chave;
    }
  });
});

describe("segredos", () => {
  it("nenhuma resposta de um fluxo completo contém ficha, sinais, armadilhas ou rubrica", async () => {
    const alvo = (await resolverAvaliacao("demo"))!;
    const segredos = [
      ...alvo.problema.ficha.flatMap((f) => [f.resposta]),
      ...alvo.problema.sinaisEsperados,
      ...alvo.problema.armadilhas,
      ...alvo.kit.criterios.flatMap((c) => Object.values(c.niveis)),
    ].filter((s) => s.length > 15);
    assert.ok(segredos.length > 5);

    const corpos: string[] = [];
    const guardar = async (r: Response) => {
      corpos.push(await r.clone().text());
      return r;
    };
    const cria = await guardar(await criar(post("/api/sessoes", { avaliacao_id: "demo", candidato_id: "c" })));
    const { sessao_id } = await cria.json();
    await guardar(await analisarPost(post("/x", pedido(sessao_id)), params(sessao_id)));
    await guardar(
      await eventosPost(post("/x", { eventos: [{ horario: "2026-11-07T15:00:00Z", tipo: "pergunta", dados: { numero: 1 } }] }), params(sessao_id)),
    );
    await guardar(await perguntarPost(post("/x", { sessao_id, fase: "APROFUNDAMENTO", texto: "Quantos acessos?" }), params(sessao_id)));
    await guardar(await analisarPost(post("/x", pedido(sessao_id)), params(sessao_id)));
    await guardar(await analisarPost(post("/x", pedido("fantasma")), params("fantasma")));

    const tudo = corpos.join("\n").toLowerCase();
    for (const s of segredos) assert.ok(!tudo.includes(s.toLowerCase()), `vazou: ${s}`);
    for (const proibido of ["diagnostico", "rubrica", "ficha", "armadilhas", "sinaisesperados"]) {
      assert.ok(!tudo.includes(proibido), `campo proibido: ${proibido}`);
    }
  });
});
