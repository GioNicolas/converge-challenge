import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { criarEscutaTranscricao, type EstadoEscuta, type InterrupcaoPelaVoz } from "../useTranscricao";
import { ErroTokenTranscricao, type CredencialTranscricao } from "../tokenTranscricao";
import type { TrechoTranscrito } from "../transcricao";

/** Amostras PCM 16 bits de uma mensagem input_audio_chunk. */
function amostrasDe(dados: string): number[] {
  const binario = atob((JSON.parse(dados) as { audio_base_64: string }).audio_base_64);
  const saida: number[] = [];
  for (let i = 0; i < binario.length; i += 2) {
    const valor = binario.charCodeAt(i) | (binario.charCodeAt(i + 1) << 8);
    saida.push(valor >= 32768 ? valor - 65536 : valor);
  }
  return saida;
}

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
  servidor?: boolean; navegador?: boolean; prefixado?: boolean; semAudio?: boolean; taxa?: number;
  obterToken?: (id: string) => Promise<string | CredencialTranscricao>;
  interrupcao?: InterrupcaoPelaVoz;
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
    sampleRate = opcoes.taxa ?? 48000;
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
    interrupcao: opcoes.interrupcao,
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

test("pausa mantém socket e contexto, fecha o trecho com silêncio, não envia nada e ignora transcrições atrasadas", async (t) => {
  const m = montar(t);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  m.processar();
  ws.mensagem({ message_type: "partial_transcript", text: "escala" });
  m.controle.ativar(false);
  assert.equal(m.estado()?.escutando, false);
  // A fala aberta é fechada com silêncio (a folga de 1,2 s) para o Scribe confirmar o trecho.
  const fechamento = ws.enviados.slice(1).flatMap((dados) => amostrasDe(dados));
  assert.ok(fechamento.length >= 1.2 * 16000);
  assert.ok(fechamento.slice(-1.2 * 16000).every((amostra) => amostra === 0));
  const enviadosNaPausa = ws.enviados.length;
  m.processar(1, 30);
  assert.equal(ws.enviados.length, enviadosNaPausa);
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

/** Roda blocos de 256 ms (4096 amostras a 16 kHz) com relógio e timers andando junto. */
function relogioDeAudio(t: TestContext, m: ReturnType<typeof montar>) {
  let relogio = 0;
  t.mock.method(performance, "now", () => relogio);
  return {
    async blocos(valor: number, ms: number) {
      for (let i = 0; i < Math.round(ms / 256); i++) {
        m.processar(valor, 1);
        relogio += 256;
        t.mock.timers.tick(256);
        await andar();
        const ultimo = m.sockets.at(-1);
        if (ultimo && ultimo.readyState === 0) ultimo.iniciar();
      }
    },
  };
}

const VOZ = 0.25;
const SILENCIO = 0.001;
const AMOSTRA_VOZ = Math.round(VOZ * 32767);

test("portão de voz: nada vai no silêncio; fala vai inteira com 300 ms antes e 1,2 s depois", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  await audio.blocos(SILENCIO, 4096);
  const ws = m.sockets[0];
  const keepalive = ws.enviados.length;
  assert.ok(keepalive <= 1, "no silêncio só sai o bloco curto que mantém a conexão");
  await audio.blocos(VOZ, 2048);
  await audio.blocos(SILENCIO, 4096);
  const enviadas = ws.enviados.slice(keepalive).flatMap(amostrasDe);
  const primeiraVoz = enviadas.indexOf(AMOSTRA_VOZ);
  assert.ok(primeiraVoz >= 4096 && primeiraVoz <= 4800 + 4096, `folga antes: ${primeiraVoz} amostras`);
  assert.equal(enviadas.filter((a) => a === AMOSTRA_VOZ).length, 8 * 4096, "toda a fala foi enviada");
  const depois = enviadas.length - enviadas.lastIndexOf(AMOSTRA_VOZ) - 1;
  assert.ok(depois >= 1.2 * 16000 && depois <= 1.2 * 16000 + 4096, `folga depois: ${depois} amostras`);
  ws.mensagem({ message_type: "committed_transcript", text: "Quantos acessos por dia?" });
  assert.equal(m.trechos.at(-1)?.texto, "Quantos acessos por dia?");
  assert.ok(m.controle.uso().audioEnviadoS < 4);
});

test("fala que começa logo depois de o Totti parar não perde o começo", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  m.controle.ativar(false);
  await audio.blocos(VOZ, 5120); // o microfone ouve o Totti
  const ws = m.sockets[0];
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a !== 0).length, 0, "a voz do Totti não vai ao Scribe");
  m.controle.ativar(true);
  const antes = ws.enviados.length;
  await audio.blocos(VOZ, 512);
  await audio.blocos(SILENCIO, 1536);
  assert.equal(ws.enviados.slice(antes).flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 2 * 4096);
});

test("um \"sim\" isolado vai inteiro e confirma o trecho", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  await audio.blocos(SILENCIO, 2048);
  await audio.blocos(VOZ, 256);
  await audio.blocos(SILENCIO, 2048);
  const enviadas = m.sockets[0].enviados.flatMap(amostrasDe);
  assert.equal(enviadas.filter((a) => a === AMOSTRA_VOZ).length, 4096);
  m.sockets[0].mensagem({ message_type: "committed_transcript", text: "Sim." });
  assert.equal(m.trechos.at(-1)?.texto, "Sim.");
});

test("fala durante a conexão espera o session_started e sai inteira", async (t) => {
  const m = montar(t, { taxa: 16000 });
  m.controle.ativar(true);
  await andar();
  m.processar(VOZ, 3);
  const ws = m.sockets[0];
  assert.equal(ws.enviados.length, 0);
  ws.iniciar();
  assert.ok(ws.enviados.length >= 3, "o que esperava sai assim que a sessão começa");
  m.processar(SILENCIO, 6); // a folga depois da fala fecha o portão e manda o resto
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 3 * 4096);
});

test("fala enquanto o token é buscado também espera e sai inteira", async (t) => {
  let resolver!: (token: string) => void;
  const m = montar(t, { taxa: 16000, obterToken: () => new Promise((resolve) => { resolver = resolve; }) });
  m.controle.ativar(true);
  await andar();
  m.processar(VOZ, 3); // o socket ainda nem existe
  resolver("token");
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  m.processar(SILENCIO, 6);
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 3 * 4096);
});

test("o que esperava a conexão sai em rajadas que não saturam o socket", async (t) => {
  let resolver!: (token: string) => void;
  const m = montar(t, { taxa: 16000, obterToken: () => new Promise((resolve) => { resolver = resolve; }) });
  m.controle.ativar(true);
  await andar();
  m.processar(VOZ, 30); // ~7,7 s de fala: mandar tudo de uma vez passaria de 256 KB no buffer
  resolver("token");
  await andar();
  const ws = m.sockets[0];
  const enviar = ws.send.bind(ws);
  ws.send = (dados: string) => { ws.bufferedAmount += dados.length; enviar(dados); };
  ws.iniciar();
  assert.equal(ws.fechamentos, 0);
  assert.ok(ws.bufferedAmount < 262144, `buffer: ${ws.bufferedAmount}`);
  assert.ok(ws.enviados.length < 30 * 4096 / 3200, "parte fica para depois");
  for (let i = 0; i < 20; i++) {
    ws.bufferedAmount = 0; // a rede escoou
    t.mock.timers.tick(200);
  }
  m.processar(SILENCIO, 6);
  assert.equal(ws.fechamentos, 0);
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 30 * 4096);
});

test("fim de frase dito baixo segue com o portão aberto; ruído baixo sozinho não abre", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  const BAIXO = 0.006;
  const AMOSTRA_BAIXA = Math.round(BAIXO * 32767);
  await audio.blocos(BAIXO, 2048); // abaixo de LIMIAR_VOZ_RMS: não abre
  const ws = m.sockets[0];
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_BAIXA).length, 0);
  await audio.blocos(VOZ, 512);
  await audio.blocos(BAIXO, 2048); // mais longo que a folga de 1,2 s
  await audio.blocos(SILENCIO, 2048);
  const enviadas = ws.enviados.flatMap(amostrasDe);
  const baixasDepois = enviadas.slice(enviadas.lastIndexOf(AMOSTRA_VOZ)).filter((a) => a === AMOSTRA_BAIXA).length;
  assert.equal(baixasDepois, 8 * 4096, "toda a fala baixa depois da voz foi enviada");
});

test("ruído constante entre os limiares não mantém o portão aberto depois da fala", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  const ws = m.sockets[0];
  const RUIDO = 0.006; // ventilador ou TV a ~-44 dBFS: acima de LIMIAR_SUSTENTAR_RMS, abaixo de LIMIAR_VOZ_RMS
  const AMOSTRA_RUIDO = Math.round(RUIDO * 32767);
  const commits = () => ws.enviados.filter((d) => (JSON.parse(d) as { commit: boolean }).commit).length;
  await audio.blocos(VOZ, 1024);
  await audio.blocos(RUIDO, 60_000);
  const ruidoEnviado = ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_RUIDO).length / 16000;
  // Sustenta até 3 s depois da última voz e segue a folga de 1,2 s; o resto do minuto de ruído não vai.
  assert.ok(ruidoEnviado <= 3 + 1.2 + 0.3, `ruído enviado: ${ruidoEnviado.toFixed(2)} s`);
  assert.ok(ruidoEnviado >= 3, "o fim de frase baixo continua indo");
  assert.equal(commits(), 1, "o trecho é confirmado mesmo com o ruído");
  // Voz nova no meio do ruído abre o portão de novo.
  await audio.blocos(VOZ, 512);
  await audio.blocos(RUIDO, 10_000);
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 6 * 4096);
  assert.equal(commits(), 2);
});

test("o commit de segurança espera a fila escoar em vez de desistir", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  const ws = m.sockets[0];
  const commits = () => ws.enviados.filter((d) => (JSON.parse(d) as { commit: boolean }).commit).length;
  ws.bufferedAmount = 100_000; // acima de LIMITE_RAJADA: a rede está lenta, a fila não escoa
  await audio.blocos(VOZ, 512);
  await audio.blocos(SILENCIO, 3072); // o portão fecha e o commit de segurança vence com a fila cheia
  assert.equal(commits(), 0);
  ws.bufferedAmount = 0; // a rede escoou
  await audio.blocos(SILENCIO, 2048);
  assert.equal(commits(), 1, "o commit sai depois que a fila esvazia");
  const ultimo = JSON.parse(ws.enviados.findLast((d) => (JSON.parse(d) as { commit: boolean }).commit)!) as { commit: boolean };
  assert.equal(ultimo.commit, true);
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 2 * 4096);
});

test("pausa no meio de uma rajada não descarta a fala nem a folga de fechamento", async (t) => {
  let resolver!: (token: string) => void;
  const m = montar(t, { taxa: 16000, obterToken: () => new Promise((resolve) => { resolver = resolve; }) });
  m.controle.ativar(true);
  await andar();
  m.processar(VOZ, 30); // ~7,7 s de fala esperando a conexão
  resolver("token");
  await andar();
  const ws = m.sockets[0];
  const enviar = ws.send.bind(ws);
  ws.send = (dados: string) => { ws.bufferedAmount += dados.length; enviar(dados); };
  ws.iniciar();
  assert.ok(ws.enviados.length < 30 * 4096 / 3200, "parte fica para depois");
  m.controle.ativar(false); // o Totti começa a falar no meio da rajada
  for (let i = 0; i < 30; i++) {
    ws.bufferedAmount = 0;
    t.mock.timers.tick(200);
  }
  const enviadas = ws.enviados.flatMap(amostrasDe);
  assert.equal(enviadas.filter((a) => a === AMOSTRA_VOZ).length, 30 * 4096, "nenhuma fala perdida");
  const depois = enviadas.slice(enviadas.lastIndexOf(AMOSTRA_VOZ) + 1);
  assert.ok(depois.length >= 1.2 * 16000 && depois.every((a) => a === 0), "a folga de fechamento saiu");
  assert.equal(ws.fechamentos, 0);
});

test("commit vazio atrasado no meio da frase seguinte não faz ela ser descartada", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  await audio.blocos(VOZ, 1024); // a frase seguinte já começou
  ws.mensagem({ message_type: "committed_transcript", text: "" }); // resposta atrasada ao commit de segurança
  await audio.blocos(SILENCIO, 256);
  ws.mensagem({ message_type: "committed_transcript", text: "E qual é a proporção?" });
  assert.ok(m.trechos.some((tr) => tr.final && tr.texto.includes("proporção")));
});

test("se o VAD não confirma o trecho, o portão confirma à mão depois de fechar", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  const ws = m.sockets[0];
  const commits = () => ws.enviados.filter((d) => (JSON.parse(d) as { commit: boolean }).commit).length;
  // Fala de 1 s: com a folga, o trecho passa dos 2 s que o Scribe precisa e espera o VAD.
  await audio.blocos(VOZ, 1024);
  await audio.blocos(SILENCIO, 1536); // o portão fecha no último bloco
  assert.equal(commits(), 0, "espera o VAD primeiro");
  await audio.blocos(SILENCIO, 1024);
  assert.equal(commits(), 1);
  await audio.blocos(SILENCIO, 3072);
  assert.equal(commits(), 1, "um commit por trecho");
  // Com o VAD confirmando, nenhum commit à mão.
  await audio.blocos(VOZ, 512);
  await audio.blocos(SILENCIO, 1024);
  ws.mensagem({ message_type: "committed_transcript", text: "Ok." });
  await audio.blocos(SILENCIO, 3072);
  assert.equal(commits(), 1);
});

test("socket fechando não descarta o que estava para sair", async (t) => {
  const m = montar(t, { taxa: 16000 });
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  ws.readyState = 2;
  m.processar(VOZ, 3);
  assert.equal(ws.enviados.length, 0);
  ws.readyState = 1;
  m.processar(SILENCIO, 6);
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 3 * 4096);
});

async function linhaDoTempo(t: TestContext, fundo: number) {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  m.sockets[0].iniciar();
  let falado = 0;
  let ouvindo = 0;
  const falar = async (ms: number) => { falado += Math.round(ms / 256) * 4096; ouvindo += ms; await audio.blocos(VOZ, ms); };
  const calar = async (ms: number) => { ouvindo += ms; await audio.blocos(fundo, ms); };
  // Ciclo de 1 min: Totti pergunta, candidato responde com uma pausa curta, digita, diz "sim", comenta.
  for (let ciclo = 0; ciclo < 30; ciclo++) {
    m.controle.ativar(false);
    await audio.blocos(VOZ, 12_000);
    m.controle.ativar(true);
    await falar(6000);
    await calar(512);
    await falar(8000);
    await calar(15_000);
    await falar(512);
    await calar(8000);
    await falar(3500);
    await calar(6500);
  }
  const ws = m.sockets[0];
  assert.equal(m.sockets.length, 1, "pausas curtas e silêncio não derrubam a conexão");
  const enviadas = ws.enviados.flatMap(amostrasDe);
  assert.equal(enviadas.filter((a) => a === AMOSTRA_VOZ).length, falado, "nenhum trecho de fala perdido");
  m.controle.parar();
  const uso = m.controle.uso();
  const antigo = ouvindo / 1000 + 30 * 12; // caminho antigo: a sessão inteira, silêncio no lugar do Totti
  assert.ok(Math.abs(uso.sessaoS - antigo) < 5, `sessão: ${uso.sessaoS} s`);
  console.info(`[linha do tempo, fundo ${fundo}] enviado ${uso.audioEnviadoS.toFixed(0)} s de ${uso.sessaoS.toFixed(0)} s de sessão`);
  return { enviadoS: uso.audioEnviadoS, antigoS: antigo };
}

test("linha do tempo de 30 min (candidato fala 30%): o áudio enviado cai mais da metade", async (t) => {
  const { enviadoS, antigoS } = await linhaDoTempo(t, SILENCIO);
  assert.ok(enviadoS <= 0.5 * antigoS, `enviado ${enviadoS.toFixed(0)} s de ${antigoS.toFixed(0)} s`);
});

test("linha do tempo de 30 min com ruído de fundo constante (~-44 dBFS): a economia continua", async (t) => {
  const { enviadoS, antigoS } = await linhaDoTempo(t, 0.006);
  assert.ok(enviadoS <= 0.6 * antigoS, `enviado ${enviadoS.toFixed(0)} s de ${antigoS.toFixed(0)} s`);
});

test("fala curta (\"sim\") é completada até 2 s de áudio e confirmada em até 1,5 s depois da fala", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  const commits = () => ws.enviados.filter((d) => (JSON.parse(d) as { commit: boolean }).commit).length;
  await audio.blocos(VOZ, 256);
  // Folga do portão (1,2 s) + commit do trecho curto (300 ms).
  await audio.blocos(SILENCIO, 1536);
  assert.equal(commits(), 1, "confirmado à mão sem esperar o commit de segurança de 1 s");
  const enviadas = ws.enviados.flatMap(amostrasDe);
  assert.ok(enviadas.length >= 32_000, `o trecho chegou a 2 s de áudio (${enviadas.length} amostras)`);
});

test("fala curta já confirmada pelo VAD na folga não é completada com silêncio", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  await audio.blocos(VOZ, 256);
  await audio.blocos(SILENCIO, 768);
  ws.mensagem({ message_type: "committed_transcript", text: "Sim." });
  await audio.blocos(SILENCIO, 3072);
  const enviadas = ws.enviados.flatMap(amostrasDe);
  assert.ok(enviadas.length < 32_000, `nada além do portão e do manter-vivo (${enviadas.length} amostras)`);
  assert.ok(m.trechos.some((tr) => tr.final && tr.texto === "Sim."));
});

test("frase longa com pouca voz no microfone é descartada como inventada", async (t) => {
  const m = montar(t, { taxa: 16000 });
  const audio = relogioDeAudio(t, m);
  m.controle.ativar(true);
  await andar();
  const ws = m.sockets[0];
  ws.iniciar();
  await audio.blocos(VOZ, 256); // ~0,25 s de voz
  ws.mensagem({ message_type: "committed_transcript", text: "Eee 20. Tchau. Até mais, Fábio." });
  assert.ok(!m.trechos.some((tr) => tr.final), "6 palavras com 0,25 s de voz não chegam ao Totti");
  await audio.blocos(VOZ, 2048);
  ws.mensagem({ message_type: "committed_transcript", text: "Eu usaria um dicionário de pares aqui." });
  assert.ok(m.trechos.some((tr) => tr.final && tr.texto.includes("dicionário de pares")));
});

test("o vocabulário do servidor vai como keyterms na URL do Scribe", async (t) => {
  const m = montar(t, { taxa: 16000, obterToken: async () => ({ token: "tk", termos: ["dicionário de pares", "two sum"] }) });
  m.controle.ativar(true);
  await andar();
  const url = new URL(m.sockets[0].url);
  assert.deepEqual(url.searchParams.getAll("keyterms"), ["dicionário de pares", "two sum"]);
});

// Interrupção pela voz nas salas (#97): com o Totti falando, a escuta pausada mede o microfone e não manda nada.
function comInterrupcao(t: TestContext, ativa = () => true) {
  let disparos = 0;
  let disparouEm: number | null = null;
  let relogio = 0;
  const m = montar(t, { taxa: 16000, interrupcao: { ativa, aoInterromper: () => { disparos++; disparouEm = relogio; } } });
  const audio = relogioDeAudio(t, m);
  return {
    m,
    get disparos() { return disparos; },
    get disparouEm() { return disparouEm; },
    async blocos(valor: number, ms: number) {
      for (let i = 0; i < Math.round(ms / 256); i++) {
        await audio.blocos(valor, 256);
        relogio += 256;
      }
    },
  };
}
const FOLGA_E_LINHA_DE_BASE_MS = 1280;

test("com fone, falar por cima do Totti interrompe em menos de 0,5 s e nada vai ao Scribe antes", async (t) => {
  const c = comInterrupcao(t);
  c.m.controle.ativar(true);
  await andar();
  c.m.sockets[0].iniciar();
  c.m.controle.ativar(false); // o Totti começou a falar
  await c.blocos(0.002, FOLGA_E_LINHA_DE_BASE_MS); // folga de silêncio e quase nada de vazamento no fone
  await c.blocos(0.003, 2048);
  assert.equal(c.disparos, 0, "o vazamento do fone não interrompe");
  const comecou = FOLGA_E_LINHA_DE_BASE_MS + 2048;
  await c.blocos(VOZ, 512);
  assert.equal(c.disparos, 1);
  assert.ok(c.disparouEm !== null && c.disparouEm - comecou < 500, `disparou ${c.disparouEm! - comecou} ms depois da fala`);
  const ws = c.m.sockets[0];
  assert.equal(ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length, 0, "pausada, a escuta não manda a fala");
});

test("depois do disparo, a escuta retomada manda primeiro o áudio de antes: a primeira palavra não se perde", async (t) => {
  const c = comInterrupcao(t);
  c.m.controle.ativar(true);
  await andar();
  c.m.sockets[0].iniciar();
  c.m.controle.ativar(false);
  await c.blocos(0.002, FOLGA_E_LINHA_DE_BASE_MS + 1024);
  await c.blocos(VOZ, 512); // o primeiro bloco já dispara; o segundo é a fala seguindo enquanto a voz para
  assert.equal(c.disparos, 1);
  c.m.controle.ativar(true); // a sala parou o Totti e reabriu a escuta
  const ws = c.m.sockets[0];
  const antes = ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length;
  assert.ok(antes >= 4096, `o áudio da fala de antes de reabrir saiu (${antes} amostras de voz)`);
  await c.blocos(VOZ, 512);
  await c.blocos(SILENCIO, 1536);
  const total = ws.enviados.flatMap(amostrasDe).filter((a) => a === AMOSTRA_VOZ).length;
  // Os dois blocos de voz de antes de reabrir (o do disparo e o seguinte) e os dois de depois.
  assert.equal(total, 4 * 4096, "e a fala segue inteira depois");
  ws.mensagem({ message_type: "committed_transcript", text: "Pera, deixa eu explicar uma coisa antes." });
  assert.equal(c.m.trechos.at(-1)?.texto, "Pera, deixa eu explicar uma coisa antes.", "a voz de antes conta: o trecho não parece inventado");
});

test("com caixa de som, o Totti não se interrompe sozinho em 20 falas seguidas", async (t) => {
  const c = comInterrupcao(t);
  c.m.controle.ativar(true);
  await andar();
  c.m.sockets[0].iniciar();
  for (let fala = 0; fala < 20; fala++) {
    c.m.controle.ativar(false);
    await c.blocos(0.001, 768); // a folga de silêncio da fala
    // A voz dele voltando pelo microfone, variando em volta do nível da primeira sílaba.
    for (let i = 0; i < 12; i++) await c.blocos(0.04 + 0.05 * Math.abs(Math.sin(i / 2 + fala)), 256);
    c.m.controle.ativar(true);
    await c.blocos(SILENCIO, 1536); // a pausa entre as falas
  }
  assert.equal(c.disparos, 0);
  c.m.controle.ativar(false);
  await c.blocos(0.001, 768);
  await c.blocos(0.06, 512);
  await c.blocos(0.5, 512); // falar bem mais alto que ele interrompe
  assert.equal(c.disparos, 1);
});

test("sem poder interromper (despedida) ou com o microfone mudo, a vigília não dispara", async (t) => {
  let podeInterromper = false;
  const c = comInterrupcao(t, () => podeInterromper);
  c.m.controle.ativar(true);
  await andar();
  c.m.sockets[0].iniciar();
  c.m.controle.ativar(false);
  await c.blocos(0.002, FOLGA_E_LINHA_DE_BASE_MS);
  await c.blocos(VOZ, 1024);
  assert.equal(c.disparos, 0, "despedida: não interrompe");
  c.m.controle.ativar(true);
  podeInterromper = true;
  c.m.trilha.enabled = false;
  c.m.controle.ativar(false);
  await c.blocos(0.002, FOLGA_E_LINHA_DE_BASE_MS);
  await c.blocos(VOZ, 1024);
  assert.equal(c.disparos, 0, "mudo: não interrompe");
});
