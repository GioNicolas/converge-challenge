// O que deu errado numa entrevista real de system design (sessão a1fe8e5e, chat em tempo real) e não pode voltar:
// pergunta repetida, pedido de encerramento ignorado, peça citada sem marca, observação repetida no livro e a
// mudança no problema escrita por cima do desenho.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aceitaEncerrar, OFERTA_DE_ENCERRAR, perguntaDeConducao, perguntaJaFeita } from "../guardas";
import { KIT_SYSTEM_DESIGN as kitDemo } from "../kits/system-design";
import { criarClienteFalso } from "../llm/cliente";
import { AVISOS_DE_QUE_VAI_OLHAR, perguntar } from "../perguntar";
import { estadoInicial, transicionar, type EstadoSessao } from "../sessao/estado";
import { extrairIdsDoGrafo, filtrarResposta, motivoBloqueioPlin } from "../sessao/politica";
import { garantirMarca, pecasCitadas } from "../../presenca/acoesVisuais";
import { lugarLivreParaALinha } from "../../presenca/coreografia";
import { estadoInicial as estadoDoQuadro, marcoDoCliente, transicionar as transicionarQuadro, type EstadoEntrevista } from "../../sessao/estados";

const AGORA = 1_800_000_000_000;
const problema = kitDemo.problemas.find((p) => p.id === "chat_tempo_real")!;
const GRAFO = [
  "COMPONENTES",
  "- [r1] Novo usuário Número: Senha: (retângulo)",
  "- [r2] Contatos (retângulo)",
  "- [r3] Banco de dados Usuarios Cada usuario terá seus contatos salvos aqui (retângulo)",
  "- [r4] Conversa aberta (retângulo)",
  "CONEXÕES",
  "- [s1] Novo usuário Número: Senha: → Contatos",
].join("\n");

const JA_PERGUNTOU = "Se cada pessoa num grupo de cem mil faz uma requisição direta pro banco pra buscar mensagem, como você imagina que o banco se comporta com esse volume?";
const REPETIDA = "Se a gente mantiver essa ida direta ao banco para cada pessoa do grupo buscar mensagem, como você escalaria essa parte para aguentar o volume?";

function estadoEm(fase: EstadoSessao["fase"], extra: Partial<EstadoSessao> = {}): EstadoSessao {
  return { ...estadoInicial(), fase, faseIniciadaEm: AGORA - 5 * 60_000, iniciadaEm: AGORA - 8 * 60_000, ...extra };
}
const deps = (saida: Record<string, unknown>) => ({
  llm: criarClienteFalso([{ requisito: null, concluiu: false, desfecho: null, ...saida }]), kit: kitDemo, problema, log: () => {}, versao: "v2" as const,
});

describe("pergunta repetida", () => {
  it("reconhece a pergunta que o candidato reclamou de ouvir de novo", () => {
    assert.equal(perguntaJaFeita(REPETIDA, [JA_PERGUNTOU]), true);
    assert.equal(perguntaJaFeita("Como a mensagem chega em quem está offline?", [JA_PERGUNTOU]), false);
  });

  it("o Totti não repete: a pergunta sai da fala, e sem mais nada ele fica quieto", async () => {
    const estado = estadoEm("ALTO_NIVEL", { conversa: [{ quem: "agente", texto: JA_PERGUNTOU, em: AGORA - 40_000 }] });
    const r = await perguntar(deps({ responder: true, texto: REPETIDA }), estado, { fase: "ALTO_NIVEL", texto: "Vai ter uma lentidão, depende do banco.", grafo: GRAFO }, AGORA);
    assert.equal(r.responder, false);
  });
});

describe("candidato diz que terminou", () => {
  it("na primeira vez o Totti avisa que vai olhar o desenho, sem convite vago, e a pergunta seguinte fica liberada", async () => {
    const r = await perguntar(deps({ responder: true, texto: "Tranquilo. O que mais você gostaria de detalhar ou adicionar no desenho?", concluiu: true }),
      estadoEm("APROFUNDAMENTO"), { fase: "APROFUNDAMENTO", texto: "Acho que eu terminei aqui.", grafo: GRAFO }, AGORA);
    // O convite vago em forma de pergunta não passa: no lugar dele, o aviso.
    assert.ok(AVISOS_DE_QUE_VAI_OLHAR.includes(r.texto), r.texto);
    assert.equal(r.concluiu, true);
    assert.equal(r.estado.conclusoes, 1);
    for (const vaga of ["Quer seguir para outra parte do desenho ou detalhar algo que a gente passou por cima?", "O que mais você gostaria de detalhar ou adicionar no desenho?"]) {
      assert.equal(perguntaDeConducao(vaga), true, vaga);
    }
    assert.equal(perguntaDeConducao("Por que você quer guardar as mensagens nesse banco?"), false);
    assert.equal(perguntaDeConducao("Como a mensagem chega em quem está offline?"), false);
    const semPergunta = await perguntar(deps({ responder: true, texto: "Tudo bem. Fica à vontade.", concluiu: true }),
      estadoEm("APROFUNDAMENTO"), { fase: "APROFUNDAMENTO", texto: "Acho que eu terminei aqui.", grafo: GRAFO }, AGORA);
    assert.ok(AVISOS_DE_QUE_VAI_OLHAR.includes(semPergunta.texto));
    // ...e a regra "a bola está com o candidato" não segura a pergunta da análise logo depois do aviso.
    assert.equal(motivoBloqueioPlin(semPergunta.estado, AGORA + 3_000, undefined, { paradoHaS: 3 }), null);
  });

  it("na terceira vez oferece encerrar, e a resposta curta a essa oferta encerra", async () => {
    const jaDisseDuasVezes = estadoEm("APROFUNDAMENTO", { conclusoes: 2, ultimaConclusaoEm: AGORA - 30_000 });
    const oferta = await perguntar(deps({ responder: true, texto: "Tudo bem. Se quiser dar uma última olhada, fica à vontade.", concluiu: true }),
      jaDisseDuasVezes, { fase: "APROFUNDAMENTO", texto: "Já falei, pô. Eu acho que eu terminei aqui.", grafo: GRAFO }, AGORA);
    assert.equal(oferta.texto, OFERTA_DE_ENCERRAR);
    for (const fala of ["Nada.", "Quero não, pode encerrar.", "Pode.", "Já falei tudo."]) {
      const fim = await perguntar(deps({ responder: true, texto: "não deveria ser usado" }), oferta.estado, { fase: "APROFUNDAMENTO", texto: fala }, AGORA + 5_000);
      assert.equal(fim.encerrar, true, fala);
    }
    assert.equal(aceitaEncerrar("Na verdade eu queria mostrar como a fila resolve o problema do grupo grande"), false);
  });
});

describe("peça citada é marcada", () => {
  it("acha pelo nome as peças de que a fala trata", () => {
    assert.deepEqual(pecasCitadas("Como as mensagens passam desse banco de dados para a conversa aberta?", GRAFO), ["r3", "r4"]);
    assert.deepEqual(pecasCitadas("E se o destinatário estiver offline?", GRAFO), []);
  });

  it("pergunta com elementos e sem gesto ganha uma marca; o gesto do modelo fica como está", () => {
    assert.deepEqual(garantirMarca([], ["r3"]), [{ tipo: "marcar", alvo: "r3" }]);
    assert.deepEqual(garantirMarca([{ tipo: "anotar", texto: "Por quê?" }], ["r3"], 1), [{ tipo: "marcar", alvo: "r3" }, { tipo: "anotar", texto: "Por quê?" }]);
    const doModelo = [{ tipo: "enquadrar" as const, alvo: "r4" }];
    assert.deepEqual(garantirMarca(doModelo, ["r3"]), doModelo);
    assert.equal(garantirMarca(undefined, []), undefined);
  });

  it("a análise que devolve visual vazio com elementos sai com a marca", () => {
    const r = filtrarResposta(estadoEm("ALTO_NIVEL"), {
      status: "duvida", pergunta: "Por que os contatos ficam nesse banco?", nota: "Contatos no banco?", elementos: ["r3"], visual: [], degrau: null, observacoes: [],
    }, extrairIdsDoGrafo(GRAFO), AGORA);
    assert.deepEqual(r.visual, [{ tipo: "marcar", alvo: "r3" }]);
  });

  it("a pergunta da conversa que cita uma peça também marca", async () => {
    const r = await perguntar(deps({ responder: true, texto: "Como as mensagens saem desse banco de dados e chegam na conversa aberta?", visual: [] }),
      estadoEm("ALTO_NIVEL"), { fase: "ALTO_NIVEL", texto: "Pronto, tem alguma dúvida?", grafo: GRAFO }, AGORA);
    assert.equal(r.visual?.[0] && "alvo" in r.visual[0] ? r.visual[0].alvo : null, "r3");
  });
});

describe("livro de observações", () => {
  it("a mesma observação com outras palavras não entra de novo", () => {
    const obs = (evidencia: string, criterio = "requisitos") => ({ status: "ok" as const, pergunta: null, nota: null, elementos: [], degrau: null,
      observacoes: [{ criterio, sinal: "negativo" as const, espontaneo: false, evidencia }] });
    let e = estadoEm("ALTO_NIVEL");
    for (const evidencia of [
      "Começou a desenhar telas de cadastro e contatos sem alinhar escala ou funcionalidades principais.",
      "Candidato começou a desenhar telas de cadastro e contatos sem alinhar escala ou funcionalidades principais.",
      "Candidato desenhando telas de cadastro e contatos sem definir escala ou funcionalidades principais.",
    ]) e = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: obs(evidencia) }, AGORA).estado;
    assert.equal(e.observacoes.length, 1);
    assert.equal(e.cobertura.requisitos.negativo, 1);
    // Outro critério, ou outro fato, entra.
    e = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: obs("Propôs um banco de dados para cada grupo.", "dados_consistencia") }, AGORA).estado;
    assert.equal(e.observacoes.length, 2);
  });
});

describe("quadro", () => {
  it("o requisito novo não é escrito por cima do desenho do candidato", () => {
    const linha = { x: 40, y: 300, largura: 560, altura: 30 };
    assert.deepEqual(lugarLivreParaALinha(linha, [{ x: 700, y: 290, largura: 200, altura: 80 }]), linha);
    const desviada = lugarLivreParaALinha(linha, [{ x: 100, y: 280, largura: 300, altura: 120 }, { x: 500, y: 310, largura: 400, altura: 60 }]);
    assert.equal(desviada.x, 900 + 48);
    assert.equal(desviada.y, linha.y);
  });

  it("dizer que terminou é um marco no quadro: a pergunta seguinte não espera o intervalo", () => {
    let e: EstadoEntrevista = { ...estadoDoQuadro(), fase: "APROFUNDAMENTO", faseIniciadaEm: AGORA - 5 * 60_000 };
    assert.equal(marcoDoCliente(e, AGORA), false);
    e = transicionarQuadro(e, { tipo: "CANDIDATO_CONCLUIU" }, AGORA);
    assert.equal(e.fase, "APROFUNDAMENTO");
    assert.equal(marcoDoCliente(e, AGORA + 10_000), true);
    assert.equal(marcoDoCliente(e, AGORA + 60_000), false);
  });
});
