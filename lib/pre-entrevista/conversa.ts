/**
 * Agente de conversa (Totti): conduz a configuração da entrevista falando com a recrutadora.
 *
 * O planejador (`planejador.ts`) escolhe o passo; aqui o modelo só escreve a fala desse passo.
 * A abertura sai sem LLM, a partir da classificação, para aparecer na hora. As falas seguintes
 * vêm do modelo: Featherless primeiro, OpenRouter depois, com 12 s por alvo.
 */
import type { FocusArea } from "@/lib/contracts";
import { AREAS, LIMIAR, NOME_AREA_FALA } from "./cobertura";
import { chat, ErroChat, type Alvo, type Mensagem, type Tentativa } from "./llm";
import type { Passo } from "./planejador";
import { DURACAO_PADRAO, type Rascunho, type Turno } from "./rascunho";
import type { Sessao } from "./sessoes";

const TEMPERATURA_CONVERSA = 0.5;
const MAX_TOKENS_CONVERSA = 400;
/** Conversa vai para a voz: Featherless tem 6 s antes de cair para a OpenRouter, que tem 8 s. */
const TIMEOUT_FEATHERLESS_MS = 6_000;
const TIMEOUT_OPENROUTER_MS = 8_000;

/** Featherless (principal) e OpenRouter (plano B). Cada alvo tem 12 s antes de passar adiante. */
function alvosDaConversa(): Alvo[] {
  return [
    {
      provedor: "featherless",
      model: process.env.CONVERSA_MODEL || "google/gemma-4-26B-A4B-it",
      timeoutMs: TIMEOUT_FEATHERLESS_MS,
    },
    {
      provedor: "openrouter",
      model: process.env.CONVERSA_FALLBACK_MODEL || "google/gemini-2.5-flash-lite",
      timeoutMs: TIMEOUT_OPENROUTER_MS,
    },
  ];
}

const PROMPT_SISTEMA_CONVERSA = `Você é a Totti, assistente que monta entrevistas técnicas conversando com a recrutadora.
Você soa como uma colega de RH experiente que conhece tecnologia: direta, simpática, sem enrolação.
A fala vai ser ouvida em voz alta.

Como falar:
- Cada fala tem no máximo 2 frases curtas e uma pergunta só. A exceção é o resumo final, que pode ter até 4 frases curtas.
- Reconheça a resposta dela em 2 a 4 palavras ("Boa.", "Faz sentido.", "Fechado.") ou vá direto para a pergunta.
  Não comece com "Entendi" e não repita a resposta dela palavra por palavra.
- Fale com as palavras dela e da vaga. Nunca use nomes internos (tecnico, pressao, escala_produto, uso_ia, criterio, passo)
  nem as expressões "domínio técnico", "escala e produto" e "pressão e adaptação".
- Não repita uma pergunta que aparece em "SUAS ÚLTIMAS FALAS", e não pergunte de novo o que ela já respondeu na transcrição.
- Só cite o que está na transcrição ou em "O QUE JÁ SE SABE". Nunca invente.
- Sem listas, markdown, asteriscos, aspas nem emojis. Português do Brasil, tratando a recrutadora por "você".
- Use "sou Totti" e evite adjetivos com gênero sobre você.

Exemplos de tom (não copie as palavras):
- "Boa. Num problema de algoritmo, o que faz você achar um candidato ótimo e não só bom?"
- "Certo. Você prefere que ele explique a complexidade, ou que trate entrada vazia sem ser lembrado?"
- "Fechado, então escalabilidade entra no foco e uso de IA fica de lado, beleza? E o que separa uma solução simples de uma que não aguenta volume?"

A cada fala você recebe o contexto da vaga, o que já se sabe, suas últimas falas, o PASSO desta fala e a transcrição.
Siga o PASSO. Responda somente com a fala da Totti, sem prefixo, sem aspas e sem explicações.`;

const FORMATO_FALA: Record<Rascunho["mode"], string> = {
  live_coding: "live coding, com código na IDE",
  system_design: "system design, desenhando a arquitetura num quadro",
};

const FORMATO_CURTO: Record<Rascunho["mode"], string> = { live_coding: "live coding", system_design: "system design" };

const SENIORIDADE_FALA: Record<Rascunho["seniority"], string> = { junior: "júnior", pleno: "pleno", senior: "sênior" };

/** Rótulo curto de cada área para a abertura, por padrão. */
const ROTULO_PADRAO: Record<FocusArea, string> = {
  tecnico: "algoritmos",
  pressao: "pressão",
  escala_produto: "escalabilidade",
  uso_ia: "uso de IA",
};

/** Quando a vaga usa estas palavras, o rótulo da área sai com o termo dela (a ordem é a prioridade). */
const ROTULOS_NA_VAGA: Record<FocusArea, Array<[RegExp, string]>> = {
  tecnico: [
    [/c[oó]digo limpo|qualidade de c[oó]digo|testes?/i, "código limpo"],
    [/estrutura[s]? de dados/i, "estruturas de dados"],
  ],
  pressao: [[/pressão|prazo|incidente|plant[aã]o|on-call|startup/i, "pressão"]],
  escala_produto: [
    [/escal|milh[õo]es|volume|distribu/i, "escalabilidade"],
    [/confiabil|disponibilidade|consist[êe]ncia|SLO/i, "confiabilidade"],
  ],
  uso_ia: [[/\bIA\b|LLM|agente|copilot|cursor|prompt/i, "uso de IA"]],
};

/** "a", "a e b", "a, b e c". */
function listar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Rótulos curtos das áreas do foco, do mais pesado para o menos pesado, com as palavras da vaga quando elas aparecem. */
function rotulosDoFoco(r: Rascunho, quantos: number): string[] {
  const vaga = r.jobDescription ?? "";
  const rotulos: string[] = [];
  const ordenadas = [...r.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area);
  for (const area of ordenadas) {
    const achados = ROTULOS_NA_VAGA[area].filter(([re]) => re.test(vaga)).map(([, nome]) => nome);
    for (const nome of achados.length ? achados : [ROTULO_PADRAO[area]]) {
      if (rotulos.length < quantos && !rotulos.includes(nome)) rotulos.push(nome);
    }
  }
  return rotulos;
}

/** Nomes naturais das áreas do foco, do mais pesado para o menos pesado. */
function nomesDoFoco(r: Rascunho, quantos = r.focus.length): string {
  return listar(
    [...r.focus]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, quantos)
      .map((f) => NOME_AREA_FALA[f.area]),
  );
}

/**
 * Primeira fala do agente, montada sem LLM: apresenta formato, senioridade e os dois focos principais
 * numa fala só. Se o classificador não tem certeza do formato, pergunta qual formato em vez de sugerir.
 */
export function aberturaDoAgente(sessao: Sessao): string {
  const r = sessao.rascunho;
  const saudacao = "Oi! Sou Totti, vou montar essa entrevista com você.";
  const focos = listar(rotulosDoFoco(r, 2));
  const nivel = SENIORIDADE_FALA[r.seniority];
  if (sessao.classificacao.confirmar.includes("mode")) {
    return `${saudacao} A vaga é de nível ${nivel}, olhando principalmente ${focos}. Você prefere live coding ou system design?`;
  }
  return `${saudacao} Pela vaga, pensei em ${FORMATO_CURTO[r.mode]} pra nível ${nivel}, olhando principalmente ${focos}. É isso, ou quer focar em outra coisa?`;
}

/** O que já se sabe, em linguagem natural (sem JSON e sem rótulos internos). */
function saberEmLinguagemNatural(sessao: Sessao): string {
  const r = sessao.rascunho;
  const sinal = (id: string) => sessao.plano.sinais[id] ?? 0;
  const pedidas = AREAS.filter((a) => !r.focus.some((f) => f.area === a) && sinal(`quer_${a}`) >= LIMIAR).map((a) => NOME_AREA_FALA[a]);
  const reduzidas = AREAS.filter((a) => sinal(`dispensa_${a}`) >= LIMIAR).map((a) => NOME_AREA_FALA[a]);

  const linhas = [
    `- formato: ${FORMATO_FALA[r.mode]}`,
    `- senioridade: ${SENIORIDADE_FALA[r.seniority]}`,
    `- foco, do mais pesado: ${nomesDoFoco(r)}`,
  ];
  if (pedidas.length) linhas.push(`- ela também quer avaliar: ${listar(pedidas)}`);
  if (reduzidas.length) linhas.push(`- ela disse que pesa menos ou não importa: ${listar(reduzidas)}`);
  linhas.push(
    r.durationMin
      ? `- duração: ${r.durationMin} min (ela disse)`
      : `- duração: não definida (padrão do formato: ${DURACAO_PADRAO[r.mode]} min)`,
  );
  if (r.recruiterNotes) linhas.push(`- notas da recrutadora: ${r.recruiterNotes}`);
  return linhas.join("\n");
}

/** Instrução específica para o passo escolhido pelo planejador. */
function instrucaoDoPasso(passo: Passo, sessao: Sessao): string {
  const r = sessao.rascunho;
  switch (passo.tipo) {
    case "confirmar_inicio":
      return (
        `Ainda não ficou claro se ela concorda com a proposta (${FORMATO_CURTO[r.mode]} pra nível ${SENIORIDADE_FALA[r.seniority]}, ` +
        `olhando ${listar(rotulosDoFoco(r, 2))}). Pergunte de forma leve se é isso ou se ela quer focar em outra coisa. Uma pergunta só.`
      );
    case "aprofundar":
      if (passo.motivo === "vaga") {
        return (
          `A última resposta dela sobre ${NOME_AREA_FALA[passo.area]} foi genérica. Não repita a pergunta anterior. ` +
          "Ofereça duas opções concretas, do que se vê na entrevista, em forma de pergunta curta, e deixe ela escolher. " +
          "Não julgue a resposta dela."
        );
      }
      return (
        `Pergunte o que separa um candidato ótimo de um candidato fraco em ${NOME_AREA_FALA[passo.area]}, ` +
        `de forma concreta e ligada ao cargo ${r.roleTitle}. Uma pergunta só.`
      );
    case "confirmar_mudanca_foco": {
      const partes: string[] = [];
      if (passo.entra.length) partes.push(`${listar(passo.entra.map((a) => NOME_AREA_FALA[a]))} passa a fazer parte da avaliação`);
      if (passo.sai.length)
        partes.push(`${listar(passo.sai.map((a) => NOME_AREA_FALA[a]))} deixa de ser prioridade ou pesa menos, como ela disse`);
      let texto = partes.length ? `Confirme a mudança numa frase, com as palavras dela: ${partes.join("; ")}.` : "";
      if (passo.duvida.length) {
        texto += ` Pergunte se ${listar(passo.duvida.map((a) => NOME_AREA_FALA[a]))} ainda contam para a avaliação ou se ficam de lado. Uma pergunta só.`;
      } else if (passo.proximo) {
        texto += ` Na mesma fala, emende a pergunta do próximo assunto: ${instrucaoDoPasso(passo.proximo, sessao)}`;
      }
      return texto;
    }
    case "resumo_final":
      if (passo.revisao) {
        return (
          "Ela pediu uma mudança depois do resumo. Confirme só o que mudou, em uma ou duas frases curtas, sem repetir o resumo inteiro. " +
          "Varie o fechamento, por exemplo: 'Anotado: sessenta minutos e sem dicas. Mais alguma coisa?' " +
          "ou 'Fechado, quarenta e cinco minutos então. Posso finalizar?'."
        );
      }
      return (
        "Faça o resumo falado, em no máximo 4 frases curtas: formato, senioridade e, numa frase natural com as palavras dela, " +
        "o que vai ser avaliado (por exemplo: 'vou olhar como ele lida com picos de tráfego e falhas no meio do pagamento, e se escreve código limpo'; " +
        "não copie esse exemplo). Depois diga a duração (se ela não disse, o padrão do formato). " +
        "Se ela não falou de tom nem de dicas, diga que a entrevista é amigável e que pode dar uma dica leve se o candidato travar: " +
        "quem dá a dica é a entrevista, não ela. Se ela citou algo eliminatório, inclua. " +
        'Termine com "quer mudar algo ou posso finalizar?".'
      );
    case "encerrar":
      return "Ela aprovou o resumo. Diga em uma frase curta que está tudo certo para revisar e confirmar na tela. Sem pergunta.";
  }
}

function formatarTranscricao(turnos: Turno[]): string {
  return turnos.map((t, i) => `${i + 1}. ${t.role}: ${t.text}`).join("\n");
}

/** Primeira linha da descrição da vaga, para dar contexto sem colar a vaga inteira. */
function primeiraLinha(texto: string | undefined): string {
  const linha =
    texto
      ?.split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return linha.length > 160 ? `${linha.slice(0, 160)}…` : linha;
}

/** Mensagens da próxima fala: persona e regras no sistema; contexto, passo e transcrição no usuário. */
export function montarMensagensConversa(sessao: Sessao, passo: Passo): Mensagem[] {
  const r = sessao.rascunho;
  const ultimas = sessao.transcricao
    .filter((t) => t.role === "agente")
    .slice(-2)
    .map((t) => `- ${t.text}`);

  const entrada = [
    `CONTEXTO DA VAGA: ${r.roleTitle}. ${primeiraLinha(r.jobDescription)}`.trimEnd(),
    `O QUE JÁ SE SABE:\n${saberEmLinguagemNatural(sessao)}`,
    `SUAS ÚLTIMAS FALAS (não repita essas perguntas):\n${ultimas.join("\n") || "(nenhuma)"}`,
    `PASSO DESTA FALA:\n${instrucaoDoPasso(passo, sessao)}`,
    `ÚLTIMAS 6 FALAS DA TRANSCRIÇÃO:\n${formatarTranscricao(sessao.transcricao.slice(-6))}`,
    "Escreva a próxima fala da Totti.",
  ].join("\n\n");

  return [
    { role: "system", content: PROMPT_SISTEMA_CONVERSA },
    { role: "user", content: entrada },
  ];
}

/** Tira o que não pode ir para a voz: markdown, aspas em volta e prefixo "Totti:". */
function limparFala(texto: string): string {
  return texto
    .replace(/^\s*totti\s*:\s*/i, "")
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

/** Gera a fala da Totti para o passo escolhido. Lança `ErroChat` se nenhum alvo responder. */
export async function responder(sessao: Sessao, passo: Passo): Promise<RespostaAgente> {
  const mensagens = montarMensagensConversa(sessao, passo);
  const resposta = await chat({
    alvos: alvosDaConversa(),
    messages: mensagens,
    temperature: TEMPERATURA_CONVERSA,
    maxTokens: MAX_TOKENS_CONVERSA,
  });
  const texto = limparFala(resposta.content);
  if (!texto) throw new ErroChat(`Totti devolveu fala vazia (${resposta.provedor}/${resposta.model})`, resposta.tentativas);

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
