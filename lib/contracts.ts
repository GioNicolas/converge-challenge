/**
 * Contratos compartilhados entre a IDE, o agente e a pré-entrevista.
 * Mudou algo aqui? Avisa o time inteiro — todo mundo depende deste arquivo.
 *
 * Tempos (`t`) são sempre milissegundos desde o início da sessão.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuração da entrevista (gerada pela pré-entrevista com a recrutadora)
// ---------------------------------------------------------------------------

export const FocusArea = z.enum([
  "tecnico", // domínio técnico: algoritmo, complexidade, corretude
  "pressao", // como lida com tempo curto, travadas e provocações
  "escala_produto", // pensa em escala, trade-offs e evolução do produto
  "uso_ia", // como usa IA como ferramenta de trabalho
]);
export type FocusArea = z.infer<typeof FocusArea>;

export const Criterion = z.object({
  id: z.string(),
  name: z.string(),
  /** O que conta como bom nesse critério — vai direto pro prompt do Evaluator. */
  description: z.string(),
  weight: z.number().positive(),
  focus: FocusArea,
});
export type Criterion = z.infer<typeof Criterion>;

/** Formato da entrevista: código na IDE (estilo NeetCode) ou system design no Excalidraw. */
export const InterviewMode = z.enum(["live_coding", "system_design"]);
export type InterviewMode = z.infer<typeof InterviewMode>;

export const InterviewConfig = z.object({
  id: z.string(),
  mode: InterviewMode.default("live_coding"),
  roleTitle: z.string(),
  /** Descrição da vaga colada pela recrutadora na pré-entrevista. */
  jobDescription: z.string().optional(),
  seniority: z.enum(["junior", "pleno", "senior"]),
  focus: z.array(z.object({ area: FocusArea, weight: z.number().min(0).max(1) })),
  /** Notas livres da recrutadora ("time pequeno, precisa de autonomia"). */
  recruiterNotes: z.string().default(""),
  criteria: z.array(Criterion).min(1),
  /** Nível das questões, definido pelo agente conforme a vaga (ver `lib/problems.ts`). */
  difficulty: z.enum(["facil", "medio"]).optional(),
  /** Questão escolhida do banco pelo agente; deve ser do nível `difficulty`. */
  problemId: z.string(),
  languages: z.array(z.string()).min(1),
  durationMin: z.number().int().positive().default(30),
});
export type InterviewConfig = z.infer<typeof InterviewConfig>;

// ---------------------------------------------------------------------------
// Execução de código (IDE → agente)
// ---------------------------------------------------------------------------

export const RunCase = z.object({
  name: z.string(),
  passed: z.boolean(),
  input: z.string().optional(),
  expected: z.string().optional(),
  got: z.string().optional(),
  error: z.string().optional(),
});

export const RunResult = z.object({
  passed: z.number().int(),
  total: z.number().int(),
  cases: z.array(RunCase),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  durationMs: z.number(),
});
export type RunResult = z.infer<typeof RunResult>;

// ---------------------------------------------------------------------------
// Eventos da sessão (IDE → agente, via POST /api/events)
// ---------------------------------------------------------------------------

const base = { sessionId: z.string(), t: z.number().nonnegative() };

export const SessionEvent = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("session_started"), configId: z.string(), problemId: z.string(), language: z.string() }),
  /** Código inteiro. Mandar ~1,5 s depois de parar de digitar, ou no máximo a cada 5 s. */
  z.object({ ...base, type: z.literal("snapshot"), code: z.string(), version: z.number().int(), language: z.string() }),
  /** Sem digitar há `idleMs` (a IDE manda a partir de 8 s). */
  z.object({ ...base, type: z.literal("pause"), idleMs: z.number() }),
  z.object({ ...base, type: z.literal("run"), result: RunResult }),
  z.object({ ...base, type: z.literal("paste"), chars: z.number().int(), lines: z.number().int(), startLine: z.number().int() }),
  z.object({ ...base, type: z.literal("speech"), role: z.enum(["candidate", "agent"]), text: z.string(), blipId: z.string().optional() }),
  z.object({ ...base, type: z.literal("hint"), level: z.number().int(), text: z.string() }),
  z.object({ ...base, type: z.literal("blip_opened"), blipId: z.string() }),
  z.object({ ...base, type: z.literal("blip_closed"), blipId: z.string(), reason: z.enum(["agent", "button"]) }),
  /** Candidato clicou "agora não" no balão: a pergunta volta mais tarde. */
  z.object({ ...base, type: z.literal("blip_snoozed"), blipId: z.string() }),
  z.object({ ...base, type: z.literal("language_changed"), language: z.string() }),
  z.object({ ...base, type: z.literal("session_ended"), reason: z.enum(["timeout", "button"]) }),
]);
export type SessionEvent = z.infer<typeof SessionEvent>;
export type SessionEventType = SessionEvent["type"];

// ---------------------------------------------------------------------------
// Blip: o agente tem uma pergunta (agente → IDE)
// ---------------------------------------------------------------------------

export const LineRange = z.object({ startLine: z.number().int(), endLine: z.number().int() });
export type LineRange = z.infer<typeof LineRange>;

export const Blip = z.object({
  id: z.string(),
  /** Texto curto pro balão ("Tenho uma pergunta sobre seu loop"). Nunca a pergunta inteira. */
  preview: z.string(),
  priority: z.number().min(0).max(1),
  createdAt: z.number(),
  highlight: LineRange.optional(),
});
export type Blip = z.infer<typeof Blip>;

/**
 * Resposta de POST /api/events e de GET /api/blip/pending (a IDE consulta a cada ~3 s).
 * `dismissBlipId`: o balão com esse id expirou sem clique — a IDE deve tirá-lo da tela.
 */
export const EventsResponse = z.object({ blip: Blip.optional(), dismissBlipId: z.string().optional() });
export type EventsResponse = z.infer<typeof EventsResponse>;

/** Resposta de GET /api/blip/:id/context — o que a conversa (voz ou texto) recebe ao abrir. */
export const BlipContext = z.object({
  blip: Blip,
  question: z.string(),
  /** Tema pra aprofundar, sem fugir do assunto ("por que fica pesado com entrada grande"). */
  followUpTopic: z.string(),
  /** Dica leve disponível, usada só se o candidato pedir ajuda. */
  availableHint: z.string().optional(),
  numberedCode: z.string(),
  summary: z.string(),
  focus: z.array(FocusArea),
});
export type BlipContext = z.infer<typeof BlipContext>;

// ---------------------------------------------------------------------------
// Conversa por texto (plano B da voz) — POST /api/chat
// ---------------------------------------------------------------------------

export const ChatMessage = z.object({ role: z.enum(["candidate", "agent"]), text: z.string() });
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatRequest = z.object({
  sessionId: z.string(),
  blipId: z.string().optional(),
  messages: z.array(ChatMessage),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

// ---------------------------------------------------------------------------
// Comandos de editor (agente → IDE)
// ---------------------------------------------------------------------------

export const EditorCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("highlight_range"), startLine: z.number().int(), endLine: z.number().int(), note: z.string().optional() }),
  z.object({ type: z.literal("add_inline_note"), line: z.number().int(), text: z.string() }),
  z.object({ type: z.literal("clear_highlights") }),
]);
export type EditorCommand = z.infer<typeof EditorCommand>;

export const ChatResponse = z.object({
  reply: z.string(),
  /** Grifos pra aplicar antes de mostrar/falar a resposta. */
  commands: z.array(EditorCommand),
  /** true quando o agente encerra a conversa ("Beleza, pode seguir!"). */
  end: z.boolean(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;

// ---------------------------------------------------------------------------
// Relatório final (agente → tela da recrutadora)
// ---------------------------------------------------------------------------

export const Evidence = z.object({ t: z.number(), text: z.string() });

export const CriterionScore = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number().int().min(1).max(4),
  evidence: z.array(Evidence),
});

export const Report = z.object({
  sessionId: z.string(),
  configId: z.string(),
  roleTitle: z.string(),
  recommendation: z.enum(["avancar", "talvez", "nao_avancar"]),
  /** Média ponderada dos critérios, de 1 a 4. */
  overallScore: z.number().min(1).max(4),
  criteria: z.array(CriterionScore),
  summary: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  /** Pontos pra explorar na próxima etapa do processo. */
  nextSteps: z.array(z.string()),
  signals: z.object({
    testsPassed: z.number().int(),
    testsTotal: z.number().int(),
    hintsUsed: z.number().int(),
    pastes: z.number().int(),
    durationMs: z.number(),
  }),
});
export type Report = z.infer<typeof Report>;
