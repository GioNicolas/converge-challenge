import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { caracteresAlterados, linhasAlteradas, voltouATrabalhar } from "../fechamento";
import { iniciarFechamento, proximoPasso } from "@/lib/totti/fechamento";
import { decideBlip } from "../policy";
import type { SessionState } from "@/lib/session/types";
import type { SessionEvent } from "@/lib/contracts";

const estado = iniciarFechamento({ sala: "codigo", gatilho: "concluiu", candidatas: [{ pergunta: "Qual é o custo dessa solução?", apontar: { startLine: 1, endLine: 2 } }], tempoRestanteMs: 600_000 });

describe("fechamento live coding", () => {
  it("mede linhas e caracteres alterados separadamente", () => {
    assert.equal(linhasAlteradas("a\nb\nc", "a\nx\nc"), 1);
    assert.equal(caracteresAlterados("prefixo antigo sufixo", "prefixo novo sufixo"), 5);
  });
  it("anuncia junto com a primeira pergunta e grifa o trecho", () => {
    const passo = proximoPasso(estado);
    assert.match(passo.fala, /Beleza.*Qual é o custo/);
    assert.deepEqual(passo.apontar, { startLine: 1, endLine: 2 });
    assert.equal(passo.etapa, "perguntas_finais");
  });

  it("encerra a conversa com despedida após a última palavra", () => {
    const primeira = proximoPasso(estado);
    const segunda = proximoPasso(primeira.estado, { responder: true, texto: "Certo.", intencao: "respondeu", concluiu: false, encerrar: false, perguntou: false }, "A complexidade é linear.");
    assert.equal(segunda.etapa, "ultima_palavra");
    const fim = proximoPasso(segunda.estado, { responder: true, texto: "Entendi.", intencao: "respondeu", concluiu: false, encerrar: false, perguntou: false }, "Não, é isso.");
    assert.equal(fim.encerrar, true);
    assert.equal(fim.etapa, "encerrada");
  });

  it("não sei avança para a próxima pergunta", () => {
    const inicio = iniciarFechamento({ sala: "codigo", gatilho: "concluiu", candidatas: [{ pergunta: "P1?" }, { pergunta: "P2?" }], tempoRestanteMs: 600_000 });
    const primeira = proximoPasso(inicio);
    const depois = proximoPasso(primeira.estado, { responder: true, texto: "Não sei.", intencao: "nao_sabe", concluiu: false, encerrar: false, perguntou: false }, "Não sei.");
    assert.match(depois.fala, /P2\?/);
  });

  it("pedido de encerrar começa diretamente pela despedida", () => {
    const inicio = iniciarFechamento({ sala: "codigo", gatilho: "pediu_encerrar" });
    const fim = proximoPasso(inicio);
    assert.equal(fim.encerrar, true);
    assert.ok(fim.fala.length > 0);
  });

  it("decideBlip não abre balão durante o fechamento", () => {
    const session = { fechamento: estado } as SessionState;
    assert.deepEqual(decideBlip(session, 0), {});
  });

  it("suspende só após edição substancial, não por run isolado", () => {
    const pequeno = { type: "snapshot", t: 1, sessionId: "s", code: "a\nb", version: 2, language: "ts" } as SessionEvent;
    const grande = { ...pequeno, code: "a\nb\nc\nd\ne" } as SessionEvent;
    const run = { type: "run", t: 2, sessionId: "s", result: { passed: 1, total: 1, cases: [], stdout: "", stderr: "", durationMs: 1 } } as SessionEvent;
    assert.equal(voltouATrabalhar(estado, pequeno, "a\nb"), false);
    assert.equal(voltouATrabalhar(estado, grande, "a\nb"), true);
    assert.equal(voltouATrabalhar(estado, run, "a\nb"), false);
  });
});
