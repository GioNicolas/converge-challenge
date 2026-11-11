import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGO,
  SYSTEM_DESIGN_ATIVO,
  mede,
  criteriosIniciais,
  modoAlternativoQueMede,
  modoAtivo,
  problemaPadrao,
} from "@/lib/pre-entrevista/catalogo";
import { nomeAreaFala } from "@/lib/pre-entrevista/cobertura";
import { cortarNaPrimeiraPergunta, falaFormatoIndisponivel, limparFala, trocarPergunta } from "@/lib/pre-entrevista/conversa";
import { PERGUNTA_CONTEXTO, PERGUNTAS, perguntaObvia, perguntasDaArea } from "@/lib/pre-entrevista/perguntas";
import { montarGuia } from "@/lib/pre-entrevista/guia";
import { lerDuracao, perguntouSobreTempo } from "@/lib/pre-entrevista/duracao";
import {
  aplicarPasso,
  decidirResumo,
  decidirTradeoff,
  decisaoDaOferta,
  decisaoPendente,
  decisoesAposTroca,
  MAX_APROFUNDAMENTOS,
  MAX_RESUMOS,
  nivelEmAberto,
  planoInicial,
  proximoPasso,
  trocaPedida,
  type EstadoPlanejamento,
} from "@/lib/pre-entrevista/planejador";
import { aplicarDecisoesTradeoff, mudarModo, paraInterviewConfig, Rascunho } from "@/lib/pre-entrevista/rascunho";

/**
 * Estado em que o início já foi confirmado e ela já disse um eliminatório: a próxima decisão é de aprofundamento,
 * e sem aprofundamento vem o resumo (a pergunta de contexto tem testes próprios).
 */
function estado(extra: Partial<EstadoPlanejamento>): EstadoPlanejamento {
  return {
    ...planoInicial(),
    focus: [],
    cobertura: { confirmou_inicio: 1, eliminatorios: 1 },
    perguntasPorTopico: { confirmou_inicio: 1 },
    ...extra,
  };
}

describe("aprofundar: uma pergunta por área", () => {
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

  it("resposta vaga não reabre a área com outro aprofundamento: o pedido do concreto é outro passo", () => {
    const anterior = { tipo: "aprofundar" as const, area: "pressao" as const, motivo: "inicial" as const };
    const passo = proximoPasso(
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
    assert.deepEqual(passo, { tipo: "pedir_o_que_faltou", sobre: "criterio", area: "pressao" });
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
    assert.equal(MAX_APROFUNDAMENTOS, 2);
    const focus = [
      { area: "tecnico" as const, weight: 0.25 },
      { area: "pressao" as const, weight: 0.25 },
      { area: "escala_produto" as const, weight: 0.25 },
      { area: "uso_ia" as const, weight: 0.25 },
    ];
    const abaixo = proximoPasso(
      estado({
        focus,
        perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1 },
      }),
    );
    assert.deepEqual(abaixo, { tipo: "aprofundar", area: "pressao", motivo: "inicial" });

    const no_teto = proximoPasso(
      estado({
        focus,
        perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1, criterio_pressao: 1 },
      }),
    );
    assert.equal(no_teto.tipo, "resumo_final");
  });

  it("aplicarPasso conta a pergunta de aprofundamento em criterio_<area>", () => {
    const plano = aplicarPasso(planoInicial(), { tipo: "aprofundar", area: "tecnico", motivo: "inicial" });
    assert.equal(plano.perguntasPorTopico.criterio_tecnico, 1);
  });
});

describe("aprofundar só o que ela trouxe ou o que mais pesa", () => {
  const focus = [
    { area: "tecnico" as const, weight: 0.6 },
    { area: "pressao" as const, weight: 0.4 },
  ];

  it("área que ela não pediu e não é a de maior peso não ganha pergunta (a pergunta inflaria o peso dela)", () => {
    const passo = proximoPasso(
      estado({ focus, areasFaladas: ["tecnico"], perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1 }, mode: "live_coding" }),
    );
    assert.equal(passo.tipo, "resumo_final");
  });

  it("ela já falou da área principal e nada foi perguntado: uma pergunta de escolha sobre ela, uma vez", () => {
    const passo = proximoPasso(estado({ focus, areasFaladas: ["tecnico", "pressao"], mode: "live_coding" }));
    assert.deepEqual(passo, { tipo: "aprofundar", area: "tecnico", motivo: "inicial" });
  });

  it("área que ela pediu ganha pergunta mesmo sem ser a de maior peso", () => {
    const passo = proximoPasso(estado({ focus, areasFaladas: ["tecnico"], sinais: { quer_pressao: 0.9 }, mode: "live_coding" }));
    assert.deepEqual(passo, { tipo: "aprofundar", area: "pressao", motivo: "inicial" });
  });

  it("a de maior peso vem primeiro quando ela não pediu nada", () => {
    const passo = proximoPasso(estado({ focus, mode: "live_coding" }));
    assert.deepEqual(passo, { tipo: "aprofundar", area: "tecnico", motivo: "inicial" });
  });
});

describe("pergunta de contexto (o que reprova direto, o que não deu certo antes)", () => {
  const semEliminatorio = (extra: Partial<EstadoPlanejamento>) => estado({ cobertura: { confirmou_inicio: 1 }, ...extra });

  it("vem depois dos aprofundamentos e antes do primeiro resumo, uma vez", () => {
    const focus = [{ area: "tecnico" as const, weight: 1 }];
    const depois = semEliminatorio({ focus, perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1 }, mode: "live_coding" });
    assert.equal(proximoPasso(depois).tipo, "perguntar_contexto");

    const plano = aplicarPasso(depois, { tipo: "perguntar_contexto" });
    assert.equal(plano.perguntasPorTopico.contexto, 1);
    assert.equal(proximoPasso({ ...depois, ...plano }).tipo, "resumo_final");
  });

  it("não pergunta se ela já disse um eliminatório", () => {
    const focus = [{ area: "tecnico" as const, weight: 1 }];
    const passo = proximoPasso(estado({ focus, perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1 }, mode: "live_coding" }));
    assert.equal(passo.tipo, "resumo_final");
  });

  it("não volta depois do resumo", () => {
    const passo = proximoPasso(semEliminatorio({ focus: [{ area: "tecnico", weight: 1 }], resumos: 1, perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1 }, mode: "live_coding" }));
    assert.notEqual(passo.tipo, "perguntar_contexto");
  });
});

describe("perguntas decisivas", () => {
  it("o molde 'o que separa um ótimo de um fraco' é reconhecido; pergunta de escolha, não", () => {
    for (const obvia of [
      "Sobre manter a calma quando dá errado, o que diferencia um desenvolvedor pleno de um que tem muita dificuldade?",
      "Num problema de algoritmo, o que separa um candidato ótimo de um fraco para implementar telas?",
      "Em componentes e modelo de dados, o que faz você achar um candidato ótimo e não só bom para essa vaga?",
      "O que separa um engenheiro excelente de um que apenas cumpre o básico?",
    ]) {
      assert.equal(perguntaObvia(obvia), true, obvia);
    }
    for (const boa of [
      "Se o tempo acabar, conta mais ele ter uma solução funcionando ou ter explicado bem o caminho?",
      "Nesse sistema, o que é pior: perder ou duplicar um dado, ou o sistema ficar fora do ar por um tempo?",
      PERGUNTA_CONTEXTO,
    ]) {
      assert.equal(perguntaObvia(boa), false, boa);
    }
  });

  it("todas as perguntas do banco passam na própria checagem e terminam com ?", () => {
    for (const modo of ["live_coding", "system_design"] as const) {
      for (const lista of Object.values(PERGUNTAS[modo])) {
        for (const p of lista ?? []) {
          assert.equal(perguntaObvia(p.texto), false, p.id);
          assert.ok(p.texto.trim().endsWith("?"), p.id);
        }
      }
    }
  });

  it("toda área que o formato mede tem pergunta no banco, em todo nível", () => {
    for (const modo of ["live_coding", "system_design"] as const) {
      for (const area of ["tecnico", "pressao", "escala_produto", "uso_ia"] as const) {
        if (!mede(modo, area)) continue;
        for (const nivel of ["junior", "pleno", "senior"] as const) {
          assert.ok(perguntasDaArea(modo, area, nivel, "").length > 0, `${modo}/${area}/${nivel}`);
        }
      }
    }
  });

  it("a vaga puxa a pergunta mais ligada a ela", () => {
    const [primeira] = perguntasDaArea("system_design", "escala_produto", "senior", "app de delivery offline-first com sincronização");
    assert.equal(primeira.id, "o_que_nao_pode_falhar");
  });

  it("trocarPergunta mantém a frase de antes e troca só a pergunta", () => {
    assert.equal(
      trocarPergunta("Então vamos de system design. O que separa um ótimo de um fraco?", "Qual é pior?"),
      "Então vamos de system design. Qual é pior?",
    );
    assert.equal(trocarPergunta("O que separa um ótimo de um fraco?", "Qual é pior?"), "Qual é pior?");
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
    // Sem sinal nenhum, o código não escolhe por ela: a oferta fica aberta e a fala vai ao modelo.
    assert.equal(decisaoDaOferta({}, oferta, "live_coding"), "incerto");
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

describe("nome da área técnica pelo formato", () => {
  it("em system design a área técnica é o desenho, não algoritmos; em live coding segue igual", () => {
    assert.equal(nomeAreaFala("tecnico", "system_design"), "componentes e modelo de dados");
    assert.equal(nomeAreaFala("tecnico", "live_coding"), "algoritmos e código");
    assert.equal(nomeAreaFala("tecnico"), "algoritmos e código");
    assert.equal(nomeAreaFala("escala_produto", "system_design"), "escalabilidade");
  });

  it("o guia do entrevistador usa o nome do formato", () => {
    const guia = montarGuia({
      mode: "system_design",
      focus: ["tecnico"],
      enfase: { tecnico: 3 },
      dispensadas: [],
      frasesImportantes: [],
      eliminatorios: [],
      contexto: "",
      tom: "amigavel",
      dicas: "leves",
      naoAvaliado: [],
    });
    assert.match(guia, /O que mais importa: componentes e modelo de dados\./);
    assert.doesNotMatch(guia, /algoritmos/);
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

describe("duração não sai de porcentagem nem de 'se o tempo acabar'", () => {
  it("'se o tempo acabar' não é pergunta de duração; 'quanto tempo' e 'minutos' são", () => {
    assert.equal(perguntouSobreTempo("Se o tempo acabar, o que conta mais pra você: funcionar ou explicar?"), false);
    assert.equal(perguntouSobreTempo("Quanto tempo você quer de entrevista?"), true);
    assert.equal(perguntouSobreTempo("Trinta minutos está bom?"), true);
  });

  it("porcentagem não vira minutos, mesmo depois de pergunta de tempo", () => {
    assert.equal(lerDuracao("não preciso que esteja 100% funcionando", { perguntouTempo: true }), undefined);
    assert.equal(lerDuracao("uns 45", { perguntouTempo: true }), 45);
  });
});

describe("semDispensaContrariada", () => {
  it("ignora a dispensa da área de que ela falou bem e mantém a dispensa declarada", async () => {
    const { semDispensaContrariada } = await import("@/lib/pre-entrevista/turno");
    const { acumularEnfase, estadoInicialEnfase } = await import("@/lib/pre-entrevista/enfase");
    const fala = "Quero menos algoritmo complicado e mais problema do dia a dia, tipo modelar uma API.";
    const respondeu = acumularEnfase(estadoInicialEnfase(), { tecnico: "respondeu" }, fala);
    const sinais = { dispensa_tecnico: 0.67, quer_pressao: 0.99 };
    assert.deepEqual(semDispensaContrariada(sinais, respondeu), { dispensa_tecnico: 0, quer_pressao: 0.99 });

    const dispensou = acumularEnfase(respondeu, { tecnico: "dispensou" }, "Pode tirar a parte técnica.");
    assert.equal(semDispensaContrariada(sinais, dispensou), sinais);
  });
});

describe("decisões: escolha, recusa ou incerto", () => {
  const oferta = { tipo: "oferecer_tradeoff" as const, area: "uso_ia" as const, modoAlternativo: "system_design" as const };

  it("troca de formato: os três caminhos pelos sinais, e incerto quando nenhum passa do limiar", () => {
    assert.equal(decidirTradeoff({ escolheu_trocar_formato: 0.9 }), "trocou");
    assert.equal(decidirTradeoff({ escolheu_proxima_etapa: 0.9 }), "proxima_etapa");
    assert.equal(decidirTradeoff({ escolheu_seguir_sem: 0.9 }), "seguir_sem");
    assert.equal(decidirTradeoff({ escolheu_trocar_formato: 0.3, escolheu_proxima_etapa: 0.4 }), "incerto");
    assert.equal(decidirTradeoff({}), "incerto");
  });

  it("resumo: aprovou, pediu mudança (que vale sobre a aprovação) ou incerto", () => {
    assert.equal(decidirResumo({ aprovou_resumo: 1 }), "aprovou");
    assert.equal(decidirResumo({ pediu_mudanca: 1 }), "mudanca");
    assert.equal(decidirResumo({ aprovou_resumo: 1, pediu_mudanca: 1 }), "mudanca");
    assert.equal(decidirResumo({ aprovou_resumo: 0.2 }), "incerto");
  });

  it("oferta em curso sem decisão fica pendente; com decisão ou com dúvida dela, não", () => {
    const base = estado({ focus: [{ area: "tecnico", weight: 1 }], mode: "live_coding", ultimoPasso: oferta, perguntasPorTopico: { confirmou_inicio: 1, tradeoff_uso_ia: 1 } });
    assert.deepEqual(decisaoPendente(base, proximoPasso(base), false), { tipo: "troca", oferta });
    const decidida = { ...base, decisoesTradeoff: { uso_ia: "proxima_etapa" as const } };
    assert.equal(decisaoPendente(decidida, proximoPasso(decidida), false), undefined);
    const comDuvida = { ...base, sinais: { fez_pergunta: 1 } };
    assert.equal(proximoPasso(comDuvida).tipo, "responder_duvida");
    assert.equal(decisaoPendente(comDuvida, proximoPasso(comDuvida), false), undefined);
  });

  it("nível perguntado e não dito fica pendente; sem a pergunta feita, o planejador pergunta", () => {
    const base = estado({ focus: [{ area: "tecnico", weight: 1 }], mode: "live_coding", nivelEmAberto: true, ultimoPasso: { tipo: "perguntar_nivel" } });
    assert.deepEqual(proximoPasso(base), { tipo: "perguntar_nivel" });
    assert.deepEqual(decisaoPendente(base, proximoPasso(base), true), { tipo: "nivel" });
    assert.equal(decisaoPendente(base, proximoPasso(base), false), undefined);
  });

  it("depois do resumo, fala que não aprova nem pede mudança fica pendente e nunca encerra", () => {
    const base = estado({ focus: [{ area: "tecnico", weight: 1 }], mode: "live_coding", perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1 }, ultimoPasso: { tipo: "resumo_final" } });
    for (const resumos of [1, MAX_RESUMOS, MAX_RESUMOS + 2]) {
      const e = { ...base, resumos };
      assert.deepEqual(proximoPasso(e), { tipo: "resumo_final", revisao: true });
      assert.deepEqual(decisaoPendente(e, proximoPasso(e), false), { tipo: "resumo" });
    }
  });

  it("aprovação e pedido de mudança claros continuam resolvidos pelos sinais", () => {
    const base = estado({ focus: [{ area: "tecnico", weight: 1 }], mode: "live_coding", perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1 }, ultimoPasso: { tipo: "resumo_final" }, resumos: 1 });
    const aprovou = { ...base, sinais: { aprovou_resumo: 1 } };
    assert.deepEqual(proximoPasso(aprovou), { tipo: "encerrar" });
    assert.equal(decisaoPendente(aprovou, proximoPasso(aprovou), false), undefined);
    const mudou = { ...base, sinais: { pediu_mudanca: 1 } };
    assert.deepEqual(proximoPasso(mudou), { tipo: "resumo_final", revisao: true });
    assert.equal(decisaoPendente(mudou, proximoPasso(mudou), false), undefined);
    // O limite conta só resumos de verdade: no terceiro, um pedido de mudança encerra.
    assert.deepEqual(proximoPasso({ ...mudou, resumos: MAX_RESUMOS }), { tipo: "encerrar" });
  });

  it("nível por estimativa deixa de estar em aberto", () => {
    assert.equal(nivelEmAberto(planoInicial(), ["seniority"], false), true);
    assert.equal(nivelEmAberto({ ...planoInicial(), nivelPorEstimativa: true }, ["seniority"], false), false);
  });
});

/** Issue #72: resposta que faz sentido, mas não diz o conteúdo ("Tem", "Somente que ele raciocine"). */
describe("pedir o que faltou", () => {
  const CONTEXTO = { tipo: "perguntar_contexto" as const };
  /** Depois da pergunta de contexto, sem eliminatório coberto. */
  const depoisDoContexto = (extra: Partial<EstadoPlanejamento> = {}) =>
    estado({
      focus: [{ area: "escala_produto", weight: 1 }],
      cobertura: { confirmou_inicio: 1 },
      perguntasPorTopico: { confirmou_inicio: 1, criterio_escala_produto: 1, contexto: 1 },
      ultimoPasso: CONTEXTO,
      mode: "system_design",
      ...extra,
    });

  it("'Tem' seco depois da pergunta de contexto: pergunta qual é, antes do resumo", () => {
    const passo = proximoPasso(depoisDoContexto({ sinais: { disse_que_tem_sem_dizer: 0.9, resposta_vaga: 0.77 } }));
    assert.deepEqual(passo, { tipo: "pedir_o_que_faltou", sobre: "contexto" });
  });

  it("só uma vez: sem resposta concreta de novo, segue para o resumo", () => {
    const antes = depoisDoContexto({ sinais: { disse_que_tem_sem_dizer: 0.9 } });
    const plano = aplicarPasso(antes, { tipo: "pedir_o_que_faltou", sobre: "contexto" });
    assert.equal(plano.perguntasPorTopico.faltou_contexto, 1);
    // Mesmo que ela diga "tem" de novo.
    assert.equal(proximoPasso({ ...antes, ...plano, sinais: { disse_que_tem_sem_dizer: 0.9 } }).tipo, "resumo_final");
  });

  it("com o eliminatório dito, ou sem ela confirmar que existe, vai direto para o resumo", () => {
    const coberto = depoisDoContexto({ cobertura: { confirmou_inicio: 1, eliminatorios: 0.9 }, sinais: { disse_que_tem_sem_dizer: 0.9 } });
    assert.equal(proximoPasso(coberto).tipo, "resumo_final");
    // "Não, nada" ou uma fala sem sentido (caso da #76): o sinal diz não, e esta issue não dispara.
    assert.equal(proximoPasso(depoisDoContexto({ sinais: { disse_que_tem_sem_dizer: 0.1 } })).tipo, "resumo_final");
  });

  it("depois de uma dúvida respondida, o 'Tem' ainda vale para a pergunta de contexto retomada", () => {
    const duvida = { tipo: "responder_duvida" as const, retomar: CONTEXTO, seguidas: 1 };
    const passo = proximoPasso(depoisDoContexto({ ultimoPasso: duvida, sinais: { disse_que_tem_sem_dizer: 0.9 } }));
    assert.deepEqual(passo, { tipo: "pedir_o_que_faltou", sobre: "contexto" });
  });

  const ESCALA = { tipo: "aprofundar" as const, area: "escala_produto" as const, motivo: "inicial" as const };
  /** Depois de um aprofundamento de escalabilidade, com o eliminatório já dito (o contexto não entra). */
  const depoisDoAprofundamento = (extra: Partial<EstadoPlanejamento> = {}) =>
    estado({
      focus: [
        { area: "escala_produto", weight: 0.6 },
        { area: "tecnico", weight: 0.4 },
      ],
      perguntasPorTopico: { confirmou_inicio: 1, criterio_escala_produto: 1 },
      ultimoPasso: ESCALA,
      mode: "system_design",
      ...extra,
    });

  it("resposta vaga num aprofundamento ('Somente que ele raciocine'): pede o concreto da mesma área", () => {
    const passo = proximoPasso(depoisDoAprofundamento({ sinais: { resposta_vaga: 0.77 }, cobertura: { confirmou_inicio: 1, eliminatorios: 1, criterio_escala_produto: 0.06 } }));
    assert.deepEqual(passo, { tipo: "pedir_o_que_faltou", sobre: "criterio", area: "escala_produto" });
  });

  it("resposta concreta não ganha follow-up", () => {
    const concreta = depoisDoAprofundamento({ sinais: { resposta_vaga: 0.1 }, cobertura: { confirmou_inicio: 1, eliminatorios: 1, criterio_escala_produto: 0.9 } });
    assert.notEqual(proximoPasso(concreta).tipo, "pedir_o_que_faltou");
    // O sinal de vaga sozinho não basta se o critério da área ficou coberto.
    assert.notEqual(proximoPasso({ ...concreta, sinais: { resposta_vaga: 0.9 } }).tipo, "pedir_o_que_faltou");
  });

  it("uma vez por conversa, não por área, e conta no teto de aprofundamentos", () => {
    const antes = depoisDoAprofundamento({ sinais: { resposta_vaga: 0.9 } });
    const plano = aplicarPasso(antes, { tipo: "pedir_o_que_faltou", sobre: "criterio", area: "escala_produto" });
    assert.equal(plano.perguntasPorTopico.faltou_criterio, 1);
    // O pedido ocupa a segunda vaga do teto: a área técnica não é perguntada, e a conversa vai para o resumo.
    assert.equal(proximoPasso({ ...antes, ...plano, sinais: { resposta_vaga: 0.9 } }).tipo, "resumo_final");

    // Outra área com resposta vaga, já tendo usado o pedido: nada de follow-up.
    const tecnico = { tipo: "aprofundar" as const, area: "tecnico" as const, motivo: "inicial" as const };
    const segunda = depoisDoAprofundamento({
      ultimoPasso: tecnico,
      perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1, faltou_criterio: 1 },
      sinais: { resposta_vaga: 0.9 },
    });
    assert.notEqual(proximoPasso(segunda).tipo, "pedir_o_que_faltou");
  });

  it("no teto de aprofundamentos, resposta vaga não ganha follow-up", () => {
    const noTeto = depoisDoAprofundamento({
      perguntasPorTopico: { confirmou_inicio: 1, criterio_tecnico: 1, criterio_escala_produto: 1 },
      sinais: { resposta_vaga: 0.9 },
    });
    assert.equal(proximoPasso(noTeto).tipo, "resumo_final");
  });

  it("área dispensada na mesma fala não ganha follow-up", () => {
    const passo = proximoPasso(depoisDoAprofundamento({ sinais: { resposta_vaga: 0.9, dispensa_escala_produto: 0.9 } }));
    assert.notEqual(passo.tipo, "pedir_o_que_faltou");
  });

  it("vale também para o aprofundamento emendado numa confirmação de mudança de foco", () => {
    const mudanca = { tipo: "confirmar_mudanca_foco" as const, entra: ["escala_produto" as const], sai: [], duvida: [], proximo: ESCALA };
    const passo = proximoPasso(depoisDoAprofundamento({ ultimoPasso: mudanca, mudancasPerguntadas: ["escala_produto"], sinais: { resposta_vaga: 0.9 } }));
    assert.deepEqual(passo, { tipo: "pedir_o_que_faltou", sobre: "criterio", area: "escala_produto" });
  });

  it("depois do resumo, nada de pedido do que faltou", () => {
    assert.notEqual(proximoPasso(depoisDoContexto({ resumos: 1, sinais: { disse_que_tem_sem_dizer: 0.9 } })).tipo, "pedir_o_que_faltou");
    assert.notEqual(proximoPasso(depoisDoAprofundamento({ resumos: 1, sinais: { resposta_vaga: 0.9 } })).tipo, "pedir_o_que_faltou");
  });

  it("a pergunta de contexto é aberta, não de sim ou não", () => {
    assert.doesNotMatch(PERGUNTA_CONTEXTO, /^(tem|existe|há)\b/i);
    assert.match(PERGUNTA_CONTEXTO, /^O que/);
  });
});
