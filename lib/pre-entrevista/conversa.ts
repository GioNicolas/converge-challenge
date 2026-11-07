/**
 * Agente de conversa (Nara): assistente que configura a entrevista conversando com a recrutadora.
 *
 * A abertura sai sem LLM, a partir da classificação, para aparecer na hora. As falas seguintes
 * vêm do modelo: Featherless primeiro, OpenRouter depois, com 12 s por alvo.
 */
import { topicosDo } from "./cobertura";
import { chat, ErroChat, type Alvo, type Mensagem, type Tentativa } from "./llm";
import type { Rascunho, Turno } from "./rascunho";
import type { Sessao } from "./sessoes";

const TEMPERATURA_CONVERSA = 0.5;
const MAX_TOKENS_CONVERSA = 400;
const TIMEOUT_CONVERSA_MS = 12_000;

/** Featherless (principal) e OpenRouter (plano B). Cada alvo tem 12 s antes de passar adiante. */
function alvosDaConversa(): Alvo[] {
  return [
    {
      provedor: "featherless",
      model: process.env.CONVERSA_MODEL || "google/gemma-4-26B-A4B-it",
      timeoutMs: TIMEOUT_CONVERSA_MS,
    },
    {
      provedor: "openrouter",
      model: process.env.CONVERSA_FALLBACK_MODEL || "google/gemini-2.5-flash-lite",
      timeoutMs: TIMEOUT_CONVERSA_MS,
    },
  ];
}

const PROMPT_SISTEMA_CONVERSA = `Você é a Nara, assistente que configura entrevistas técnicas conversando com a recrutadora.
Seu objetivo é coletar o que falta para montar a entrevista desta vaga: formato (live coding ou system design),
senioridade, áreas de foco com o que é um bom e um mau candidato em cada uma, duração, tom, política de dicas
e eliminatórios.

Como responder:
- Faça UMA pergunta por fala, em no máximo 2 frases curtas.
- Sua fala vai ser lida em voz alta: não use listas, markdown, asteriscos, títulos nem emojis.
- Siga a ordem da lista "O QUE FALTA", mas não repita algo que a recrutadora já respondeu na transcrição,
  mesmo que ainda conste como pendente, porque a extração roda com atraso.
- Se a resposta dela foi vaga (por exemplo, "quero alguém bom em IA"), peça um comportamento observável
  e ofereça 2 exemplos concretos para ela escolher.
- Se ela não tiver opinião sobre algo, proponha um padrão razoável e siga em frente.
- Nunca invente o que ela disse. Ao citar algo, use só o que está na transcrição ou no rascunho.
- Quando não faltar nada, ou só faltarem tópicos opcionais (tom, dicas, eliminatorios), faça um resumo falado
  curto com modo, senioridade, focos principais e duração, e pergunte se pode finalizar.
- Linguagem natural e simpática, em português do Brasil. Trate a recrutadora por "você".

A cada fala você recebe o rascunho atual, a lista do que falta (com a sugestão de pergunta de cada item)
e a transcrição. Responda somente com a fala da Nara, sem prefixo, sem aspas e sem explicações.`;

const DESCRICAO_MODO = {
  live_coding: "live coding, com código na IDE",
  system_design: "system design, desenhando a arquitetura num quadro",
} as const;

const JUSTIFICATIVA_MODO = {
  live_coding: "a vaga pede mais implementar e manter código",
  system_design: "a vaga pede desenhar e decidir a arquitetura de sistemas",
} as const;

/**
 * Primeira fala do agente, montada sem LLM. Se o classificador não tem certeza do formato,
 * pergunta em vez de sugerir.
 */
export function aberturaDoAgente(sessao: Sessao): string {
  const { roleTitle, mode } = sessao.rascunho;
  const saudacao = `Oi! Eu sou a Nara, e vou montar a entrevista da vaga de ${roleTitle} com você.`;
  if (sessao.classificacao.confirmar.includes("mode")) {
    return (
      `${saudacao} Você prefere uma entrevista de live coding, com código na IDE, ` +
      "ou de system design, desenhando a arquitetura num quadro?"
    );
  }
  return `${saudacao} Pelo que você colou, eu faria uma entrevista de ${DESCRICAO_MODO[mode]}, porque ${JUSTIFICATIVA_MODO[mode]}. Faz sentido pra você?`;
}

function resumirRascunho(r: Rascunho) {
  return {
    modo: r.mode,
    senioridade: r.seniority,
    confirmado: r.confirmado,
    focos: r.focus.map((f) => ({ area: f.area, peso: f.weight })),
    criterios: r.criteria.map((c) => ({ nome: c.name, area: c.focus, peso: c.weight })),
    duracaoMin: r.durationMin ?? "(padrão do modo)",
    notas: r.recruiterNotes || "(vazio)",
  };
}

function formatarTranscricao(turnos: Turno[]): string {
  return turnos.map((t, i) => `${i + 1}. ${t.role}: ${t.text}`).join("\n");
}

/** Mensagens da próxima fala: persona e regras no sistema; rascunho, pendências e transcrição no usuário. */
export function montarMensagensConversa(sessao: Sessao): Mensagem[] {
  const r = sessao.rascunho;
  const faltando = topicosDo(r).filter((t) => r.pendencias.includes(t.id));
  const listaFaltando =
    faltando.length > 0
      ? faltando.map((t) => `- ${t.id}: ${t.sugestao}`).join("\n")
      : "(nada: pode fazer o resumo e perguntar se pode finalizar)";

  const entrada = [
    `RASCUNHO ATUAL:\n${JSON.stringify(resumirRascunho(r), null, 2)}`,
    `O QUE FALTA (em ordem de prioridade, com a sugestão de pergunta):\n${listaFaltando}`,
    `TRANSCRIÇÃO ATÉ AGORA:\n${formatarTranscricao(sessao.transcricao)}`,
    "Escreva a próxima fala da Nara.",
  ].join("\n\n");

  return [
    { role: "system", content: PROMPT_SISTEMA_CONVERSA },
    { role: "user", content: entrada },
  ];
}

/** Tira o que não pode ir para a voz: markdown, aspas em volta e prefixo "Nara:". */
function limparFala(texto: string): string {
  return texto
    .replace(/^\s*nara\s*:\s*/i, "")
    .replace(/[*_#`]/g, "")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim();
}

export interface RespostaAgente {
  texto: string;
  provedor: string;
  model: string;
  /** Tempo somado das tentativas. */
  ms: number;
  fallback: boolean;
  tentativas: Tentativa[];
  /** Mensagens enviadas ao modelo. */
  mensagens: Mensagem[];
  /** Resposta crua do modelo, antes da limpeza. */
  respostaCrua: string;
}

/** Gera a próxima fala da Nara. Lança `ErroChat` se nenhum alvo responder. */
export async function responder(sessao: Sessao): Promise<RespostaAgente> {
  const mensagens = montarMensagensConversa(sessao);
  const resposta = await chat({
    alvos: alvosDaConversa(),
    messages: mensagens,
    temperature: TEMPERATURA_CONVERSA,
    maxTokens: MAX_TOKENS_CONVERSA,
  });
  const texto = limparFala(resposta.content);
  if (!texto) throw new ErroChat(`Nara devolveu fala vazia (${resposta.provedor}/${resposta.model})`, resposta.tentativas);

  return {
    texto,
    provedor: resposta.provedor,
    model: resposta.model,
    ms: resposta.ms,
    fallback: resposta.tentativas.some((t) => t.erro !== undefined),
    tentativas: resposta.tentativas,
    mensagens,
    respostaCrua: resposta.content,
  };
}
