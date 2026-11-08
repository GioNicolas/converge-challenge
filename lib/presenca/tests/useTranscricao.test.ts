import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { criarEscutaTranscricao, type EstadoEscuta } from "../useTranscricao";
import { ErroTokenTranscricao } from "../tokenTranscricao";
import type { TrechoTranscrito } from "../transcricao";

const andar = () => new Promise<void>((resolver) => setImmediate(resolver));

function globalFalso(t: TestContext, nome: string, valor: unknown) {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, nome);
  Object.defineProperty(globalThis, nome, { configurable: true, writable: true, value: valor });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, nome, anterior);
    else Reflect.deleteProperty(globalThis, nome);
  });
}

function montar(t: TestContext, opcoes: {
  servidor?: boolean; navegador?: boolean; prefixado?: boolean; semAudio?: boolean;
  obterToken?: (id: string) => Promise<string>;
} = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const estados: EstadoEscuta[] = [];
  const trechos: TrechoTranscrito[] = [];
  const sockets: SocketFalso[] = [];
  const contextos: ContextoFalso[] = [];
  const reconhecedores: ReconhecimentoFalso[] = [];
  let tokens = 0;
  class TrilhaFalsa extends EventTarget {
    enabled = true;
    muted = false;
    readyState = "live";
    paradas = 0;
    stop() { this.paradas++; }
  }
  const trilha = new TrilhaFalsa();
  const stream = { getAudioTracks: () => opcoes.semAudio ? [] : [trilha] } as unknown as MediaStream;
  class NoFalso {
    desconectado = false;
    gain = { value: 1 };
    connect(outro: unknown) { return outro; }
    disconnect() { this.desconectado = true; }
  }
  class ProcessadorFalso extends NoFalso {
    onaudioprocess: ((evento: AudioProcessingEvent) => void) | null = null;
  }
  class ContextoFalso {
    sampleRate = 48000;
    state = "running";
    fechamentos = 0;
    destination = {};
    fonte = new NoFalso();
    processador = new ProcessadorFalso();
    ganho = new NoFalso();
    constructor() { contextos.push(this); }
    createMediaStreamSource(s: MediaStream) { assert.equal(s, stream); return this.fonte; }
    createScriptProcessor() { return this.processador; }
    createGain() { return this.ganho; }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { this.state = "closed"; this.fechamentos++; return Promise.resolve(); }
  }
  class SocketFalso {
    readyState = 0;
    bufferedAmount = 0;
    enviados: string[] = [];
    fechamentos = 0;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((evento: { data: string }) => void) | null = null;
    constructor(public url: string) { sockets.push(this); }
    send(dados: string) { this.enviados.push(dados); }
    close() { this.readyState = 3; this.fechamentos++; this.onclose?.(); }
    mensagem(dados: unknown) { this.onmessage?.({ data: JSON.stringify(dados) }); }
    iniciar() { this.readyState = 1; this.onopen?.(); this.mensagem({ message_type: "session_started" }); }
    cair() { this.readyState = 3; this.onclose?.(); }
  }
  type Resultado = { isFinal: boolean; 0: { transcript: string } };
  class ReconhecimentoFalso {
    lang = "";
    continuous = false;
    interimResults = false;
    inicios = 0;
    abortos = 0;
    trilhas: unknown[] = [];
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((evento: { error: string }) => void) | null = null;
    onresult: ((evento: { resultIndex: number; results: Resultado[] }) => void) | null = null;
    constructor() { reconhecedores.push(this); }
    start(trilhaRecebida: unknown) { this.inicios++; this.trilhas.push(trilhaRecebida); this.onstart?.(); }
    abort() { this.abortos++; this.onend?.(); }
    resultado(itens: { texto: string; final: boolean }[], resultIndex = 0) {
      this.onresult?.({ resultIndex, results: itens.map((r) => ({ isFinal: r.final, 0: { transcript: r.texto } })) });
    }
  }
  const janela: Record<string, unknown> = { AudioContext: ContextoFalso };
  if (opcoes.navegador !== false) janela[opcoes.prefixado ? "webkitSpeechRecognition" : "SpeechRecognition"] = ReconhecimentoFalso;
  globalFalso(t, "window", janela);
  globalFalso(t, "WebSocket", SocketFalso);
  const controle = criarEscutaTranscricao({
    stream, sessaoId: "sessao", servidor: opcoes.servidor ?? true,
    aoEstado: (estado) => estados.push(estado), aoTrecho: (trecho) => trechos.push(trecho),
    obterToken: opcoes.obterToken ?? (async (id) => { assert.equal(id, "sessao"); return `token-${++tokens}`; }),
  });
  t.after(() => controle.parar());
  return {
    controle, estados, trechos, sockets, contextos, reconhecedores, trilha,
    tokens: () => tokens,
    estado: () => estados.at(-1),
    processar(valor = 0.25, vezes = 3) {
      const contexto = contextos.at(-1)!;
      for (let i = 0; i < vezes; i++) contexto.processador.onaudioprocess?.({
        inputBuffer: { numberOfChannels: 1, length: 4096, getChannelData: () => new Float32Array(4096).fill(valor) },
        outputBuffer: { getChannelData: () => new Float32Array(4096) },
      } as unknown as AudioProcessingEvent);
    },
  };
}

test("Scribe só inicia quando ativo e envia PCM mono em blocos de 200 ms", async (t) => {
  const m = montar(t);
  await andar();
  assert.equal(m.tokens(), 0);
  m.controle.ativar(true);
  await andar();
  assert.equal(m.tokens(), 1);
  assert.equal(m.sockets.length, 1);
  assert.equal(m.estado()?.escutando, false);
  m.sockets[0].iniciar();
  assert.equal(m.estado()?.escutando, true);
  m.processar();
  assert.equal(m.sockets[0].enviados.length, 1);
  const audio = JSON.parse(m.sockets[0].enviados[0]) as { message_type: string; audio_base_64: string; sample_rate: number; commit: boolean };
  assert.equal(audio.message_type, "input_audio_chunk");
  assert.equal(audio.sample_rate, 16000);
  assert.equal(audio.commit, false);
  const binario = atob(audio.audio_base_64);
  assert.equal(binario.length, 6400);
  assert.deepEqual([binario.charCodeAt(0), binario.charCodeAt(1)], [0, 32]);
  assert.equal(m.contextos[0].ganho.gain.value, 0);
});

test("ocultar a aba suspende envio de voz e retomar não duplica finais", async (t) => {
  const pagina = { hidden: false };
  globalFalso(t, "document", pagina);
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  pagina.hidden = true;
  t.mock.timers.tick(200);
  ws.mensagem({ message_type: "committed_transcript", text: "não gravar" });
  assert.equal(m.estado()?.escutando, false);
  assert.equal(m.trechos.some((t) => t.final), false);
  pagina.hidden = false;
  t.mock.timers.tick(200);
  m.processar();
  ws.mensagem({ message_type: "committed_transcript", text: "retomou" });
  assert.equal(m.trechos.at(-1)?.texto, "retomou");
});

test("pausa mantém socket e contexto, envia silêncio e ignora transcrições atrasadas", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  m.processar();
  ws.mensagem({ message_type: "partial_transcript", text: "escala" });
  m.controle.ativar(false);
  assert.equal(m.estado()?.escutando, false);
  m.processar(1);
  const audio = JSON.parse(ws.enviados.at(-1)!) as { audio_base_64: string };
  assert.ok([...atob(audio.audio_base_64)].every((c) => c.charCodeAt(0) === 0));
  const antes = m.trechos.length;
  ws.mensagem({ message_type: "committed_transcript", text: "não deve sair" });
  assert.equal(m.trechos.length, antes);
  m.controle.ativar(true);
  m.processar();
  ws.mensagem({ message_type: "partial_transcript", text: "qual a" });
  ws.mensagem({ message_type: "partial_transcript", text: "qual a escala" });
  ws.mensagem({ message_type: "committed_transcript", text: "Qual a escala?" });
  assert.equal(m.trechos.at(-1)?.texto, "Qual a escala?");
  assert.equal(m.trechos.at(-1)?.final, true);
  assert.equal(m.sockets.length, 1);
  assert.equal(m.contextos.length, 1);
  assert.equal(m.trilha.paradas, 0);
});

test("cada reconexão recebe token novo, respeita espera crescente e termina no fallback", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  for (const [i, espera] of [500, 1000, 2000, 4000, 8000].entries()) {
    m.sockets.at(-1)!.iniciar();
    m.sockets.at(-1)!.cair();
    assert.match(m.estado()!.erro!, /reconectando microfone/);
    t.mock.timers.tick(espera - 1);
    await andar();
    assert.equal(m.tokens(), i + 1);
    t.mock.timers.tick(1);
    await andar();
    assert.equal(m.tokens(), i + 2);
    assert.equal(new URL(m.sockets.at(-1)!.url).searchParams.get("token"), `token-${i + 2}`);
  }
  m.sockets.at(-1)!.cair();
  assert.equal(m.estado()?.motor, "navegador");
  assert.equal(m.estado()?.escutando, true);
  assert.equal(m.contextos[0].fechamentos, 1);
  assert.equal(m.trilha.paradas, 0);
});

test("quota esgotada cai direto no navegador; autenticação tenta token novo", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  m.sockets[0].mensagem({ message_type: "auth_error", error: "expirado" });
  t.mock.timers.tick(500);
  await andar();
  assert.equal(m.tokens(), 2);
  m.sockets[1].mensagem({ message_type: "quota_exceeded", error: "quota" });
  assert.equal(m.estado()?.motor, "navegador");
});

test("conexão sem session_started tem prazo e erros duplicados não duplicam retentativas", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  t.mock.timers.tick(10000);
  assert.equal(m.sockets[0].fechamentos, 1);
  assert.match(m.estado()!.erro!, /reconectando/);
  t.mock.timers.tick(500);
  await andar();
  assert.equal(m.tokens(), 2);
  const ws = m.sockets[1];
  const cair = ws.onclose;
  ws.onerror?.();
  cair?.();
  t.mock.timers.tick(1000);
  await andar();
  assert.equal(m.tokens(), 3);
});

test("parar durante token pendente não abre socket nem publica estado depois", async (t) => {
  let resolver!: (token: string) => void;
  const m = montar(t, { obterToken: () => new Promise((resolve) => { resolver = resolve; }) });
  m.controle.ativar(true);
  await andar();
  m.controle.parar();
  const antes = m.estados.length;
  resolver("tarde");
  await andar();
  t.mock.timers.tick(20000);
  assert.equal(m.sockets.length, 0);
  assert.equal(m.estados.length, antes);
  assert.equal(m.contextos[0].fechamentos, 1);
});

test("limpeza fecha recursos próprios sem parar o stream compartilhado", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  m.processar();
  m.sockets[0].mensagem({ message_type: "partial_transcript", text: "parcial" });
  const antes = m.trechos.length;
  m.controle.parar();
  m.controle.parar();
  t.mock.timers.tick(30000);
  assert.equal(m.trechos.length, antes);
  assert.equal(m.sockets[0].fechamentos, 1);
  assert.equal(m.contextos[0].fechamentos, 1);
  assert.equal(m.contextos[0].fonte.desconectado, true);
  assert.equal(m.trilha.paradas, 0);
});

test("modo navegador configura pt-BR, usa a trilha e reinicia após silêncio", (t) => {
  const m = montar(t, { servidor: false, prefixado: true });
  m.controle.ativar(true);
  const n = m.reconhecedores[0];
  assert.equal(n.lang, "pt-BR");
  assert.equal(n.continuous, true);
  assert.equal(n.interimResults, true);
  assert.equal(n.trilhas[0], m.trilha);
  n.onend?.();
  t.mock.timers.tick(249);
  assert.equal(n.inicios, 1);
  t.mock.timers.tick(1);
  assert.equal(n.inicios, 2);
  assert.equal(m.reconhecedores.length, 1);
  assert.equal(m.contextos.length, 0);
});

test("resultados cumulativos do navegador não repetem finais e juntam só parciais atuais", (t) => {
  const m = montar(t, { servidor: false });
  m.controle.ativar(true);
  const n = m.reconhecedores[0];
  n.resultado([{ texto: "qual a", final: false }]);
  n.resultado([{ texto: "Qual a escala?", final: true }]);
  n.resultado([{ texto: "Qual a escala?", final: true }]);
  n.resultado([{ texto: "Qual a escala?", final: true }, { texto: "outra", final: false }, { texto: "pergunta", final: false }], 1);
  assert.equal(m.trechos.filter((t) => t.final).length, 1);
  assert.equal(m.trechos.at(-1)?.texto, "outra pergunta");
  n.onend?.();
  t.mock.timers.tick(250);
  n.resultado([{ texto: "Qual a escala?", final: true }]);
  assert.equal(m.trechos.filter((t) => t.final).length, 2);
});

test("pausa e mute interrompem o navegador e retomam a mesma instância", (t) => {
  const m = montar(t, { servidor: false });
  m.controle.ativar(true);
  const n = m.reconhecedores[0];
  m.controle.ativar(false);
  const antes = m.trechos.length;
  n.resultado([{ texto: "voz do alto-falante", final: true }]);
  t.mock.timers.tick(1000);
  assert.equal(m.trechos.length, antes);
  assert.equal(n.inicios, 1);
  m.controle.ativar(true);
  assert.equal(n.inicios, 2);
  m.trilha.enabled = false;
  t.mock.timers.tick(200);
  assert.equal(m.estado()?.escutando, false);
  m.trilha.enabled = true;
  t.mock.timers.tick(200);
  assert.equal(n.inicios, 3);
  assert.equal(m.reconhecedores.length, 1);
  assert.equal(m.trilha.paradas, 0);
});

test("erro de rede reinicia com espera, enquanto permissão negada não gera loop", (t) => {
  const m = montar(t, { servidor: false });
  m.controle.ativar(true);
  const n = m.reconhecedores[0];
  n.onerror?.({ error: "network" });
  t.mock.timers.tick(499);
  assert.equal(n.inicios, 1);
  t.mock.timers.tick(1);
  assert.equal(n.inicios, 2);
  n.onerror?.({ error: "not-allowed" });
  t.mock.timers.tick(30000);
  assert.equal(n.inicios, 2);
  assert.equal(m.estado()?.motor, "nenhum");
  assert.match(m.estado()!.erro!, /not-allowed/);
});

test("navegador sem reconhecimento expõe nenhum motor", (t) => {
  const m = montar(t, { servidor: false, navegador: false });
  m.controle.ativar(true);
  assert.equal(m.estado()?.motor, "nenhum");
  assert.match(m.estado()!.erro!, /indisponível/);
  assert.equal(m.contextos.length, 0);
});

test("stream sem áudio expõe nenhum motor", (t) => {
  const vazio = montar(t, { semAudio: true });
  vazio.controle.ativar(true);
  assert.equal(vazio.estado()?.motor, "nenhum");
  assert.match(vazio.estado()!.erro!, /trilha/);
});

test("falha do token respeita o limite antes de cair no navegador", async (t) => {
  let chamadas = 0;
  const m = montar(t, { obterToken: async () => { chamadas++; throw new Error("indisponível"); } });
  m.controle.ativar(true);
  await andar();
  for (const espera of [500, 1000, 2000, 4000, 8000]) {
    t.mock.timers.tick(espera);
    await andar();
  }
  assert.equal(chamadas, 6);
  assert.equal(m.sockets.length, 0);
  assert.equal(m.estado()?.motor, "navegador");
});

test("sem fallback disponível a falha definitiva expõe erro e fecha captura", async (t) => {
  const m = montar(t, { navegador: false });
  m.controle.ativar(true);
  await andar();
  m.sockets[0].mensagem({ message_type: "quota_exceeded", error: "quota" });
  assert.equal(m.estado()?.motor, "nenhum");
  assert.equal(m.estado()?.escutando, false);
  assert.ok(m.estado()?.erro);
  assert.equal(m.contextos[0].fechamentos, 1);
});

test("socket saturado reconecta sem acumular áudio ilimitadamente", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  m.sockets[0].bufferedAmount = 300000;
  m.processar();
  assert.equal(m.sockets[0].enviados.length, 0);
  assert.equal(m.sockets[0].fechamentos, 1);
  assert.match(m.estado()!.erro!, /reconectando/);
});

test("erros repetidos do navegador param após cinco reinícios", (t) => {
  const m = montar(t, { servidor: false });
  m.controle.ativar(true);
  const n = m.reconhecedores[0];
  for (const espera of [500, 1000, 2000, 4000, 8000]) {
    n.onerror?.({ error: "network" });
    t.mock.timers.tick(espera);
  }
  n.onerror?.({ error: "network" });
  assert.equal(m.estado()?.motor, "nenhum");
  assert.equal(n.inicios, 6);
  t.mock.timers.tick(30000);
  assert.equal(n.inicios, 6);
});

test("navegador antigo que rejeita start(track) pode usar o microfone padrão", (t) => {
  const m = montar(t, { servidor: false });
  const n = m.reconhecedores[0];
  t.mock.method(n, "start", (trilha?: unknown) => {
    if (trilha) throw new TypeError("assinatura antiga");
    n.inicios++;
    n.onstart?.();
  });
  m.controle.ativar(true);
  assert.equal(m.estado()?.escutando, true);
  assert.equal(n.inicios, 1);
});

test("fim da trilha encerra captura e sockets sem reconectar", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  m.trilha.readyState = "ended";
  m.trilha.dispatchEvent(new Event("ended"));
  assert.equal(m.estado()?.motor, "nenhum");
  assert.equal(m.sockets[0].fechamentos, 1);
  t.mock.timers.tick(30000);
  assert.equal(m.tokens(), 1);
});

test("queda durante pausa só busca outro token quando a escuta é retomada", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  m.controle.ativar(false);
  m.sockets[0].cair();
  t.mock.timers.tick(30000);
  await andar();
  assert.equal(m.tokens(), 1);
  m.controle.ativar(true);
  await andar();
  assert.equal(m.tokens(), 2);
});

test("hipótese parcial retirada pelo navegador limpa a legenda sem criar final", (t) => {
  const m = montar(t, { servidor: false });
  m.controle.ativar(true);
  const n = m.reconhecedores[0];
  n.resultado([{ texto: "talvez", final: false }]);
  n.resultado([]);
  assert.equal(m.trechos.at(-1)?.texto, "");
  assert.equal(m.trechos.filter((t) => t.final).length, 0);
});

test("erro permanente do token cai direto no navegador, sem retentativas", async (t) => {
  let chamadas = 0;
  const m = montar(t, { obterToken: async () => { chamadas++; throw new ErroTokenTranscricao("sem chave", true); } });
  m.controle.ativar(true);
  await andar();
  assert.equal(chamadas, 1);
  assert.equal(m.estado()?.motor, "navegador");
});

test("pausa longa fecha o socket e retomar pede token novo", async (t) => {
  const m = montar(t);
  let relogio = 0;
  t.mock.method(performance, "now", () => relogio);
  const avancar = (ms: number) => { relogio += ms; t.mock.timers.tick(ms); };
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  m.controle.ativar(false);
  avancar(29000);
  assert.equal(m.sockets[0].fechamentos, 0);
  avancar(1400);
  assert.equal(m.sockets[0].fechamentos, 1);
  assert.equal(m.tokens(), 1);
  m.controle.ativar(true);
  await andar();
  assert.equal(m.tokens(), 2);
});

test("frases que o Scribe inventa no silêncio são descartadas; fala de verdade passa", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  m.processar(0.002, 6); // ruído de fundo, abaixo do limiar de voz
  ws.mensagem({ message_type: "partial_transcript", text: "Redução?" });
  ws.mensagem({ message_type: "committed_transcript", text: "Eu esqueci o que vocês vão perguntar. Redução?" });
  assert.equal(m.trechos.some((t) => t.texto.includes("Redução")), false);
  m.processar(0.002, 6);
  m.processar(0.2, 3); // ~250 ms de voz
  ws.mensagem({ message_type: "committed_transcript", text: "Quantos acessos por dia?" });
  assert.equal(m.trechos.at(-1)?.texto, "Quantos acessos por dia?");
  assert.equal(m.trechos.at(-1)?.final, true);
  // A voz conta por trecho: o próximo começa do zero.
  ws.mensagem({ message_type: "committed_transcript", text: "Obrigado." });
  assert.equal(m.trechos.at(-1)?.texto, "Quantos acessos por dia?");
});
