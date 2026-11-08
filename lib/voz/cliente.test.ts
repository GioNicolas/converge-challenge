import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { criarVoz, dividirFala, falarNoNavegador } from "./cliente";
import { tocarComAlinhamento } from "../presenca/vozSincronizada";
import { RespostaVoz } from "./contrato";

const dadosVoz = {
  audio_base64: "AAAA",
  alinhamento: { characters: ["o", "i"], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] },
};
const eventos = () => ({ aoIniciar: () => {}, aoProgresso: () => {} });

test("usa o áudio da Sofia e propaga o progresso do player", async () => {
  const progresso: number[] = [];
  let provedor = "";
  let iniciou = false;
  const falar = criarVoz({
    fetch: async (url, opcoes) => {
      assert.equal(url, "/api/falar");
      assert.deepEqual(JSON.parse(String(opcoes?.body)), { texto: "oi" });
      return Response.json(dadosVoz);
    },
    tocar: async (_audio, alinhamento, opcoes) => {
      assert.equal(iniciou, false);
      assert.deepEqual(alinhamento, dadosVoz.alinhamento);
      opcoes.aoProgresso?.(0);
      assert.equal(iniciou, true);
      opcoes.aoProgresso?.(2);
    },
    navegador: async () => { assert.fail("não deveria usar fallback"); },
  });
  await falar("oi", new AbortController().signal, {
    aoIniciar: (fonte) => { provedor = fonte; iniciou = true; },
    aoProgresso: (n) => progresso.push(n),
  });
  assert.equal(provedor, "elevenlabs");
  assert.equal(progresso.at(-1), 2);
});

test("501 usa navegador e evita repetir requisições sem configuração", async () => {
  let pedidos = 0;
  const falas: string[] = [];
  const falar = criarVoz({
    fetch: async () => { pedidos++; return new Response(null, { status: 501 }); },
    tocar: async () => { assert.fail("sem áudio remoto"); },
    navegador: async (texto) => { falas.push(texto); },
  });
  await falar("Primeira resposta.", new AbortController().signal, eventos());
  await falar("Segunda resposta.", new AbortController().signal, eventos());
  assert.equal(pedidos, 1);
  assert.deepEqual(falas, ["Primeira resposta.", "Segunda resposta."]);
});

test("cancelar requisição pendente ignora resposta tardia e não chama fallback", async () => {
  const controle = new AbortController();
  let responder: (resposta: Response) => void = () => {};
  const pendente = new Promise<Response>((resolve) => { responder = resolve; });
  const falar = criarVoz({
    fetch: async () => pendente,
    tocar: async () => { assert.fail("não deve tocar resposta atrasada"); },
    navegador: async () => { assert.fail("cancelamento não é falha para fallback"); },
  });
  const reproduzir = falar("Resposta velha.", controle.signal, eventos());
  controle.abort();
  responder(Response.json(dadosVoz));
  await assert.rejects(reproduzir, { name: "AbortError" });
});

test("respostas grandes chegam inteiras em trechos de até 2000 caracteres", async () => {
  const texto = "Início. " + "Uma frase sobre a entrevista. ".repeat(240) + "Fim.";
  const partes = dividirFala(texto);
  assert.ok(partes.length > 2);
  assert.ok(partes.every((p) => p.texto.length <= 2000 && texto.slice(p.inicio, p.fim) === p.texto));
  assert.equal(partes.map((p) => p.texto).join(" "), texto.trim());
  const utf16 = dividirFala("🙂".repeat(2100));
  assert.ok(utf16.every((p) => !/[\uD800-\uDBFF]$/u.test(p.texto)));
  assert.equal(utf16.map((p) => p.texto).join(""), "🙂".repeat(2100));
  const recebidos: string[] = [];
  const progresso: number[] = [];
  const falar = criarVoz({
    fetch: async () => new Response(null, { status: 501 }),
    tocar: async () => {},
    navegador: async (trecho, _sinal, e) => { recebidos.push(trecho); e.aoProgresso(trecho.length); },
  });
  await falar(texto, new AbortController().signal, { aoIniciar: () => {}, aoProgresso: (n) => progresso.push(n) });
  assert.deepEqual(recebidos, partes.map((p) => p.texto));
  assert.equal(progresso.at(-1), texto.length);
});

test("alinhamento inválido não é usado e falha do player recorre ao navegador", async () => {
  assert.equal(RespostaVoz.safeParse({ ...dadosVoz, alinhamento: { ...dadosVoz.alinhamento, character_start_times_seconds: [0] } }).success, false);
  let fallback = 0;
  const falar = criarVoz({
    fetch: async () => Response.json(dadosVoz),
    tocar: async () => { throw new Error("autoplay bloqueado"); },
    navegador: async () => { fallback++; },
  });
  await falar("oi", new AbortController().signal, eventos());
  assert.equal(fallback, 1);
});

function globalFalso(t: TestContext, nome: string, valor: unknown) {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, nome);
  Object.defineProperty(globalThis, nome, { configurable: true, writable: true, value: valor });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, nome, anterior);
    else Reflect.deleteProperty(globalThis, nome);
  });
}

test("player da Sofia pausa e revoga o áudio quando o microfone interrompe", async (t) => {
  let pausou = false;
  let revogou = false;
  class AudioFalso {
    preload = "";
    currentTime = 0;
    onended = null;
    onerror = null;
    async play() {}
    pause() { pausou = true; }
    removeAttribute() {}
  }
  globalFalso(t, "Audio", AudioFalso);
  globalFalso(t, "requestAnimationFrame", () => 1);
  globalFalso(t, "cancelAnimationFrame", () => {});
  globalFalso(t, "URL", { createObjectURL: () => "blob:teste", revokeObjectURL: () => { revogou = true; } });
  const controle = new AbortController();
  const reproduzir = tocarComAlinhamento(new Blob(), dadosVoz.alinhamento, { sinal: controle.signal });
  controle.abort();
  await assert.rejects(reproduzir, { name: "AbortError" });
  assert.equal(pausou, true);
  assert.equal(revogou, true);
});

test("fallback do navegador também para a fala e não completa progresso cancelado", async (t) => {
  let falou: SpeechSynthesisUtterance | undefined;
  let cancelou = false;
  class FalaFalsa {
    onstart = null;
    onboundary = null;
    onend = null;
    onerror = null;
  }
  globalFalso(t, "SpeechSynthesisUtterance", FalaFalsa);
  globalFalso(t, "window", { speechSynthesis: {
    getVoices: () => [], speak: (fala: SpeechSynthesisUtterance) => { falou = fala; }, cancel: () => { cancelou = true; },
  } });
  const controle = new AbortController();
  const progresso: number[] = [];
  const reproduzir = falarNoNavegador("Olá", controle.signal, { aoIniciar: () => {}, aoProgresso: (n) => progresso.push(n) });
  controle.abort();
  await assert.rejects(reproduzir, { name: "AbortError" });
  assert.equal(cancelou, true);
  assert.equal(falou?.onend, null);
  assert.deepEqual(progresso, []);
});

test("áudio que para no meio não repete a parte com a voz do navegador", async () => {
  const progresso: number[] = [];
  const falar = criarVoz({
    fetch: async () => Response.json(dadosVoz),
    tocar: async (_audio, _alinhamento, opcoes) => {
      opcoes.aoProgresso?.(1);
      throw new Error("erro de decodificação");
    },
    navegador: async () => { assert.fail("não deveria repetir a fala no navegador"); },
  });
  const aviso = console.warn;
  console.warn = () => {};
  try {
    await falar("oi", new AbortController().signal, { aoIniciar: () => {}, aoProgresso: (n) => progresso.push(n) });
  } finally {
    console.warn = aviso;
  }
  assert.equal(progresso.at(-1), 2);
});
