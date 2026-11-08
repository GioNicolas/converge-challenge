import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_DESIGN_ATIVO, modoAlternativoQueMede, modoAtivo } from "@/lib/pre-entrevista/catalogo";
import { cortarNaPrimeiraPergunta, falaFormatoIndisponivel, limparFala } from "@/lib/pre-entrevista/conversa";
import { aplicarPasso, MAX_APROFUNDAMENTOS, planoInicial, proximoPasso, type EstadoPlanejamento } from "@/lib/pre-entrevista/planejador";

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

  it("pedido de system design com o formato disponível não recebe aviso de indisponível", () => {
    const passo = proximoPasso(
      estado({
        focus: [{ area: "tecnico", weight: 1 }],
        mode: "live_coding",
        formatoIndisponivelPedido: false,
        sinais: { pediu_system_design: 1 },
      }),
    );
    assert.notEqual(passo.tipo, "informar_formato_indisponivel");
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
