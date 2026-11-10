/**
 * Checagens do placar de casos fixos (`npm run pre:conversa`), como funções puras: sem LLM, com o antes e o depois
 * da fala montados à mão. Issue #51: três checagens aprovavam respostas erradas.
 *
 *   npx tsx --test scripts/pre-entrevista/__tests__/validar-conversa.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CASOS,
  desfechoDoCaso,
  errosDaSessao,
  perguntasDe,
  semPerguntaNova,
  type Checagem,
  type Foto,
  type Resultado,
} from "../validar-conversa";
import type { Sessao } from "@/lib/pre-entrevista/sessoes";

/** A pergunta de aprofundamento que estava em aberto antes da fala testada. */
const FALA_ANTERIOR = "Boa. E o pagamento duplicado?";

function foto(fala: string): Foto {
  return {
    ultimoPasso: undefined,
    emCurso: undefined,
    perguntasPorTopico: { aprofundar: 1 },
    resumos: 0,
    decisoesTradeoff: {},
    foco: [] as unknown as Foto["foco"],
    modo: "system_design" as Foto["modo"],
    nivelConfirmado: true,
    enfase: {} as Foto["enfase"],
    preferencias: {} as Foto["preferencias"],
    fala,
  };
}

/** O Totti respondeu `fala` e nada mais mudou no estado. */
function resultado(fala: string): Resultado {
  const antes = foto(FALA_ANTERIOR);
  return { antes, depois: { ...structuredClone(antes), fala }, passo: { tipo: "aprofundar" } as Resultado["passo"], sessao: {} as Resultado["sessao"] };
}

function conferirCaso(id: string, fala: string): Checagem[] {
  const caso = CASOS.find((c) => c.id === id);
  assert.ok(caso, `caso ${id} existe`);
  return caso.conferir(resultado(fala));
}

const falhas = (checagens: Checagem[]) => checagens.filter((c) => !c.ok).map((c) => c.nome);

describe("perguntasDe", () => {
  it("devolve todas as perguntas da fala, na ordem", () => {
    assert.deepEqual(perguntasDe("Qual a duração? E o pagamento duplicado?"), ["Qual a duração?", "E o pagamento duplicado?"]);
  });

  it("não corta a pergunta em valor com ponto", () => {
    assert.deepEqual(perguntasDe("Custa R$ 1.000 por mês. Cabe no orçamento?"), ["Cabe no orçamento?"]);
  });
});

describe("semPerguntaNova (caso pede-tempo)", () => {
  it("reprova pergunta nova antes da pergunta em aberto", () => {
    const c = semPerguntaNova(resultado("Qual a duração? E o pagamento duplicado?"));
    assert.equal(c.ok, false);
    assert.match(c.detalhe ?? "", /Qual a duração\?/);
  });

  it("reprova o caso inteiro com a mesma fala", () => {
    assert.deepEqual(falhas(conferirCaso("pede-tempo", "Qual a duração? E o pagamento duplicado?")), ["sem pergunta nova"]);
  });

  it("aprova fala sem pergunta", () => {
    assert.deepEqual(falhas(conferirCaso("pede-tempo", "Claro, fica à vontade.")), []);
  });

  it("aprova fala que só retoma a pergunta em aberto", () => {
    assert.deepEqual(falhas(conferirCaso("pede-tempo", "Claro, sem pressa. E o pagamento duplicado?")), []);
  });
});

describe("responde antes de voltar à pergunta (caso duvida-fora-da-entrevista)", () => {
  it("reprova fala que não responde a dúvida, mesmo com duas frases", () => {
    assert.deepEqual(falhas(conferirCaso("duvida-fora-da-entrevista", "Vamos continuar. E o pagamento duplicado?")), [
      "responde antes de voltar à pergunta",
    ]);
  });

  it("reprova fala que só retoma a pergunta", () => {
    assert.ok(falhas(conferirCaso("duvida-fora-da-entrevista", "E o pagamento duplicado?")).includes("responde antes de voltar à pergunta"));
  });

  it("aprova resposta que fala do candidato e volta à pergunta", () => {
    assert.deepEqual(falhas(conferirCaso("duvida-fora-da-entrevista", "Não, o candidato não vê essa conversa. E o pagamento duplicado?")), []);
  });

  it("aprova resposta que fala da conversa sem citar o candidato", () => {
    assert.deepEqual(falhas(conferirCaso("duvida-fora-da-entrevista", "Não, essa conversa fica só com você. E o pagamento duplicado?")), []);
  });
});

describe("erro na sessão", () => {
  const ok: Checagem[] = [{ nome: "o plano não mudou", ok: true }];
  const logs = (tipos: string[]) =>
    tipos.map((tipo, id) => ({ id, t: 0, em: "", tipo, resumo: `${tipo} ${id}` })) as unknown as Sessao["logs"];

  it("caso com evento de erro sai como erro, mesmo com as checagens passando", () => {
    const erros = errosDaSessao(logs(["sessao_criada", "erro", "rascunho_atualizado"]));
    assert.deepEqual(erros, ["erro 1"]);
    assert.equal(desfechoDoCaso(ok, erros), "erro");
  });

  it("caso sem erro continua passando", () => {
    assert.equal(desfechoDoCaso(ok, errosDaSessao(logs(["sessao_criada", "rascunho_atualizado"]))), "passou");
  });

  it("erro no histórico vence cenário que não chegou ao ponto esperado", () => {
    assert.equal(desfechoDoCaso([], errosDaSessao(logs(["sessao_criada", "erro"])), false), "erro");
    assert.equal(desfechoDoCaso([], errosDaSessao(logs(["sessao_criada"])), false), "nao_montado");
  });

  it("checagem que falha sem erro na sessão sai como falhou", () => {
    assert.equal(desfechoDoCaso([...ok, { nome: "x", ok: false }], []), "falhou");
  });
});
