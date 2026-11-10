/**
 * Interviewer: fala com o candidato por voz, numa pergunta do Totti (blip) ou numa fala livre dele.
 * Um turno por chamada. Erro do LLM nunca vira erro de API: volta uma fala de reserva.
 */
import { InterviewerOutput } from "@/lib/agents/interviewerSchema";
import { buildInterviewerSystem, buildInterviewerUser, candidatoPerguntou, type InterviewerTurnInput } from "@/lib/agents/prompts/interviewer";
import { recordOutcome, uncoveredCriteria } from "@/lib/agents/coverage";
import { empecilhoAnunciado, empecilhoDaQuestao, mudancaParaPrompt, testesIde } from "@/lib/agents/empecilho";
import { CONVERSA_LIVRE, conversasFeitas, faseDaEntrevista, formatarConversas } from "@/lib/agents/fase";
import { findBlipQuestion, nextHint, perdeuAVez } from "@/lib/agents/policy";
import { checkReply } from "@/lib/agents/spoilerFilter";
import type { ChatMessage, ChatResponse, EditorCommand, LineRange } from "@/lib/contracts";
import { FALAS_DE_REPETICAO } from "@/lib/conversa/falasDeReserva";
import { completeJson } from "@/lib/llm";
import { appendEvent, latestCode, numberCode, sessionNow } from "@/lib/session/store";
import type { SessionState } from "@/lib/session/types";
import { getProblem } from "@/problems";

/** Falha do LLM: pede para repetir. Varia para não soar como gravação quando acontece mais de uma vez. */
const FALLBACK_REPLIES = FALAS_DE_REPETICAO;
/** Fala barrada duas vezes pelo filtro: uma pergunta aberta que não entrega nada (e sem repetir a mesma frase).
 * Não fecha o assunto: o candidato ainda tem a vez. Sem validar e sem pedir para ele bolar testes. */
/** Fala barrada quando ele tinha feito uma pergunta: uma resposta que não entrega nada, e não outra pergunta
 * (devolver "o que você quer que esse trecho faça?" a quem perguntou soava como ignorar a pergunta). */
const SAFE_ANSWER_REPLIES = [
  "Essa eu deixo com você: vale olhar com calma o que cada variável guarda nesse ponto.",
  "Essa parte eu prefiro que você descubra no código, é justamente o que eu quero ver.",
  "Aí eu não vou entregar, mas você tem tudo o que precisa no código e nos testes.",
];
const SAFE_CLOSE_REPLIES = [
  "Certo. O que você quer que esse trecho faça?",
  "Entendi. Qual é o seu próximo passo agora?",
  "Saquei. Por que você escolheu esse caminho?",
];

/** Orçamento de um turno: o candidato está esperando a voz. Passou disso, sai a fala de reserva. */
const PRAZO_TURNO_MS = 7_000;
/** Cada geração tem no máximo isto; o filtro de fala, bem menos. */
const PRAZO_GERACAO_MS = 4_500;
const PRAZO_FILTRO_MS = 1_800;
/** Só gera de novo (fala barrada) se ainda couber uma geração e um filtro no orçamento. */
const MIN_PARA_REGERAR_MS = 3_000;

/** A primeira das opções que o entrevistador ainda não disse nesta sessão (ou a menos recente, se já disse todas). */
export function falaNaoRepetida(opcoes: string[], jaDitas: string[]): string {
  const ditas = jaDitas.map((t) => t.trim());
  const nova = opcoes.find((o) => !ditas.includes(o));
  if (nova) return nova;
  return [...opcoes].sort((a, b) => ditas.lastIndexOf(a) - ditas.lastIndexOf(b))[0];
}

/** O que o agente já falou: nesta conversa e nas falas gravadas da sessão. */
function falasDoAgente(session: SessionState, messages: ChatMessage[]): string[] {
  const gravadas = session.events.flatMap((e) => (e.type === "speech" && e.role === "agent" ? [e.text] : []));
  return [...gravadas, ...messages.filter((m) => m.role === "agent").map((m) => m.text)];
}

export async function runInterviewerTurn(
  session: SessionState,
  req: { blipId?: string; messages: ChatMessage[]; reconheceu?: boolean },
): Promise<ChatResponse> {
  const resposta = await turno(session, req);
  return resposta.reply ? { ...resposta, reply: semReconhecimentoRepetido(resposta.reply, req.messages, req.reconheceu === true) } : resposta;
}

async function turno(
  session: SessionState,
  req: { blipId?: string; messages: ChatMessage[] },
): Promise<ChatResponse> {
  const found = req.blipId !== undefined ? findBlipQuestion(session, req.blipId) : undefined;
  if (req.blipId !== undefined && !found) throw new Error(`blip desconhecido: ${req.blipId}`);

  // Empecilho: a primeira fala é o anúncio, fixo (sem LLM, não tem como falhar), e é ali que ele entra na linha do tempo.
  if (found?.question.kind === "empecilho" && req.messages.length === 0) {
    return { reply: anunciarEmpecilho(session, found.question.id), commands: [{ type: "clear_highlights" }], end: false };
  }

  const code = latestCode(session);
  const lineCount = code.split("\n").length;
  const question = found?.question;
  const problem = getProblem(session.config.problemId);

  // A primeira fala de uma pergunta é a pergunta preparada, dita como está: a análise já a escreveu para este
  // momento e o filtro já a aprovou. Reescrever com outra chamada de LLM era um segundo cérebro (mais um a
  // dois segundos e às vezes um "oi, tudo bem?" no meio da entrevista). Só o encerramento, que junta vários
  // pontos pendentes numa fala, passa pelo modelo.
  if (found && req.messages.length === 0 && found.question.kind !== "encerramento") {
    // Entre a pergunta nascer e a pausa para falar, ele pode já ter contado o plano ou ouvido o mesmo: fica quieto.
    const motivo = perdeuAVez(session, found.question, found.blip.createdAt);
    if (motivo) {
      console.info(`[interviewer] ${found.question.id}: ${motivo}`);
      found.question.status = "stale";
      return { reply: "", commands: [{ type: "clear_highlights" }], end: true };
    }
    const grifo = found.question.highlight;
    const util = grifo && grifoComProposito(found.question.question, code, grifo, problem.public.starters[session.language] ?? "");
    return { reply: found.question.question, commands: highlightCommands(util ? grifo : undefined), end: false };
  }
  const checkInDoEmpecilho = question?.checkInId
    ? session.checkIns.find((c) => c.id === question.checkInId)?.empecilhoId !== undefined
    : false;
  // A dica leve é do problema original: na conversa da mudança e no retorno dela não se aplica.
  const semDica = question?.kind === "empecilho" || checkInDoEmpecilho;
  const hint = semDica ? undefined : nextHint(session);
  const anunciado = empecilhoAnunciado(session);
  // O que o filtro de fala deixa passar: a dica oficial e a regra nova, que o Totti pode repetir.
  const permitido =
    [hint, anunciado && `regra nova do problema, já anunciada ao candidato: ${anunciado.empecilho.statement}`]
      .filter(Boolean)
      .join(" | ") || undefined;
  const criterion = session.config.criteria.find((c) => c.id === question?.criterionId);
  const checkIn = question?.checkInId ? session.checkIns.find((c) => c.id === question.checkInId) : undefined;
  const input: InterviewerTurnInput = {
    mode: found ? "blip" : "candidate",
    fase: faseDaEntrevista(session),
    elapsedLabel: formatMmSs(elapsedMs(session)),
    remainingLabel: formatMmSs(Math.max(0, session.config.durationMin * 60_000 - elapsedMs(session))),
    language: session.language,
    numberedCode: numberCode(code),
    question: found?.question.question,
    followUpTopic: found?.question.followUpTopic,
    kickoff: found?.question.kickoff,
    kind: question?.kind,
    criterion: criterion ? `${criterion.id}: ${criterion.name} — ${criterion.description}` : undefined,
    probeGuide: criterion ? problem.private.probeGuides?.[criterion.id] : undefined,
    challengeSummary: checkIn?.challenge,
    mudanca: mudancaParaPrompt(session, formatMmSs),
    mudancaClarifications:
      question?.kind === "empecilho" || checkInDoEmpecilho
        ? anunciado?.empecilho.clarifications.map((c) => `"${c.question}" → ${c.answer}`)
        : undefined,
    closingTopics: question?.closingTopics,
    questionHighlight: found?.question.highlight,
    availableHint: hint,
    uncovered: uncoveredCriteria(session)
      .filter((id) => id !== question?.criterionId)
      .map((id) => {
        const c = session.config.criteria.find((item) => item.id === id)!;
        return `${c.id}: ${c.name} — ${c.description}`;
      }),
    hintsPolicy: session.config.hints,
    analystNotes: analystNotesOf(session),
    hypothesis: session.analyst.insights?.candidateThinking?.trim() || undefined,
    // As conversas anteriores (sem a atual, que vai em `messages`).
    previousConversations: formatarConversas(
      // Fora de balão, as falas recentes já vêm em `messages` (a conversa livre do fase.ts duplicaria).
      conversasFeitas(session).filter((c) => c.pergunta !== found?.question.question && (found || c.pergunta !== CONVERSA_LIVRE)),
    ),
    messages: req.messages,
  };

  // Solução funcionando e ele repete que já terminou: é para encerrar, não para mais perguntas.
  if (!found && input.fase === "funcionando" && querEncerrar(req.messages)) {
    return { reply: "", commands: [], end: true, finish: true };
  }
  const perguntou = candidatoPerguntou(req.messages);
  const system = buildInterviewerSystem(session.config, problem);
  const user = buildInterviewerUser(input);
  const candidateLines = req.messages.filter((m) => m.role === "candidate").slice(-3).map((m) => m.text);
  const opening = found !== undefined && req.messages.length === 0;
  let output: InterviewerOutput;
  const prazo = Date.now() + PRAZO_TURNO_MS;
  const sobra = () => prazo - Date.now();
  try {
    output = limitarPerguntas(await generate(session, system, user, Math.min(PRAZO_GERACAO_MS, sobra())), question, req.messages, opening);
    // Pediu para encerrar a entrevista: quem se despede e fecha é a IDE (como no botão Finalizar).
    if (!opening && output.finish === true) {
      registrarEvidencia(session, output);
      return { reply: "", commands: [], end: true, finish: true };
    }
    // Só ouvindo (pensando em voz alta, ainda explicando): nada é falado e a conversa segue aberta.
    // A primeira fala de um balão é a pergunta, então ali o agente sempre fala.
    if (!opening && perguntou && (output.respond === false || output.reply.trim() === "") && sobra() >= MIN_PARA_REGERAR_MS) {
      // Ele perguntou e o modelo ficou quieto: era o "você pode me explicar?" sem resposta.
      output = limitarPerguntas(
        await generate(session, system, `${user}\n\nATENÇÃO: ele te fez uma pergunta e você não respondeu. respond = true: responda a ela agora.`, Math.min(PRAZO_GERACAO_MS, sobra())),
        question, req.messages, opening,
      );
    }
    // Encerramento com todos os pontos já perguntados: a resposta dele ao último é o fim. Ficar ouvindo deixava o
    // candidato esperando ~30 s até perguntar "tem mais alguma pergunta?".
    if (!opening && question?.kind === "encerramento" && (output.respond === false || output.reply.trim() === "")
      && perguntasSeguidas(req.messages) >= limiteDePerguntas(question)) {
      registrarEvidencia(session, output);
      session.lastConversationEndedAt = elapsedMs(session);
      return { reply: falaNaoRepetida(FECHAR_O_ENCERRAMENTO, falasDoAgente(session, req.messages)), commands: [{ type: "clear_highlights" }], end: true };
    }
    if (!opening && (output.respond === false || output.reply.trim() === "")) {
      registrarEvidencia(session, output);
      return { reply: "", commands: [], end: false, listening: true };
    }
    if (opening && output.reply.trim() === "") output = { ...output, reply: found.question.question, highlight: found.question.highlight ?? null };
    // Filtro de fala: aponta bug, entrega solução ou confirma acerto? Gera de novo sabendo o motivo.
    // A pergunta preparada já passou pelo filtro de perguntas: só confere se o modelo acrescentou algo.
    // Fala curta que só reconhece e devolve a vez (sem pergunta) não tem o que entregar: vai sem o filtro, que
    // custava mais de um segundo em cada resposta.
    if (!(opening && isAboutTheSame(output.reply, found.question.question)) && !falaSoDeReconhecer(output.reply)) {
      const verdict = await checkReply(output.reply, candidateLines, permitido, code, Math.min(PRAZO_FILTRO_MS, sobra()));
      session.analyst.costUsd += verdict.costUsd;
      if (!verdict.safe && sobra() < MIN_PARA_REGERAR_MS) {
        // Sem tempo para outra geração: a reserva segura, sem arriscar a fala barrada.
        console.info(`[interviewer] fala barrada (${verdict.reason}) sem tempo para outra: ${output.reply}`);
        output = opening
          ? { ...output, reply: found.question.question, highlight: found.question.highlight ?? null, end: false, gaveHint: false, challenge: null }
          : { ...output, reply: falaSegura(perguntou, falasDoAgente(session, req.messages)), highlight: null, end: perguntou, gaveHint: false, challenge: null };
      } else if (!verdict.safe) {
        console.info(`[interviewer] fala barrada (${verdict.reason}): ${output.reply}`);
        const barrada = output;
        // A segunda geração pode estourar o prazo: aí vale a fala segura, nunca o "pode repetir" (o candidato
        // falou certo; quem falhou foi a geração).
        output = await generate(
          session,
          system,
          `${user}\n\nATENÇÃO: sua fala anterior ("${output.reply}") foi barrada: ${verdict.reason}. Escreva outra que não faça isso.`,
          Math.min(PRAZO_GERACAO_MS, sobra() - PRAZO_FILTRO_MS / 2),
        ).then((o) => limitarPerguntas(o, question, req.messages, opening)).catch((err) => {
          console.info("[interviewer] segunda geração falhou, indo de fala segura:", err instanceof Error ? err.message : err);
          return opening
            ? { ...barrada, reply: found.question.question, highlight: found.question.highlight ?? null, end: false, gaveHint: false, challenge: null }
            : { ...barrada, reply: falaSegura(perguntou, falasDoAgente(session, req.messages)), highlight: null, end: perguntou, gaveHint: false, challenge: null };
        });
        const second = await checkReply(output.reply, candidateLines, permitido, code, Math.max(500, Math.min(PRAZO_FILTRO_MS, sobra())));
        session.analyst.costUsd += second.costUsd;
        if (!second.safe) {
          console.info(`[interviewer] fala barrada de novo (${second.reason}): ${output.reply}`);
          // Na abertura, a pergunta preparada (já filtrada); depois, uma pergunta aberta segura, sem fechar.
          output = opening
            ? { ...output, reply: found.question.question, highlight: found.question.highlight ?? null, end: false, gaveHint: false, challenge: null }
            : { ...output, reply: falaSegura(perguntou, falasDoAgente(session, req.messages)), highlight: null, end: perguntou, gaveHint: false, challenge: null };
        }
      }
    }
  } catch (err) {
    console.error("[interviewer] falha no LLM:", err instanceof Error ? err.message : err);
    // Primeira fala de um blip: a pergunta preparada, com o grifo dela. Senão, pede pra repetir.
    if (found && req.messages.length === 0) {
      const grifo = found.question.highlight;
      const util = grifo && grifoComProposito(found.question.question, code, grifo, problem.public.starters[session.language] ?? "");
      return {
        reply: found.question.question,
        commands: highlightCommands(util ? grifo : undefined),
        end: false,
      };
    }
    return { reply: falaNaoRepetida(FALLBACK_REPLIES, falasDoAgente(session, req.messages)), commands: [], end: false };
  }

  // A primeira fala de um blip é a pergunta: encerrar ali não deixaria o candidato responder.
  if (found && req.messages.length === 0) output.end = false;
  // Fala sem pergunta não deixa o assunto aberto: senão os dois ficam esperando, sem saber de quem é a vez.
  else if (!output.end && !output.reply.trim().endsWith("?")) output = { ...output, end: true };
  // Antes de ele escrever código, uma pergunta sobre o plano basta: depois disso ele é liberado para codar.
  // Sem isso a conversa virava um interrogatório (por que, custo, bordas...) antes da primeira linha.
  if (!found && input.fase === "entendendo" && (jaPerguntouDoPlano(req.messages) || jaPerguntouNaSessao(session)) && output.reply.trim().endsWith("?")) {
    output = { ...output, reply: liberarParaCodar(output.reply), end: true, highlight: null };
  }
  // Grifo só com propósito: a fala tem que citar algo que está nas linhas grifadas.
  if (output.highlight && !grifoComProposito(output.reply, code, output.highlight, problem.public.starters[session.language] ?? "")) {
    output = { ...output, highlight: null };
  }
  const t = elapsedMs(session);

  const highlight = output.highlight ? clampLines(output.highlight, lineCount) : undefined;
  const commands: EditorCommand[] = highlightCommands(highlight);
  if (output.end) commands.push({ type: "clear_highlights" });

  // Só conta como dica se a fala traz a dica de fato (o modelo às vezes marca gaveHint ao fechar).
  if (output.gaveHint && hint !== undefined && containsHint(output.reply, hint)) {
    appendEvent(session, {
      type: "hint",
      sessionId: session.sessionId,
      t: elapsedMs(session),
      level: session.hintsUsed + 1,
      text: hint,
    });
  }
  registrarEvidencia(session, output);
  const outcome = output.probeOutcome;
  if (outcome) {
    recordOutcome(session, { t, ...outcome, questionId: question?.id, source: "interviewer" });
  }
  // Topou um desafio (da pergunta de desafio ou emendado numa sondagem): o agente volta depois para ver
  // como foi (policy.enqueueDueCheckIns). Nunca a partir de um retorno, para não virar um ciclo.
  if (
    question &&
    question.kind !== "retorno" &&
    question.kind !== "empecilho" &&
    output.challenge?.accepted &&
    !session.checkIns.some((c) => c.challengeId === question.id)
  ) {
    session.checkIns.push({
      id: `c-${session.checkIns.length + 1}`,
      challengeId: question.id,
      criterionId: question.criterionId,
      challenge: output.challenge.summary,
      createdAt: t,
      versionAtStart: session.codeHistory.at(-1)?.version ?? 0,
      status: "aguardando",
    });
  }
  if (output.end && checkIn) checkIn.status = "feito";
  if (output.end) session.lastConversationEndedAt = t;
  // Concluiu uma etapa: a próxima análise é um momento-chave (ver consumirEtapaConcluida no analista).
  const concluded = output.concluded === true && !opening;
  if (concluded) session.etapaConcluidaEm = t;

  return { reply: output.reply, commands, end: output.end, ...(concluded ? { concluded } : {}) };
}

function registrarEvidencia(session: SessionState, output: InterviewerOutput): void {
  if (!output.evidence) return;
  session.evidence.push({
    t: elapsedMs(session),
    criterionId: output.evidence.criterionId,
    note: output.evidence.note,
    source: "interviewer",
  });
}

/**
 * Anuncia o empecilho (uma vez): grava o evento na linha do tempo com o conceito que ele exige e já agenda o
 * retorno ("como ficou com a mudança?"). Repetir a chamada (tentar de novo) só devolve o anúncio.
 */
function anunciarEmpecilho(session: SessionState, blipId: string): string {
  const empecilho = empecilhoDaQuestao(session);
  const state = session.empecilho;
  if (!empecilho || !state || state.blipId !== blipId) return falaNaoRepetida(FALLBACK_REPLIES, falasDoAgente(session, []));
  if (state.announcedAt !== undefined) return empecilho.announcement;

  const t = elapsedMs(session);
  state.announcedAt = t;
  appendEvent(session, {
    type: "empecilho",
    sessionId: session.sessionId,
    t,
    empecilhoId: empecilho.id,
    kind: empecilho.kind,
    concept: empecilho.concept,
    title: empecilho.title,
    blipId,
    testNames: testesIde(session, empecilho.tests).map((teste) => teste.name),
  });
  session.checkIns.push({
    id: `c-${session.checkIns.length + 1}`,
    challengeId: blipId,
    challenge: `adaptar o código à mudança (${empecilho.title})`,
    createdAt: t,
    versionAtStart: session.codeHistory.at(-1)?.version ?? 0,
    status: "aguardando",
    empecilhoId: empecilho.id,
  });
  return empecilho.announcement;
}

/** Fechamentos que devolvem a vez para o código, variados. */
const DEVOLVER_PARA_O_CODIGO = ["Pode seguir.", "Segue no seu ritmo.", "Fica à vontade para continuar.", "Pode continuar no código."];

/**
 * Quantas perguntas o Totti já fez seguidas nesta conversa, sem devolver a vez (uma fala dele sem pergunta fecha
 * a sequência). Os pedidos de licença não contam.
 */
export function perguntasSeguidas(messages: ChatMessage[]): number {
  let n = 0;
  for (const m of messages) {
    if (m.role !== "agent") continue;
    const texto = m.text.trim();
    if (/posso (te )?(perguntar|interromper)/i.test(texto)) continue;
    n = texto.endsWith("?") ? n + 1 : 0;
  }
  return n;
}

/**
 * Quantas perguntas seguidas cabem numa conversa antes de o Totti devolver a vez. Uma resposta sempre ganha no
 * máximo um aprofundamento: mais que isso virava interrogatório (pergunta, pergunta, pergunta) e ele não deixava o
 * candidato voltar para o código. Fora de uma pergunta sua, uma pergunta só. O encerramento e a mudança no
 * problema têm o próprio ritmo.
 */
export function limiteDePerguntas(question: PerguntaDoLimite | undefined): number {
  if (!question) return 1;
  if (question.kind === "empecilho") return Number.POSITIVE_INFINITY;
  // Uma pergunta por ponto pendente, sem aprofundar: ele já clicou para sair. Com aprofundamento eram quatro
  // perguntas e o Totti não encerrava depois dos pontos.
  if (question.kind === "encerramento") return Math.max(1, question.closingTopics?.length ?? 2);
  if (question.kickoff) return 1;
  if (question.kind === "retorno") return 3;
  return 2;
}

/** Passou do limite de perguntas seguidas: reconhece, tira a pergunta e devolve a vez para o código. */
type PerguntaDoLimite = { kind?: string; kickoff?: boolean; closingTopics?: string[] };

/** No encerramento, o corte despede (a IDE diz o tchau depois); nas outras conversas, devolve para o código. */
const FECHAR_O_ENCERRAMENTO = ["Era isso que eu queria fechar.", "Era isso, obrigado pelas respostas."];

export function limitarPerguntas(
  output: InterviewerOutput,
  question: PerguntaDoLimite | undefined,
  messages: ChatMessage[],
  opening: boolean,
): InterviewerOutput {
  if (opening || output.respond === false || output.finish === true || !output.reply.trim().endsWith("?")) return output;
  // Perguntou algo ou está travado: a pergunta do Totti ali é ajuda (o que ele está vendo, onde travou), não
  // interrogatório. Cortar deixava um "Pode seguir." seco para quem acabou de dizer que não sabe seguir.
  const encerramento = question?.kind === "encerramento";
  if (!encerramento && (candidatoPerguntou(messages) || travado(messages))) return output;
  if (perguntasSeguidas(messages) + 1 <= limiteDePerguntas(question)) return output;
  const jaDitas = messages.filter((m) => m.role === "agent").map((m) => m.text);
  const fechamento = falaNaoRepetida(encerramento ? FECHAR_O_ENCERRAMENTO : DEVOLVER_PARA_O_CODIGO, jaDitas);
  return { ...output, reply: semPerguntaNoFim(output.reply, fechamento, encerramento), end: true, highlight: null };
}

/** Ele diz que não sabe seguir, não entendeu ou travou. */
export function travado(messages: ChatMessage[]): boolean {
  const ultima = messages.at(-1);
  return ultima?.role === "candidate" && /\b(n[ãa]o sei (como|o que|o porqu[êe]|porque|por que|mais)|n[ãa]o entendi|n[ãa]o t[ôo] entendendo|travei|t[ôo] travad[oa]|n[ãa]o (t[ôo]|estou) conseguindo)\b/i.test(ultima.text);
}

/** Com a solução funcionando, ele diz que já terminou (ou repete que terminou): quer encerrar. */
export function querEncerrar(messages: ChatMessage[]): boolean {
  const doCandidato = messages.filter((m) => m.role === "candidate");
  const ultima = doCandidato.at(-1)?.text ?? "";
  const terminou = /\b(terminei|acabei|finalizei)\b/i;
  if (!terminou.test(ultima)) return false;
  return /\bj[áa]\b/i.test(ultima) || doCandidato.slice(0, -1).some((m) => terminou.test(m.text));
}

/** A fala segura quando a geração foi barrada: resposta neutra se ele perguntou algo, senão uma pergunta aberta. */
function falaSegura(perguntou: boolean, jaDitas: string[]): string {
  return falaNaoRepetida(perguntou ? SAFE_ANSWER_REPLIES : SAFE_CLOSE_REPLIES, jaDitas);
}

const RECONHECIMENTO_NO_COMECO = /^(uhum|hum|hm+|saquei|entendi|entendido|certo|beleza|ok|t[áa]|legal|show|ah|ent[ãa]o)\b[,.!]?\s*/i;

/**
 * Tira o "Saquei."/"Entendi." do começo da resposta quando a IDE já disse um "uhum" agora, ou quando a fala
 * anterior do Totti abriu com a mesma palavra: era o "entendi, entendi, entendi".
 */
export function semReconhecimentoRepetido(reply: string, messages: ChatMessage[], reconheceu: boolean): string {
  const primeira = (t: string) => t.trim().match(RECONHECIMENTO_NO_COMECO)?.[1]?.toLowerCase();
  const anterior = messages.filter((m) => m.role === "agent").at(-1)?.text;
  const abre = primeira(reply);
  if (!abre || (!reconheceu && abre !== (anterior && primeira(anterior)))) return reply;
  let texto = reply.trim();
  for (let i = 0; i < 2 && RECONHECIMENTO_NO_COMECO.test(texto); i++) texto = texto.replace(RECONHECIMENTO_NO_COMECO, "");
  // Só a reação ("Saquei."): sem ela não sobra fala; fica como está.
  if (texto.length < 3) return reply;
  return texto[0].toUpperCase() + texto.slice(1);
}

/** Uma fala curta e sem pergunta: só reconhece e devolve a vez. */
function falaSoDeReconhecer(reply: string): boolean {
  const texto = reply.trim();
  return !texto.includes("?") && texto.split(/\s+/).length <= 14;
}

/** Tira as perguntas do fim da fala e põe o fechamento no lugar (mantém a reação curta do começo, se houver). */
function semPerguntaNoFim(reply: string, fechamento: string, sempreFechar = false): string {
  const frases = reply.trim().split(/(?<=[.!?])\s+/);
  while (frases.length && frases[frases.length - 1].endsWith("?")) frases.pop();
  if (sempreFechar) return [...frases.slice(0, 1), fechamento].join(" ");
  // Sobrou a reação ou a resposta ao que ele perguntou: ela basta (o "Pode seguir." em toda fala cansava).
  // O fechamento só entra quando não sobrou nada.
  return frases.length ? frases.slice(0, 2).join(" ") : fechamento;
}

/** O entrevistador já fez alguma pergunta nesta conversa livre (as falas que vieram no pedido). */
function jaPerguntouDoPlano(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "agent" && m.text.trim().endsWith("?"));
}

/**
 * Ele já ouviu uma pergunta do Totti nesta sessão (a abertura ou outra). Antes de haver código, qualquer pergunta é
 * sobre o plano: a abertura numa conversa e outra pergunta do plano na fala livre seguinte era o "você já me
 * perguntou isso".
 */
function jaPerguntouNaSessao(session: SessionState): boolean {
  return session.events.some((e) => e.type === "speech" && e.role === "agent" && e.text.trim().endsWith("?") && !/posso (te )?(perguntar|interromper)/i.test(e.text));
}

/** Tira a pergunta do fim e libera para codar (mantém a reação curta do começo, se houver). */
function liberarParaCodar(reply: string): string {
  const frases = reply.trim().split(/(?<=[.!?])\s+/);
  while (frases.length && frases[frases.length - 1].endsWith("?")) frases.pop();
  return [...frases, "Pode começar a codar quando quiser."].join(" ");
}

/** Mais linhas que isso já é o arquivo, não um trecho. */
const MAX_LINHAS_GRIFO = 12;

const PALAVRAS_DA_LINGUAGEM = new Set(["def", "for", "return", "not", "and", "pass", "else", "elif", "while", "len", "range", "true", "false", "none", "self", "class", "import", "from", "const", "let", "var", "function", "int", "string", "public", "static", "void", "new", "this", "null", "undefined"]);

/**
 * O grifo tem propósito quando as linhas têm código do candidato (não só o inicial) e a fala cita algo delas
 * (um nome, uma palavra do trecho) ou aponta para ele ("essa linha", "aqui"). Grifo sem isso confunde: o
 * candidato olha para a tela e não entende do que o Totti está falando.
 */
export function grifoComProposito(reply: string, code: string, range: LineRange, starter: string): boolean {
  const linhasDoInicio = new Set(starter.split("\n").map((l) => l.trim()).filter(Boolean));
  // Grifar a função inteira não aponta nada: o grifo é para um trecho.
  if (range.endLine - range.startLine + 1 > MAX_LINHAS_GRIFO) return false;
  const linhas = code.split("\n").slice(Math.max(0, range.startLine - 1), range.endLine).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0 || linhas.every((l) => linhasDoInicio.has(l) || l.startsWith("#") || l.startsWith("//"))) return false;
  const fala = reply.toLowerCase();
  if (/\b(essa linha|nessa linha|esse trecho|nesse trecho|aqui em cima|aqui embaixo|esse (loop|if|bloco|retorno|return|for)|essa (condição|função|variável|parte))\b/.test(fala)) return true;
  const nomes = new Set(linhas.join(" ").toLowerCase().match(/[a-zà-ú_][a-zà-ú0-9_]{2,}/g) ?? []);
  return [...nomes].some((n) => !PALAVRAS_DA_LINGUAGEM.has(n) && new RegExp(`(^|[^a-zà-ú0-9_])${n}([^a-zà-ú0-9_]|$)`).test(fala));
}

/** Uma geração da fala no modelo de conversa (rápido, sem raciocínio), cancelada de verdade no prazo. */
async function generate(session: SessionState, system: string, user: string, prazoMs: number): Promise<InterviewerOutput> {
  const result = await completeJson({
    role: "conversa",
    system,
    user,
    schema: InterviewerOutput,
    prazoMs,
    signal: AbortSignal.timeout(Math.max(500, prazoMs)),
  });
  session.analyst.costUsd += result.costUsd;
  return result.data;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-zà-ú]{4,}/g) ?? [];
}

/** A fala traz a dica: boa parte das palavras da dica aparecem nela. */
function containsHint(reply: string, hint: string): boolean {
  const said = new Set(words(reply));
  const hintWords = words(hint);
  return hintWords.length > 0 && hintWords.filter((w) => said.has(w)).length / hintWords.length >= 0.6;
}

/** A fala é praticamente a pergunta preparada: quase todas as palavras dela e quase nada a mais. */
function isAboutTheSame(reply: string, question: string): boolean {
  const asked = new Set(words(question));
  const said = words(reply);
  if (asked.size === 0 || said.length === 0) return false;
  const extra = said.filter((w) => !asked.has(w)).length;
  return containsHint(reply, question) && extra <= 2;
}

function elapsedMs(session: SessionState): number {
  return sessionNow(session);
}

function highlightCommands(range: LineRange | undefined): EditorCommand[] {
  return range ? [{ type: "highlight_range", startLine: range.startLine, endLine: range.endLine }] : [];
}

/** Mantém o grifo dentro das linhas do código e com endLine >= startLine. */
function clampLines(range: LineRange, lineCount: number): LineRange {
  const startLine = clamp(range.startLine, 1, lineCount);
  const endLine = clamp(range.endLine, startLine, lineCount);
  return { startLine, endLine };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Um parágrafo com o que o Analyst viu: abordagem, complexidade e trechos suspeitos. */
function analystNotesOf(session: SessionState): string | undefined {
  const insights = session.analyst.insights;
  if (!insights) return undefined;
  // Só a complexidade: a abordagem e as linhas suspeitas do analista às vezes citam o bug
  // ("sem verificar i == j"), e o entrevistador que sabe onde está o bug acaba apontando.
  return `Complexidade estimada: ${insights.timeComplexity} de tempo, ${insights.spaceComplexity} de espaço.`;
}

/** Tempo em mm:ss. */
function formatMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
