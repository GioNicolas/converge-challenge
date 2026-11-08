import assert from "node:assert/strict";
import { test } from "node:test";
import { FocoAudio } from "../audio/foco";
import type { reproduzirFala } from "./cliente";
import { criarFilaDeFalas, type EstadoVoz } from "./filaDeFalas";

// Tempos curtos para o teste: o que importa é a ordem e a pausa, não os valores reais.
const PAUSA = 60;
const SINTESE = 20;
const DURACAO = 80;
/** Folga para a imprecisão dos timers. */
const FOLGA = 3;

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Monta uma fila com um "ElevenLabs" falso que registra quando cada áudio começa e termina de tocar. */
function montar(opcoes: { falhar?: string[]; duracao?: Record<string, number> } = {}) {
  const t0 = Date.now();
  const agora = () => Date.now() - t0;
  const audios: { texto: string; inicio: number; fim?: number; cortado?: boolean }[] = [];
  const estados: { em: number; estado: EstadoVoz }[] = [];
  let tocandoAgora = 0;
  let maximoSimultaneo = 0;

  const reproduzir: typeof reproduzirFala = async (texto, sinal, eventos, antesDeTocar) => {
    await dormir(SINTESE);
    sinal.throwIfAborted();
    if (opcoes.falhar?.includes(texto)) throw new Error(`voz indisponível para ${texto}`);
    if (antesDeTocar && !(await antesDeTocar())) return;
    sinal.throwIfAborted();
    const audio: (typeof audios)[number] = { texto, inicio: agora() };
    audios.push(audio);
    tocandoAgora++;
    maximoSimultaneo = Math.max(maximoSimultaneo, tocandoAgora);
    eventos.aoIniciar("elevenlabs");
    try {
      await new Promise<void>((ok, falha) => {
        const id = setTimeout(ok, opcoes.duracao?.[texto] ?? DURACAO);
        sinal.addEventListener("abort", () => { clearTimeout(id); falha(sinal.reason); }, { once: true });
      });
    } catch (erro) {
      audio.cortado = true;
      throw erro;
    } finally {
      tocandoAgora--;
      audio.fim = agora();
    }
  };

  const fila = criarFilaDeFalas({
    reproduzir,
    foco: new FocoAudio(),
    pausaMs: PAUSA,
    tela: {
      estado: (estado) => estados.push({ em: agora(), estado }),
      erro: () => {},
      aviso: () => {},
      provedor: () => {},
      fala: () => {},
    },
  });
  const audio = (texto: string) => {
    const a = audios.find((x) => x.texto === texto);
    assert.ok(a, `o áudio "${texto}" deveria ter tocado`);
    return a;
  };
  return { fila, audios, estados, audio, agora, maximoSimultaneo: () => maximoSimultaneo };
}

test("fala nova com outra tocando espera ela terminar e a pausa, sem sobrepor", async () => {
  const { fila, audio, maximoSimultaneo } = montar();
  const a = fila.falar("A");
  await dormir(SINTESE + 30); // A já está tocando
  const b = fila.falar("B");
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.equal(audio("A").cortado, undefined, "A não pode ser cortada pela B");
  assert.ok(audio("B").inicio >= audio("A").fim! + PAUSA - FOLGA, "B só começa depois do fim de A mais a pausa");
  assert.equal(maximoSimultaneo(), 1);
});

test("a pausa vale mesmo quando a fala seguinte chega depois que a anterior já terminou", async () => {
  const { fila, audio } = montar();
  assert.equal(await fila.falar("A"), true);
  // Ex.: a resposta acabou e a pergunta de um balão chega logo em seguida.
  assert.equal(await fila.falar("B"), true);
  assert.ok(audio("B").inicio >= audio("A").fim! + PAUSA - FOLGA);
});

test("uma fala que ainda não começou a tocar é substituída pela mais nova", async () => {
  const { fila, audios, audio } = montar();
  const a = fila.falar("A");
  await dormir(SINTESE + 30);
  const b = fila.falar("B"); // na fila atrás de A
  await dormir(10);
  const c = fila.falar("C"); // B ainda não tocava: fica velha
  assert.deepEqual(await Promise.all([a, b, c]), [true, false, true]);
  assert.deepEqual(audios.map((x) => x.texto), ["A", "C"]);
  assert.ok(audio("C").inicio >= audio("A").fim! + PAUSA - FOLGA, "C espera A mesmo com B descartada no meio");
});

test("depois de um corte (parar), a fala seguinte também espera a pausa", async () => {
  const { fila, audio } = montar();
  const a = fila.falar("A");
  await dormir(SINTESE + 30);
  fila.parar(); // ex.: o candidato abriu um balão
  const b = fila.falar("B");
  assert.deepEqual(await Promise.all([a, b]), [false, true]);
  assert.equal(audio("A").cortado, true);
  assert.ok(audio("B").inicio >= audio("A").fim! + PAUSA - FOLGA, "B espera a pausa contada do corte de A");
});

test("numa rajada de falas nunca toca mais de uma ao mesmo tempo", async () => {
  const { fila, audios, maximoSimultaneo } = montar();
  const pedidas: Promise<boolean>[] = [];
  for (const texto of ["A", "B", "C", "D", "E"]) {
    pedidas.push(fila.falar(texto));
    await dormir(DURACAO + SINTESE); // cada uma chega com a anterior ainda tocando ou na pausa
  }
  await Promise.all(pedidas);
  assert.equal(maximoSimultaneo(), 1);
  for (let i = 1; i < audios.length; i++) {
    assert.ok(audios[i].inicio >= audios[i - 1].fim! + PAUSA - FOLGA, `${audios[i].texto} encostou em ${audios[i - 1].texto}`);
  }
});

test("na pausa entre duas falas o agente segue ocupado (ninguém toma a vez dele)", async () => {
  const { fila, estados, audio } = montar();
  const a = fila.falar("A");
  await dormir(SINTESE + 30);
  const b = fila.falar("B");
  await Promise.all([a, b]);
  const naPausa = estados.filter((e) => e.em >= audio("A").fim! && e.em < audio("B").inicio).map((e) => e.estado);
  assert.ok(!naPausa.includes("inativa"), `estado na pausa: ${naPausa.join(", ")}`);
  assert.equal(estados.at(-1)?.estado, "inativa", "no fim de tudo o agente fica inativo");
});

test("parar descarta também as falas da fila", async () => {
  const { fila, audios } = montar();
  const a = fila.falar("A");
  await dormir(SINTESE + 30);
  const b = fila.falar("B");
  fila.parar();
  assert.deepEqual(await Promise.all([a, b]), [false, false]);
  await dormir(DURACAO + PAUSA + SINTESE);
  assert.deepEqual(audios.map((x) => x.texto), ["A"]);
});

test("erro na fala da fila não derruba a que está tocando", async () => {
  const { fila, estados, audio } = montar({ falhar: ["B"] });
  const a = fila.falar("A");
  await dormir(SINTESE + 10);
  const b = fila.falar("B");
  assert.deepEqual(await Promise.all([a, b]), [true, false]);
  assert.equal(audio("A").cortado, undefined);
  const enquantoA = estados.filter((e) => e.em > audio("A").inicio && e.em < audio("A").fim!).map((e) => e.estado);
  assert.ok(!enquantoA.includes("erro"), `estado enquanto A tocava: ${enquantoA.join(", ")}`);
});

test("a fala espera o candidato fazer uma pausa (antesDeTocar) só depois da pausa do agente", async () => {
  const { fila, audio, agora } = montar();
  const a = fila.falar("A");
  await dormir(SINTESE + 30);
  let perguntouEm = -1;
  const b = fila.falar("B", {
    antesDeTocar: async () => { perguntouEm = agora(); await dormir(40); return true; },
  });
  await Promise.all([a, b]);
  assert.ok(perguntouEm >= audio("A").fim! + PAUSA - FOLGA, "a vez do candidato só é consultada depois da pausa");
  assert.ok(audio("B").inicio >= perguntouEm + 40 - FOLGA);
});
