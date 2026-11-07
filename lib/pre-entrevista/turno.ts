/**
 * Um turno da conversa, o mesmo caminho para a rota HTTP e para o simulador:
 *
 *   1. registra a fala da recrutadora;
 *   2. mede a cobertura e os sinais no momento (Jev, ~0,3 s) e aplica no rascunho;
 *   3. o planejador escolhe o próximo passo;
 *   4. a Totti escreve a fala desse passo e ela é registrada.
 *
 * A extração lenta (GLM) não entra aqui: quem chama agenda `agendarExtracao` (ou `extrairAgora`).
 */
import { aplicarCobertura, areasEmJogo, avaliarCobertura, ultimaFalaDoAgente } from "./cobertura";
import { aberturaDoAgente, responder } from "./conversa";
import { ErroChat } from "./llm";
import { registrarEvento } from "./log";
import { aplicarPasso, descreverPasso, proximoPasso, type EstadoPlanejamento, type Passo } from "./planejador";
import { lerDuracao, perguntouSobreTempo } from "./duracao";
import { atualizarPreferencias } from "./preferencias";
import { duracaoDoRascunho } from "./rascunho";
import { desfazerUltimaFala, registrarFala, type Sessao } from "./sessoes";

/** Estado que o planejador enxerga: o plano da sessão mais o foco e a cobertura do rascunho. */
function estadoDoPlanejamento(sessao: Sessao): EstadoPlanejamento {
  return { ...sessao.plano, focus: sessao.rascunho.focus, cobertura: sessao.rascunho.cobertura };
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
    sessao.preferencias = atualizarPreferencias(sessao.preferencias, cob.sinais);
    const emJogo = areasEmJogo(sessao.rascunho.focus, cob.sinais);
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

/** Primeira fala da Totti, sem LLM. Conta como a pergunta de confirmação do início. */
export function abrirConversa(sessao: Sessao): void {
  registrarFala(sessao, { role: "agente", text: aberturaDoAgente(sessao) }, { dados: { origem: "abertura_sem_llm" } });
  sessao.plano = aplicarPasso(sessao.plano, { tipo: "confirmar_inicio" });
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
  await atualizarCobertura(sessao);

  const estado = estadoDoPlanejamento(sessao);
  const passo = proximoPasso(estado);
  const emJogo = areasEmJogo(estado.focus, estado.sinais);
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
