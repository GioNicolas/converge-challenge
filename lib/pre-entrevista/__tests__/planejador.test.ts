import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGO,
  SYSTEM_DESIGN_ATIVO,
  criteriosIniciais,
  modoAlternativoQueMede,
  modoAtivo,
  problemaPadrao,
} from "@/lib/pre-entrevista/catalogo";
import { cortarNaPrimeiraPergunta, falaFormatoIndisponivel, limparFala } from "@/lib/pre-entrevista/conversa";
import {
  aplicarPasso,
  decisaoDaOferta,
  decisoesAposTroca,
  MAX_APROFUNDAMENTOS,
  planoInicial,
  proximoPasso,
  trocaPedida,
  type EstadoPlanejamento,
} from "@/lib/pre-entrevista/planejador";
import { aplicarDecisoesTradeoff, mudarModo, paraInterviewConfig, Rascunho } from "@/lib/pre-entrevista/rascunho";

/** Estado em que o início já foi confirmado: a próxima decisão é de aprofundamento. */
function estado(extra: Partial<EstadoPlanejamento>): EstadoPlanejamento {
  return {
    ...planoInicial(),
    focus: [],
    cobertura: { confirmou_inicio: 1 },
    perguntasPorTopico: { confirmou_inicio: 1 },
    ...extra,
  };
}

describe("aprofundar: uma pergunta por área, sem follow-up", () => {
  it("pula a área que ela já tratou na fala", () => {
    const passo = proximoPasso(
      estado({
        focus: [
          { area: "escala_produto", weight: 0.5 },
          { area: "pressao", weight: 0.5 },
        ],
        areasFaladas: ["escala_produto"],
        mode: "live_coding",
      }),
    );
    assert.deepEqual(passo, { tipo: "aprofundar", area: "pressao", motivo: "inicial" });
  });

  it("resposta vaga não reabre a área: segue para a próxima ou para o resumo", () => {
    const anterior = { tipo: "aprofundar" as const, area: "pressao" as const, motivo: "inicial" as const };
    const comOutraArea = proximoPasso(
      estado({
        focus: [
          { area: "pressao", weight: 0.5 },
          { area: "escala_produto", weight: 0.5 },
        ],
        ultimoPasso: anterior,
        perguntasPorTopico: { confirmou_inicio: 1, criterio_pressao: 1 },
        sinais: { resposta_vaga: 1 },
        mode: "live_coding",
      }),
    );
    assert.deepEqual(comOutraArea, { tipo: "aprofundar", area: "escala_produto", motivo: "inicial" });

    const soUmaArea = proximoPasso(
      estado({
        focus: [{ area: "pressao", weight: 1 }],
        ultimoPasso: anterior,
        perguntasPorTopico: { confirmou_inicio: 1, criterio_pressao: 1 },
        sinais: { resposta_vaga: 1 },
        mode: "live_coding",
      }),
    );
    assert.equal(soUmaArea.tipo, "resumo_final");
  });

  it("área que já teve sua pergunta não volta, mesmo sem resposta boa", () => {
    const passo = proximoPasso(
      estado({
        focus: [{ area: "escala_produto", weight: 1 }],
        perguntasPorTopico: { confirmou_inicio: 1, criterio_escala_produto: 1 },
        mode: "live_coding",
      }),
    );
    assert.equal(passo.tipo, "resumo_final");
  });

  it("no máximo MAX_APROFUNDAMENTOS perguntas na conversa; depois segue para o resumo", () => {
    assert.equal(MAX_APROFUNDAMENTOS, 3);
    const focus = [
      { area: "tecnico" as const, weight: 0.25 },
      { area: "pressao" as const, weight: 0.25 },
      { area: "escala_produto" as const, weight: 0.25 },
      { area: "uso_ia" as const, weight: 0.25 },
    ];
    const abaixo = proximoPasso(
      estado({
        focus,
        perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1, criterio_pressao: 1 },
      }),
    );
    assert.deepEqual(abaixo, { tipo: "aprofundar", area: "escala_produto", motivo: "inicial" });

    const no_teto = proximoPasso(
      estado({
        focus,
        perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1, criterio_pressao: 1, criterio_escala_produto: 1 },
      }),
    );
    assert.equal(no_teto.tipo, "resumo_final");
  });

  it("aplicarPasso conta a pergunta de aprofundamento em criterio_<area>", () => {
    const plano = aplicarPasso(planoInicial(), { tipo: "aprofundar", area: "tecnico", motivo: "inicial" });
    assert.equal(plano.perguntasPorTopico.criterio_tecnico, 1);
  });
});

describe("system design disponível", () => {
  it("system design está ligado e é a troca que mede uso de IA quando o plano é live coding", () => {
    assert.equal(SYSTEM_DESIGN_ATIVO, true);
    assert.equal(modoAtivo("system_design"), true);
    assert.equal(modoAlternativoQueMede("live_coding", "uso_ia"), "system_design");
  });

  it("pedido de system design com o formato disponível não recebe aviso de indisponível (trava real)", () => {
    // Sem `formatoIndisponivelPedido`: o planejador lê a trava de verdade.
    const passo = proximoPasso(
      estado({
        focus: [{ area: "tecnico", weight: 1 }],
        mode: "live_coding",
        sinais: { pediu_system_design: 1 },
      }),
    );
    assert.notEqual(passo.tipo, "informar_formato_indisponivel");
  });

  it("pedido de system design em live coding vira troca; já em system design ou sem pedido, nada", () => {
    assert.equal(trocaPedida({ pediu_system_design: 1 }, "live_coding"), "system_design");
    assert.equal(trocaPedida({ pediu_system_design: 1 }, "system_design"), undefined);
    assert.equal(trocaPedida({ pediu_system_design: 0.2 }, "live_coding"), undefined);
    assert.equal(trocaPedida({}, "live_coding"), undefined);
  });

  it("depois da troca, a próxima pergunta de aprofundamento confirma o formato", () => {
    const passo = proximoPasso(
      estado({
        focus: [{ area: "escala_produto", weight: 1 }],
        mode: "system_design",
        modoEscolhido: "system_design",
        trocaPendente: "system_design",
      }),
    );
    assert.deepEqual(passo, { tipo: "aprofundar", area: "escala_produto", motivo: "inicial", confirmaTroca: "system_design" });
  });
});

describe("troca para system design: do rascunho ao plano do quadro", () => {
  const rascunho = (extra: Partial<Rascunho> = {}): Rascunho =>
    Rascunho.parse({
      mode: "live_coding",
      roleTitle: "Engenheiro(a) de Software Sênior — Backend",
      seniority: "senior",
      focus: [
        { area: "tecnico", weight: 0.5 },
        { area: "uso_ia", weight: 0.5 },
      ],
      criteria: criteriosIniciais("live_coding", ["tecnico"]),
      confirmado: { mode: false, seniority: true, focus: false },
      pendencias: [],
      ...extra,
    });

  it("troca escolhida para medir uso de IA: plano em system design com o chatbot de IA", () => {
    const r = aplicarDecisoesTradeoff(rascunho(), { uso_ia: "trocou" }, "system_design");
    assert.equal(r.mode, "system_design");
    assert.ok(r.criteria.every((c) => CATALOGO.system_design.some((x) => x.id === c.id)), "critérios do catálogo de system design");
    const final = paraInterviewConfig(r);
    assert.ok(final.ok, final.ok ? "" : final.erros.join("; "));
    assert.equal(final.config.mode, "system_design");
    assert.equal(final.config.problemId, "chatbot-atendimento-ia");
  });

  it("sem IA no foco, o problema segue o domínio da vaga", () => {
    const r = mudarModo(
      rascunho({ focus: [{ area: "escala_produto", weight: 1 }], jobDescription: "Time de pagamentos: Pix e transferências." }),
      "system_design",
    );
    const final = paraInterviewConfig(r);
    assert.ok(final.ok, final.ok ? "" : final.erros.join("; "));
    assert.equal(final.config.problemId, "pagamentos-instantaneos");
  });
});

describe("troca de formato: oferta, volta e resumo", () => {
  const oferta = { tipo: "oferecer_tradeoff" as const, area: "uso_ia" as const, modoAlternativo: "system_design" as const };

  it("pedir o formato oferecido é aceitar a troca, mesmo sem o sinal de escolha", () => {
    assert.equal(decisaoDaOferta({ pediu_system_design: 1 }, oferta, "live_coding"), "trocou");
    assert.equal(decisaoDaOferta({}, oferta, "live_coding"), "proxima_etapa");
    assert.equal(decisaoDaOferta({ escolheu_seguir_sem: 1 }, oferta, "live_coding"), "seguir_sem");
  });

  it("pedido de live coding depois de system design volta o formato; pedido ambíguo não troca", () => {
    assert.equal(trocaPedida({ pediu_live_coding: 1 }, "system_design"), "live_coding");
    assert.equal(trocaPedida({ pediu_live_coding: 1 }, "live_coding"), undefined);
    assert.equal(trocaPedida({ pediu_live_coding: 1, pediu_system_design: 1 }, "live_coding"), undefined);
  });

  it("voltar para um formato que não mede a área da troca deixa a área para a próxima etapa", () => {
    assert.deepEqual(decisoesAposTroca({ uso_ia: "trocou", pressao: "seguir_sem" }, "live_coding"), {
      uso_ia: "proxima_etapa",
      pressao: "seguir_sem",
    });
    assert.deepEqual(decisoesAposTroca({ uso_ia: "trocou" }, "system_design"), { uso_ia: "trocou" });
  });

  it("aprovação do resumo com troca pendente não encerra: vem o resumo de revisão com o formato novo", () => {
    const base = estado({
      focus: [{ area: "escala_produto", weight: 1 }],
      perguntasPorTopico: { confirmou_inicio: 1, criterio_escala_produto: 1 },
      mode: "system_design",
      resumos: 1,
      ultimoPasso: { tipo: "resumo_final" },
      sinais: { aprovou_resumo: 1, pediu_system_design: 1 },
    });
    assert.deepEqual(proximoPasso({ ...base, trocaPendente: "system_design" }), { tipo: "resumo_final", revisao: true });
    assert.deepEqual(proximoPasso(base), { tipo: "encerrar" });
  });
});

describe("problema de system design pela vaga", () => {
  const tec = [{ area: "tecnico" as const, weight: 1 }];

  it("termos genéricos não puxam domínio: banco de dados, tempo real, notificações", () => {
    const texto = "Backend Sênior. Experiência com banco de dados relacional, dashboards em tempo real e notificações push.";
    assert.equal(problemaPadrao("system_design", tec, texto), "encurtador-de-url");
  });

  it("termos do domínio puxam o problema certo", () => {
    assert.equal(problemaPadrao("system_design", tec, "Fintech: time de meios de pagamento e Pix"), "pagamentos-instantaneos");
    assert.equal(problemaPadrao("system_design", tec, "Banco digital, squad de contas"), "pagamentos-instantaneos");
    assert.equal(problemaPadrao("system_design", tec, "Plataforma de mensagens instantâneas"), "chat-tempo-real");
  });

  it("uso de IA com peso baixo não passa na frente do domínio; com peso relevante, sim", () => {
    const pouca = [
      { area: "escala_produto" as const, weight: 0.8 },
      { area: "uso_ia" as const, weight: 0.2 },
    ];
    const muita = [
      { area: "escala_produto" as const, weight: 0.5 },
      { area: "uso_ia" as const, weight: 0.5 },
    ];
    assert.equal(problemaPadrao("system_design", pouca, "Time de pagamentos"), "pagamentos-instantaneos");
    assert.equal(problemaPadrao("system_design", pouca, "Backend"), "chatbot-atendimento-ia");
    assert.equal(problemaPadrao("system_design", muita, "Time de pagamentos"), "chatbot-atendimento-ia");
  });
});

describe("formato que não está disponível (trava desligada)", () => {
  it("pedido de system design recebe um aviso, uma vez", () => {
    const e = estado({
      focus: [{ area: "tecnico", weight: 1 }],
      mode: "live_coding",
      formatoIndisponivelPedido: true,
      sinais: { pediu_system_design: 1 },
    });
    const passo = proximoPasso(e);
    assert.deepEqual(passo, { tipo: "informar_formato_indisponivel" });
    const depois = aplicarPasso(planoInicial(), passo);
    assert.equal(depois.perguntasPorTopico.formato_indisponivel, 1);
    const denovo = proximoPasso({ ...e, perguntasPorTopico: depois.perguntasPorTopico });
    assert.notEqual(denovo.tipo, "informar_formato_indisponivel");
  });
});

describe("limparFala", () => {
  it("tira a palavra de concordância do começo e capitaliza a nova primeira letra", () => {
    assert.equal(limparFala("Boa. Num problema de algoritmo, o que faz você achar um candidato ótimo?"), "Num problema de algoritmo, o que faz você achar um candidato ótimo?");
    assert.equal(limparFala("Fechado, então escalabilidade entra no foco. O que separa uma solução simples?"), "Então escalabilidade entra no foco. O que separa uma solução simples?");
    assert.equal(limparFala("Faz sentido! Você prefere explicar a complexidade?"), "Você prefere explicar a complexidade?");
    assert.equal(limparFala("Ótimo, você prefere X?"), "Você prefere X?");
  });

  it("não mexe em fala sem palavra de concordância, nem em palavra que só começa igual", () => {
    assert.equal(limparFala("Boas práticas importam. Qual você prefere?"), "Boas práticas importam. Qual você prefere?");
    assert.equal(limparFala("Certo"), "Certo");
    assert.equal(limparFala('"Legal, o que você acha?"'), "O que você acha?");
  });
});

describe("cortarNaPrimeiraPergunta", () => {
  it("duas perguntas: fica só a primeira", () => {
    assert.equal(cortarNaPrimeiraPergunta("O que você acha? Qual prefere?"), "O que você acha?");
  });

  it("afirmação e pergunta: as duas ficam", () => {
    assert.equal(cortarNaPrimeiraPergunta("Escalabilidade entra no foco. Qual você prefere?"), "Escalabilidade entra no foco. Qual você prefere?");
  });

  it("afirmação, pergunta e afirmação: a última afirmação sai", () => {
    assert.equal(cortarNaPrimeiraPergunta("Entra no foco. Você prefere X? Vou olhar isso também."), "Entra no foco. Você prefere X?");
  });

  it("sem pergunta, ou com a primeira dentro de aspas, fica como está", () => {
    assert.equal(cortarNaPrimeiraPergunta("Vou olhar a escalabilidade."), "Vou olhar a escalabilidade.");
    assert.equal(cortarNaPrimeiraPergunta('Ela disse "isso é certo?" e seguimos. Ok?'), 'Ela disse "isso é certo?" e seguimos. Ok?');
  });
});

describe("falaFormatoIndisponivel", () => {
  it("fala fixa em live coding, terminando com pergunta de decisão", () => {
    assert.equal(
      falaFormatoIndisponivel("live_coding"),
      "System design ainda não está disponível nesta versão, então a entrevista segue em live coding. Prefere seguir assim ou mudar alguma coisa?",
    );
  });
});
