// O que o quadro entrega ao fechamento comum (#84): as candidatas a pergunta final, na ordem de importância, e o
// que o candidato já ouviu. A escolha (quantas cabem, sem repetir) é do núcleo: lib/totti/fechamento.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escolherPerguntasFinais } from "../../totti/fechamento";
import { candidatasDoQuadro, perguntaDoCriterio, perguntasJaOuvidas } from "../fechamento";
import { KIT_SYSTEM_DESIGN as kit } from "../kits/system-design";
import { linhaDoFechamento } from "../prompts/entrevistador-v2";
import { estadoInicial, transicionar, type EstadoSessao } from "../sessao/estado";

const AGORA = 1_800_000_000_000;
const problema = kit.problemas.find((p) => p.id === "chat_tempo_real")!;
const estadoEm = (extra: Partial<EstadoSessao> = {}): EstadoSessao =>
  ({ ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: AGORA - 5 * 60_000, iniciadaEm: AGORA - 12 * 60_000, ...extra });
/** Uma observação positiva no critério: passa a ter evidência suficiente. */
const comEvidencia = (estado: EstadoSessao, criterio: string): EstadoSessao => transicionar(estado, { tipo: "ANALISE_RECEBIDA", resposta: {
  status: "ok", parteFechada: false, escopo: false, pergunta: null, nota: null, elementos: [], degrau: null,
  observacoes: [{ criterio, sinal: "positivo", espontaneo: true, evidencia: `Mostrou ${criterio} no desenho.` }],
} }, AGORA).estado;

describe("candidatas a pergunta final do quadro", () => {
  it("a pergunta da análise que esperava a vez vem primeiro, com as peças e as marcas dela", () => {
    const pendente: EstadoSessao["perguntaPendente"] = {
      status: "duvida", parteFechada: true, escopo: false, pergunta: "Por que o app fala direto com o banco?", nota: "Direto no banco?", elementos: ["s3"],
      visual: [{ tipo: "circular", alvo: "s3" }], degrau: null, observacoes: [], criadoEm: AGORA - 10_000,
    };
    const candidatas = candidatasDoQuadro(kit, problema, estadoEm({ perguntaPendente: pendente }), AGORA);
    const fila = escolherPerguntasFinais(candidatas, undefined, []);
    assert.equal(fila[0].pergunta, "Por que o app fala direto com o banco?");
    assert.equal(fila[0].origem, "analise");
    assert.deepEqual(fila[0].apontar, { elementos: ["s3"], visual: [{ tipo: "circular", alvo: "s3" }] });
  });

  it("depois, os critérios de maior peso sem evidência (requisitos e comunicação ficam de fora), e então as do problema", () => {
    const candidatas = candidatasDoQuadro(kit, problema, estadoEm(), AGORA);
    const deCriterio = candidatas.filter((c) => c.origem?.startsWith("criterio:"));
    assert.equal(deCriterio.some((c) => c.origem === "criterio:requisitos" || c.origem === "criterio:comunicacao"), false);
    const fila = escolherPerguntasFinais(candidatas, undefined, []);
    assert.deepEqual(fila.map((c) => c.origem?.split(":")[0]), ["criterio", "criterio", "problema", "problema"]);
    assert.notEqual(fila[0].pergunta, fila[1].pergunta);
    assert.equal(fila[2].pergunta, problema.perguntasSugeridas[0]);
  });

  it("critério que já tem evidência não vira pergunta", () => {
    const coberto = ["componentes", "escalabilidade", "dados_consistencia", "tradeoffs"].reduce(comEvidencia, estadoEm());
    const candidatas = candidatasDoQuadro(kit, problema, coberto, AGORA);
    const comEvidenciaSuficiente = kit.criterios.filter((c) => coberto.cobertura[c.id] && coberto.cobertura[c.id].positivo > 0).map((c) => `criterio:${c.id}`);
    assert.ok(comEvidenciaSuficiente.length > 0, "o kit mudou de critérios: ajuste os ids do teste");
    for (const origem of comEvidenciaSuficiente) assert.equal(candidatas.some((c) => c.origem === origem), false, origem);
  });

  it("a sugerida que continua a anterior não vai sozinha quando ele já ouviu a anterior", () => {
    const [primeira, continuacao] = problema.perguntasSugeridas;
    assert.ok(continuacao.startsWith("E "), "o problema mudou: escolha outro par de perguntas para o teste");
    const semOuvir = candidatasDoQuadro(kit, problema, estadoEm(), AGORA).map((c) => c.pergunta);
    assert.ok(semOuvir.includes(primeira) && semOuvir.includes(continuacao));
    const jaOuviu = estadoEm({ conversa: [{ quem: "agente", texto: primeira, em: AGORA - 60_000 }] });
    assert.equal(candidatasDoQuadro(kit, problema, jaOuviu, AGORA).some((c) => c.pergunta === continuacao), false);
  });

  it("o que ele já ouviu: as perguntas da conversa e as da análise, com as continuações", () => {
    const estado = estadoEm({
      conversa: [
        { quem: "agente", texto: "Saquei.", em: AGORA - 90_000 },
        { quem: "agente", texto: "E se o servidor cair?", em: AGORA - 60_000 },
        { quem: "candidato", texto: "Posso assumir um banco só?", em: AGORA - 30_000 },
      ],
      perguntas: [{ numero: 1, status: "duvida", pergunta: "Onde fica o gargalo?", nota: null, elementos: [], degrau: null, feitaEm: AGORA - 120_000, fase: "ALTO_NIVEL", seguimentos: ["E com dez vezes o volume?"] }],
    });
    assert.deepEqual(perguntasJaOuvidas(estado), ["E se o servidor cair?", "Onde fica o gargalo?", "E com dez vezes o volume?"]);
  });

  it("a pergunta do critério usa o nome da rubrica sem o parêntese, em duas formas", () => {
    assert.equal(perguntaDoCriterio("Dados e consistência"), "Como você pensou a parte de dados e consistência no seu desenho?");
    assert.equal(perguntaDoCriterio("Clareza da interface (hierarquia, estados de erro)", 1), "Sobre clareza da interface: o que você levou em conta até aqui?");
    assert.equal(perguntaDoCriterio("APIs e contratos"), "Como você pensou a parte de APIs e contratos no seu desenho?");
  });
});

describe("contexto do fechamento no prompt", () => {
  it("sem conclusão nem fechamento, o prompt não muda", () => {
    assert.equal(linhaDoFechamento(undefined), "");
    assert.equal(linhaDoFechamento({ desenhoConcluido: false }), "");
  });

  it("desenho concluído: não pedir para continuar; no fechamento, a etapa e que a sequência é do sistema", () => {
    assert.match(linhaDoFechamento({ desenhoConcluido: true }), /^Desenho concluído: .*Não peça para continuar, seguir ou retomar o desenho\.\n$/);
    const finais = linhaDoFechamento({ desenhoConcluido: true, etapa: "perguntas_finais" });
    assert.match(finais, /Fechamento da entrevista: o desenho está concluído/);
    assert.match(finais, /a próxima pergunta é escolhida pelo sistema/);
    assert.match(finais, /a despedida é do sistema/);
    assert.match(linhaDoFechamento({ desenhoConcluido: true, etapa: "ultima_palavra" }), /quer acrescentar algo/);
  });
});
