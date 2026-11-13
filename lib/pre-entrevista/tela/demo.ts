// Demonstração da pré-entrevista sem as chaves dos modelos: uma conversa roteirizada com o Totti
// que devolve exatamente o formato do `EstadoSessao` real (ver `../sessoes.ts`).
// A cada fala da recrutadora, o Totti avança um passo e o rascunho se atualiza.
import type { Criterion, FocusArea } from "@/lib/contracts";
import { CATALOGO } from "../catalogo";
import type { Vaga } from "../classificador";
import type { EstadoSessao } from "../sessoes";

type Topico = EstadoSessao["topicos"][number];

const TOPICOS: Omit<Topico, "cobertura" | "coberto">[] = [
  { id: "formato", pergunta: "Formato da entrevista", opcional: false },
  { id: "senioridade", pergunta: "Senioridade esperada", opcional: false },
  { id: "foco", pergunta: "O que mais pesa na avaliação", opcional: false },
  { id: "boa_resposta", pergunta: "Como é uma boa resposta", opcional: false },
  { id: "tom", pergunta: "Tom da entrevista", opcional: true },
  { id: "duracao", pergunta: "Duração", opcional: true },
];

const pesos = (lista: [FocusArea, number][]) => lista.map(([area, weight]) => ({ area, weight }));

function criterios(focus: FocusArea[]): Criterion[] {
  return CATALOGO.system_design.filter((c) => focus.includes(c.focus)).map((c) => ({ ...c }));
}

/** Um passo do roteiro: o que muda no estado quando a recrutadora responde, e a próxima fala do Totti. */
type Passo = {
  cobre: string[];
  totti: (texto: string) => string;
  mudar?: (e: EstadoSessao, texto: string) => void;
  encerrar?: boolean;
};

const ROTEIRO: Passo[] = [
  {
    cobre: ["formato"],
    mudar: (e) => (e.rascunho.confirmado.mode = true),
    totti: () =>
      "Perfeito, system design então. E a senioridade: sênior mesmo? Alguém que conduz o desenho sozinho e acha os gargalos antes de ser perguntado?",
  },
  {
    cobre: ["senioridade"],
    mudar: (e) => (e.rascunho.confirmado.seniority = true),
    totti: () =>
      "Fechado. Sobre o foco, eu daria mais peso a escala e produto, um pouco a domínio técnico e quase nada a pressão. Concorda?",
  },
  {
    cobre: ["foco"],
    mudar: (e) => {
      e.rascunho.confirmado.focus = true;
      e.rascunho.focus = pesos([
        ["escala_produto", 0.55],
        ["tecnico", 0.3],
        ["pressao", 0.15],
      ]);
      e.planejamento.emJogo = ["escala_produto", "tecnico", "pressao"];
    },
    totti: () =>
      "Entendi. Quando a pessoa desenhar o fluxo de pagamento, o que seria uma boa resposta pra você? E o que te faria desconfiar?",
  },
  {
    cobre: ["boa_resposta"],
    mudar: (e) => {
      const novo: Criterion = {
        id: "idempotencia",
        name: "Consistência e idempotência",
        focus: "escala_produto",
        weight: 1.25,
        description:
          "Bom: garante sozinho que um pagamento repetido não cobra duas vezes (chave de idempotência, saga, reprocessamento). Ruim: só pensa nisso quando o entrevistador pergunta.",
      };
      e.rascunho.criteria = [novo, ...e.rascunho.criteria.filter((c) => c.id !== novo.id)];
      e.rascunho.recruiterNotes = "Time de Pagamentos: consistência e alta disponibilidade (99,99%) são o centro.";
    },
    totti: () => "Ótimo, isso vira um critério. E o tom: prefere uma conversa mais amigável ou mais pressionada?",
  },
  {
    cobre: ["tom"],
    mudar: (e) => {
      e.rascunho.recruiterNotes += "\nTom: amigável, mas firme nos trade-offs.";
    },
    totti: () => "Combinado. Quanto tempo vocês têm para a entrevista? O padrão de system design é 45 minutos.",
  },
  {
    cobre: ["duracao"],
    mudar: (e, texto) => {
      const minutos = Number(/(\d{2,3})\s*min/i.exec(texto)?.[1] ?? /(\d{2,3})/.exec(texto)?.[1]);
      e.rascunho.durationMin = Number.isFinite(minutos) && minutos >= 15 && minutos <= 120 ? minutos : 45;
    },
    encerrar: true,
    totti: () =>
      "Pronto, montei a entrevista: system design, sênior, com foco em escala e consistência. Dá uma revisada no plano e, se estiver tudo certo, é só confirmar.",
  },
];

export function estadoInicialDemo(vaga: Vaga): EstadoSessao {
  const focus = pesos([
    ["escala_produto", 0.6],
    ["tecnico", 0.25],
    ["pressao", 0.15],
  ]);
  const areas = focus.map((f) => f.area);
  return {
    id: `demo-${Date.now().toString(36)}`,
    criadaEm: Date.now(),
    vaga,
    classificacao: {
      mode: { value: "system_design", confidence: 0.86, probabilities: { system_design: 0.86, live_coding: 0.14 } },
      seniority: { value: "senior", confidence: 0.91, probabilities: { senior: 0.91, pleno: 0.08, junior: 0.01 } },
      focusScores: [
        { area: "escala_produto", score: 2.8, pImportante: 0.95 },
        { area: "tecnico", score: 2.1, pImportante: 0.7 },
        { area: "pressao", score: 1.4, pImportante: 0.4 },
        { area: "uso_ia", score: 0.6, pImportante: 0.1 },
      ],
      focus,
      confirmar: ["mode", "seniority", "focus"],
      usage: { inputTokens: null, ms: 1800 },
      model: "demonstração",
    } as EstadoSessao["classificacao"],
    transcricao: [
      {
        role: "agente",
        text: `Oi! Li a vaga de ${vaga.roleTitle}. Pelo que entendi, faria sentido uma entrevista de system design, com o candidato desenhando a arquitetura num quadro. Faz sentido pra vocês?`,
      },
    ],
    rascunho: {
      mode: "system_design",
      roleTitle: vaga.roleTitle,
      jobDescription: vaga.jobDescription,
      seniority: "senior",
      focus,
      criteria: criterios(areas),
      recruiterNotes: "",
      problemId: "encurtador-de-url",
      confirmado: { mode: false, seniority: false, focus: false },
      cobertura: {},
      pendencias: TOPICOS.filter((t) => !t.opcional).map((t) => t.id),
      origens: {},
      eliminatorios: [],
      contexto: "",
      fixados: [],
      conducao: [],
    },
    topicos: TOPICOS.map((t) => ({ ...t, cobertura: 0, coberto: false })),
    faltando: TOPICOS.filter((t) => !t.opcional).map((t) => t.id),
    planejamento: { emJogo: areas, sinais: {}, perguntasPorTopico: {}, resumos: 0, decisoesTradeoff: {} },
    competencias: [],
    naoAvaliado: [],
    status: { extraindo: false, versaoExtraida: 0 },
    pesos: [],
    logs: [],
  };
}

/** Aplica a resposta da recrutadora: avança o roteiro e devolve o novo estado (sem mexer no anterior). */
export function responderDemo(anterior: EstadoSessao, texto: string): EstadoSessao {
  const e: EstadoSessao = structuredClone(anterior);
  e.transcricao.push({ role: "recrutadora", text: texto });
  const respondidas = e.transcricao.filter((t) => t.role === "recrutadora").length;
  const passo = ROTEIRO[respondidas - 1];
  if (!passo) {
    e.transcricao.push({ role: "agente", text: "Anotei! Quando quiser, é só revisar o plano e confirmar." });
    return e;
  }
  passo.mudar?.(e, texto);
  for (const t of e.topicos) {
    if (passo.cobre.includes(t.id)) {
      t.cobertura = 1;
      t.coberto = true;
      e.rascunho.cobertura[t.id] = 1;
    }
  }
  e.faltando = e.topicos.filter((t) => !t.coberto && !t.opcional).map((t) => t.id);
  e.rascunho.pendencias = e.faltando;
  e.transcricao.push({ role: "agente", text: passo.totti(texto) });
  if (passo.encerrar) e.planejamento.passo = { tipo: "encerrar" } as EstadoSessao["planejamento"]["passo"];
  e.status.versaoExtraida += 1;
  return e;
}
