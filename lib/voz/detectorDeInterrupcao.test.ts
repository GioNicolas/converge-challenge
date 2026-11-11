import assert from "node:assert/strict";
import { test } from "node:test";
import { BYTES_ANTES_DO_DISPARO, criarDetectorDeInterrupcao, criarRegraDeInterrupcao, REGRA_PADRAO } from "./detectorDeInterrupcao";
import type { capturarAudio } from "../transcricao/captura";

const BLOCO = 100;
/** Mede `ms` de áudio com energia constante; devolve em que ms (desde o começo da chamada) disparou, ou null. */
function medirPor(regra: ReturnType<typeof criarRegraDeInterrupcao>, energia: number, ms: number): number | null {
  for (let t = 0; t < ms; t += BLOCO) if (regra.medir(energia, BLOCO)) return t + BLOCO;
  return null;
}
/** Começo de uma fala: folga de silêncio e linha de base com o vazamento. */
function calibrar(regra: ReturnType<typeof criarRegraDeInterrupcao>, vazamento: number) {
  medirPor(regra, 0, REGRA_PADRAO.ignorarMs);
  medirPor(regra, vazamento, REGRA_PADRAO.linhaDeBaseMs);
}

test("com fone (vazamento ~0), voz acima do piso por 250 ms interrompe em menos de 0,5 s", () => {
  const regra = criarRegraDeInterrupcao();
  calibrar(regra, 0.0005);
  assert.equal(regra.limiar, REGRA_PADRAO.piso);
  assert.equal(medirPor(regra, 0.005, 2000), null, "ruído baixo não interrompe");
  const disparo = medirPor(regra, 0.08, 1000);
  assert.ok(disparo !== null && disparo < 500, `disparou em ${disparo} ms`);
});

test("com caixa de som, o limiar sobe com o vazamento: o Totti não se interrompe sozinho", () => {
  const regra = criarRegraDeInterrupcao();
  calibrar(regra, 0.05);
  assert.ok(Math.abs(regra.limiar - 0.15) < 1e-9);
  // 20 falas seguidas, cada uma com o próprio vazamento variando em volta do nível medido.
  for (let fala = 0; fala < 20; fala++) {
    regra.reiniciar();
    calibrar(regra, 0.05);
    for (let t = 0; t < 4000; t += BLOCO) assert.equal(regra.medir(0.03 + 0.07 * Math.abs(Math.sin(t / 170 + fala)), BLOCO), false);
  }
  regra.reiniciar();
  calibrar(regra, 0.05);
  assert.ok(medirPor(regra, 0.3, 1000) !== null, "falar mais alto que ele interrompe");
});

test("pico curto (menos que o mínimo) não interrompe; precisa ser seguido", () => {
  const regra = criarRegraDeInterrupcao();
  calibrar(regra, 0);
  for (let i = 0; i < 10; i++) {
    assert.equal(regra.medir(0.2, 200), false);
    assert.equal(regra.medir(0, 100), false);
  }
  assert.equal(regra.medir(0.2, 200), false);
  assert.equal(regra.medir(0.2, 100), true);
});

test("a folga do começo e a janela da linha de base nunca disparam, e cada fala dispara uma vez", () => {
  const regra = criarRegraDeInterrupcao();
  assert.equal(medirPor(regra, 0.5, REGRA_PADRAO.ignorarMs + REGRA_PADRAO.linhaDeBaseMs), null);
  regra.reiniciar();
  calibrar(regra, 0);
  assert.notEqual(medirPor(regra, 0.5, 500), null);
  assert.equal(medirPor(regra, 0.5, 2000), null, "depois de disparar, espera a próxima fala");
});

/** Bloco PCM 16 bits de 100 ms com amplitude constante. */
function bloco(amplitude: number) {
  const valor = Math.round(amplitude * 32767) & 0xffff;
  let binario = "";
  for (let i = 0; i < 1600; i++) binario += String.fromCharCode(valor & 0xff, valor >> 8);
  return btoa(binario);
}

test("detector entrega a captura aberta com o áudio de antes do disparo", async () => {
  let aoAudio: ((b: string) => void) | undefined;
  let canceladas = 0;
  const capturar: typeof capturarAudio = async (o) => { aoAudio = o.aoAudio; return { cancelar: () => { canceladas++; }, parar: async () => {} }; };
  const entregues: string[] = [];
  let recebida: Parameters<Parameters<typeof criarDetectorDeInterrupcao>[0]["aoInterromper"]>[0] | undefined;
  const detector = criarDetectorDeInterrupcao({ capturar, aoInterromper: (c) => { recebida = c; } });
  detector.iniciar();
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 6; i++) aoAudio?.(bloco(0)); // folga e linha de base
  for (let i = 0; i < 10; i++) aoAudio?.(bloco(0.001)); // Totti falando com fone: quase nada no microfone
  for (let i = 0; i < 3 && !recebida; i++) aoAudio?.(bloco(0.2)); // a pessoa fala por cima
  assert.ok(recebida, "disparou");
  aoAudio?.(bloco(0.2)); // a fala continua enquanto a transcrição conecta
  recebida.ligar((b) => entregues.push(b));
  // ~600 ms guardados antes do disparo (3 blocos de antes + os 3 que dispararam) e o que veio depois.
  assert.equal(entregues.length, BYTES_ANTES_DO_DISPARO / 3200 + 1);
  detector.parar();
  assert.equal(canceladas, 0, "a captura entregue pertence ao ditado: o detector não a fecha");
});

test("parar sem disparo solta o microfone", async () => {
  let canceladas = 0;
  const capturar: typeof capturarAudio = async () => ({ cancelar: () => { canceladas++; }, parar: async () => {} });
  const detector = criarDetectorDeInterrupcao({ capturar, aoInterromper: () => assert.fail("não deve disparar") });
  detector.iniciar();
  await new Promise((r) => setImmediate(r));
  detector.parar();
  assert.equal(canceladas, 1);
});
