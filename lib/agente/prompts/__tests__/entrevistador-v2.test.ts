import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FalaRecente } from "../../sessao/tipos";
import { blocoDoRitmo } from "../entrevistador-v2";

const agente = (texto: string): FalaRecente => ({ quem: "agente", texto });
const candidato = (texto: string): FalaRecente => ({ quem: "candidato", texto });

describe("blocoDoRitmo", () => {
  it("conta as perguntas do agente e não manda segurar quando ele quase não perguntou", () => {
    const texto = blocoDoRitmo([agente("Oi, eu sou o Totti."), candidato("Oi."), agente("Onde fica o contador?"), candidato("Num serviço.")]);
    assert.match(texto, /Perguntas suas até agora: 1/);
    assert.doesNotMatch(texto, /NÃO pergunte/);
  });
  it("manda não perguntar quando duas das últimas quatro falas terminaram em pergunta", () => {
    const conversa = [agente("E se cair?"), candidato("Vai pro banco."), agente("Tá."), candidato("E a fila."), agente("Como conta os cliques?")];
    const texto = blocoDoRitmo(conversa);
    assert.match(texto, /Perguntas suas até agora: 2/);
    assert.match(texto, /2 das suas últimas 3 falas terminaram em pergunta\. Nesta, NÃO pergunte/);
  });
  it("lista as perguntas já feitas, mesmo quando muitas reações curtas vieram depois", () => {
    const conversa = [agente("Como fica o código personalizado?"), ...Array.from({ length: 8 }, () => agente("Hm.")), agente("Tá.")];
    assert.match(blocoDoRitmo(conversa), /Perguntas que você já fez na conversa.*"Como fica o código personalizado\?"/);
  });
  it("só olha as últimas quatro falas do agente para o aviso", () => {
    const conversa = [agente("A?"), agente("B?"), agente("Tá."), agente("Segue."), agente("Certo."), agente("Pode continuar.")];
    assert.doesNotMatch(blocoDoRitmo(conversa), /NÃO pergunte/);
  });
});
