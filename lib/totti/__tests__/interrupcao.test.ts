import assert from "node:assert/strict";
import { test } from "node:test";
import { falaInterrompida, foiInterrompida, INSTRUCAO_INTERRUPCAO, MARCA_INTERROMPIDA, semMarcaDeInterrupcao } from "../interrupcao";
import { aplicarGuardas } from "../guardas";
import { conversaEmTexto, historicoDaConversa } from "../../agente/prompts/contexto";
import { buildInterviewerUser } from "../../agents/prompts/interviewer";

const PERGUNTA = "Como esse banco aguenta o pico de acessos da manhã?";
const ENTRADA_DO_CODIGO = {
  mode: "candidate" as const, fase: "implementando" as const, elapsedLabel: "05:00", remainingLabel: "25:00", language: "python",
  numberedCode: "1 | pass", uncovered: [], previousConversations: "(nenhuma)",
};

test("a fala cortada fica até a última palavra inteira ouvida, com a marca", () => {
  assert.equal(falaInterrompida(PERGUNTA, 20), `Como esse banco… ${MARCA_INTERROMPIDA}`);
  // No meio de "aguenta": a palavra não foi dita inteira.
  assert.equal(falaInterrompida(PERGUNTA, 19), `Como esse banco… ${MARCA_INTERROMPIDA}`);
  assert.equal(falaInterrompida(PERGUNTA, 16), `Como esse banco… ${MARCA_INTERROMPIDA}`);
});

test("ouviu até o fim: não é corte; não ouviu nada: a fala sai do histórico", () => {
  assert.equal(falaInterrompida(PERGUNTA, PERGUNTA.length - 1), PERGUNTA);
  assert.equal(falaInterrompida(PERGUNTA, 0), null);
  assert.equal(falaInterrompida(PERGUNTA, 3), null, "nem a primeira palavra inteira");
});

test("a marca nunca sai na fala do Totti", () => {
  assert.equal(semMarcaDeInterrupcao(`Certo. ${MARCA_INTERROMPIDA} E o cache?`), "Certo. E o cache?");
  assert.equal(aplicarGuardas(`E o cache? ${MARCA_INTERROMPIDA}`).texto, "E o cache?");
});

test("retomar uma pergunta cortada não é repetir pergunta", () => {
  const cortada = falaInterrompida(PERGUNTA, 35)!;
  assert.ok(foiInterrompida(cortada));
  const retomada = "Voltando: como esse banco aguenta o pico de acessos?";
  assert.equal(aplicarGuardas(retomada, { perguntasJaFeitas: [cortada] }).texto, retomada);
  // A mesma pergunta, feita inteira antes, continua barrada.
  assert.notEqual(aplicarGuardas(retomada, { perguntasJaFeitas: [PERGUNTA] }).texto, retomada);
});

test("a conversa das duas salas explica a marca só quando há fala cortada", () => {
  const cortada = falaInterrompida(PERGUNTA, 35)!;
  const quadro = conversaEmTexto([{ quem: "agente", texto: cortada }, { quem: "candidato", texto: "Pera." }]);
  assert.ok(quadro.includes(INSTRUCAO_INTERRUPCAO));
  assert.ok(!conversaEmTexto([{ quem: "agente", texto: PERGUNTA }]).includes(INSTRUCAO_INTERRUPCAO));
  const codigo = buildInterviewerUser({ ...ENTRADA_DO_CODIGO, messages: [{ role: "agent", text: cortada }, { role: "candidate", text: "Pera." }] });
  assert.ok(codigo.includes(INSTRUCAO_INTERRUPCAO));
  assert.ok(codigo.indexOf(INSTRUCAO_INTERRUPCAO) > codigo.indexOf("</conversa>"), "fora da etiqueta de dados");
});

test("quadro: a versão cortada toma o lugar da fala inteira que o servidor guardou", () => {
  const cortada = falaInterrompida(PERGUNTA, 35)!;
  const servidor = [
    { quem: "candidato" as const, texto: "Coloquei um banco aqui." },
    { quem: "agente" as const, texto: PERGUNTA },
  ];
  const doQuadro = [...servidor.slice(0, 1), { quem: "agente" as const, texto: cortada }, { quem: "candidato" as const, texto: "Pera, qual pico?" }];
  assert.deepEqual(historicoDaConversa(servidor, doQuadro).map((f) => f.texto), ["Coloquei um banco aqui.", cortada, "Pera, qual pico?"]);
});
