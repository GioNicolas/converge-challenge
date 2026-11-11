// Filtro de spoiler sem API: trava o formato do pedido (modelo, temperatura, prefixo fixo em cache, mensagem de cada
// conferência) e a leitura do veredito, com os casos fixos de casos-filtro.ts. O provedor é simulado pelo fetch.
// A qualidade dos vereditos com modelo de verdade é medida por scripts/bench-filtro.ts.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { CASOS_FILTRO, CASOS_FILTRO_INEDITOS, CASOS_FILTRO_VALIDACAO, type CasoFiltro } from "./casos-filtro";
import { checkQuestion, checkReply, pedidoDaFala, pedidoDaPergunta, SISTEMA_DO_FILTRO } from "../spoilerFilter";

type Parte = { type: string; text?: string; cache_control?: { type: string } };
interface Pedido {
  url: string;
  model: string;
  temperature?: number;
  max_tokens: number;
  messages: { role: string; content: string | Parte[] }[];
}

const fetchOriginal = globalThis.fetch;
const env = { ...process.env };
let pedidos: Pedido[] = [];
let resposta: (p: Pedido) => Response;

function completion(conteudo: string) {
  return Response.json({ choices: [{ message: { content: conteudo }, finish_reason: "stop" }], usage: { cost: 0.0001, prompt_tokens: 2000, completion_tokens: 20 } });
}

beforeEach(() => {
  pedidos = [];
  // Só a OpenRouter (o primário do papel "filtro"): sem hedge, um pedido por conferência.
  process.env.OPENROUTER_API_KEY = "teste";
  delete process.env.FEATHERLESS_API_KEY;
  delete process.env.FILTRO_MODEL;
  delete process.env.LLM_PRIMARIO_FILTRO;
  resposta = () => completion(JSON.stringify({ reason: "ok", safe: true }));
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const pedido = { url: String(url), ...(JSON.parse(String(init?.body)) as Omit<Pedido, "url">) };
    pedidos.push(pedido);
    return resposta(pedido);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  for (const k of ["OPENROUTER_API_KEY", "FEATHERLESS_API_KEY", "FILTRO_MODEL", "LLM_PRIMARIO_FILTRO"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

function conferir(caso: CasoFiltro) {
  return caso.tipo === "pergunta"
    ? checkQuestion(caso.pergunta, caso.tema, caso.kind, { code: caso.codigo, candidateSaid: caso.falas })
    : checkReply(caso.fala, caso.falas, caso.dica, caso.codigo);
}

const TODOS = [...CASOS_FILTRO, ...CASOS_FILTRO_VALIDACAO, ...CASOS_FILTRO_INEDITOS];

test("casos: ids únicos, ~40 no ajuste, metade segura e as duas conferências", () => {
  assert.equal(new Set(TODOS.map((c) => c.id)).size, TODOS.length);
  assert.ok(CASOS_FILTRO.length >= 40);
  for (const conjunto of [CASOS_FILTRO, CASOS_FILTRO_VALIDACAO, CASOS_FILTRO_INEDITOS]) {
    const inseguros = conjunto.filter((c) => c.esperado === "inseguro").length;
    assert.ok(Math.abs(inseguros / conjunto.length - 0.5) <= 0.1, `inseguros ${inseguros}/${conjunto.length}`);
    for (const tipo of ["pergunta", "fala"] as const) {
      for (const esperado of ["seguro", "inseguro"] as const) {
        assert.ok(conjunto.some((c) => c.tipo === tipo && c.esperado === esperado), `${tipo}/${esperado}`);
      }
    }
  }
});

test("o prompt fixo passa do mínimo do cache e vai marcado para o cache, igual em todas as conferências", async () => {
  // MIN_CHARS_CACHE (lib/llm/openaiCompat.ts): abaixo disso o prompt vai sem cache e cada conferência paga ele cheio.
  assert.ok(SISTEMA_DO_FILTRO.length >= 4_000, `${SISTEMA_DO_FILTRO.length} caracteres`);
  for (const caso of TODOS) await conferir(caso);
  assert.equal(pedidos.length, TODOS.length);
  for (const p of pedidos) {
    assert.match(p.url, /openrouter\.ai/);
    assert.equal(p.model, "google/gemini-3.5-flash-lite");
    assert.equal(p.temperature, 0);
    assert.equal(p.max_tokens, 300);
    const sistema = p.messages[0];
    assert.equal(sistema.role, "system");
    assert.deepEqual(sistema.content, [{ type: "text", text: SISTEMA_DO_FILTRO, cache_control: { type: "ephemeral" } }]);
    // Nada que muda entre conferências fica no sistema: o que muda vai todo na mensagem do usuário.
    assert.equal(p.messages.length, 2);
    assert.equal(p.messages[1].role, "user");
  }
});

test("a mensagem de cada conferência diz qual é e leva código, falas e o texto conferido", async () => {
  for (const caso of TODOS) {
    pedidos = [];
    await conferir(caso);
    const usuario = String(pedidos[0].messages[1].content);
    if (caso.tipo === "pergunta") {
      assert.equal(usuario, pedidoDaPergunta(caso.pergunta, caso.tema, caso.kind, { code: caso.codigo, candidateSaid: caso.falas }));
      assert.ok(usuario.startsWith("CONFERÊNCIA: PERGUNTA\n"));
      assert.ok(usuario.includes(`PERGUNTA: ${caso.pergunta}\nTIPO: ${caso.kind}\nTEMA para aprofundar depois: ${caso.tema}`));
    } else {
      assert.equal(usuario, pedidoDaFala(caso.fala, caso.falas, caso.dica, caso.codigo));
      assert.ok(usuario.startsWith("CONFERÊNCIA: FALA\n"));
      assert.ok(usuario.endsWith(`FALA DO ENTREVISTADOR: ${caso.fala}`));
      assert.ok(usuario.includes(`DICA OFICIAL (permitida): ${caso.dica ?? "(nenhuma)"}`));
    }
    assert.ok(usuario.includes(caso.codigo), caso.id);
    for (const f of caso.falas) assert.ok(usuario.includes(f), caso.id);
  }
});

test("código e falas vazios aparecem como vazios, não somem", () => {
  const p = pedidoDaPergunta("Por quê?", "a escolha", "explicar", { code: "", candidateSaid: [] });
  assert.ok(p.includes("CÓDIGO DO CANDIDATO:\n(vazio)"));
  assert.ok(p.includes("O QUE O CANDIDATO JÁ DISSE:\n(nada)"));
  const f = pedidoDaFala("Entendi.", []);
  assert.ok(f.includes("CÓDIGO DO CANDIDATO:\n(vazio)"));
  assert.ok(f.includes("ÚLTIMAS FALAS DO CANDIDATO:\n(nenhuma)"));
});

test("o veredito do modelo chega a quem chama, com o reason antes do safe", async () => {
  for (const caso of TODOS) {
    const safe = caso.esperado === "seguro";
    resposta = () => completion(`{"reason": "motivo de ${caso.id}", "safe": ${safe}}`);
    const v = await conferir(caso);
    assert.equal(v.safe, safe, caso.id);
    assert.equal(v.reason, `motivo de ${caso.id}`);
    assert.equal(v.costUsd, 0.0001);
    assert.equal(v.promptTokens, 2000);
  }
});

test("a ordem antiga das chaves e o JSON em bloco de código também são lidos", async () => {
  resposta = () => completion('```json\n{"safe": false, "reason": "aponta o erro"}\n```');
  const v = await checkReply("Isso não trata repetidos.", [], undefined, "x = 1");
  assert.deepEqual([v.safe, v.reason], [false, "aponta o erro"]);
});

test("filtro fora do ar: deixa passar e avisa no reason (não trava a entrevista)", async () => {
  resposta = () => new Response("modelo indisponível", { status: 400 });
  const avisos = console.warn;
  console.warn = () => {};
  try {
    const p = await checkQuestion("Por quê?", "a escolha", "explicar");
    const f = await checkReply("Entendi.", []);
    assert.deepEqual([p.safe, p.reason, p.costUsd], [true, "filtro indisponível", 0]);
    assert.deepEqual([f.safe, f.reason, f.costUsd], [true, "filtro indisponível", 0]);
  } finally {
    console.warn = avisos;
  }
});

test("FILTRO_MODEL troca o modelo sem mudar o pedido", async () => {
  process.env.FILTRO_MODEL = "google/gemini-3.1-flash-lite";
  await checkReply("Entendi.", []);
  assert.equal(pedidos[0].model, "google/gemini-3.1-flash-lite");
  assert.deepEqual(pedidos[0].messages[0].content, [{ type: "text", text: SISTEMA_DO_FILTRO, cache_control: { type: "ephemeral" } }]);
});
