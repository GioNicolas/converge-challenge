/**
 * Um turno da conversa, o mesmo caminho para a rota HTTP e para o simulador:
 *
 *   1. registra a fala da recrutadora;
 *   2. mede a cobertura e os sinais no momento (Jev, ~0,3 s) e aplica no rascunho;
 *   3. se a Totti acabou de oferecer a troca de formato, aplica a escolha dela;
 *   4. o planejador escolhe o próximo passo;
 *   5. a Totti escreve a fala desse passo e ela é registrada.
 *
 * A extração lenta (GLM) não entra aqui: quem chama agenda `agendarExtracao` (ou `extrairAgora`).
 */
import { ROTULO_NAO_AVALIADO } from "./catalogo";
import { aplicarCobertura, AREAS, areasEmJogo, avaliarCobertura, LIMIAR, ultimaFalaDoAgente } from "./cobertura";
import { aberturaDoAgente, responder, tradeoffDaAbertura } from "./conversa";
import { ErroChat } from "./llm";
import { registrarEvento } from "./log";
import {
  aplicarPasso,
  decidirTradeoff,
  descreverPasso,
  ofertaEmCurso,
  proximoPasso,
  type EstadoPlanejamento,
  type Passo,
  type PlanoEstado,
} from "./planejador";
import { lerDuracao, perguntouSobreTempo } from "./duracao";
import { lerLinguagens } from "./linguagens";
import { atualizarPreferencias } from "./preferencias";
import { aplicarDecisoesTradeoff, duracaoDoRascunho } from "./rascunho";
import { desfazerUltimaFala, registrarFala, type Sessao } from "./sessoes";

/** Estado que o planejador enxerga: o plano da sessão mais o foco, a cobertura e o formato do rascunho. */
function estadoDoPlanejamento(sessao: Sessao): EstadoPlanejamento {
  return { ...sessao.plano, focus: sessao.rascunho.focus, cobertura: sessao.rascunho.cobertura, mode: sessao.rascunho.mode };
}

/**
 * Mede a cobertura e os sinais da transcrição atual e aplica no rascunho. Se o Jev falhar, registra
 * o erro e segue com o estado anterior: o planejador ainda tem o que decidir, e a conversa não trava.
 */
async function atualizarCobertura(sessao: Sessao): Promise<void> {
  try {
    const cob = await avaliarCobertura(sessao.rascunho, sessao.transcricao.slice(), {
      ultimaFalaAgente: ultimaFalaDoAgente(sessao.transcricao),
    });
    sessao.plano = { ...sessao.plano, sinais: cob.sinais };
    // Guarda o máximo de cada dispensa: é o que autoriza a extração a tirar a área do foco depois.
    for (const area of AREAS) {
      sessao.dispensaMaxima[area] = Math.max(sessao.dispensaMaxima[area] ?? 0, cob.sinais[`dispensa_${area}`] ?? 0);
    }
    sessao.preferencias = atualizarPreferencias(sessao.preferencias, cob.sinais);
    const emJogo = areasEmJogo(sessao.rascunho.focus, cob.sinais, sessao.plano.decisoesTradeoff);
    sessao.rascunho = aplicarCobertura(sessao.rascunho, cob.cobertura, emJogo);
    registrarEvento(sessao, {
      tipo: "cobertura",
      resumo: `sincrona (antes da fala) | em jogo: ${emJogo.join(", ") || "nenhuma"} | faltando: ${sessao.rascunho.pendencias.join(", ") || "nada"}`,
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
        emJogo,
        faltando: cob.faltando.map((t) => t.id),
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
 * Aplica a escolha da recrutadora sobre a última oferta de troca de formato. Só age quando a fala dela é uma escolha
 * (não uma dúvida) e a área ainda não tem decisão. Ambígua vira "próxima etapa" (ver `decidirTradeoff`).
 */
function resolverTradeoff(sessao: Sessao): void {
  const oferta = ofertaEmCurso(sessao.plano);
  if (!oferta || sessao.plano.decisoesTradeoff[oferta.area]) return;
  // Dúvida dela não é escolha: a Totti responde e a oferta segue em aberto.
  if ((sessao.plano.sinais.fez_pergunta ?? 0) >= LIMIAR) return;

  const decisao = decidirTradeoff(sessao.plano.sinais);
  const decisoes = { ...sessao.plano.decisoesTradeoff, [oferta.area]: decisao };
  const plano: PlanoEstado = { ...sessao.plano, decisoesTradeoff: decisoes };
  if (decisao === "trocou") {
    plano.modoEscolhido = oferta.modoAlternativo;
    plano.trocaPendente = oferta.modoAlternativo;
  }
  sessao.plano = plano;

  const novo = aplicarDecisoesTradeoff(sessao.rascunho, decisoes, plano.modoEscolhido);
  sessao.rascunho = aplicarCobertura(novo, novo.cobertura, areasEmJogo(novo.focus, plano.sinais, decisoes));
  registrarEvento(sessao, {
    tipo: "plano",
    resumo: `troca de formato sobre ${oferta.area}: ${decisao}${decisao === "trocou" ? ` para ${oferta.modoAlternativo}` : ""}`,
    dados: {
      oferta,
      decisao,
      decisoesTradeoff: decisoes,
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
 * O que fica de fora desta entrevista: áreas que a recrutadora deixou para a próxima etapa, e as competências
 * que o formato final não verifica (só as duas primeiras da lista, que são as importantes). Derivado do estado,
 * então é recalculado a cada turno e não fica desatualizado se o formato mudar.
 */
export function atualizarNaoAvaliado(sessao: Sessao): void {
  const decisoes = sessao.plano.decisoesTradeoff;
  const porDecisao = AREAS.filter((a) => decisoes[a] === "proxima_etapa").map((a) => ROTULO_NAO_AVALIADO[a]);
  const porCompetencia = sessao.competencias
    .slice(0, 2)
    .filter((c) => !c.verificavel[sessao.rascunho.mode])
    .map((c) => c.nome);
  sessao.naoAvaliado = [...new Set([...porDecisao, ...porCompetencia])];
}

/** Primeira fala da Totti, sem LLM. Conta como a pergunta de confirmação do início. */
export function abrirConversa(sessao: Sessao): void {
  const oferta = tradeoffDaAbertura(sessao);
  registrarFala(sessao, { role: "agente", text: aberturaDoAgente(sessao) }, { dados: { origem: "abertura_sem_llm", oferta } });
  sessao.plano = aplicarPasso(sessao.plano, { tipo: "confirmar_inicio" });
  // Se a abertura já foi a oferta de troca, a resposta a ela é a escolha (ver `resolverTradeoff`).
  if (oferta) sessao.plano = { ...aplicarPasso(sessao.plano, oferta), tradeoffNaAbertura: true };
  atualizarNaoAvaliado(sessao);
}

/**
 * Processa uma fala da recrutadora e devolve o passo escolhido e a fala da Totti.
 * Se a Totti falhar, a fala da recrutadora sai da transcrição e o erro sobe (a rota responde 502).
 */
export async function conduzirTurno(sessao: Sessao, texto: string): Promise<{ passo: Passo; fala: string }> {
  registrarFala(sessao, { role: "recrutadora", text: texto });
  // Duração lida direto da fala, antes do planejador: o resumo não depende do extrator (lento) para saber o tempo.
  const duracao = lerDuracao(texto, { perguntouTempo: perguntouSobreTempo(ultimaFalaDoAgente(sessao.transcricao)) });
  if (duracao !== undefined) sessao.preferencias = { ...sessao.preferencias, duracaoMin: duracao };
  // Linguagem também: "só Python" vira restrição na config (no padrão o candidato escolhe entre todas).
  const linguagens = lerLinguagens(texto);
  if (linguagens) sessao.preferencias = { ...sessao.preferencias, linguagens };
  await atualizarCobertura(sessao);
  resolverTradeoff(sessao);
  atualizarNaoAvaliado(sessao);

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

  let resposta: Awaited<ReturnType<typeof responder>>;
  try {
    resposta = await responder(sessao, passo);
  } catch (err) {
    desfazerUltimaFala(sessao);
    const mensagem = err instanceof Error ? err.message : String(err);
    registrarEvento(sessao, {
      tipo: "erro",
      nivel: "erro",
      resumo: `resposta da Totti falhou; fala desfeita: ${mensagem}`,
      dados: {
        etapa: "conversa",
        textoNaoRespondido: texto,
        passo,
        mensagem,
        ...(err instanceof ErroChat ? { tentativas: err.tentativas } : {}),
      },
    });
    throw err;
  }

  registrarFala(
    sessao,
    { role: "agente", text: resposta.texto },
    {
      ms: resposta.ms,
      provedor: resposta.provedor,
      model: resposta.model,
      fallback: resposta.fallback,
      dados: {
        passo,
        mensagens: resposta.mensagens,
        respostaCrua: resposta.respostaCrua,
        tentativas: resposta.tentativas,
      },
    },
  );
  sessao.plano = aplicarPasso(sessao.plano, passo);
  // Guarda como ficou o resumo, para a próxima revisão confirmar só o que mudou.
  if (passo.tipo === "resumo_final") {
    sessao.resumo = { preferencias: { ...sessao.preferencias }, duracaoMin: duracaoDoRascunho(sessao.rascunho, sessao.preferencias) };
  }
  return { passo, fala: resposta.texto };
}
