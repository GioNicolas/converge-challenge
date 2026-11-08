// Smoke test do entrevistador do live coding com o LLM real (microfone aberto, conversa livre e balão).
// Só dados sintéticos; usa créditos do provedor.
// npx tsx --env-file-if-exists=.env.local scripts/validar-conversa-ide.ts
import assert from "node:assert/strict";
import { runInterviewerTurn } from "@/lib/agents/interviewer";
import type { ChatMessage } from "@/lib/contracts";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";
import type { QueuedQuestion, SessionState } from "@/lib/session/types";
import { filaDoProvedor } from "@/lib/llm/openaiCompat";
import { deixaABola } from "./validar-conversa";

// DEBUG_FILA=1 mostra as vagas dos provedores a cada 2 s (para achar chamada presa).
if (process.env.DEBUG_FILA) {
  setInterval(() => console.log("[fila]", JSON.stringify({ fl: filaDoProvedor("featherless"), or: filaDoProvedor("openrouter") })), 2000).unref();
}

const CODIGO =
  "def two_sum(nums, target):\n" +
  "    for i in range(len(nums)):\n" +
  "        for j in range(len(nums)):\n" +
  "            if nums[i] + nums[j] == target:\n" +
  "                return [i, j]";

/** Termos que entregariam a solução (o filtro de fala também barra, mas o modelo não deveria nem tentar). */
const SOLUCAO = /dicion[aá]rio|hash ?map|tabela hash|complemento|\bset\b|conjunto/i;

function sessao(id: string): SessionState {
  const s = getOrCreateSession(id);
  appendEvent(s, { type: "session_started", sessionId: id, t: 0, configId: s.config.id, problemId: s.config.problemId, language: "python" });
  appendEvent(s, { type: "snapshot", sessionId: id, t: 0, code: CODIGO, version: 1, language: "python" });
  const q: QueuedQuestion = {
    id: "q-1",
    question: "Me fala um pouco desse loop interno. Por que o j começa onde começa?",
    followUpTopic: "o raciocínio por trás de onde o loop começa",
    topicLabel: "o loop interno",
    priority: 0.8,
    highlight: { startLine: 3, endLine: 3 },
    createdAt: 0,
    status: "blipped",
  };
  s.queue.push(q);
  s.blips.push({ id: "q-1", preview: "Tenho uma pergunta sobre seu código", priority: 0.8, createdAt: 0, highlight: q.highlight });
  return s;
}

type Caso = { nome: string; fala: string; responde: boolean; blip?: boolean; checar?: (r: string) => string | null };

const CASOS: Caso[] = [
  { nome: "pensando em voz alta", fala: "então aqui eu percorro o array e pra cada número eu olho os outros", responde: false },
  { nome: "murmúrio", fala: "hmm deixa eu ver esse índice aqui", responde: false },
  { nome: "falando sozinho do erro", fala: "ué, deu errado no segundo teste, deixa eu olhar", responde: false },
  { nome: "dúvida do enunciado", fala: "posso assumir que sempre existe uma resposta?", responde: true },
  { nome: "pede a estrutura", fala: "qual estrutura de dados você usaria aqui?", responde: true, checar: (r) => (SOLUCAO.test(r) ? "entregou a solução" : null) },
  { nome: "pede validação", fala: "meu código tá certo?", responde: true, checar: (r) => (/\b(está|tá) certo\b|correto|isso mesmo/i.test(r) && !/\?/.test(r) ? "validou o código" : null) },
  { nome: "explica e pergunta", fala: "acho que fica O(n²) por causa dos dois loops, faz sentido pra você?", responde: true },
  { nome: "resposta no balão", fala: "começa do zero porque eu quero olhar todos os pares", responde: true, blip: true },
];

async function main() {
  const falhas: string[] = [];
  const tempos: number[] = [];
  const so = process.env.SO_CASOS?.split(",").map(Number);
  for (const [i, caso] of CASOS.entries()) {
    if (so && !so.includes(i)) continue;
    const s = sessao(`validar-ide-${Date.now()}-${i}`);
    const mensagens: ChatMessage[] = [];
    if (caso.blip) {
      appendEvent(s, { type: "blip_opened", sessionId: s.sessionId, t: 0, blipId: "q-1" });
      const abertura = await runInterviewerTurn(s, { blipId: "q-1", messages: [] });
      mensagens.push({ role: "agent", text: abertura.reply });
    }
    mensagens.push({ role: "candidate", text: caso.fala });
    const inicio = Date.now();
    const r = await runInterviewerTurn(s, { blipId: caso.blip ? "q-1" : undefined, messages: mensagens });
    const ms = Date.now() - inicio;
    tempos.push(ms);
    console.log(JSON.stringify({ caso: caso.nome, ms, silent: r.silent ?? false, end: r.end, reply: r.reply }));
    const respondeu = !r.silent && r.reply.trim() !== "";
    if (respondeu !== caso.responde) falhas.push(`${caso.nome}: ${caso.responde ? "devia responder" : "devia ficar quieto"}`);
    else if (respondeu) {
      const problema = caso.checar?.(r.reply);
      if (problema) falhas.push(`${caso.nome}: ${problema}`);
      if (!r.end && !deixaABola(r.reply)) falhas.push(`${caso.nome}: não devolve a vez`);
    }
  }
  const ordenado = [...tempos].sort((a, b) => a - b);
  console.log(`p50 ${ordenado[Math.floor(ordenado.length / 2)]} ms, máx ${ordenado.at(-1)} ms`);
  assert.equal(falhas.length, 0, falhas.join("; "));
}
main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  // A store da sessão deixa timers vivos: sem isso o processo não termina.
  .finally(() => setTimeout(() => process.exit(), 100));
