/**
 * Agente de conversa (Totti): conduz a configuração da entrevista falando com a recrutadora.
 *
 * O planejador (`planejador.ts`) escolhe o passo; aqui o modelo escreve a fala e diz que movimento de conversa ela é
 * (`movimento`: seguir o passo, repetir, esclarecer ou responder a algo que a recrutadora disse).
 * Quando o Totti pediu uma decisão e a resposta dela não decidiu, o modelo recebe a decisão pendente no lugar do passo
 * e devolve a escolha no campo `decisao`. Depois que a fala é escrita, as travas de `responder` conferem o que é
 * inegociável (formato de voz, uma pergunta por fala, resumo montado do estado) e obedecem ao movimento: nenhuma
 * reescreve uma fala que repete, esclarece ou responde. O contrato está em `docs/totti-v2-conversa.md`, seção 9.
 *
 * A abertura sai sem LLM, a partir da classificação, para aparecer na hora. As falas seguintes
 * vêm do modelo: Featherless primeiro, OpenRouter depois, com 12 s por alvo.
 */
import { z } from "zod";
import type { FocusArea } from "@/lib/contracts";
import { areasEmJogo, AREAS, LIMIAR, nomeAreaFala } from "./cobertura";
import { CATALOGO, COMO_AVALIAMOS, mede, modoAlternativoQueMede, ROTULO_NAO_AVALIADO, semMedicaoNoFormato } from "./catalogo";
import { chat, ErroChat, extrairJson, type Alvo, type Mensagem, type Tentativa } from "./llm";
import { registrarEvento } from "./log";
import { descreverPasso, nivelEmAberto, VALORES_DE_DECISAO, type DecisaoPendente, type OferecerTradeoffPasso, type Passo } from "./planejador";
import { PERGUNTA_CONTEXTO, perguntaObvia, perguntasDaArea } from "./perguntas";
import { normalizarTexto } from "./frases";
import { LIMIAR_DUPLICADA, sobreposicao } from "@/lib/agente/guardas";
import { LINGUAGENS_IDE, nomesDasLinguagens } from "./linguagens";
import type { Preferencias } from "./preferencias";
import { DURACAO_PADRAO, duracaoDoRascunho, listar, type Rascunho, type Turno } from "./rascunho";
import type { Sessao } from "./sessoes";
import { afirmacaoDaMemoria, pedidoDaRegra, perguntaDaMemoria, regrasDoFormato, resumoDaMemoria } from "@/lib/squad-memory/fala";

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
    // Terceiro alvo: outro modelo da OpenRouter, diferente do flash-lite, para não cair junto com ele.
    { provedor: "openrouter", model: "openai/gpt-4o-mini", timeoutMs: TIMEOUT_OPENROUTER_MS },
  ];
}

const PROMPT_SISTEMA_CONVERSA = `Você é o Totti, assistente que monta entrevistas técnicas conversando com a recrutadora.
Você soa como um colega de RH experiente que conhece tecnologia: direto, simpático, sem enrolação.
A fala vai ser ouvida em voz alta.

Como falar:
- Cada fala tem no máximo 2 frases curtas e uma pergunta só (3 frases quando você responde a algo que ela perguntou e volta
  à sua pergunta). No resumo final, você escreve só as duas primeiras frases; o resto é acrescentado pelo sistema.
- Nunca comece com palavra de concordância ou reconhecimento: "Boa", "Fechado", "Certo", "Perfeito", "Ótimo", "Show", "Beleza",
  "Legal", "Combinado", "Entendi", "Entendido" ou "Faz sentido". Comece direto pelo conteúdo ou pela pergunta.
  A exceção é uma fala curta de movimento "responder" (ela pediu um tempo ou fez um comentário): ali um "Claro" ou "Certo" é a resposta natural.
- Não repita a resposta dela palavra por palavra.
- Nunca ofereça como opção algo que ela já disse. Se ela falou de escalabilidade, não a ofereça de novo como escolha.
- Fale com as palavras dela e da vaga. Nunca use nomes internos (tecnico, pressao, escala_produto, uso_ia, criterio, passo)
  nem as expressões "domínio técnico", "escala e produto" e "pressão e adaptação". Para a área de IA, diga "IA aplicada".
- Não repita por conta própria uma pergunta que aparece em "SUAS ÚLTIMAS FALAS", e não pergunte de novo o que ela já
  respondeu na transcrição. Se ela pedir para repetir, repita.
- Só cite o que está na transcrição ou em "O QUE JÁ SE SABE". Nunca invente.
- Sem listas, markdown, asteriscos, aspas nem emojis. Português do Brasil, tratando a recrutadora por "você".
- Você se apresenta só na abertura. Depois dela, nunca diga "sou Totti", "eu sou o Totti" nem repita seu nome.
  Quando falar de si, use o masculino (o Totti é ele).
- Varie as palavras: não repita de uma fala para a outra a mesma expressão de fechamento ou de tom.
- Para pressão, diga "lidar com pressão e imprevistos" ou "manter a calma quando dá errado". Nunca diga "alta demanda": isso é escala.
- Nunca pergunte o que separa ou diferencia um candidato ótimo de um fraco, o que destaca um bom candidato, nem nada cuja
  resposta seja óbvia ("o que destaca quem mantém a calma?" só rende "manter a calma"). Toda pergunta tem que decidir algo
  da entrevista: uma escolha entre duas posturas que times diferentes responderiam diferente.
- A recrutadora quase nunca é técnica. Não use jargão (complexidade, big O, casos de borda, edge case, escalabilidade
  horizontal) a menos que ela tenha usado: diga com palavras do dia a dia ("se fica lento com muitos dados", "entrada vazia").
- Nunca ofereça escolher o tema, o tipo ou o enunciado da questão ("lógica pura ou listas?", "otimização de rotas ou
  restrições de horário?"). A questão de algoritmo é sorteada do banco pelo nível e pelo que pesa, e não tem o tema da vaga.
  Pergunte sobre o que avaliar no candidato, nunca sobre qual problema dar.

O formato de uma boa pergunta: parte do que ela acabou de dizer ou de um detalhe concreto desta vaga, e oferece duas
posturas que times diferentes escolheriam diferente, em palavras de RH. Uma mudança que ela pediu é confirmada numa frase
curta antes da pergunta. Nunca reaproveite um cenário que não apareceu nesta conversa nem nesta vaga.

QUANDO A CONVERSA SAI DO ROTEIRO
Você conduz uma conversa, não um formulário. Antes de seguir o PASSO, leia a última fala dela: às vezes ela não respondeu
à sua pergunta, e seguir em frente deixaria uma escolha da entrevista sem dono. Nos casos abaixo, o movimento vem NO LUGAR
do PASSO desta fala; o PASSO fica para a fala seguinte.
- Ela pediu para repetir, não ouviu ou se perdeu ("pode repetir?", "oi? não ouvi", "quais eram as opções mesmo?"): diga de
  novo a PERGUNTA SUA EM ABERTO, igual ou mais simples (se o que estava em aberto era o resumo, diga o resumo de novo).
  Sem a pergunta ela não tem como decidir, e o plano sairia com um padrão que ninguém escolheu. Diga como pergunta, que
  termina em "?", e não como relato ("eu perguntei sobre..."): por voz, é o "?" que diz a ela que a vez é dela. Movimento "repetir".
- Ela não entendeu o que você quer saber ("como assim?", "não entendi a pergunta"): reformule em palavras de RH, ou diga em
  uma frase o que essa escolha muda na entrevista, sem jargão, e pergunte de novo. Dizer as mesmas palavras outra vez não
  ajuda quem não entendeu. A fala termina na pergunta, com "?", e não na explicação. Movimento "esclarecer".
- Ela pediu um tempo ("pera", "deixa eu abrir a vaga aqui"): aceite em poucas palavras e espere. A pergunta continua em
  aberto e você não cobra: quem pede um minuto e é cobrada na mesma hora sente que não foi ouvida. Movimento "responder".
- Ela perguntou outra coisa no meio ("e o resultado chega pra mim quando", "isso aparece pro candidato"): a fala
  vem transcrita da voz e quase nunca traz "?", então leia pelo sentido. Responda primeiro, com o que está em "O QUE JÁ
  SE SABE", ou diga com franqueza que não sabe; "vou anotar" não é resposta. Pergunta ignorada quebra a confiança dela no resto da conversa. Depois volte à pergunta em aberto, na mesma fala.
  Movimento "responder".
- Ela fez um comentário de conversa ("tá me ouvindo?", "desculpa, me distraí"): responda como gente, curto. Movimento "responder".
Se a última fala dela responde à sua pergunta, mesmo curta ou vaga, ou se o PASSO já manda responder a uma dúvida dela,
nada disso vale: siga o PASSO. Movimento "seguir".

QUANDO VOCÊ PEDIU UMA DECISÃO E A RESPOSTA NÃO DECIDIU
Às vezes você pediu uma decisão (troca de formato, nível da vaga, aprovação do resumo) e o sistema não conseguiu ler a
resposta dela como escolha. A entrada traz então "DECISÃO PENDENTE" no lugar do PASSO, e quem lê a fala dela é você:
se ela escolheu com outras palavras, registre a escolha no campo "decisao"; se pediu um tempo, aceite em poucas palavras;
se perguntou algo ou pediu recomendação, responda com o que está na entrada e pergunte de novo. Nunca escolha por ela sem
dizer: decisão que ela não tomou e ninguém avisou vira surpresa na entrevista. Sem certeza, "decisao" é "adiar", e a
pergunta continua em aberto.

A cada fala você recebe o contexto da vaga, o que já se sabe, suas últimas falas, a sua pergunta em aberto, o PASSO desta
fala (ou a DECISÃO PENDENTE) e a transcrição.

FORMATO DA RESPOSTA
Responda com um objeto JSON e nada mais: {"fala": "...", "movimento": "seguir"}
- "fala": o que o Totti diz, em texto puro, sem prefixo e sem explicações.
- "movimento": "seguir" (a fala executa o PASSO), "repetir" (ela pediu e a fala traz de novo a pergunta ou o resumo em aberto),
  "esclarecer" (ela não entendeu e a fala reformula ou explica o que você quer saber) ou "responder" (a fala responde a algo
  que ELA perguntou ou comentou). Na dúvida, "seguir".
- "decisao": só quando a entrada traz DECISÃO PENDENTE; os valores possíveis vêm nela.`;

/**
 * Que movimento de conversa é a fala do Totti (contrato comum da issue #22). Quem decide é o modelo.
 *  - `repetir`: ela pediu para repetir, e a fala traz a mesma pergunta (ou o mesmo resumo) que estava em aberto;
 *  - `esclarecer`: ela não entendeu a pergunta, e a fala a reformula ou explica o que se quer saber, em palavras de RH;
 *  - `responder`: a fala responde a algo que ELA perguntou ou comentou (dúvida, "tá me ouvindo?", pedido de tempo);
 *  - `seguir`: todo o resto, ou seja, executar o passo do planejador. Campo ausente vale `seguir`.
 */
export const Movimento = z.enum(["repetir", "esclarecer", "responder", "seguir"]);
export type Movimento = z.infer<typeof Movimento>;

/** Saída do modelo. `movimento` é opcional, e um valor que não existe conta como ausente. */
const SaidaDoModelo = z.object({
  fala: z.string(),
  movimento: Movimento.optional().catch(undefined),
  /** Só quando havia uma decisão pendente. Quem confere o valor é o turno (ver `VALORES_DE_DECISAO`). */
  decisao: z.string().optional().catch(undefined),
});

/** JSON cortado no meio (limite de tokens): ainda dá para aproveitar o que veio do campo "fala". */
const RE_FALA_EM_JSON_CORTADO = /"fala"\s*:\s*"((?:[^"\\]|\\.)*)/;

/** Resposta que começa como objeto JSON (com ou sem cerca de código). */
const RE_COMECA_COMO_JSON = /^\s*(```(json)?\s*)?\{/i;

/** Chaves que o modelo às vezes usa no lugar de "fala". */
const CHAVES_DA_FALA = ["fala", "texto", "text", "resposta"] as const;

/** Desfaz os escapes de uma string JSON cortada no meio (inclusive \uXXXX); um escape incompleto no fim é descartado. */
function desescaparStringJson(trecho: string): string {
  const semEscapeIncompleto = trecho.replace(/\\u[0-9a-fA-F]{0,3}$/, "");
  try {
    return JSON.parse(`"${semEscapeIncompleto}"`) as string;
  } catch {
    return semEscapeIncompleto.replace(/\\(["\\/])/g, "$1");
  }
}

/**
 * Lê a resposta do modelo: o JSON `{ fala, movimento }`, com ou sem cerca de código. Texto puro continua válido
 * (a resposta inteira é a fala), e sem o campo `movimento` vale `seguir`. Um JSON de onde não sai fala nenhuma
 * devolve fala vazia (quem chama trata como erro), para o JSON cru nunca ir para a voz. Função pura.
 */
export function lerSaidaDoModelo(conteudo: string): { fala: string; movimento: Movimento; decisao?: string } {
  let objeto: unknown;
  try {
    objeto = extrairJson(conteudo);
  } catch {
    // Não é JSON inteiro: segue como JSON cortado ou como texto puro.
  }
  if (objeto !== undefined) {
    const lida = SaidaDoModelo.safeParse(objeto);
    if (lida.success) {
      const { fala, movimento, decisao } = lida.data;
      return { fala, movimento: movimento ?? "seguir", ...(decisao ? { decisao } : {}) };
    }
    // JSON válido com a fala noutra chave ou de outro tipo: aproveita a chave que der, ou fala vazia.
    const registro = typeof objeto === "object" && objeto !== null ? (objeto as Record<string, unknown>) : {};
    const fala = CHAVES_DA_FALA.map((chave) => registro[chave]).find((v): v is string => typeof v === "string") ?? "";
    const movimento = Movimento.safeParse(registro.movimento);
    const decisao = typeof registro.decisao === "string" && registro.decisao ? registro.decisao : undefined;
    return { fala, movimento: movimento.success ? movimento.data : "seguir", ...(decisao ? { decisao } : {}) };
  }
  const cortado = conteudo.match(RE_FALA_EM_JSON_CORTADO);
  if (cortado) return { fala: desescaparStringJson(cortado[1]).replace(/\s*\n\s*/g, " ").trim(), movimento: "seguir" };
  if (RE_COMECA_COMO_JSON.test(conteudo)) return { fala: "", movimento: "seguir" };
  return { fala: conteudo, movimento: "seguir" };
}

/**
 * Última pergunta de uma fala: a última frase terminada em "?". Frase acaba em ".", "!" ou "?" seguido de espaço,
 * para não cortar em "Node.js" nem em "R$ 1.000". Função pura.
 */
export function ultimaPergunta(texto: string): string | undefined {
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((frase) => frase.trim())
    .filter((frase) => frase.endsWith("?"))
    .at(-1);
}

/**
 * A pergunta do Totti que ficou sem resposta: a última pergunta da última fala dele que tem pergunta
 * (depois de um resumo, a pergunta de fechamento). Uma fala sem pergunta ("Claro, sem pressa.") não fecha a
 * pergunta de antes; a fala de encerramento fecha, porque só vem depois que ela aprovou o resumo. Função pura.
 */
export function perguntaEmAberto(transcricao: Turno[]): string | undefined {
  for (let i = transcricao.length - 1; i >= 0; i--) {
    const turno = transcricao[i];
    if (turno.role !== "agente") continue;
    if (FALAS_DE_ENCERRAMENTO.includes(turno.text)) return undefined;
    const pergunta = ultimaPergunta(turno.text);
    if (pergunta) return pergunta;
  }
  return undefined;
}

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
  uso_ia: "IA aplicada",
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
  uso_ia: [[/\bIA\b|LLM|agente|copilot|cursor|prompt/i, "IA aplicada"]],
};

/** Como cada área aparece na oferta de troca: "ele mostra bem X" (se o formato mede) e "não mede Y" (se não mede). */
const MOSTRA_BEM: Record<FocusArea, string> = {
  tecnico: "algoritmos e qualidade de código",
  pressao: "lidar com pressão e imprevistos",
  escala_produto: "escalabilidade",
  uso_ia: "IA aplicada",
};
const NAO_MEDE_FALA: Record<FocusArea, string> = {
  tecnico: "algoritmos e qualidade de código",
  pressao: "como ele lida com pressão e imprevistos",
  escala_produto: "escalabilidade",
  uso_ia: "se a pessoa sabe construir com IA",
};
/** Complemento da alternativa, quando o outro formato mede a área de um jeito específico. */
const COMPLEMENTO_OFERTA: Partial<Record<FocusArea, string>> = { uso_ia: "desenhando uma solução com IA" };

/** Rótulos curtos das áreas do foco, do mais pesado para o menos pesado, com as palavras da vaga quando elas aparecem. */
function rotulosDoFoco(r: Rascunho, quantos: number): string[] {
  const vaga = r.jobDescription ?? "";
  const rotulos: string[] = [];
  const ordenadas = [...r.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area);
  // Área que o formato não mede não entra em "olhando principalmente": a fala diz à parte que ela fica de fora.
  const medidas = ordenadas.filter((a) => mede(r.mode, a));
  for (const area of medidas.length ? medidas : ordenadas) {
    const achados = ROTULOS_NA_VAGA[area].filter(([re]) => re.test(vaga)).map(([, nome]) => nome);
    // Em system design a área técnica é o desenho, não algoritmos (ver `nomeAreaFala`).
    const padrao = area === "tecnico" && r.mode === "system_design" ? "arquitetura" : ROTULO_PADRAO[area];
    for (const nome of achados.length ? achados : [padrao]) {
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
      .map((f) => nomeAreaFala(f.area, r.mode)),
  );
}

/** Área que o formato atual não mede e que outro formato mede: a oferta de troca da abertura. Função pura. */
export function tradeoffDaAbertura(sessao: Sessao): OferecerTradeoffPasso | undefined {
  // Com o formato incerto, a abertura pergunta o formato. A oferta de troca vem depois, pelo planejador.
  if (sessao.classificacao.confirmar.includes("mode")) return undefined;
  const r = sessao.rascunho;
  const duasDeMaiorPeso = [...r.focus]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((f) => f.area);
  for (const area of duasDeMaiorPeso) {
    if (mede(r.mode, area)) continue;
    const alternativo = modoAlternativoQueMede(r.mode, area);
    if (alternativo) return { tipo: "oferecer_tradeoff", area, modoAlternativo: alternativo };
  }
  return undefined;
}

/**
 * Frase da oferta de troca na abertura: o que o formato mostra bem, o que não mede e a alternativa, numa frase só.
 * O nível entra só quando já está confirmado (senão a pergunta de nível vem no fim da abertura). Função pura.
 */
function fraseDoTradeoff(r: Rascunho, oferta: OferecerTradeoffPasso, nivel?: string): string {
  const duasDeMaiorPeso = [...r.focus]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((f) => f.area);
  const mostradas = duasDeMaiorPeso.filter((a) => mede(r.mode, a)).map((a) => MOSTRA_BEM[a]);
  const frente = mostradas.length ? `que mostra bem ${listar(mostradas)} mas ` : "";
  const complemento = COMPLEMENTO_OFERTA[oferta.area];
  const alternativa = `${FORMATO_CURTO[oferta.modoAlternativo]}${complemento ? ` ${complemento}` : ""}`;
  return (
    `Pensei em ${FORMATO_CURTO[r.mode]}${nivel ? ` pra nível ${nivel}` : ""}, ${frente}não mede ${NAO_MEDE_FALA[oferta.area]}; ` +
    `se isso for central, ${alternativa} avalia melhor.`
  );
}

/**
 * Frase da abertura para a área do foco que o formato não mede e que nenhum outro formato disponível mede:
 * ela fica pra próxima etapa, sem oferta de troca. Função pura.
 */
function fraseSemMedicao(r: Rascunho): string | undefined {
  const area = [...r.focus]
    .sort((a, b) => b.weight - a.weight)
    .map((f) => f.area)
    .find((a) => semMedicaoNoFormato(r.mode, a));
  if (!area) return undefined;
  const frase = `${FORMATO_CURTO[r.mode]} não mede ${NAO_MEDE_FALA[area]}, então isso fica pra próxima etapa.`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

/**
 * Primeira fala do agente, montada sem LLM, em até 4 frases: saudação com o cargo, o resumo da vaga (se houver),
 * o formato e o foco (ou o trade-off, se o formato não mede uma área de peso) e a pergunta final.
 * Nível não dito na vaga vira pergunta, não afirmação. Se o formato não está claro, a pergunta é o formato.
 */
/** As regras da squad que valem no formato atual da conversa. */
function memoriaDoFormato(sessao: Sessao) {
  return regrasDoFormato(
    sessao.regrasSquad,
    CATALOGO[sessao.rascunho.mode].map((c) => c.id),
  );
}

export function aberturaDoAgente(sessao: Sessao): string {
  const r = sessao.rascunho;
  const memoria = memoriaDoFormato(sessao);
  const afirmacao = afirmacaoDaMemoria(memoria);
  const frases = [`Oi! Sou Totti, vou montar a entrevista de ${r.roleTitle} com você.`];
  // O resumo entra no meio da frase: a primeira letra vai para minúscula, sem mexer em sigla (APIs, iOS).
  const resumo = sessao.resumoVaga?.replace(/^([A-ZÀ-Ú])(?=[a-zà-ú])/, (letra) => letra.toLowerCase());
  if (resumo) frases.push(`Vi que a vaga gira em torno de ${resumo}.`);

  const incerto = nivelEmAberto(sessao.plano, sessao.classificacao.confirmar, r.confirmado.seniority);
  const nivel = SENIORIDADE_FALA[r.seniority];
  const focos = listar(rotulosDoFoco(r, 2));
  const perguntaNivel = PERGUNTA_DE_NIVEL;

  if (sessao.classificacao.confirmar.includes("mode")) {
    frases.push(incerto ? `Olhando principalmente ${focos}.` : `A vaga é de nível ${nivel}, olhando principalmente ${focos}.`);
    if (afirmacao) frases.push(afirmacao);
    frases.push(
      incerto
        ? `Você prefere live coding ou system design, e qual o nível: ${perguntaNivel}`
        : "Você prefere live coding ou system design?",
    );
    return frases.join(" ");
  }
  const oferta = tradeoffDaAbertura(sessao);
  if (oferta) {
    frases.push(fraseDoTradeoff(r, oferta, incerto ? undefined : nivel));
    if (afirmacao) frases.push(afirmacao);
    frases.push(incerto ? `Qual faz mais sentido, e qual o nível: ${perguntaNivel}` : "Qual faz mais sentido?");
    return frases.join(" ");
  }
  frases.push(
    incerto
      ? `Pensei em ${FORMATO_CURTO[r.mode]}, olhando principalmente ${focos}.`
      : `Pensei em ${FORMATO_CURTO[r.mode]} pra nível ${nivel}, olhando principalmente ${focos}.`,
  );
  const semMedicao = fraseSemMedicao(r);
  if (semMedicao) frases.push(semMedicao);
  // Com memória da squad, a pergunta final confirma o plano e o que o time pediu da última vez, numa pergunta só.
  if (incerto) {
    if (afirmacao) frases.push(afirmacao);
    frases.push(`O nível não está claro na vaga: ${perguntaNivel}`);
  } else {
    frases.push(perguntaDaMemoria(memoria) ?? "É isso, ou quer focar em outra coisa?");
  }
  return frases.join(" ");
}

/** O que já se sabe, em linguagem natural (sem JSON e sem rótulos internos). */
function saberEmLinguagemNatural(sessao: Sessao): string {
  const r = sessao.rascunho;
  const sinal = (id: string) => sessao.plano.sinais[id] ?? 0;
  // Área já decidida (trocada, para a próxima etapa ou deixada de lado) não aparece como "quer avaliar".
  const decididas = new Set<string>(Object.keys(sessao.plano.decisoesTradeoff));
  const pedidas = AREAS.filter((a) => !decididas.has(a) && !r.focus.some((f) => f.area === a) && sinal(`quer_${a}`) >= LIMIAR).map(
    (a) => nomeAreaFala(a, r.mode),
  );
  const reduzidas = AREAS.filter((a) => sinal(`dispensa_${a}`) >= LIMIAR).map((a) => nomeAreaFala(a, r.mode));

  const nivelAberto = nivelEmAberto(sessao.plano, sessao.classificacao.confirmar, r.confirmado.seniority);
  const linhas = [
    `- formato: ${FORMATO_FALA[r.mode]}`,
    nivelAberto
      ? `- senioridade: ainda não confirmada, a vaga não diz o nível (estimativa: ${SENIORIDADE_FALA[r.seniority]})`
      : `- senioridade: ${SENIORIDADE_FALA[r.seniority]}`,
    `- foco, do mais pesado: ${nomesDoFoco(r)}`,
  ];
  if (pedidas.length) linhas.push(`- ela também quer avaliar: ${listar(pedidas)}`);
  if (reduzidas.length) linhas.push(`- ela disse que pesa menos ou não importa: ${listar(reduzidas)}`);
  const foraFalado = naoAvaliadoParaFalar(sessao);
  if (foraFalado.length) linhas.push(`- fica de fora desta entrevista: ${listar(foraFalado)}`);
  linhas.push(
    r.durationMin
      ? `- duração: ${r.durationMin} min (ela disse)`
      : `- duração: não definida (padrão do formato: ${DURACAO_PADRAO[r.mode]} min)`,
  );
  if (r.recruiterNotes) linhas.push(`- notas da recrutadora: ${r.recruiterNotes}`);
  const memoria = memoriaDoFormato(sessao);
  if (memoria.length) {
    linhas.push(
      `- critérios que o time já ensinou ao Totti (já entram na entrevista; o código fala deles, não repita): ${listar(memoria.map((m) => pedidoDaRegra(m.text)))}`,
    );
  }
  return linhas.join("\n");
}

/** Lembrete em todo passo antes do resumo: duração, tom e dicas não são perguntados, só entram no resumo como padrão. */
const SEM_LOGISTICA = "Não pergunte duração, tom nem dicas: isso fica para o resumo, que usa o padrão do formato.";

/** Instrução específica para o passo escolhido pelo planejador. */
function instrucaoDoPasso(passo: Passo, sessao: Sessao): string {
  const r = sessao.rascunho;
  switch (passo.tipo) {
    case "confirmar_inicio":
      return (
        `Ainda não ficou claro se ela concorda com a proposta (${FORMATO_CURTO[r.mode]} pra nível ${SENIORIDADE_FALA[r.seniority]}, ` +
        `olhando ${listar(rotulosDoFoco(r, 2))}). Pergunte de forma leve se é isso ou se ela quer focar em outra coisa. Uma pergunta só.`
      );
    case "perguntar_nivel":
      return (
        `A vaga não deixa o nível claro e ela ainda não disse. Pergunte só o nível, em uma frase curta: ` +
        `'É júnior, pleno ou sênior?' (com as palavras da conversa). Não faça outra pergunta nem fale de formato ou foco.`
      );
    case "aprofundar": {
      // Depois de uma troca de formato, a primeira fala confirma a troca e já faz a pergunta.
      const confirma = passo.confirmaTroca
        ? `Confirme a troca em 1 frase, com as palavras dela (ex.: 'Fechado, então ${FORMATO_CURTO[passo.confirmaTroca]}.'), e na mesma fala siga o passo abaixo. `
        : "";
      const area = nomeAreaFala(passo.area, r.mode);
      // O padrão do catálogo já é avaliado: perguntar isso de novo só rende o óbvio.
      const padrao = CATALOGO[r.mode]
        .filter((c) => c.focus === passo.area)
        .map((c) => c.description)
        .join(" ");
      const opcoes = perguntasDoBanco(sessao, passo.area)
        .map((p) => `- ${p.texto}`)
        .join("\n");
      return (
        confirma +
        `Assunto: ${area}, na vaga de ${r.roleTitle}. Faça UMA pergunta que decida algo da entrevista nesse assunto.\n` +
        `O que a entrevista já avalia por padrão (não pergunte isso, a resposta seria óbvia): ${padrao}\n` +
        "Se a última fala dela trouxe algo concreto desse assunto, pergunte a escolha que falta sobre aquilo, com as palavras dela " +
        "(ex.: ela citou um problema que a vaga enfrenta; pergunte qual de dois jeitos de errar nele é pior pra eles). " +
        `Senão, use a pergunta abaixo que mais combina com a vaga, adaptando as palavras:\n${opcoes}\n` +
        `A pergunta oferece duas opções concretas que alguém de RH entende. ${SEM_LOGISTICA}`
      );
    }
    case "perguntar_contexto":
      return (
        "Pergunte o que a descrição da vaga não diz e só ela sabe: se tem algo que reprova o candidato direto, ou o que fez uma " +
        `contratação passada não dar certo. Uma pergunta só, curta e natural (ex.: '${PERGUNTA_CONTEXTO}'). ${SEM_LOGISTICA}`
      );
    case "informar_formato_indisponivel":
      return (
        "Ela pediu system design, que ainda não está disponível nesta versão. Diga isso numa frase curta, sem pedir desculpa, " +
        `e que a entrevista segue em ${FORMATO_CURTO[r.mode]}. Depois pergunte se ela prefere seguir assim ou mudar alguma coisa. Uma pergunta só.`
      );
    case "oferecer_tradeoff": {
      const complemento = COMPLEMENTO_OFERTA[passo.area] ? ` ${COMPLEMENTO_OFERTA[passo.area]}` : "";
      return (
        `Diga, numa frase, que ${FORMATO_CURTO[r.mode]} não consegue medir ${NAO_MEDE_FALA[passo.area]}. ` +
        `Depois ofereça 3 caminhos numa fala só: trocar pra ${FORMATO_CURTO[passo.modoAlternativo]}${complemento}, ` +
        "deixar pra próxima etapa do processo, ou seguir sem. Termine com 'O que prefere?'. Não faça outra pergunta."
      );
    }
    case "confirmar_mudanca_foco": {
      const partes: string[] = [];
      if (passo.entra.length) partes.push(`${listar(passo.entra.map((a) => nomeAreaFala(a, r.mode)))} passa a fazer parte da avaliação`);
      if (passo.sai.length)
        partes.push(`${listar(passo.sai.map((a) => nomeAreaFala(a, r.mode)))} deixa de ser prioridade ou pesa menos, como ela disse`);
      let texto = partes.length ? `Confirme a mudança numa frase, com as palavras dela: ${partes.join("; ")}.` : "";
      if (passo.duvida.length) {
        texto += ` Pergunte se ${listar(passo.duvida.map((a) => nomeAreaFala(a, r.mode)))} ainda contam para a avaliação ou se ficam de lado. Uma pergunta só. ${SEM_LOGISTICA}`;
      } else if (passo.proximo) {
        texto += ` Na mesma fala, emende a pergunta do próximo assunto: ${instrucaoDoPasso(passo.proximo, sessao)}`;
      }
      return texto;
    }
    case "resumo_final":
      if (passo.revisao) {
        return (
          "Ela pediu uma mudança depois do resumo. Confirme só o que mudou, numa frase curta com as palavras dela, sem repetir o resumo. " +
          "Se a mudança for sobre dicas, diga 'sem dicas' ou 'com uma dica leve se ele travar'. " +
          "Depois pergunte se pode finalizar. Não faça outra pergunta."
        );
      }
      // Só as duas primeiras frases vêm do modelo. Duração, tom, dicas e o fechamento são acrescentados pelo código.
      return (
        "Escreva só as duas primeiras frases do resumo, em voz alta: (1) formato e senioridade; (2) o que vai ser avaliado, " +
        "numa frase natural com as palavras dela (por exemplo: 'vou olhar como ele lida com picos de tráfego e falhas no meio do pagamento'; " +
        "não copie esse exemplo). Se ela citou algo eliminatório, inclua na segunda frase. " +
        "Não fale de tom, de duração nem de dicas, e não faça pergunta: o sistema acrescenta essas partes."
      );
    case "responder_duvida":
      return [
        "Ela fez uma pergunta ou dúvida sobre a entrevista (formato, avaliação ou processo). A resposta tem no máximo 2 frases, " +
          "concretas e honestas, usando só o que está abaixo; não prometa nada além disso. " +
          "Se ela discordou de algo, não concorde com ela: explique como a entrevista é. " +
          "Se ela pediu sua opinião ou recomendação ('o que você acha?', 'o que eu devo procurar?'), recomende algo concreto, " +
          "do que a entrevista observa abaixo, em vez de devolver a pergunta. " +
          "Se a dúvida for sobre algo que você não sabe, diga isso com franqueza e ofereça um padrão, por exemplo 'a gente segue com o que já combinamos'.",
        `COMO AS ÁREAS EM JOGO SÃO AVALIADAS (${FORMATO_CURTO[r.mode]}):\n${comoAvaliamosDoFoco(sessao)
          .map((f) => `- ${f}`)
          .join("\n")}`,
        // Os critérios inteiros: sem eles, "pedir ajuda" virava pressão, quando é o critério de comunicação.
        `CRITÉRIOS QUE A ENTREVISTA JÁ OBSERVA (use para mostrar onde o que ela quer já entra; não ofereça trocar um pelo outro):\n${CATALOGO[
          r.mode
        ]
          .map((c) => `- ${c.name}: ${c.description}`)
          .join("\n")}`,
        `Depois, em uma pergunta curta, retome o que ficou sem resposta: ${perguntaParaRetomar(passo.retomar, sessao)} ` +
          "É a mesma pergunta de antes: pode dizê-la com as mesmas palavras ou com outras mais simples, e termine perguntando o que ela prefere.",
      ].join("\n\n");
    case "encerrar":
      // Não passa pelo modelo: a fala de encerramento é fixa (ver `falaDeEncerramento`).
      return "Fala fixa, sem modelo.";
  }
}

/**
 * Instrução quando o Totti pediu uma decisão e a resposta dela não decidiu (ver `decisaoPendente` no planejador).
 * Vai no lugar do passo: o modelo lê a fala dela e devolve a escolha no campo `decisao`, ou adia.
 */
function instrucaoDaDecisao(pendente: DecisaoPendente, sessao: Sessao): string {
  const r = sessao.rascunho;
  const valores = VALORES_DE_DECISAO[pendente.tipo].map((v) => `"${v}"`).join(", ");
  const comum =
    "- Ela pediu um tempo: aceite em poucas palavras e espere (\"decisao\": \"adiar\").\n" +
    "- Ela pediu para repetir ou não entendeu: repita ou explique, como em QUANDO A CONVERSA SAI DO ROTEIRO (\"decisao\": \"adiar\").";
  switch (pendente.tipo) {
    case "troca": {
      const { area, modoAlternativo } = pendente.oferta;
      const nome = NAO_MEDE_FALA[area];
      return (
        `DECISÃO PENDENTE: troca de formato. Você disse que ${FORMATO_CURTO[r.mode]} não mede ${nome} e ofereceu três caminhos: ` +
        `trocar pra ${FORMATO_CURTO[modoAlternativo]}, deixar isso pra próxima etapa do processo, ou seguir sem. ` +
        `A última fala dela não foi lida como escolha. Leia você e responda com "decisao" (${valores}):\n` +
        `- Ela escolheu um caminho, mesmo com outras palavras: "trocar", "proxima_etapa" ou "seguir_sem". Se ela quis ficar em ` +
        `${FORMATO_CURTO[r.mode]} sem dizer o que fazer com isso, vale "proxima_etapa". A fala é só uma confirmação curta do que ficou; ` +
        "o sistema faz a próxima pergunta.\n" +
        `- Ela perguntou algo ou pediu sua recomendação: responda com o que está abaixo, recomende um caminho se ela pediu, e pergunte ` +
        'de novo qual ela prefere ("decisao": "adiar").\n' +
        '- A fala dela não tratou disso: diga os três caminhos de novo, curto, e pergunte qual ela prefere ("decisao": "adiar").\n' +
        `${comum}\n` +
        `O QUE CADA FORMATO MOSTRA: em ${FORMATO_CURTO[modoAlternativo]}, ${COMO_AVALIAMOS[modoAlternativo][area]} Em ${FORMATO_CURTO[r.mode]}, isso não é medido.`
      );
    }
    case "nivel": {
      const estimativa = SENIORIDADE_FALA[r.seniority];
      return (
        `DECISÃO PENDENTE: nível da vaga. Você perguntou se é júnior, pleno ou sênior; a vaga não diz, e a estimativa é ${estimativa}. ` +
        `A última fala dela não disse o nível de forma clara. Leia você e responda com "decisao" (${valores}):\n` +
        '- Ela disse o nível com outras palavras ("mais experiente", "começando agora"): "junior", "pleno" ou "senior". ' +
        "A fala é só uma confirmação curta; o sistema faz a próxima pergunta.\n" +
        `- Ela não sabe, tanto faz, ou pediu que você decida: "estimativa". O sistema avisa que segue com ${estimativa} e que dá pra mudar na revisão.\n` +
        '- Ela perguntou algo: responda e pergunte o nível de novo ("decisao": "adiar").\n' +
        '- A fala dela não tratou disso: pergunte só o nível de novo, em uma frase ("decisao": "adiar").\n' +
        comum
      );
    }
    case "resumo":
      return (
        "DECISÃO PENDENTE: aprovação do resumo. Você fez o resumo e perguntou se pode finalizar. A última fala dela não aprovou " +
        `nem pediu uma mudança clara. Leia você e responda com "decisao" (${valores}):\n` +
        '- Ela aprovou com outras palavras: "finalizar". O sistema encerra; a fala pode ser uma frase curta.\n' +
        '- Ela pediu uma mudança: confirme só o que mudou, numa frase, e pergunte se pode finalizar ("mudar").\n' +
        "- Ela perguntou algo (por exemplo, quanto ficou a duração): responda com o que está abaixo e em 'O QUE JÁ SE SABE', " +
        'e pergunte de novo se pode finalizar ("decisao": "adiar").\n' +
        `${comum}\n` +
        "Não invente mudança que ela não pediu e não dê a conversa por encerrada sem ela aprovar.\n" +
        `O RESUMO EM VIGOR: ${FORMATO_CURTO[r.mode]} pra nível ${SENIORIDADE_FALA[r.seniority]}. ${fraseLogistica(r, sessao.preferencias)}`
      );
  }
}

/** A pergunta do nível, como o Totti a faz na abertura e no passo `perguntar_nivel`. */
const PERGUNTA_DE_NIVEL = "é júnior, pleno ou sênior?";
const RE_PERGUNTA_DE_NIVEL = /j[úu]nior.*pleno.*s[êe]nior/i;

/** O texto é uma pergunta que pede o nível. Fica junto de `PERGUNTA_DE_NIVEL` para os dois não se afastarem. Função pura. */
export function pedeONivel(texto: string | undefined): boolean {
  return RE_PERGUNTA_DE_NIVEL.test(texto ?? "");
}

/**
 * Fala de reserva quando o modelo falha ou demora com uma decisão pendente: nada é decidido, e a pergunta é refeita,
 * curta. Função pura.
 */
export function falaDeReserva(pendente: DecisaoPendente): string {
  switch (pendente.tipo) {
    case "troca":
      return `Não peguei qual caminho você prefere: trocar pra ${FORMATO_CURTO[pendente.oferta.modoAlternativo]}, deixar pra próxima etapa ou seguir sem?`;
    case "nivel":
      return "Não peguei o nível: é júnior, pleno ou sênior?";
    case "resumo":
      return fechamentoDoResumo(0);
  }
}

/** Frase que avisa que a conversa segue com a estimativa do nível. Vem antes da próxima pergunta. Função pura. */
export function fraseNivelPorEstimativa(nivel: Rascunho["seniority"]): string {
  return `Sigo com nível ${SENIORIDADE_FALA[nivel]} então; dá pra mudar na revisão.`;
}

/** Perguntas decisivas da área para esta vaga: as que a vaga e as falas dela puxam vêm primeiro. */
function perguntasDoBanco(sessao: Sessao, area: FocusArea) {
  const r = sessao.rascunho;
  const falasDela = sessao.transcricao
    .filter((t) => t.role === "recrutadora")
    .map((t) => t.text)
    .join(" ");
  return perguntasDaArea(r.mode, area, r.seniority, `${r.jobDescription ?? ""} ${falasDela}`);
}

/**
 * Troca a pergunta da fala por `pergunta`, mantendo as frases de antes dela (ex.: a confirmação de uma troca de formato).
 * Função pura.
 */
export function trocarPergunta(texto: string, pergunta: string): string {
  const i = texto.indexOf("?");
  const fim = i < 0 ? texto.length : i;
  const inicioDaFrase = Math.max(texto.lastIndexOf(".", fim), texto.lastIndexOf("!", fim));
  const antes = i < 0 ? texto.trim() : inicioDaFrase >= 0 ? texto.slice(0, inicioDaFrase + 1).trim() : "";
  return [antes, pergunta].filter(Boolean).join(" ");
}

/** Frases de como as duas áreas mais pesadas em jogo são observadas no formato atual. */
function comoAvaliamosDoFoco(sessao: Sessao): string[] {
  const r = sessao.rascunho;
  const emJogo = areasEmJogo(r.focus, sessao.plano.sinais, sessao.plano.decisoesTradeoff);
  const peso = (a: FocusArea) => r.focus.find((f) => f.area === a)?.weight ?? 0;
  const areas = (emJogo.length ? emJogo : r.focus.map((f) => f.area)).sort((a, b) => peso(b) - peso(a)).slice(0, 2);
  return areas.map((a) => COMO_AVALIAMOS[r.mode][a]);
}

/** A pergunta que um passo fez, em forma de instrução curta, para o Totti retomar depois de uma dúvida. */
function perguntaParaRetomar(passo: Passo, sessao: Sessao): string {
  switch (passo.tipo) {
    case "resumo_final":
      return "pergunte se ela quer mudar algo ou se pode finalizar.";
    case "confirmar_mudanca_foco":
      if (passo.duvida.length) {
        return `pergunte se ${listar(passo.duvida.map((a) => nomeAreaFala(a, sessao.rascunho.mode)))} ainda contam para a avaliação ou se ficam de lado.`;
      }
      return passo.proximo ? instrucaoDoPasso(passo.proximo, sessao) : "confirme a mudança numa frase.";
    case "responder_duvida":
      return perguntaParaRetomar(passo.retomar, sessao);
    default:
      return instrucaoDoPasso(passo, sessao);
  }
}

/** Frase que fala de dica, tom, clima ou duração (em minutos ou por extenso). */
const LOGISTICA_NA_FALA = /\b(dicas?|tom|clima|minutos?|dura[çc][ãa]o|quinze|trinta|quarenta|quarenta e cinco|sessenta)\b|\d+\s*min/i;

/**
 * Tira da revisão feita pelo modelo as frases sobre dica, tom e duração. Se não sobrar nada, pergunta de novo se pode
 * finalizar. Função pura.
 */
export function removerLogisticaDaRevisao(texto: string): string {
  const frases = texto.split(/(?<=[.!?])\s+/).filter((f) => f.trim() && !LOGISTICA_NA_FALA.test(f));
  const limpo = frases.join(" ").trim();
  return limpo || "Certo. Quer mudar mais alguma coisa, ou posso finalizar?";
}

/**
 * O que o resumo e o modelo podem dizer que fica pra próxima etapa. Vale o que ela decidiu ou dispensou, o que o formato
 * não mede (a abertura já disse) e o que ela mesma citou. Competência que só veio da descrição da vaga fica nas notas
 * (`naoAvaliado`), não na fala. Função pura.
 */
export function naoAvaliadoParaFalar(sessao: Sessao): string[] {
  const r = sessao.rascunho;
  const anunciados = new Set<string>(
    AREAS.filter(
      (a) =>
        sessao.plano.decisoesTradeoff[a] === "proxima_etapa" ||
        sessao.enfaseEstado[a].declarado === "dispensou" ||
        semMedicaoNoFormato(r.mode, a),
    ).map((a) => ROTULO_NAO_AVALIADO[a]),
  );
  const falado = ` ${normalizarTexto(
    sessao.transcricao
      .filter((t) => t.role === "recrutadora")
      .map((t) => t.text)
      .join(" "),
  )} `;
  return sessao.naoAvaliado.filter((item) => anunciados.has(item) || falado.includes(` ${normalizarTexto(item)} `));
}

/**
 * Uma pergunta por fala: corta o texto do modelo logo depois do primeiro "?", e o resto sai. Se não há "?", ou se o
 * primeiro cai dentro de aspas (ela ou o Totti citando algo), o texto segue como está. Função pura.
 */
export function cortarNaPrimeiraPergunta(texto: string): string {
  const i = texto.indexOf("?");
  if (i < 0) return texto;
  const antes = texto.slice(0, i);
  const aspasRetas = antes.split('"').length - 1;
  const abreAspas = (antes.match(/“/g) ?? []).length;
  const fechaAspas = (antes.match(/”/g) ?? []).length;
  if (aspasRetas % 2 === 1 || abreAspas > fechaAspas) return texto;
  return texto.slice(0, i + 1).trim();
}

/**
 * Frase do resumo com o que fica de fora desta entrevista ("X e Y ficam pra próxima etapa."). Sem o modelo.
 * Sem itens, não há frase.
 */
export function fraseNaoAvaliado(itens: string[]): string | undefined {
  if (itens.length === 0) return undefined;
  const texto = listar(itens);
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} ${itens.length === 1 ? "fica" : "ficam"} pra próxima etapa.`;
}

const FALAS_DE_ENCERRAMENTO = [
  "Pronto! Deixei tudo na tela pra você revisar e confirmar.",
  "Agora é só revisar na tela e confirmar.",
  "Tudo anotado. Falta só revisar na tela e confirmar.",
];

/** Fala de encerramento: fixa, escolhida ao acaso entre as variações. Não usa o modelo. */
export function falaDeEncerramento(): string {
  return FALAS_DE_ENCERRAMENTO[Math.floor(Math.random() * FALAS_DE_ENCERRAMENTO.length)];
}

const NUMEROS_BAIXOS = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];

/** Número por extenso, em português (até 199; acima disso, algarismos). Função pura. */
export function porExtenso(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 199) return String(n);
  if (n < 20) return NUMEROS_BAIXOS[n];
  if (n < 100) {
    const unidade = n % 10;
    return DEZENAS[Math.floor(n / 10)] + (unidade ? ` e ${NUMEROS_BAIXOS[unidade]}` : "");
  }
  if (n === 100) return "cem";
  const resto = n - 100;
  return `cento${resto ? ` e ${porExtenso(resto)}` : ""}`;
}

/**
 * Frase do resumo sobre duração, tom e dicas, montada a partir do estado (sem o modelo).
 * `variante` escolhe uma das três formas. Função pura.
 */
export function fraseLogistica(r: Rascunho, p: Preferencias, variante = 0): string {
  const dur = porExtenso(duracaoDoRascunho(r, p));
  const clima = p.tom === "desafiador" ? "tom mais desafiador" : "clima tranquilo";
  const dica = p.dicas === "nenhuma" ? "sem dicas" : p.dicas === "livres" ? "com dicas se ele pedir" : "com uma dica leve se ele travar";
  const formas = [
    `São ${dur} minutos, num ${clima} e ${dica}.`,
    `Vão ser ${dur} minutos, com ${clima} e ${dica}.`,
    `Duração de ${dur} minutos, ${clima}, ${dica}.`,
  ];
  const linguagem = r.mode === "live_coding" ? fraseLinguagem(p) : "";
  return [formas[variante % formas.length], linguagem].filter(Boolean).join(" ");
}

/** Linguagem só entra no resumo quando a recrutadora restringiu: "O código vai ser só em Python." */
function fraseLinguagem(p: Preferencias): string {
  const langs = p.linguagens;
  if (!langs?.length || langs.length >= LINGUAGENS_IDE.length) return "";
  return `O código vai ser só em ${nomesDasLinguagens(langs)}.`;
}

const FECHAMENTOS = [
  "Quer mudar algo ou posso finalizar?",
  "Quer ajustar alguma coisa ou posso finalizar?",
  "Quer mudar alguma coisa, ou posso finalizar?",
];

/** Pergunta final do resumo, em uma das variações. */
export function fechamentoDoResumo(variante = Math.floor(Math.random() * FECHAMENTOS.length)): string {
  return FECHAMENTOS[variante % FECHAMENTOS.length];
}

/**
 * Confirmação da revisão quando a mudança é só de tom, dicas ou duração: sai pronta, sem o modelo.
 * Compara com o último resumo falado. Se não houve essa mudança, devolve undefined e o modelo confirma.
 */
function confirmacaoDeterministica(sessao: Sessao): string | undefined {
  const anterior = sessao.resumo;
  if (!anterior) return undefined;
  const atual = sessao.preferencias;
  const partes: string[] = [];
  if (atual.tom !== anterior.preferencias.tom) partes.push(atual.tom === "desafiador" ? "tom mais desafiador" : "tom amigável");
  if (atual.dicas !== anterior.preferencias.dicas) {
    partes.push(atual.dicas === "nenhuma" ? "sem dicas" : atual.dicas === "livres" ? "dicas quando ele pedir" : "dica leve se ele travar");
  }
  const duracao = duracaoDoRascunho(sessao.rascunho, sessao.preferencias);
  if (duracao !== anterior.duracaoMin) partes.push(`${porExtenso(duracao)} minutos`);
  const langs = atual.linguagens ?? [...LINGUAGENS_IDE];
  if (langs.join() !== (anterior.preferencias.linguagens ?? [...LINGUAGENS_IDE]).join()) {
    partes.push(langs.length >= LINGUAGENS_IDE.length ? "linguagem livre" : `só ${nomesDasLinguagens(langs)}`);
  }
  if (partes.length === 0) return undefined;
  return `Ajustei ${partes.join(" e ")}. Posso finalizar?`;
}

/** Resposta sem modelo: mesma forma de `RespostaAgente`, com o provedor "fixa". */
export function respostaFixa(texto: string): RespostaAgente {
  return { texto, movimento: "seguir", travas: [], provedor: "fixa", model: "-", ms: 0, fallback: false, tentativas: [], mensagens: [], respostaCrua: "" };
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
export function montarMensagensConversa(sessao: Sessao, passo: Passo, opcoes: { pendente?: DecisaoPendente } = {}): Mensagem[] {
  const r = sessao.rascunho;
  const ultimas = sessao.transcricao
    .filter((t) => t.role === "agente")
    .slice(-2)
    .map((t) => `- ${t.text}`);

  const entrada = [
    `CONTEXTO DA VAGA: ${r.roleTitle}. ${primeiraLinha(r.jobDescription)}`.trimEnd(),
    `O QUE JÁ SE SABE:\n${saberEmLinguagemNatural(sessao)}`,
    `SUAS ÚLTIMAS FALAS (não repita essas perguntas por conta própria; só se ela pedir):\n${ultimas.join("\n") || "(nenhuma)"}`,
    `PERGUNTA SUA EM ABERTO: ${perguntaEmAberto(sessao.transcricao) ?? "(nenhuma)"}`,
    opcoes.pendente ? instrucaoDaDecisao(opcoes.pendente, sessao) : `PASSO DESTA FALA:\n${instrucaoDoPasso(passo, sessao)}`,
    `ÚLTIMAS 6 FALAS DA TRANSCRIÇÃO:\n${formatarTranscricao(sessao.transcricao.slice(-6))}`,
    "Escreva a próxima fala do Totti, no formato JSON pedido.",
  ].join("\n\n");

  return [
    { role: "system", content: PROMPT_SISTEMA_CONVERSA },
    { role: "user", content: entrada },
  ];
}

/** Palavra de concordância no começo ("Boa.", "Fechado,", "Faz sentido."). O modelo insiste nelas, então saem aqui. */
const RE_RECONHECIMENTO_INICIAL =
  /^(boa|fechado|perfeito|certo|entendido|entendi|[oó]timo|show|beleza|legal|combinado|faz sentido)\s*[.!,]\s+/i;

/**
 * Tira o que não pode ir para a voz: markdown, aspas em volta, prefixo "Totti:" e palavra de concordância no começo
 * (a capital volta na nova primeira letra). Único ponto por onde passa a fala do modelo.
 * Com `manterReconhecimento` (fala cujo movimento não é `seguir`), a palavra do começo fica: ali ela é a reação natural.
 */
export function limparFala(texto: string, opcoes: { manterReconhecimento?: boolean } = {}): string {
  const limpo = texto
    .replace(/^\s*totti\s*:\s*/i, "")
    .replace(/[*_#`]/g, "")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim();
  if (opcoes.manterReconhecimento) return limpo;
  let semReconhecimento = limpo;
  let anterior: string;
  do {
    anterior = semReconhecimento;
    semReconhecimento = semReconhecimento.replace(RE_RECONHECIMENTO_INICIAL, "");
  } while (semReconhecimento !== anterior && semReconhecimento);
  if (!semReconhecimento || semReconhecimento === limpo) return limpo;
  return semReconhecimento.charAt(0).toUpperCase() + semReconhecimento.slice(1);
}

/** Uma trava que reescreveu a fala do modelo: o nome dela e a fala antes e depois. */
export interface TravaAplicada {
  trava: string;
  antes: string;
  depois: string;
}

export interface RespostaAgente {
  texto: string;
  /** O movimento de conversa que o modelo declarou (`seguir` quando não declarou, e nas falas fixas). */
  movimento: Movimento;
  /** O que o modelo devolveu no campo `decisao`, quando havia uma decisão pendente. O turno confere e aplica. */
  decisao?: string;
  /** Travas que reescreveram a fala, na ordem (cada uma também vira um evento `trava` no log da sessão). */
  travas: TravaAplicada[];
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

/** Número de frases de uma fala (pelos sinais de pontuação). */
export function contarFrases(texto: string): number {
  return texto.split(/[.!?]+/).filter((s) => s.trim()).length;
}

/** Aviso de que system design não está disponível: fala fixa, sem modelo. Só com a trava desligada (ver `SYSTEM_DESIGN_ATIVO`). */
export function falaFormatoIndisponivel(modo: Rascunho["mode"]): string {
  return `System design ainda não está disponível nesta versão, então a entrevista segue em ${FORMATO_CURTO[modo]}. Prefere seguir assim ou mudar alguma coisa?`;
}

/** O passo em curso: o último que o Totti executou (a dúvida respondida não conta, vale o passo que ela retomou). */
function passoEmCurso(sessao: Sessao): Passo | undefined {
  const ultimo = sessao.plano.ultimoPasso;
  return ultimo?.tipo === "responder_duvida" ? ultimo.retomar : ultimo;
}

/** Os dois passos fazem a mesma pergunta: mesmo tipo e, quando há área, a mesma área. */
function mesmaPerguntaDoPasso(a: Passo, b: Passo | undefined): boolean {
  if (!b || a.tipo !== b.tipo) return false;
  if ((a.tipo === "aprofundar" || a.tipo === "oferecer_tradeoff") && (b.tipo === "aprofundar" || b.tipo === "oferecer_tradeoff")) {
    return a.area === b.area;
  }
  return true;
}

/**
 * Reserva para o modelo rápido, que às vezes não declara o movimento: se a fala traz quase a mesma pergunta que estava
 * em aberto e o planejador tinha escolhido outra pergunta, o modelo repetiu, e a fala conta como `repetir`.
 * Não vale quando a repetição é o próprio passo: nova tentativa da mesma pergunta, resposta a dúvida (que retoma a
 * pergunta) e pergunta de nível (sempre as mesmas palavras, inclusive quando a abertura já a fez). Função pura.
 */
export function movimentoDaFala(declarado: Movimento, fala: string, sessao: Sessao, passo: Passo): Movimento {
  if (declarado !== "seguir") return declarado;
  if (passo.tipo === "responder_duvida" || passo.tipo === "perguntar_nivel") return declarado;
  if (mesmaPerguntaDoPasso(passo, passoEmCurso(sessao))) return declarado;
  const aberta = perguntaEmAberto(sessao.transcricao);
  // A pergunta que vai para a voz: com `seguir`, a fala é cortada na primeira pergunta (`cortar_na_primeira_pergunta`).
  const daFala = ultimaPergunta(cortarNaPrimeiraPergunta(fala));
  if (!aberta || !daFala) return declarado;
  return sobreposicao(daFala, aberta) >= LIMIAR_DUPLICADA ? "repetir" : declarado;
}

export interface OpcoesResponder {
  /** Cliente de LLM. Os testes passam um falso; sem ele, vale o `chat` de verdade. */
  chat?: typeof chat;
  /**
   * O Totti pediu uma decisão e a resposta dela não decidiu (ver `decisaoPendente`): nenhuma fala fixa é usada, e o
   * modelo recebe a decisão pendente no lugar do passo. `passo` é o passo em curso.
   */
  pendente?: DecisaoPendente;
}

/**
 * Gera a fala do Totti para o passo escolhido. Lança `ErroChat` se nenhum alvo responder.
 *
 * As travas abaixo conferem a fala depois que o modelo a escreve, e obedecem ao `movimento` que ele declarou:
 * nenhuma reescreve uma fala `repetir`, `esclarecer` ou `responder` (nem tira o "Certo," do começo), com duas exceções
 * que são formato de voz e não conteúdo: a limpeza de markdown, aspas e prefixo vale sempre, e "uma pergunta só" vale
 * para `repetir` e `esclarecer`.
 * Cada reescrita vira um evento `trava` no log da sessão.
 */
export async function responder(sessao: Sessao, passo: Passo, opcoes: OpcoesResponder = {}): Promise<RespostaAgente> {
  if (passo.tipo === "encerrar") return respostaFixa(falaDeEncerramento());
  if (passo.tipo === "informar_formato_indisponivel") return respostaFixa(falaFormatoIndisponivel(sessao.rascunho.mode));
  // Revisão de tom, dicas ou duração: a confirmação sai pronta. Mudança de foco ou de critério segue com o modelo.
  if (passo.tipo === "resumo_final" && passo.revisao && !opcoes.pendente) {
    const confirmacao = confirmacaoDeterministica(sessao);
    if (confirmacao) return respostaFixa(confirmacao);
  }
  const conversar = opcoes.chat ?? chat;
  const resumoCompleto = passo.tipo === "resumo_final" && !passo.revisao;
  const mensagens = montarMensagensConversa(sessao, passo, { pendente: opcoes.pendente });
  let resposta = await conversar({
    alvos: alvosDaConversa(),
    messages: mensagens,
    temperature: TEMPERATURA_CONVERSA,
    maxTokens: MAX_TOKENS_CONVERSA,
  });
  // A reescrita do resumo, abaixo, não muda o movimento: vale o que o modelo declarou na primeira resposta.
  const saida = lerSaidaDoModelo(resposta.content);
  // Formato de voz (markdown, aspas, prefixo) sai sempre, antes de qualquer trava.
  let texto = limparFala(saida.fala, { manterReconhecimento: true });
  const movimento = movimentoDaFala(saida.movimento, texto, sessao, passo);
  const segue = movimento === "seguir";
  let ms = resposta.ms;
  let tentativas = resposta.tentativas;
  let respostaCrua = resposta.content;

  const travas: TravaAplicada[] = [];
  /** Aplica o resultado de uma trava e, se a fala mudou, registra. */
  const aplicar = (trava: string, depois: string) => {
    if (depois === texto) return;
    travas.push({ trava, antes: texto, depois });
    registrarEvento(sessao, {
      tipo: "trava",
      resumo: `${trava} | ${descreverPasso(passo)} | movimento ${movimento}`,
      dados: { trava, antes: texto, depois, movimento, passo },
    });
    texto = depois;
  };

  // Palavra de reconhecimento no começo ("Certo.", "Entendi,"): só sai numa fala que executa o passo. Ao responder,
  // repetir ou esclarecer, ela é a reação natural ao que ela disse e fica.
  if (texto && segue) aplicar("reconhecimento_inicial", limparFala(texto));
  // O modelo escreve até 2 frases do resumo (ou 3 numa revisão). Se passou, pede para reescrever uma vez.
  const teto = resumoCompleto ? 2 : 3;
  if (texto && segue && passo.tipo === "resumo_final" && contarFrases(texto) > teto) {
    const reescrita = await conversar({
      alvos: alvosDaConversa(),
      messages: [
        ...mensagens,
        // A resposta anterior volta no mesmo formato JSON que o sistema pede, para o modelo não aprender o contrário.
        { role: "assistant", content: JSON.stringify({ fala: texto, movimento }) },
        {
          role: "user",
          content:
            `Reescreva em no máximo ${teto} frases curtas, mantendo o conteúdo. Não fale de tom, duração nem dicas, e não faça pergunta. ` +
            "Responda no mesmo formato JSON.",
        },
      ],
      temperature: TEMPERATURA_CONVERSA,
      maxTokens: MAX_TOKENS_CONVERSA,
    });
    aplicar("reescrita_do_resumo", limparFala(lerSaidaDoModelo(reescrita.content).fala) || texto);
    ms += reescrita.ms;
    tentativas = [...tentativas, ...reescrita.tentativas];
    respostaCrua = `${respostaCrua}\n[reescrita]\n${reescrita.content}`;
    resposta = reescrita;
  }
  // Uma pergunta por fala: corta a parte do modelo antes de qualquer sufixo que o código acrescente.
  // Numa fala `responder` não corta: ela pode responder à dúvida dela e depois retomar a pergunta em aberto.
  if (texto && movimento !== "responder") aplicar("cortar_na_primeira_pergunta", cortarNaPrimeiraPergunta(texto));
  // Pergunta no molde óbvio ("o que separa um ótimo de um fraco?"): troca pela pergunta do banco, sem nova chamada.
  // Só quando a fala executa o passo: uma repetição, um esclarecimento ou uma resposta não viram outra pergunta.
  const areaAprofundada = passo.tipo === "aprofundar" ? passo.area : passo.tipo === "confirmar_mudanca_foco" ? passo.proximo?.area : undefined;
  if (texto && segue && areaAprofundada && perguntaObvia(texto)) {
    const doBanco = perguntasDoBanco(sessao, areaAprofundada)[0];
    if (doBanco) aplicar("pergunta_do_banco", trocarPergunta(texto, doBanco.texto));
  }
  if (texto && segue && passo.tipo === "perguntar_contexto" && (!texto.includes("?") || perguntaObvia(texto))) {
    aplicar("pergunta_de_contexto", trocarPergunta(texto, PERGUNTA_CONTEXTO));
  }
  // Confirmação do início e resposta a dúvida devolvem a decisão para ela: sem pergunta, o código acrescenta uma.
  // Fora do `seguir` não acrescenta: um "Claro, sem pressa." viraria cobrança.
  if (texto && segue && !texto.includes("?") && (passo.tipo === "confirmar_inicio" || passo.tipo === "responder_duvida")) {
    aplicar("pergunta_no_fim", `${texto} ${passo.tipo === "confirmar_inicio" ? "Prefere seguir assim ou mudar alguma coisa?" : "O que você prefere?"}`);
  }
  // No resumo, o código acrescenta o que fica de fora, duração, tom e dicas (do estado) e a pergunta final, em variações.
  // Revisão feita pelo modelo: dica, tom e duração só entram pela frase determinística (que compara com o estado).
  // Com movimento diferente de `seguir`, a fala não é um resumo (é uma resposta ou uma repetição) e fica como veio.
  // Com a aprovação pendente, a fala pode ser a resposta a "quanto tempo ficou mesmo?": a logística fica.
  // Pedido de mudança que o modelo leu (decisao "mudar") também é revisão: a logística só entra pelo estado.
  const mudancaLidaPeloModelo = opcoes.pendente?.tipo === "resumo" && saida.decisao === "mudar";
  if (texto && segue && passo.tipo === "resumo_final" && passo.revisao && (!opcoes.pendente || mudancaLidaPeloModelo)) {
    aplicar("logistica_da_revisao", removerLogisticaDaRevisao(texto));
  }
  // Ela pediu para repetir o resumo: sai o último resumo como foi falado, sem montar outro.
  if (texto && movimento === "repetir" && passoEmCurso(sessao)?.tipo === "resumo_final" && sessao.resumo?.texto) {
    aplicar("resumo_repetido", sessao.resumo.texto);
  }
  if (texto && segue && resumoCompleto) {
    const variante = Math.floor(Math.random() * 3);
    texto = [
      texto,
      fraseNaoAvaliado(naoAvaliadoParaFalar(sessao)),
      resumoDaMemoria(memoriaDoFormato(sessao)),
      fraseLogistica(sessao.rascunho, sessao.preferencias, variante),
      fechamentoDoResumo(),
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (!texto) throw new ErroChat(`Totti devolveu fala vazia (${resposta.provedor}/${resposta.model})`, resposta.tentativas);

  return {
    texto,
    movimento,
    ...(opcoes.pendente && saida.decisao ? { decisao: saida.decisao } : {}),
    travas,
    provedor: resposta.provedor,
    model: resposta.model,
    ms,
    fallback: tentativas.some((t) => t.erro !== undefined),
    tentativas,
    mensagens,
    respostaCrua,
  };
}
