import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FalaRecente } from "../../sessao/tipos";
import type { PlanoDaSessao } from "../../plano";
import { blocoDoRitmo, blocosDoSistemaDinamicoPerguntarV2, montarSistemaEstaticoPerguntarV2 } from "../entrevistador-v2";
import { KIT_SYSTEM_DESIGN as kit } from "../../kits/system-design";
import { estadoInicial } from "../../sessao/estado";

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

describe("notação do desenho no prompt da conversa (#81)", () => {
  it("explica (sem destino), (sem origem) e (ponta perto, sem encostar) antes do desenho", () => {
    const estado = estadoInicial({ criterios: kit.criterios.map((c) => c.id) });
    const texto = blocosDoSistemaDinamicoPerguntarV2(estado, kit, "APROFUNDAMENTO", [], "- [s1] A → (sem destino)", undefined, [], Date.now())
      .map((b) => b.texto).join("");
    for (const trecho of ["(sem destino)", "(sem origem)", "(ponta perto, sem encostar)", "não chega em nenhuma caixa", "pergunte de forma aberta"]) {
      assert.ok(texto.includes(trecho), `faltou: ${trecho}`);
    }
    assert.ok(texto.indexOf("COMO LER O DESENHO ATUAL") < texto.indexOf("Desenho atual (dados"));
  });
});

describe("critérios do plano em 'Ainda sem nenhum sinal' (#129, bloco D)", () => {
  const plano: PlanoDaSessao = {
    cargo: "Engenheiro de pagamentos", senioridade: "pleno", tom: "amigavel", dicas: "livres", foco: [], notas: "", duracaoMin: 30,
    criterios: [
      { nome: "Idempotência", descricao: "não cobra duas vezes", peso: 2 },
      { nome: "Falha no gateway", descricao: "", peso: 1 },
    ],
  };
  const textoDo = (estado: ReturnType<typeof estadoInicial>) =>
    blocosDoSistemaDinamicoPerguntarV2(estado, kit, "APROFUNDAMENTO", [], "- [s1] A → (sem destino)", undefined, [], Date.now())
      .map((b) => b.texto).join("");
  const semSinal = (texto: string) => texto.match(/Ainda sem nenhum sinal[^\n]*/)?.[0] ?? "";

  it("lista os critérios do plano sem evidência, pelos nomes, junto com os da rubrica", () => {
    const linha = semSinal(textoDo(estadoInicial({ criterios: kit.criterios.map((c) => c.id), plano })));
    assert.ok(linha.includes("Idempotência") && linha.includes("Falha no gateway"), linha);
  });

  it("some da lista quando o critério do plano ganha evidência", () => {
    const base = estadoInicial({ criterios: kit.criterios.map((c) => c.id), plano });
    const comEvidencia = { ...base, cobertura: { ...base.cobertura, Idempotência: { positivo: 1, negativo: 0, neutro: 0 } } };
    const linha = semSinal(textoDo(comEvidencia));
    assert.ok(!linha.includes("Idempotência") && linha.includes("Falha no gateway"), linha);
  });

  it("sem plano, a lista é a da rubrica (sem nomes de plano)", () => {
    const linha = semSinal(textoDo(estadoInicial({ criterios: kit.criterios.map((c) => c.id) })));
    assert.ok(!linha.includes("Idempotência"));
  });
});

describe("português claro no prompt do quadro (#129, decisão H)", () => {
  it("a regra fica na lista do quadro: termo em português, inglês só o nome usual ou o que a vaga usa", () => {
    const estatico = montarSistemaEstaticoPerguntarV2(kit, kit.problemas[0]);
    assert.match(estatico, /Português claro: termo do domínio em português \("entregador", "pedido", "lojista", "fila"\)/);
    assert.match(estatico, /Kafka, cache, API\) ou quando a descrição da vaga usa o termo/);
  });
});
