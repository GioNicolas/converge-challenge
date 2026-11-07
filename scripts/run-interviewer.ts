/**
 * Conversas roteirizadas com o Interviewer, sem a IDE. Cada cenário é uma conversa nova.
 * Uso: npx tsx scripts/run-interviewer.ts
 */
import { runInterviewerTurn } from "@/lib/agents/interviewer";
import type { ChatMessage } from "@/lib/contracts";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";
import type { QueuedQuestion, SessionState } from "@/lib/session/types";

const BUGGY_CODE =
  "def two_sum(nums, target):\n" +
  "    for i in range(len(nums)):\n" +
  "        for j in range(len(nums)):\n" +
  "            if nums[i] + nums[j] == target:\n" +
  "                return [i, j]";

interface Scenario {
  key: string;
  title: string;
  /** Presente: conversa de blip q-1. Ausente: candidato chamou o entrevistador. */
  blipId?: string;
  lines: string[];
}

const SCENARIOS: Scenario[] = [
  {
    key: "A",
    title: "blip q-1: resposta vaga, depois correta",
    blipId: "q-1",
    lines: [
      "sei lá, achei que era assim",
      "é pra comparar todos os pares",
      "ah, acho que assim ele compara o número com ele mesmo também, devia começar depois do i",
    ],
  },
  {
    key: "B",
    title: "blip q-1: pede a resposta",
    blipId: "q-1",
    lines: ["pode me falar qual é a resposta certa?", "mostra só o código então"],
  },
  {
    key: "C",
    title: "blip q-1: pede dica",
    blipId: "q-1",
    lines: ["tô travado, me dá uma dica?"],
  },
  {
    key: "D",
    title: "candidato chama: perguntas sobre o enunciado",
    lines: ["pode ter número negativo?", "e a ordem dos índices importa?", "valeu, era isso"],
  },
  {
    key: "E",
    title: "candidato chama: pede para validar o código",
    lines: ["meu código tá certo?"],
  },
  {
    key: "F",
    title: "candidato chama: pede a estrutura de dados",
    lines: ["qual estrutura de dados você usaria aqui?"],
  },
];

/** Sessão nova com o código bugado e a pergunta q-1 na fila e nos blips. */
function seedSession(sessionId: string): SessionState {
  const session = getOrCreateSession(sessionId);
  appendEvent(session, {
    type: "session_started",
    sessionId,
    t: 0,
    configId: session.config.id,
    problemId: session.config.problemId,
    language: "python",
  });
  appendEvent(session, { type: "snapshot", sessionId, t: 0, code: BUGGY_CODE, version: 1, language: "python" });

  const question: QueuedQuestion = {
    id: "q-1",
    question: "Me fala um pouco desse loop interno. Por que o j começa onde começa?",
    followUpTopic: "o raciocínio por trás de onde o loop começa",
    topicLabel: "o loop interno",
    priority: 0.8,
    highlight: { startLine: 3, endLine: 3 },
    createdAt: 0,
    status: "blipped",
  };
  session.queue.push(question);
  session.blips.push({
    id: "q-1",
    preview: "Tenho uma pergunta sobre seu código",
    priority: 0.8,
    createdAt: 0,
    highlight: question.highlight,
  });
  return session;
}

/** Uma fala do entrevistador: imprime a fala com os marcadores e devolve se a conversa acabou. */
async function agentTurn(session: SessionState, blipId: string | undefined, messages: ChatMessage[]): Promise<boolean> {
  const hintsBefore = session.hintsUsed;
  const evidenceBefore = session.evidence.length;
  const res = await runInterviewerTurn(session, { blipId, messages });
  messages.push({ role: "agent", text: res.reply });

  const markers: string[] = [];
  for (const c of res.commands) {
    if (c.type === "highlight_range") markers.push(`[grifo ${c.startLine}-${c.endLine}]`);
  }
  if (session.hintsUsed > hintsBefore) markers.push("[dica]");
  if (res.end) markers.push("[fim]");

  console.log(`Você: ${res.reply}${markers.length ? `  ${markers.join(" ")}` : ""}`);
  for (const ev of session.evidence.slice(evidenceBefore)) {
    console.log(`   [evidence ${ev.criterionId}] ${ev.note}`);
  }
  return res.end;
}

/** Roda um cenário e devolve o custo acumulado da conversa em US$. */
async function runScenario(scenario: Scenario): Promise<number> {
  const sessionId = `script-${Date.now()}-${scenario.key}`;
  const session = seedSession(sessionId);
  const messages: ChatMessage[] = [];
  const blipId = scenario.blipId;

  console.log(`\n=== ${scenario.key}. ${scenario.title} ===`);
  if (blipId !== undefined) {
    appendEvent(session, { type: "blip_opened", sessionId, t: 0, blipId });
    if (await agentTurn(session, blipId, messages)) return session.analyst.costUsd;
  }

  for (let i = 0; i < scenario.lines.length; i++) {
    const line = scenario.lines[i];
    messages.push({ role: "candidate", text: line });
    console.log(`Candidato: ${line}`);
    if (await agentTurn(session, blipId, messages)) {
      const skipped = scenario.lines.length - i - 1;
      if (skipped > 0) console.log(`(conversa encerrada: ${skipped} fala(s) do roteiro não enviada(s))`);
      break;
    }
  }
  return session.analyst.costUsd;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // sem .env.local: usa as variáveis do ambiente
  }

  let total = 0;
  for (const scenario of SCENARIOS) {
    total += await runScenario(scenario);
  }
  console.log(`\ncusto total: US$ ${total.toFixed(4)}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
