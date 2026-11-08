import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { criarVoz, dividirFala, MENSAGEM_VOZ_INDISPONIVEL } from "./cliente";
import { comFolga } from "./folga";
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
      assert.deepEqual(alinhamento, comFolga(new Uint8Array(), dadosVoz.alinhamento).alinhamento);
      opcoes.aoProgresso?.(0);
      assert.equal(iniciou, true);
      opcoes.aoProgresso?.(2);
    },
  });
  await falar("oi", new AbortController().signal, {
    aoIniciar: (fonte) => { provedor = fonte; iniciou = true; },
    aoProgresso: (n) => progresso.push(n),
  });
  assert.equal(provedor, "elevenlabs");
  assert.equal(progresso.at(-1), 2);
});

function semAvisos(t: TestContext) {
  const aviso = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = aviso; });
}

test("501 não troca para a voz do navegador e não repete requisições sem configuração", async (t) => {
  semAvisos(t);
  let pedidos = 0;
  const falar = criarVoz({
    fetch: async () => { pedidos++; return new Response(null, { status: 501 }); },
    tocar: async () => { assert.fail("sem áudio remoto"); },
  });
  await assert.rejects(falar("Primeira resposta.", new AbortController().signal, eventos()), { message: MENSAGEM_VOZ_INDISPONIVEL });
  await assert.rejects(falar("Segunda resposta.", new AbortController().signal, eventos()), { message: MENSAGEM_VOZ_INDISPONIVEL });
  assert.equal(pedidos, 1);
});

test("falha passageira do servidor tenta de novo a voz do ElevenLabs", async (t) => {
  semAvisos(t);
  let pedidos = 0;
  let tocou = 0;
  const falar = criarVoz({
    fetch: async () => (++pedidos === 1 ? new Response(null, { status: 503 }) : Response.json(dadosVoz)),
    tocar: async () => { tocou++; },
  });
  await falar("oi", new AbortController().signal, eventos());
  assert.equal(pedidos, 2);
  assert.equal(tocou, 1);
});

test("cancelar requisição pendente ignora resposta tardia e não chama fallback", async () => {
  const controle = new AbortController();
  let responder: (resposta: Response) => void = () => {};
  const pendente = new Promise<Response>((resolve) => { responder = resolve; });
  const falar = criarVoz({
    fetch: async () => pendente,
    tocar: async () => { assert.fail("não deve tocar resposta atrasada"); },
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
    fetch: async (_url, opcoes) => {
      recebidos.push(JSON.parse(String(opcoes?.body)).texto);
      return Response.json(dadosVoz);
    },
    tocar: async () => {},
  });
  await falar(texto, new AbortController().signal, { aoIniciar: () => {}, aoProgresso: (n) => progresso.push(n) });
  assert.deepEqual(recebidos, partes.map((p) => p.texto));
  assert.equal(progresso.at(-1), texto.length);
});

test("alinhamento inválido não é usado e falha do player fica no texto, sem outra voz", async (t) => {
  semAvisos(t);
  assert.equal(RespostaVoz.safeParse({ ...dadosVoz, alinhamento: { ...dadosVoz.alinhamento, character_start_times_seconds: [0] } }).success, false);
  let tentativas = 0;
  const falar = criarVoz({
    fetch: async () => Response.json(dadosVoz),
    tocar: async () => { tentativas++; throw new Error("player indisponível"); },
  });
  await assert.rejects(falar("oi", new AbortController().signal, eventos()), { message: MENSAGEM_VOZ_INDISPONIVEL });
  assert.equal(tentativas, 2);
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

test("áudio que para no meio não repete a parte", async (t) => {
  semAvisos(t);
  let tentativas = 0;
  const progresso: number[] = [];
  const falar = criarVoz({
    fetch: async () => Response.json(dadosVoz),
    tocar: async (_audio, _alinhamento, opcoes) => {
      tentativas++;
      opcoes.aoProgresso?.(1);
      throw new Error("erro de decodificação");
    },
  });
  await falar("oi", new AbortController().signal, { aoIniciar: () => {}, aoProgresso: (n) => progresso.push(n) });
  assert.equal(tentativas, 1);
  assert.equal(progresso.at(-1), 2);
});

test("autoplay bloqueado espera o próximo gesto e toca o mesmo áudio", async (t) => {
  const ouvintes = new Map<string, () => void>();
  let liberado = false;
  let tocadas = 0;
  let aguardou = false;
  class AudioFalso {
    preload = "";
    currentTime = 0;
    src = "";
    onended: (() => void) | null = null;
    onerror = null;
    async play() {
      if (!liberado) throw new DOMException("bloqueado", "NotAllowedError");
      tocadas++;
      queueMicrotask(() => this.onended?.());
    }
    pause() {}
    removeAttribute() {}
  }
  globalFalso(t, "Audio", AudioFalso);
  globalFalso(t, "window", {
    addEventListener: (e: string, f: () => void) => ouvintes.set(e, f),
    removeEventListener: (e: string) => ouvintes.delete(e),
  });
  globalFalso(t, "requestAnimationFrame", () => 1);
  globalFalso(t, "cancelAnimationFrame", () => {});
  globalFalso(t, "URL", { createObjectURL: () => "blob:teste", revokeObjectURL: () => {} });
  const reproduzir = tocarComAlinhamento(new Blob(), dadosVoz.alinhamento, { aoAguardarGesto: () => { aguardou = true; } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(aguardou, true);
  assert.equal(tocadas, 0);
  liberado = true;
  ouvintes.get("click")?.();
  await reproduzir;
  assert.equal(tocadas, 1);
  assert.equal(ouvintes.size, 0);
});

test("antesDeTocar espera a vez com o áudio já sintetizado e pode desistir da fala", async () => {
  const ordem: string[] = [];
  const falar = criarVoz({
    fetch: async () => { ordem.push("sintetizou"); return Response.json(dadosVoz); },
    tocar: async () => { ordem.push("tocou"); },
  });
  await falar("oi", new AbortController().signal, eventos(), async () => { ordem.push("vez"); return true; });
  assert.deepEqual(ordem, ["sintetizou", "vez", "tocou"]);

  ordem.length = 0;
  await falar("oi", new AbortController().signal, eventos(), async () => { ordem.push("desistiu"); return false; });
  assert.deepEqual(ordem, ["sintetizou", "desistiu"]);
});

test("sem a voz do ElevenLabs, antesDeTocar não é chamado e a fala fica no texto", async () => {
  const ordem: string[] = [];
  const falar = criarVoz({
    fetch: async () => new Response(null, { status: 501 }),
    tocar: async () => { assert.fail("sem áudio remoto"); },
  });
  await assert.rejects(
    falar("oi", new AbortController().signal, eventos(), async () => { ordem.push("vez"); return true; }),
    { message: MENSAGEM_VOZ_INDISPONIVEL },
  );
  assert.deepEqual(ordem, []);
});

test("o fetch padrão é chamado com o this do navegador (sem Illegal invocation)", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let pedidos = 0;
  // Como o fetch nativo do Chrome: chamado como método de outro objeto, ele recusa a chamada.
  globalThis.fetch = function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    pedidos++;
    return Promise.resolve(Response.json(dadosVoz));
  } as typeof fetch;
  let tocou = false;
  const falar = criarVoz({ tocar: async () => { tocou = true; } });
  await falar("oi", new AbortController().signal, eventos());
  assert.equal(pedidos, 1);
  assert.equal(tocou, true);
});
