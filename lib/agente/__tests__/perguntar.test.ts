import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KIT_SYSTEM_DESIGN as kitDemo } from "../kits/system-design";
import { criarClienteFalso, ErroLlm } from "../llm/cliente";
import { perguntar } from "../perguntar";
import { estadoInicial } from "../sessao/estado";

const AGORA = 1_000_000;
const problema = kitDemo.problemas[0];
const estado = { ...estadoInicial(), fase: "REQUISITOS" as const, faseIniciadaEm: AGORA };
// A maior parte destes testes é das regras do v1; o v2 tem os seus no bloco "Totti 2 no quadro".
const deps = (llm: ReturnType<typeof criarClienteFalso>) => ({ llm, kit: kitDemo, problema, log: () => {}, versao: "v1" as const });

describe("perguntar", () => {
  it("segunda reação vazia seguida (\"Hm.\" depois de \"Hm.\") vira silêncio; a primeira passa", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Hm.", requisito: null, concluiu: false }]);
    const comHm = { ...estado, conversa: [{ quem: "agente" as const, texto: "Hm.", em: AGORA }] };
    const v2 = { ...deps(llm), versao: "v2" as const };
    const segunda = await perguntar(v2, comHm, { fase: "REQUISITOS", texto: "E a fila fica separada." }, AGORA);
    assert.equal(segunda.responder, false);
    const primeira = await perguntar(v2, estado, { fase: "REQUISITOS", texto: "E a fila fica separada." }, AGORA);
    assert.equal(primeira.responder, true);
    assert.equal(primeira.texto, "Hm.");
  });
  it("tira a abertura com eco da fala do candidato", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Entendi que você vai usar um contador. E onde ele fica?", requisito: null, concluiu: false }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Vou usar um contador em base 62." }, AGORA);
    assert.equal(r.texto, "E onde ele fica?");
  });
  it("registra no log quem respondeu o turno (modelo, provedor, tempo e custo)", async () => {
    const falso = criarClienteFalso([{ responder: true, texto: "Certo.", requisito: null, concluiu: false }]);
    const llm = {
      ...falso,
      async completarJson<T>(args: Parameters<typeof falso.completarJson<T>>[0]) {
        const r = await falso.completarJson(args);
        return { ...r, ms: 3200, modelo: "zai-org/GLM-5.3-Flash", provedor: "featherless", uso: { entrada: 9000, saida: 120, custo: 0.002 } };
      },
    };
    const eventos: [string, Record<string, unknown>][] = [];
    await perguntar({ llm, kit: kitDemo, problema, log: (e, m) => eventos.push([e, m]) }, estado, { fase: "REQUISITOS", texto: "Oi", sessao_id: "s1" }, AGORA);
    const turno = eventos.find(([e]) => e === "perguntar_llm")?.[1];
    assert.ok(turno, "faltou o evento perguntar_llm");
    assert.equal(turno.modelo, "zai-org/GLM-5.3-Flash");
    assert.equal(turno.provedor, "featherless");
    assert.equal(turno.ms, 3200);
    assert.equal(turno.custo_usd, 0.002);
  });
  it("devolve o uso do turno (tokens, custo e tamanho de cada bloco do prompt) para a rota gravar", async () => {
    const falso = criarClienteFalso([{ responder: true, texto: "Certo.", requisito: null, concluiu: false }]);
    const llm = {
      ...falso,
      async completarJson<T>(args: Parameters<typeof falso.completarJson<T>>[0]) {
        const r = await falso.completarJson(args);
        return { ...r, modelo: "google/gemini-3.5-flash-lite", provedor: "openrouter", uso: { entrada: 5000, saida: 80, cache: 3000, custo: 0.0011 } };
      },
    };
    const comConversa = { ...estado, fase: "ALTO_NIVEL" as const, conversa: [{ quem: "candidato" as const, texto: "Vou pôr um cache.", em: AGORA }] };
    const r = await perguntar({ llm, kit: kitDemo, problema, log: () => {}, versao: "v2" }, comConversa, {
      fase: "ALTO_NIVEL", texto: "E o banco atrás.", grafo: "- [r1] Cache", mudancas: "+ [r1] Cache", imagemBase64: "data:image/jpeg;base64,AAAA",
    }, AGORA);
    assert.ok(r.uso, "faltou o uso do turno");
    assert.equal(r.uso.tokens_entrada, 5000);
    assert.equal(r.uso.tokens_cache, 3000);
    assert.equal(r.uso.custo_usd, 0.0011);
    assert.equal(r.uso.foto, "data:image/jpeg;base64,AAAA".length);
    assert.equal(r.uso.falas_no_prompt, 1);
    assert.ok(r.uso.blocos.grafo > 0 && r.uso.blocos.mudancas > 0 && r.uso.blocos.conversa > 0 && r.uso.blocos.resto > 0);
    const dinamico = falso.chamadas[0].sistema.dinamico ?? "";
    assert.equal(r.uso.blocos.grafo + r.uso.blocos.mudancas + r.uso.blocos.conversa + r.uso.blocos.resto, dinamico.length);
  });
  it("sem resposta do modelo, não há uso a gravar", async () => {
    const llm = criarClienteFalso([new ErroLlm("http", "caiu")]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Oi" }, AGORA);
    assert.equal(r.falhou, true);
    assert.equal(r.uso, undefined);
  });
  it("resposta e feedback recebem o desenho e a pergunta ativa no loop rápido", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Você separou as leituras da escrita.", requisito: null, concluiu: false }]);
    const r = await perguntar(deps(llm), { ...estado, fase: "ALTO_NIVEL" }, {
      fase: "ALTO_NIVEL", texto: "Pode comentar meu desenho?", grafo: "- [e1] API de leitura", perguntaAtiva: "Como você separou os fluxos?",
    }, AGORA);
    assert.match(llm.chamadas[0].sistema.dinamico ?? "", /API de leitura/);
    assert.match(llm.chamadas[0].sistema.dinamico ?? "", /Como você separou os fluxos/);
    assert.equal(r.concluiu, false);
    assert.equal(r.requisito, null);
  });
  it("falas curtas vão ao modelo (sem lista de palavras) e a fala é registrada", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "hmm, deixa eu ver" }, AGORA);
    assert.equal(llm.chamadas.length, 1);
    assert.equal(r.responder, false);
    assert.equal(r.estado.conversa.at(-1)?.texto, "hmm, deixa eu ver");
  });

  it("LLM pode devolver responder false", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "então, vou pensar nisso" }, AGORA);
    assert.equal(r.responder, false);
  });

  it("responde pela ficha, devolve requisito e registra as duas falas", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Uns 4 mil acessos por segundo, com picos de 40 mil.", requisito: "Leitura: ~4 mil/s (picos de 40 mil)" }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Quantos acessos por segundo?" }, AGORA);
    assert.equal(r.responder, true);
    assert.equal(r.requisito, "Leitura: ~4 mil/s (picos de 40 mil)");
    assert.deepEqual(r.estado.conversa.map((f) => f.quem), ["candidato", "agente"]);
    // A ficha está no prompt estático (servidor), a fala do candidato vai como mensagem.
    const a = llm.chamadas[0];
    assert.ok(a.sistema.estatico.includes("4 mil por segundo"));
    assert.equal(a.mensagens[0].content, "Quantos acessos por segundo?");
    assert.equal(a.nomeSchema, "resposta_entrevistador");
  });

  it("limita a 3 frases (sem cortar decimais) e não repete requisito já no quadro", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Um. São 2.5 mil por segundo. Três. Quatro.", requisito: "Retenção: 5 anos" }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Por quanto tempo guardo?", requisitosAtuais: ["Retenção: 5 anos"] }, AGORA);
    // As 3 frases do modelo ficam inteiras; como nenhuma devolve a vez, entra um convite curto no fim.
    assert.equal(r.texto, "Um. São 2.5 mil por segundo. Três. Continua daí.");
    assert.equal(r.requisito, null);
  });

  it("erro do LLM: responder false, sem lançar", async () => {
    const llm = criarClienteFalso([new ErroLlm("timeout", "x")]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Quantos acessos?" }, AGORA);
    assert.equal(r.responder, false);
    assert.equal(r.estado.conversa.length, 1);
  });
});

describe("conclusão (interpretada pelo modelo)", () => {
  it("repassa concluiu quando o modelo interpreta que o candidato terminou", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Certo, vou olhar o que você montou.", requisito: null, concluiu: true }]);
    const r = await perguntar(deps(llm), { ...estado, fase: "ALTO_NIVEL" }, { fase: "ALTO_NIVEL", texto: "acho que já deu, podemos seguir?" }, AGORA);
    assert.equal(r.concluiu, true);
    assert.equal(r.responder, true);
  });

  it("concluiu vale mesmo sem texto de resposta (o sinal é do modelo, o código não inventa fala)", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: true }]);
    const r = await perguntar(deps(llm), { ...estado, fase: "ALTO_NIVEL" }, { fase: "ALTO_NIVEL", texto: "é isso" }, AGORA);
    assert.equal(r.concluiu, true);
    assert.equal(r.responder, false);
    assert.equal(r.texto, "");
  });

  it("o código não decide por palavras: 'pronto' sem interpretação do modelo não conclui", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: false }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "pronto, pode perguntar mais" }, AGORA);
    assert.equal(r.concluiu, false);
  });

  it("pergunta comum não marca concluiu", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Uns 4 mil por segundo.", requisito: null }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "qual a escala?" }, AGORA);
    assert.equal(r.concluiu, false);
});

describe("perguntar: prompt contra quebra de personagem (sem limpeza por código)", () => {
  it("o prompt estático não instrui a citar a ficha e proíbe pergunta", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Ok, 5 anos.", requisito: null }]);
    await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Por quanto tempo guardo?" }, AGORA);
    const p = llm.chamadas[0].sistema.estatico;
    // "ficha" só pode aparecer dentro da proibição entre aspas.
    const semProibicao = p.replace(/"ficha"/g, "");
    assert.ok(!/ficha/i.test(semProibicao), "o prompt ainda usa o termo 'ficha' fora da proibição");
    assert.match(p, /NUNCA cite "ficha"/);
    assert.match(p, /NUNCA faça pergunta/);
    assert.match(p, /SEMPRE preencha/);
  });

  it("o prompt orienta recusa curta e variada, convite sem '?', assumir só se faltar dado e resposta só do perguntado", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Ok, 5 anos.", requisito: null }]);
    await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Por quanto tempo guardo?" }, AGORA);
    const p = llm.chamadas[0].sistema.estatico;
    assert.match(p, /UMA frase curta e natural/);
    assert.match(p, /VARIE a redação/);
    assert.match(p, /convite sem interrogação/);
    assert.match(p, /SOMENTE quando a pergunta do candidato é sobre um dado que não existe/);
    assert.match(p, /Nunca use essa orientação em recusas/);
    assert.match(p, /Responda SOMENTE o que foi perguntado/);
    assert.ok(!/o time espera/i.test(p), "o prompt não deve sugerir 'o time espera'");
    // Sem texto fixo de recusa para copiar.
    assert.ok(!/Não posso compartilhar/i.test(p));
  });
  });
});

describe("desfecho da pergunta ativa", () => {
  const ativa = { ...estado, fase: "APROFUNDAMENTO" as const };
  it("não sei: repassa o desfecho e a fala não termina em pergunta", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Sem problema, seguimos. Quer olhar outra parte?", requisito: null, concluiu: false, desfecho: "nao_sabe" }]);
    const r = await perguntar(deps(llm), ativa, { fase: "APROFUNDAMENTO", texto: "Não sei, nunca vi isso.", perguntaAtiva: "Como evita colisão?" }, AGORA);
    assert.equal(r.desfecho, "nao_sabe");
    assert.doesNotMatch(r.texto, /\?/);
  });
  it("respondeu vago: o aprofundamento do fim continua valendo", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Saquei. Melhor em que sentido?", requisito: null, concluiu: false, desfecho: "respondeu", aprofundar: true }]);
    const r = await perguntar(deps(llm), ativa, { fase: "APROFUNDAMENTO", texto: "Uso um contador, fica melhor.", perguntaAtiva: "Como gera o código?" }, AGORA);
    assert.equal(r.desfecho, "respondeu");
    assert.equal(r.texto, "Saquei. Melhor em que sentido?");
  });
  it("respondeu justificado: outra pergunta no fim vira convite", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Saquei. E se o contador cair?", requisito: null, concluiu: false, desfecho: "respondeu", aprofundar: false }]);
    const r = await perguntar(deps(llm), ativa, { fase: "APROFUNDAMENTO", texto: "Uso um contador porque nunca repete.", perguntaAtiva: "Como gera o código?" }, AGORA);
    assert.match(r.texto, /^Saquei\. /);
    assert.doesNotMatch(r.texto, /\?/);
  });
  it("sem pergunta ativa não há desfecho", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Tranquilo, continua daí.", requisito: null, concluiu: false, desfecho: "pulou" }]);
    const r = await perguntar(deps(llm), ativa, { fase: "APROFUNDAMENTO", texto: "Vou pular essa parte." }, AGORA);
    assert.equal(r.desfecho, null);
  });
});

describe("foto e mudanças do quadro no /perguntar", () => {
  it("a foto vai ao modelo e o que mudou entra no contexto", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    await perguntar(deps(llm), { ...estado, fase: "ALTO_NIVEL" }, {
      fase: "ALTO_NIVEL", texto: "Olha o que eu fiz aqui", imagemBase64: "data:image/jpeg;base64,/9j/", mudancas: "+ adicionou [r2] Cache",
    }, AGORA);
    assert.equal(llm.chamadas[0].imagem, "data:image/jpeg;base64,/9j/");
    assert.match(llm.chamadas[0].sistema.dinamico ?? "", /acabou de mudar no desenho.*adicionou \[r2\] Cache/);
    assert.match(llm.chamadas[0].sistema.dinamico ?? "", /FOTO DO QUADRO/);
  });
});

describe("Totti 2 no quadro (versao v2)", () => {
  const ativa = { ...estado, fase: "APROFUNDAMENTO" as const };
  const depsV2 = (llm: ReturnType<typeof criarClienteFalso>) => ({ ...deps(llm), versao: "v2" as const });
  it("usa o prompt de objetivos, o schema próprio (papel conversa_quadro) e mostra o que ainda não deu sinal", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "São 100 milhões por mês.", requisito: null }]);
    const comCriterios = { ...estadoInicial({ criterios: kitDemo.criterios.map((c) => c.id) }), fase: "REQUISITOS" as const, faseIniciadaEm: AGORA };
    await perguntar(depsV2(llm), comCriterios, { fase: "REQUISITOS", texto: "Quantas URLs por mês?" }, AGORA);
    const c = llm.chamadas[0];
    assert.equal(c.nomeSchema, "resposta_entrevistador_v2");
    assert.match(c.sistema.estatico, /PARA QUE SERVE ESTA ENTREVISTA/);
    assert.match(c.sistema.dinamico ?? "", new RegExp(`Ainda sem nenhum sinal.*${kitDemo.criterios[0].nome}`));
  });
  it("não sei: tira a pergunta do fim e, se a fala não diz o próximo passo, põe um convite", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Tranquilo, seguimos. Quer olhar outra parte?", requisito: null, desfecho: "nao_sabe" }]);
    const r = await perguntar(depsV2(llm), ativa, { fase: "APROFUNDAMENTO", texto: "Não sei.", perguntaAtiva: "Como evita colisão?" }, AGORA);
    assert.match(r.texto, /^Tranquilo, seguimos\. (Pode|Continua|Fica|Segue)/);
    assert.doesNotMatch(r.texto, /\?/);
  });
  it("não sei com próximo passo concreto: fica como o modelo disse", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Tranquilo, deixa isso de lado. Pode seguir com a próxima parte do desenho.", requisito: null, desfecho: "nao_sabe" }]);
    const r = await perguntar(depsV2(llm), ativa, { fase: "APROFUNDAMENTO", texto: "Não sei.", perguntaAtiva: "Como evita colisão?" }, AGORA);
    assert.equal(r.texto, "Tranquilo, deixa isso de lado. Pode seguir com a próxima parte do desenho.");
  });
  it("réplica solta depois de responder à pergunta do Totti ganha a direção", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Tudo bem.", requisito: null, desfecho: "respondeu" }]);
    const r = await perguntar(depsV2(llm), ativa, { fase: "APROFUNDAMENTO", texto: "Uso um contador por servidor.", perguntaAtiva: "Como evita colisão?" }, AGORA);
    assert.match(r.texto, /^Tudo bem\. \S/);
  });
  it("sem versao explícita vale o v2; TOTTI_QUADRO=v1 volta ao v1", async () => {
    const { versao: _, ...semVersao } = deps(criarClienteFalso([]));
    const anterior = process.env.TOTTI_QUADRO;
    try {
      delete process.env.TOTTI_QUADRO;
      const a = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
      await perguntar({ ...semVersao, llm: a }, estado, { fase: "REQUISITOS", texto: "hmm" }, AGORA);
      assert.equal(a.chamadas[0].nomeSchema, "resposta_entrevistador_v2");
      process.env.TOTTI_QUADRO = "v1";
      const b = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
      await perguntar({ ...semVersao, llm: b }, estado, { fase: "REQUISITOS", texto: "hmm" }, AGORA);
      assert.equal(b.chamadas[0].nomeSchema, "resposta_entrevistador");
    } finally {
      if (anterior === undefined) delete process.env.TOTTI_QUADRO;
      else process.env.TOTTI_QUADRO = anterior;
    }
  });
});

describe("briefing da entrevista no /perguntar", () => {
  const comEvidencia = {
    ...estadoInicial({ criterios: kitDemo.criterios.map((c) => c.id) }),
    fase: "APROFUNDAMENTO" as const,
    faseIniciadaEm: AGORA,
    cobertura: { ...estadoInicial({ criterios: kitDemo.criterios.map((c) => c.id) }).cobertura, escalabilidade: { positivo: 1, negativo: 0, neutro: 0 } },
    observacoes: [{ criterio: "escalabilidade", sinal: "positivo" as const, espontaneo: true, evidencia: "cache de leitura para o pico", em: AGORA, fase: "APROFUNDAMENTO" as const }],
  };

  it("o briefing vai no bloco dinâmico, com as evidências e o que falta", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    await perguntar(deps(llm), comEvidencia, { fase: "APROFUNDAMENTO", texto: "então, o cache fica na frente" }, AGORA);
    const dinamico = llm.chamadas[0].sistema.dinamico ?? "";
    assert.match(dinamico, /BRIEFING DA ENTREVISTA/);
    assert.match(dinamico, /cache de leitura para o pico/);
    assert.match(dinamico, /O que ainda falta/);
  });

  it("o bloco estático não muda com a evidência (continua igual para o mesmo kit)", async () => {
    const a = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    const b = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    await perguntar(deps(a), comEvidencia, { fase: "APROFUNDAMENTO", texto: "ok" }, AGORA);
    await perguntar(deps(b), { ...comEvidencia, observacoes: [], cobertura: estadoInicial({ criterios: kitDemo.criterios.map((c) => c.id) }).cobertura }, { fase: "APROFUNDAMENTO", texto: "ok" }, AGORA);
    assert.equal(a.chamadas[0].sistema.estatico, b.chamadas[0].sistema.estatico);
  });

  it("o prompt estático manda usar o briefing sem cobrar o que já tem evidência", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "ok" }, AGORA);
    assert.match(llm.chamadas[0].sistema.estatico, /BRIEFING DA ENTREVISTA mostra o que você já tem/);
  });
});

describe("convite do fim no /perguntar", () => {
  it("não repete o convite que o Totti acabou de dizer", async () => {
    const respostaDoModelo = { responder: true, texto: "São 20 mil por dia.", requisito: null, concluiu: false };
    const primeira = await perguntar(deps(criarClienteFalso([respostaDoModelo])), estado, { fase: "REQUISITOS", texto: "Quantos usuários?" }, AGORA);
    const convite1 = primeira.texto.replace("São 20 mil por dia. ", "");
    // A segunda pergunta parte do estado em que o Totti já disse o primeiro convite.
    const segunda = await perguntar(deps(criarClienteFalso([respostaDoModelo])), primeira.estado, { fase: "REQUISITOS", texto: "E de escrita?" }, AGORA);
    const convite2 = segunda.texto.replace("São 20 mil por dia. ", "");
    assert.notEqual(convite2, convite1);
  });
});

describe("perguntar (v2): \"tô pensando\" é pedido de tempo, não resposta", () => {
  const v2 = (llm: ReturnType<typeof criarClienteFalso>) => ({ ...deps(llm), versao: "v2" as const });
  const emAltoNivel = { ...estado, fase: "ALTO_NIVEL" as const, faseIniciadaEm: AGORA - 60_000 };
  const pensando = { responder: false, texto: "", requisito: null, concluiu: false, desfecho: "pensando" };

  it("na primeira vez na entrevista, uma reação curta fixa, sem convite e sem pergunta", async () => {
    const llm = criarClienteFalso([{ ...pensando, responder: true, texto: "Certo, pode pensar. Pode seguir quando quiser." }]);
    const r = await perguntar(v2(llm), emAltoNivel, { fase: "ALTO_NIVEL", texto: "Calma, tô pensando." }, AGORA);
    assert.equal(r.responder, true);
    assert.equal(r.texto, "Claro, fica à vontade.");
    assert.equal(r.perguntou, undefined);
    assert.deepEqual(r.pediuTempo, { reagiu: true });
    assert.equal(r.estado.pediuTempoEm, AGORA);
    assert.equal(r.estado.reacaoAoPensarDita, true);
    assert.equal(r.estado.ultimaFalaDoAgenteEm, AGORA);
  });

  it("nas vezes seguintes, fica calado: sem convite, sem pergunta, mas o pedido fica registrado", async () => {
    const jaReagiu = { ...emAltoNivel, reacaoAoPensarDita: true };
    const llm = criarClienteFalso([{ ...pensando, responder: true, texto: "Pode continuar de onde parou." }]);
    const r = await perguntar(v2(llm), jaReagiu, { fase: "ALTO_NIVEL", texto: "Deixa eu pensar um pouco." }, AGORA);
    assert.equal(r.responder, false);
    assert.equal(r.texto, "");
    assert.deepEqual(r.pediuTempo, { reagiu: false });
    assert.equal(r.estado.pediuTempoEm, AGORA);
    assert.equal(r.estado.reacaoAoPensarDita, true);
  });

  it("com pergunta ativa, o pedido não vira desfecho da pergunta nem grava observação", async () => {
    const comPergunta = { ...emAltoNivel, perguntaAtiva: {
      numero: 1, status: "duvida" as const, pergunta: "Por que o cache fica na frente do banco?", nota: null, elementos: [],
      degrau: null, fase: "ALTO_NIVEL" as const, feitaEm: AGORA - 30_000,
    } };
    const llm = criarClienteFalso([{ ...pensando, desfecho: "pensando" }]);
    const r = await perguntar(v2(llm), comPergunta, { fase: "ALTO_NIVEL", texto: "Um minuto, deixa eu pensar.", perguntaAtiva: "Por que o cache fica na frente do banco?" }, AGORA);
    assert.equal(r.desfecho, null);
    assert.equal(r.estado.observacoes.length, 0);
    assert.equal(r.estado.perguntaAtiva?.desfecho, undefined);
  });

  it("o modelo pede tempo, mas a fala é só \"Tá.\": o pedido ainda é o que vale (não sai a reação do convite)", async () => {
    const llm = criarClienteFalso([{ ...pensando, responder: true, texto: "Tá. Pode seguir." }]);
    const r = await perguntar(v2(llm), { ...emAltoNivel, reacaoAoPensarDita: true }, { fase: "ALTO_NIVEL", texto: "Calma." }, AGORA);
    assert.equal(r.responder, false);
    assert.equal(r.pediuTempo?.reagiu, false);
  });

  it("depois de ele só reagir à última fala (que devolveu a vez), a reação sai sem convite de novo (ele não desenhou)", async () => {
    const depoisDoConvite = { ...emAltoNivel, ultimaFalaDoAgenteEm: AGORA - 10_000,
      conversa: [{ quem: "agente" as const, texto: "Como você separa a leitura da escrita?", em: AGORA - 10_000 }] };
    const llm = criarClienteFalso([{ responder: true, texto: "Certo.", requisito: null, concluiu: false, desfecho: null }]);
    const r = await perguntar(v2(llm), depoisDoConvite, { fase: "ALTO_NIVEL", texto: "Tá.", desenhoParadoHaS: 30 }, AGORA);
    assert.equal(r.texto, "Certo.");
  });

  it("se ele desenhou depois da fala que devolveu a vez, a reação volta a ter convite (a regra de sempre)", async () => {
    const depoisDoConvite = { ...emAltoNivel, ultimaFalaDoAgenteEm: AGORA - 10_000,
      conversa: [{ quem: "agente" as const, texto: "Como você separa a leitura da escrita?", em: AGORA - 10_000 }] };
    const llm = criarClienteFalso([{ responder: true, texto: "Certo.", requisito: null, concluiu: false, desfecho: null }]);
    const r = await perguntar(v2(llm), depoisDoConvite, { fase: "ALTO_NIVEL", texto: "Tá.", desenhoParadoHaS: 2 }, AGORA);
    assert.match(r.texto, /^Certo\. \S/);
  });
});

describe("por quê obrigatório no v2 (escolha curta a uma pergunta com alternativas)", () => {
  const ativa = { ...estado, fase: "APROFUNDAMENTO" as const };
  const depsV2 = (llm: ReturnType<typeof criarClienteFalso>) => ({ ...deps(llm), versao: "v2" as const });
  const perguntada = { fase: "APROFUNDAMENTO" as const, perguntaAtiva: "No back ou no front?" };
  it("(a) escolha curta e o modelo só reage: sai o porquê, sem convite, e a pergunta segue aberta", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Tá.", requisito: null, concluiu: false, desfecho: "respondeu" }]);
    const r = await perguntar(depsV2(llm), ativa, { ...perguntada, texto: "back" }, AGORA);
    assert.equal(r.texto, "Tá. Por quê?");
    assert.equal(r.perguntou, true);
    assert.equal(r.seguimento, true);
    assert.equal(r.desfecho, "respondeu");
  });
  it("(a) com o modelo calado, a pergunta de porquê sai sozinha", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: false }]);
    const r = await perguntar(depsV2(llm), ativa, { ...perguntada, texto: "back" }, AGORA);
    assert.equal(r.responder, true);
    assert.equal(r.texto, "Por quê?");
    assert.equal(r.seguimento, true);
  });
  it("(a) a pergunta de porquê que sai não repete a última que o Totti disse", async () => {
    const jaPerguntou = { ...ativa, conversa: [{ quem: "agente" as const, texto: "Tá. Por quê?", em: AGORA - 60_000 }] };
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: false }]);
    const r = await perguntar(depsV2(llm), jaPerguntou, { ...perguntada, texto: "SQL" }, AGORA);
    assert.equal(r.texto, "Por que essa opção?");
  });
  it("(b) o modelo pergunta o porquê de novo: a pergunta passa, mesmo que o ponto já tenha sido aprofundado", async () => {
    const jaAprofundado = { ...ativa, conversa: [
      { quem: "agente" as const, texto: "Por que no backend?", em: AGORA - 60_000 },
      { quem: "candidato" as const, texto: "Porque é mais simples.", em: AGORA - 50_000 },
    ] };
    const llm = criarClienteFalso([{ responder: true, texto: "Por que no backend?", requisito: null, concluiu: false, desfecho: "respondeu" }]);
    const r = await perguntar(depsV2(llm), jaAprofundado, { ...perguntada, texto: "back" }, AGORA);
    assert.equal(r.texto, "Por que no backend?");
    assert.equal(r.seguimento, true);
  });
  it("(c) resposta longa e justificada: nada é forçado", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Saquei. E o banco aguenta esse volume?", requisito: null, concluiu: false, desfecho: "respondeu" }]);
    const r = await perguntar(depsV2(llm), ativa, { ...perguntada, texto: "Fila, porque o pico é alto e eu não quero perder pedido." }, AGORA);
    assert.doesNotMatch(r.texto, /Por qu/);
    assert.equal(r.seguimento, undefined);
  });
  it("(a) o convite que o modelo pôs sai antes da pergunta de porquê: \"Tá, pode seguir.\" → \"Tá. Por quê?\"", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Tá, pode seguir.", requisito: null, concluiu: false, desfecho: "respondeu" }]);
    const r = await perguntar(depsV2(llm), ativa, { ...perguntada, texto: "back" }, AGORA);
    assert.equal(r.texto, "Tá. Por quê?");
  });
  it("(d) não sei: nada é forçado, o desfecho é 'não sabe' e a fala não termina em pergunta", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Tranquilo, deixa isso de lado.", requisito: null, concluiu: false, desfecho: "nao_sabe" }]);
    const r = await perguntar(depsV2(llm), ativa, { ...perguntada, texto: "não sei" }, AGORA);
    assert.equal(r.desfecho, "nao_sabe");
    assert.doesNotMatch(r.texto, /Por qu/);
    assert.doesNotMatch(r.texto, /\?/);
  });
  it("o prompt manda pedir o porquê da escolha curta mesmo depois de aprofundar", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: false }]);
    await perguntar(depsV2(llm), ativa, { ...perguntada, texto: "back" }, AGORA);
    assert.match(llm.chamadas[0].sistema.estatico, /pergunte o porquê da escolha DELE antes de seguir/);
  });
  it("registra a regra pede_porque no log do turno", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: false }]);
    const eventos: [string, Record<string, unknown>][] = [];
    await perguntar({ ...depsV2(llm), log: (e, m) => eventos.push([e, m]) }, ativa, { ...perguntada, texto: "back" }, AGORA);
    assert.ok(eventos.some(([e, m]) => e === "perguntar_turno" && (m.regras as string[]).includes("pede_porque")));
  });
});
