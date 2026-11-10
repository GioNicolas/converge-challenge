/**
 * Um turno da conversa, o mesmo caminho para a rota HTTP e para o simulador:
 *
 *   1. registra a fala da recrutadora;
 *   2. mede a cobertura e os sinais no momento (Jev, ~0,3 s) e aplica no rascunho;
 *   3. se o Totti acabou de oferecer a troca de formato, aplica a escolha dela; se ela pediu system design, troca;
 *   4. o planejador escolhe o próximo passo;
 *   5. o Totti escreve a fala e declara o `movimento` dela (ver `conversa.ts`), e ela é registrada;
 *   6. o turno obedece ao movimento: com `seguir`, o passo conta como feito; com `repetir`, `esclarecer` ou `responder`,
 *      o passo em curso continua em curso; e com `repetir` ou `esclarecer`, o que foi lido da fala dela em 2 e 3 é desfeito
 *      (a fala não era uma resposta).
 *
 * A extração lenta (GLM) não entra aqui: quem chama agenda `agendarExtracao` (ou `extrairAgora`).
 */
import { ROTULO_NAO_AVALIADO, semMedicaoNoFormato } from "./catalogo";
import { AREAS, areasEmJogo, avaliarCobertura, avaliarEnfaseDaFala, LIMIAR, ultimaFalaDoAgente } from "./cobertura";
import { acumularEnfase, declararCentral, type EstadoEnfase } from "./enfase";
import { aberturaDoAgente, responder, tradeoffDaAbertura, type Movimento } from "./conversa";
import { chat, ErroChat } from "./llm";
import { registrarEvento } from "./log";
import {
  aplicarPasso,
  decisaoDaOferta,
  decisoesAposTroca,
  descreverPasso,
  nivelEmAberto,
  ofertaEmCurso,
  proximoPasso,
  trocaPedida,
  type EstadoPlanejamento,
  type Passo,
} from "./planejador";
import { lerDuracao, perguntouSobreTempo } from "./duracao";
import { lerFormato } from "./formato";
import { lerLinguagens } from "./linguagens";
import { atualizarPreferencias } from "./preferencias";
import type { FocusArea, InterviewMode } from "@/lib/contracts";
import { aplicarDecisoesTradeoff, duracaoDoRascunho, type DecisoesTradeoff, type Turno } from "./rascunho";
import { fraseComPalavra, limitarPalavras, RE_DICAS, RE_ELIMINATORIO, RE_TOM } from "./frases";
import { aplicarPesosNaSessao, desfazerUltimaFala, registrarFala, type Sessao } from "./sessoes";

/**
 * Estado que o planejador enxerga: o plano da sessão mais o foco, a cobertura e o formato do rascunho.
 * Enquanto o nível está em aberto, o início não conta como coberto: a Totti só fecha o início depois do nível.
 */
function estadoDoPlanejamento(sessao: Sessao): EstadoPlanejamento {
  const aberto = nivelEmAberto(sessao.plano, sessao.classificacao.confirmar, sessao.rascunho.confirmado.seniority);
  const cobertura = aberto ? { ...sessao.rascunho.cobertura, confirmou_inicio: 0 } : sessao.rascunho.cobertura;
  // Área que ela já tratou na fala (respondeu ou declarou central): o básico dela já foi dito, não se pergunta de novo.
  const enfase = sessao.enfaseEstado;
  const areasFaladas = AREAS.filter((a) => (enfase[a].falou && enfase[a].maximo >= 2) || enfase[a].declarado === "central");
  return {
    ...sessao.plano,
    focus: sessao.rascunho.focus,
    cobertura,
    mode: sessao.rascunho.mode,
    nivelEmAberto: aberto,
    areasFaladas,
  };
}

/**
 * `dispensa_<área>` lê a conversa inteira e às vezes toma "menos algoritmo complicado, mais problema do dia a dia" por
 * dispensar a área técnica. A ênfase, lida fala a fala, é mais precisa: se ela respondeu sobre a área ou a declarou central,
 * e nunca a dispensou, o sinal de dispensa não vale. Sem isso, o Totti perguntava se podia tirar a área e ela ficava fora
 * do plano até o fim. Função pura.
 */
export function semDispensaContrariada(sinais: Record<string, number>, enfase: EstadoEnfase): Record<string, number> {
  const contrariadas = AREAS.filter((a) => enfase[a].declarado === "central" || (enfase[a].declarado !== "dispensou" && enfase[a].maximo >= 2));
  if (!contrariadas.some((a) => (sinais[`dispensa_${a}`] ?? 0) > 0)) return sinais;
  return { ...sinais, ...Object.fromEntries(contrariadas.map((a) => [`dispensa_${a}`, 0])) };
}

/** Última fala dela na transcrição, se houver. */
function ultimaFalaDaRecrutadora(transcricao: Turno[]): string | undefined {
  return transcricao.filter((t) => t.role === "recrutadora").at(-1)?.text;
}

/**
 * Mede a cobertura, a ênfase e os sinais da transcrição atual e aplica no rascunho. Se o Jev falhar, registra
 * o erro e segue com o estado anterior: o planejador ainda tem o que decidir, e a conversa não trava.
 * O foco e as notas são refeitos depois, em `conduzirTurno` (ver `aplicarPesosNaSessao`).
 */
async function atualizarCobertura(sessao: Sessao, deps: DepsDoTurno): Promise<void> {
  try {
    const cob = await (deps.avaliarCobertura ?? avaliarCobertura)(sessao.rascunho, sessao.transcricao.slice(), {
      ultimaFalaAgente: ultimaFalaDoAgente(sessao.transcricao),
    });
    // A ênfase é por fala: classifica só a última fala dela, e o acumulado é feito no código (ver `enfase.ts`).
    const ultimaDela = ultimaFalaDaRecrutadora(sessao.transcricao);
    const porFala = await (deps.avaliarEnfaseDaFala ?? avaliarEnfaseDaFala)(sessao.transcricao);
    if (ultimaDela) sessao.enfaseEstado = acumularEnfase(sessao.enfaseEstado, porFala.niveis, ultimaDela);
    sessao.plano = { ...sessao.plano, sinais: semDispensaContrariada(cob.sinais, sessao.enfaseEstado) };

    // Falas dela que mostram tom, dicas e eliminatório: entram no guia como trecho, sem passar pelo extrator.
    if (ultimaDela) {
      const pediuTom = (cob.sinais.quer_tom_desafiador ?? 0) >= LIMIAR || (cob.sinais.quer_tom_amigavel ?? 0) >= LIMIAR;
      const pediuDicas = (cob.sinais.quer_sem_dicas ?? 0) >= LIMIAR || (cob.sinais.quer_dicas ?? 0) >= LIMIAR;
      // Só a frase que contém a palavra-chave: tom, dicas e eliminatório não citam a fala inteira.
      const fraseTom = pediuTom ? fraseComPalavra(ultimaDela, RE_TOM) : undefined;
      const fraseDicas = pediuDicas ? fraseComPalavra(ultimaDela, RE_DICAS) : undefined;
      if (fraseTom) sessao.origemPreferencias = { ...sessao.origemPreferencias, tom: fraseTom };
      if (fraseDicas) sessao.origemPreferencias = { ...sessao.origemPreferencias, dicas: fraseDicas };
      if ((cob.sinais.disse_eliminatorio ?? 0) >= LIMIAR) {
        const frase = fraseComPalavra(ultimaDela, RE_ELIMINATORIO) ?? limitarPalavras(ultimaDela);
        sessao.eliminatorioFalas = [...new Set([...sessao.eliminatorioFalas, frase])];
      }
    }
    sessao.preferencias = atualizarPreferencias(sessao.preferencias, cob.sinais);
    sessao.rascunho = { ...sessao.rascunho, cobertura: cob.cobertura };
    // O nível que ela disse nesta fala vale sobre a sugestão do classificador, e confirma a senioridade.
    if (cob.nivelDito !== "nao_disse") {
      sessao.rascunho = {
        ...sessao.rascunho,
        seniority: cob.nivelDito,
        confirmado: { ...sessao.rascunho.confirmado, seniority: true },
      };
    }
    // Enquanto o nível está em aberto, o início não fica coberto (nem na tela, nem para o planejador).
    if (nivelEmAberto(sessao.plano, sessao.classificacao.confirmar, sessao.rascunho.confirmado.seniority)) {
      sessao.rascunho = { ...sessao.rascunho, cobertura: { ...sessao.rascunho.cobertura, confirmou_inicio: 0 } };
    }

    registrarEvento(sessao, {
      tipo: "cobertura",
      resumo: `sincrona (antes da fala) | ênfase da fala: ${Object.entries(porFala.niveis)
        .map(([a, n]) => `${a}=${n}`)
        .join(" ")}`,
      ms: cob.ms,
      provedor: "typesafe",
      model: cob.model,
      dados: {
        origem: "sincrona",
        request: cob.request,
        answers: cob.answers,
        usage: cob.usage,
        cobertura: cob.cobertura,
        sinais: cob.sinais,
        niveisDaFala: porFala.niveis,
        enfaseEstado: sessao.enfaseEstado,
        nivelDito: cob.nivelDito,
      },
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    registrarEvento(sessao, {
      tipo: "erro",
      nivel: "erro",
      resumo: `cobertura sincrona falhou; segue com o estado anterior: ${mensagem}`,
      dados: { etapa: "cobertura_sincrona", mensagem, stack: err instanceof Error ? err.stack : undefined },
    });
  }
}

/**
 * Troca o formato do plano para `modo`, pela oferta ou por pedido dela. O formato escolhido prevalece sobre o extrator,
 * e a próxima pergunta de aprofundamento (ou o resumo) confirma a troca (ver `trocaPendente`). Área que tinha trocado
 * de formato e que `modo` não mede volta para a próxima etapa (ver `decisoesAposTroca`). Com `areaCentral` (troca por
 * causa de uma área), essa área fica central, com a fala que motivou a troca. O foco e as notas são refeitos depois,
 * em `conduzirTurno`.
 */
function aplicarTroca(sessao: Sessao, modo: InterviewMode, decisoes: DecisoesTradeoff, areaCentral?: FocusArea): void {
  const ajustadas = decisoesAposTroca(decisoes, modo);
  sessao.plano = { ...sessao.plano, decisoesTradeoff: ajustadas, modoEscolhido: modo, trocaPendente: modo };
  if (areaCentral) {
    sessao.enfaseEstado = declararCentral(sessao.enfaseEstado, areaCentral, ultimaFalaDaRecrutadora(sessao.transcricao) ?? "");
  }
  sessao.rascunho = aplicarDecisoesTradeoff(sessao.rascunho, ajustadas, modo);
}

/** Ela pediu um formato diferente do plano (ver `trocaPedida`): troca, como uma troca escolhida na oferta. */
function resolverPedidoDeFormato(sessao: Sessao): void {
  const modo = trocaPedida(sessao.plano.sinais, sessao.rascunho.mode);
  if (!modo) return;
  aplicarTroca(sessao, modo, sessao.plano.decisoesTradeoff);
  registrarEvento(sessao, {
    tipo: "plano",
    resumo: `pedido de formato: troca para ${modo}`,
    dados: {
      modoEscolhido: modo,
      decisoesTradeoff: sessao.plano.decisoesTradeoff,
      sinais: { pediu_system_design: sessao.plano.sinais.pediu_system_design, pediu_live_coding: sessao.plano.sinais.pediu_live_coding },
    },
  });
}

/**
 * Aplica a escolha da recrutadora sobre a última oferta de troca de formato. Só age quando a fala dela é uma escolha
 * (não uma dúvida) e a área ainda não tem decisão. Pedir o formato oferecido é aceitar; ambígua vira "próxima etapa"
 * (ver `decisaoDaOferta`).
 */
function resolverTradeoff(sessao: Sessao): void {
  const oferta = ofertaEmCurso(sessao.plano);
  if (!oferta || sessao.plano.decisoesTradeoff[oferta.area]) return;
  // Dúvida dela não é escolha: o Totti responde e a oferta segue em aberto.
  if ((sessao.plano.sinais.fez_pergunta ?? 0) >= LIMIAR) return;

  const decisao = decisaoDaOferta(sessao.plano.sinais, oferta, sessao.rascunho.mode);
  const decisoes = { ...sessao.plano.decisoesTradeoff, [oferta.area]: decisao };
  if (decisao === "trocou") {
    aplicarTroca(sessao, oferta.modoAlternativo, decisoes, oferta.area);
  } else {
    sessao.plano = { ...sessao.plano, decisoesTradeoff: decisoes };
    sessao.rascunho = aplicarDecisoesTradeoff(sessao.rascunho, decisoes, sessao.plano.modoEscolhido);
  }
  const plano = sessao.plano;
  registrarEvento(sessao, {
    tipo: "plano",
    resumo: `troca de formato sobre ${oferta.area}: ${decisao}${decisao === "trocou" ? ` para ${oferta.modoAlternativo}` : ""}`,
    dados: {
      oferta,
      decisao,
      decisoesTradeoff: plano.decisoesTradeoff,
      modoEscolhido: plano.modoEscolhido,
      sinais: {
        escolheu_trocar_formato: plano.sinais.escolheu_trocar_formato,
        escolheu_proxima_etapa: plano.sinais.escolheu_proxima_etapa,
        escolheu_seguir_sem: plano.sinais.escolheu_seguir_sem,
      },
    },
  });
}

/**
 * O que fica de fora desta entrevista: áreas que a recrutadora deixou para a próxima etapa, áreas do foco que o formato
 * não mede e nenhum outro formato disponível mede, e as competências que o formato final não verifica (só as duas
 * primeiras da lista, que são as importantes). Derivado do estado, então é recalculado a cada turno.
 */
export function atualizarNaoAvaliado(sessao: Sessao): void {
  const decisoes = sessao.plano.decisoesTradeoff;
  const r = sessao.rascunho;
  const porDecisao = AREAS.filter((a) => decisoes[a] === "proxima_etapa").map((a) => ROTULO_NAO_AVALIADO[a]);
  const porFormato = r.focus
    .map((f) => f.area)
    .filter((a) => semMedicaoNoFormato(r.mode, a))
    .map((a) => ROTULO_NAO_AVALIADO[a]);
  const porCompetencia = sessao.competencias
    .slice(0, 2)
    .filter((c) => !c.verificavel[r.mode])
    .map((c) => c.nome);
  sessao.naoAvaliado = [...new Set([...porDecisao, ...porFormato, ...porCompetencia])];
}

/** Primeira fala do Totti, sem LLM. Conta como a pergunta de confirmação do início. */
export function abrirConversa(sessao: Sessao): void {
  const oferta = tradeoffDaAbertura(sessao);
  registrarFala(sessao, { role: "agente", text: aberturaDoAgente(sessao) }, { dados: { origem: "abertura_sem_llm", oferta } });
  sessao.plano = aplicarPasso(sessao.plano, { tipo: "confirmar_inicio" });
  // Se a abertura já foi a oferta de troca, a resposta a ela é a escolha (ver `resolverTradeoff`).
  if (oferta) sessao.plano = { ...aplicarPasso(sessao.plano, oferta), tradeoffNaAbertura: true };
  atualizarNaoAvaliado(sessao);
}

/** O LLM e o Jev do turno. Os testes passam falsos; sem eles, valem os de verdade. */
export interface DepsDoTurno {
  chat?: typeof chat;
  avaliarCobertura?: typeof avaliarCobertura;
  avaliarEnfaseDaFala?: typeof avaliarEnfaseDaFala;
}

/** O que a leitura de uma fala dela altera na sessão (passos 2 e 3 do turno). */
type EstadoLido = Pick<
  Sessao,
  "plano" | "rascunho" | "preferencias" | "enfaseEstado" | "origemPreferencias" | "eliminatorioFalas" | "naoAvaliado" | "pesosDetalhe"
>;

function copiarEstadoLido(sessao: Sessao): EstadoLido {
  return structuredClone({
    plano: sessao.plano,
    rascunho: sessao.rascunho,
    preferencias: sessao.preferencias,
    enfaseEstado: sessao.enfaseEstado,
    origemPreferencias: sessao.origemPreferencias,
    eliminatorioFalas: sessao.eliminatorioFalas,
    naoAvaliado: sessao.naoAvaliado,
    pesosDetalhe: sessao.pesosDetalhe,
  });
}

/** O passo em curso: o último executado (a dúvida respondida não conta, vale o passo que ela retomou). */
function passoEmCurso(plano: Sessao["plano"]): Passo | undefined {
  return plano.ultimoPasso?.tipo === "responder_duvida" ? plano.ultimoPasso.retomar : plano.ultimoPasso;
}

/**
 * Processa uma fala da recrutadora e devolve o passo escolhido, a fala do Totti e o movimento que ela foi.
 * Com movimento diferente de `seguir`, o passo devolvido não foi executado: o passo em curso continua sendo
 * `sessao.plano.ultimoPasso`.
 * Se o Totti falhar, a fala da recrutadora sai da transcrição e o erro sobe (a rota responde 502).
 */
export async function conduzirTurno(
  sessao: Sessao,
  texto: string,
  deps: DepsDoTurno = {},
): Promise<{ passo: Passo; fala: string; movimento: Movimento }> {
  // Guardado antes de ler a fala dela: se o Totti repetir ou esclarecer, a fala não era resposta e nada disto muda.
  const antesDaFala = copiarEstadoLido(sessao);
  registrarFala(sessao, { role: "recrutadora", text: texto });
  // Duração lida direto da fala, antes do planejador: o resumo não depende do extrator (lento) para saber o tempo.
  const duracao = lerDuracao(texto, { perguntouTempo: perguntouSobreTempo(ultimaFalaDoAgente(sessao.transcricao)) });
  if (duracao !== undefined) sessao.preferencias = { ...sessao.preferencias, duracaoMin: duracao };
  // Linguagem também: "só Python" vira restrição na config (no padrão o candidato escolhe entre todas).
  const linguagens = lerLinguagens(texto);
  if (linguagens) sessao.preferencias = { ...sessao.preferencias, linguagens };
  await atualizarCobertura(sessao, deps);
  // Formato pedido com as palavras da tela ("vamos de quadro", "no Excalidraw", "código ao vivo") vale como pedido,
  // mesmo quando o classificador não reconhece: sem isso o plano ficava no formato errado depois de ela confirmar.
  const formato = lerFormato(texto);
  if (formato) {
    sessao.plano = { ...sessao.plano, sinais: { ...sessao.plano.sinais,
      pediu_system_design: formato === "system_design" ? 1 : 0, pediu_live_coding: formato === "live_coding" ? 1 : 0 } };
  }
  resolverTradeoff(sessao);
  resolverPedidoDeFormato(sessao);
  atualizarNaoAvaliado(sessao);
  // O foco e as notas saem da ênfase, das falas e das decisões de agora, antes de o planejador escolher o passo.
  aplicarPesosNaSessao(sessao, "turno");

  const estado = estadoDoPlanejamento(sessao);
  const passo = proximoPasso(estado);
  const emJogo = areasEmJogo(estado.focus, estado.sinais, estado.decisoesTradeoff);
  registrarEvento(sessao, {
    tipo: "plano",
    resumo: `${descreverPasso(passo)} | em jogo: ${emJogo.join(", ") || "nenhuma"}`,
    dados: {
      passo,
      emJogo,
      cobertura: estado.cobertura,
      sinais: estado.sinais,
      perguntasPorTopico: estado.perguntasPorTopico,
      mudancasPerguntadas: estado.mudancasPerguntadas,
      resumos: estado.resumos,
      ultimoPassoAnterior: estado.ultimoPasso,
      decisoesTradeoff: estado.decisoesTradeoff,
      trocaPendente: estado.trocaPendente,
      naoAvaliado: sessao.naoAvaliado,
      preferencias: sessao.preferencias,
    },
  });

  // Depois do resumo, o encerramento e a confirmação de tom, dicas e duração saem fixos, sem modelo, e por isso sem
  // movimento. Só valem quando a fala dela é uma aprovação ou um pedido claro; senão ela vai ao modelo, com o resumo
  // como passo em curso, para ele responder ao que ela disse (repetir, tirar uma dúvida, esperar).
  const sinal = (id: string) => sessao.plano.sinais[id] ?? 0;
  // Troca de formato pedida depois do resumo também é pedido claro: o resumo de revisão mostra o formato novo.
  const decisaoClara = sinal("aprovou_resumo") >= LIMIAR || sinal("pediu_mudanca") >= LIMIAR || sessao.plano.trocaPendente !== undefined;
  const passoDeFalaFixa = passo.tipo === "encerrar" || (passo.tipo === "resumo_final" && passo.revisao === true);
  const semDecisao = passoEmCurso(antesDaFala.plano)?.tipo === "resumo_final" && passoDeFalaFixa && !decisaoClara;
  const passoDaFala: Passo = semDecisao ? { tipo: "resumo_final", revisao: true } : passo;

  let resposta: Awaited<ReturnType<typeof responder>>;
  try {
    resposta = await responder(sessao, passoDaFala, { chat: deps.chat, semDecisao });
  } catch (err) {
    desfazerUltimaFala(sessao);
    const mensagem = err instanceof Error ? err.message : String(err);
    registrarEvento(sessao, {
      tipo: "erro",
      nivel: "erro",
      resumo: `resposta do Totti falhou; fala desfeita: ${mensagem}`,
      dados: {
        etapa: "conversa",
        textoNaoRespondido: texto,
        passo: passoDaFala,
        mensagem,
        ...(err instanceof ErroChat ? { tentativas: err.tentativas } : {}),
      },
    });
    throw err;
  }

  const movimento = resposta.movimento;
  // Repetir e esclarecer: a fala dela não era uma resposta. Duração, formato, ênfase, sinais e escolha de troca lidos
  // dela são desfeitos, e o plano volta a ser o de antes.
  if (movimento === "repetir" || movimento === "esclarecer") Object.assign(sessao, antesDaFala);

  registrarFala(
    sessao,
    { role: "agente", text: resposta.texto },
    {
      ms: resposta.ms,
      provedor: resposta.provedor,
      model: resposta.model,
      fallback: resposta.fallback,
      dados: {
        passo: passoDaFala,
        movimento,
        travas: resposta.travas,
        mensagens: resposta.mensagens,
        respostaCrua: resposta.respostaCrua,
        tentativas: resposta.tentativas,
      },
    },
  );
  // Só uma fala que executa o passo o fecha. Repetição, esclarecimento e resposta deixam o passo em curso como estava:
  // a pergunta continua em aberto, nenhuma contagem anda, e o planejador escolhe de novo no turno seguinte.
  if (movimento !== "seguir") {
    const emCurso = sessao.plano.ultimoPasso;
    registrarEvento(sessao, {
      tipo: "plano",
      resumo:
        `passo mantido (movimento ${movimento}): ${emCurso ? descreverPasso(emCurso) : "nenhum"} continua em curso; ` +
        `${descreverPasso(passoDaFala)} não foi executado`,
      dados: {
        movimento,
        passoMantido: emCurso,
        passoNaoExecutado: passoDaFala,
        estadoRestaurado: movimento !== "responder",
        perguntasPorTopico: sessao.plano.perguntasPorTopico,
        resumos: sessao.plano.resumos,
      },
    });
    return { passo: passoDaFala, fala: resposta.texto, movimento };
  }
  sessao.plano = aplicarPasso(sessao.plano, passoDaFala);
  // Guarda como ficou o resumo, para a próxima revisão confirmar só o que mudou. O texto do resumo inteiro fica para
  // repetir se ela pedir; depois de uma revisão ele já não vale.
  if (passoDaFala.tipo === "resumo_final") {
    sessao.resumo = {
      preferencias: { ...sessao.preferencias },
      duracaoMin: duracaoDoRascunho(sessao.rascunho, sessao.preferencias),
      ...(passoDaFala.revisao ? {} : { texto: resposta.texto }),
    };
  }
  return { passo: passoDaFala, fala: resposta.texto, movimento };
}
