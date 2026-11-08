/**
 * Agente de conversa (Totti): conduz a configuração da entrevista falando com a recrutadora.
 *
 * O planejador (`planejador.ts`) escolhe o passo; aqui o modelo só escreve a fala desse passo.
 * A abertura sai sem LLM, a partir da classificação, para aparecer na hora. As falas seguintes
 * vêm do modelo: Featherless primeiro, OpenRouter depois, com 12 s por alvo.
 */
import type { FocusArea } from "@/lib/contracts";
import { areasEmJogo, AREAS, LIMIAR, NOME_AREA_FALA } from "./cobertura";
import { COMO_AVALIAMOS, mede, modoAlternativoQueMede, ROTULO_NAO_AVALIADO, semMedicaoNoFormato } from "./catalogo";
import { chat, ErroChat, type Alvo, type Mensagem, type Tentativa } from "./llm";
import { nivelEmAberto, type OferecerTradeoffPasso, type Passo } from "./planejador";
import { normalizarTexto } from "./frases";
import { LINGUAGENS_IDE, nomesDasLinguagens } from "./linguagens";
import type { Preferencias } from "./preferencias";
import { DURACAO_PADRAO, duracaoDoRascunho, listar, type Rascunho, type Turno } from "./rascunho";
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
    // Terceiro alvo: outro modelo da OpenRouter, diferente do flash-lite, para não cair junto com ele.
    { provedor: "openrouter", model: "openai/gpt-4o-mini", timeoutMs: TIMEOUT_OPENROUTER_MS },
  ];
}

const PROMPT_SISTEMA_CONVERSA = `Você é o Totti, assistente que monta entrevistas técnicas conversando com a recrutadora.
Você soa como um colega de RH experiente que conhece tecnologia: direto, simpático, sem enrolação.
A fala vai ser ouvida em voz alta.

Como falar:
- Cada fala tem no máximo 2 frases curtas e uma pergunta só. No resumo final, você escreve só as duas primeiras frases; o resto é acrescentado pelo sistema.
- Nunca comece com palavra de concordância ou reconhecimento: "Boa", "Fechado", "Certo", "Perfeito", "Ótimo", "Show", "Beleza",
  "Legal", "Combinado", "Entendi", "Entendido" ou "Faz sentido". Comece direto pelo conteúdo ou pela pergunta.
- Não repita a resposta dela palavra por palavra.
- Nunca ofereça como opção algo que ela já disse. Se ela falou de escalabilidade, não a ofereça de novo como escolha.
- Fale com as palavras dela e da vaga. Nunca use nomes internos (tecnico, pressao, escala_produto, uso_ia, criterio, passo)
  nem as expressões "domínio técnico", "escala e produto" e "pressão e adaptação". Para a área de IA, diga "IA aplicada".
- Não repita uma pergunta que aparece em "SUAS ÚLTIMAS FALAS", e não pergunte de novo o que ela já respondeu na transcrição.
- Só cite o que está na transcrição ou em "O QUE JÁ SE SABE". Nunca invente.
- Sem listas, markdown, asteriscos, aspas nem emojis. Português do Brasil, tratando a recrutadora por "você".
- Você se apresenta só na abertura. Depois dela, nunca diga "sou Totti", "eu sou o Totti" nem repita seu nome.
  Quando falar de si, use o masculino (o Totti é ele).
- Varie as palavras: não repita de uma fala para a outra a mesma expressão de fechamento ou de tom.
- Para pressão, diga "lidar com pressão e imprevistos" ou "manter a calma quando dá errado". Nunca diga "alta demanda": isso é escala.
- Nunca ofereça escolher o tema, o tipo ou o enunciado da questão ("lógica pura ou listas?", "otimização de rotas ou
  restrições de horário?"). A questão de algoritmo é sorteada do banco pelo nível e pelo que pesa, e não tem o tema da vaga.
  Pergunte sobre o que avaliar no candidato, nunca sobre qual problema dar.

Exemplos de tom (não copie as palavras):
- "Num problema de algoritmo, o que faz você achar um candidato ótimo e não só bom?"
- "Você prefere que ele explique a complexidade, ou que trate entrada vazia sem ser lembrado?"
- "IA aplicada fica de lado, e escalabilidade entra no foco. O que separa uma solução simples de uma que não aguenta volume?"

A cada fala você recebe o contexto da vaga, o que já se sabe, suas últimas falas, o PASSO desta fala e a transcrição.
Siga o PASSO. Responda somente com a fala do Totti, sem prefixo, sem aspas e sem explicações.`;

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
export function aberturaDoAgente(sessao: Sessao): string {
  const r = sessao.rascunho;
  const frases = [`Oi! Sou Totti, vou montar a entrevista de ${r.roleTitle} com você.`];
  // O resumo entra no meio da frase: a primeira letra vai para minúscula, sem mexer em sigla (APIs, iOS).
  const resumo = sessao.resumoVaga?.replace(/^([A-ZÀ-Ú])(?=[a-zà-ú])/, (letra) => letra.toLowerCase());
  if (resumo) frases.push(`Vi que a vaga gira em torno de ${resumo}.`);

  const incerto = nivelEmAberto(sessao.plano, sessao.classificacao.confirmar, r.confirmado.seniority);
  const nivel = SENIORIDADE_FALA[r.seniority];
  const focos = listar(rotulosDoFoco(r, 2));
  const perguntaNivel = "é júnior, pleno ou sênior?";

  if (sessao.classificacao.confirmar.includes("mode")) {
    frases.push(incerto ? `Olhando principalmente ${focos}.` : `A vaga é de nível ${nivel}, olhando principalmente ${focos}.`);
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
  frases.push(incerto ? `O nível não está claro na vaga: ${perguntaNivel}` : "É isso, ou quer focar em outra coisa?");
  return frases.join(" ");
}

/** O que já se sabe, em linguagem natural (sem JSON e sem rótulos internos). */
function saberEmLinguagemNatural(sessao: Sessao): string {
  const r = sessao.rascunho;
  const sinal = (id: string) => sessao.plano.sinais[id] ?? 0;
  // Área já decidida (trocada, para a próxima etapa ou deixada de lado) não aparece como "quer avaliar".
  const decididas = new Set<string>(Object.keys(sessao.plano.decisoesTradeoff));
  const pedidas = AREAS.filter((a) => !decididas.has(a) && !r.focus.some((f) => f.area === a) && sinal(`quer_${a}`) >= LIMIAR).map(
    (a) => NOME_AREA_FALA[a],
  );
  const reduzidas = AREAS.filter((a) => sinal(`dispensa_${a}`) >= LIMIAR).map((a) => NOME_AREA_FALA[a]);

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
      return (
        confirma +
        `Pergunte o que separa um candidato ótimo de um candidato fraco em ${NOME_AREA_FALA[passo.area]}, ` +
        `de forma concreta e ligada ao cargo ${r.roleTitle}. Uma pergunta só. ${SEM_LOGISTICA}`
      );
    }
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
      if (passo.entra.length) partes.push(`${listar(passo.entra.map((a) => NOME_AREA_FALA[a]))} passa a fazer parte da avaliação`);
      if (passo.sai.length)
        partes.push(`${listar(passo.sai.map((a) => NOME_AREA_FALA[a]))} deixa de ser prioridade ou pesa menos, como ela disse`);
      let texto = partes.length ? `Confirme a mudança numa frase, com as palavras dela: ${partes.join("; ")}.` : "";
      if (passo.duvida.length) {
        texto += ` Pergunte se ${listar(passo.duvida.map((a) => NOME_AREA_FALA[a]))} ainda contam para a avaliação ou se ficam de lado. Uma pergunta só. ${SEM_LOGISTICA}`;
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
          "Se a dúvida for sobre algo que você não sabe, diga isso com franqueza e ofereça um padrão, por exemplo 'a gente segue com o que já combinamos'.",
        `COMO AS ÁREAS EM JOGO SÃO AVALIADAS (${FORMATO_CURTO[r.mode]}):\n${comoAvaliamosDoFoco(sessao)
          .map((f) => `- ${f}`)
          .join("\n")}`,
        `Depois, em uma pergunta curta, retome o que ficou sem resposta: ${perguntaParaRetomar(passo.retomar, sessao)} ` +
          "É a mesma pergunta de antes: reformule, sem repetir as palavras dela, e termine perguntando o que ela prefere.",
      ].join("\n\n");
    case "encerrar":
      // Não passa pelo modelo: a fala de encerramento é fixa (ver `falaDeEncerramento`).
      return "Fala fixa, sem modelo.";
  }
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
        return `pergunte se ${listar(passo.duvida.map((a) => NOME_AREA_FALA[a]))} ainda contam para a avaliação ou se ficam de lado.`;
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
function respostaFixa(texto: string): RespostaAgente {
  return { texto, provedor: "fixa", model: "-", ms: 0, fallback: false, tentativas: [], mensagens: [], respostaCrua: "" };
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
    "Escreva a próxima fala do Totti.",
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
 */
export function limparFala(texto: string): string {
  const limpo = texto
    .replace(/^\s*totti\s*:\s*/i, "")
    .replace(/[*_#`]/g, "")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim();
  let semReconhecimento = limpo;
  let anterior: string;
  do {
    anterior = semReconhecimento;
    semReconhecimento = semReconhecimento.replace(RE_RECONHECIMENTO_INICIAL, "");
  } while (semReconhecimento !== anterior && semReconhecimento);
  if (!semReconhecimento || semReconhecimento === limpo) return limpo;
  return semReconhecimento.charAt(0).toUpperCase() + semReconhecimento.slice(1);
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

/** Gera a fala do Totti para o passo escolhido. Lança `ErroChat` se nenhum alvo responder. */
/** Número de frases de uma fala (pelos sinais de pontuação). */
export function contarFrases(texto: string): number {
  return texto.split(/[.!?]+/).filter((s) => s.trim()).length;
}

/** Aviso de que system design não está disponível: fala fixa, sem modelo. Só com a trava desligada (ver `SYSTEM_DESIGN_ATIVO`). */
export function falaFormatoIndisponivel(modo: Rascunho["mode"]): string {
  return `System design ainda não está disponível nesta versão, então a entrevista segue em ${FORMATO_CURTO[modo]}. Prefere seguir assim ou mudar alguma coisa?`;
}

export async function responder(sessao: Sessao, passo: Passo): Promise<RespostaAgente> {
  if (passo.tipo === "encerrar") return respostaFixa(falaDeEncerramento());
  if (passo.tipo === "informar_formato_indisponivel") return respostaFixa(falaFormatoIndisponivel(sessao.rascunho.mode));
  // Revisão de tom, dicas ou duração: a confirmação sai pronta. Mudança de foco ou de critério segue com o modelo.
  if (passo.tipo === "resumo_final" && passo.revisao) {
    const confirmacao = confirmacaoDeterministica(sessao);
    if (confirmacao) return respostaFixa(confirmacao);
  }
  const resumoCompleto = passo.tipo === "resumo_final" && !passo.revisao;
  const mensagens = montarMensagensConversa(sessao, passo);
  let resposta = await chat({
    alvos: alvosDaConversa(),
    messages: mensagens,
    temperature: TEMPERATURA_CONVERSA,
    maxTokens: MAX_TOKENS_CONVERSA,
  });
  let texto = limparFala(resposta.content);
  let ms = resposta.ms;
  let tentativas = resposta.tentativas;
  let respostaCrua = resposta.content;
  // O modelo escreve até 2 frases do resumo (ou 3 numa revisão). Se passou, pede para reescrever uma vez.
  const teto = resumoCompleto ? 2 : 3;
  if (texto && passo.tipo === "resumo_final" && contarFrases(texto) > teto) {
    const reescrita = await chat({
      alvos: alvosDaConversa(),
      messages: [
        ...mensagens,
        { role: "assistant", content: texto },
        {
          role: "user",
          content: `Reescreva em no máximo ${teto} frases curtas, mantendo o conteúdo. Não fale de tom, duração nem dicas, e não faça pergunta.`,
        },
      ],
      temperature: TEMPERATURA_CONVERSA,
      maxTokens: MAX_TOKENS_CONVERSA,
    });
    texto = limparFala(reescrita.content) || texto;
    ms += reescrita.ms;
    tentativas = [...tentativas, ...reescrita.tentativas];
    respostaCrua = `${respostaCrua}\n[reescrita]\n${reescrita.content}`;
    resposta = reescrita;
  }
  // Uma pergunta por fala: corta a parte do modelo antes de qualquer sufixo que o código acrescente.
  if (texto) texto = cortarNaPrimeiraPergunta(texto);
  // Confirmação do início e resposta a dúvida devolvem a decisão para ela: sem pergunta, o código acrescenta uma.
  if (texto && !texto.includes("?") && (passo.tipo === "confirmar_inicio" || passo.tipo === "responder_duvida")) {
    texto = `${texto} ${passo.tipo === "confirmar_inicio" ? "Prefere seguir assim ou mudar alguma coisa?" : "O que você prefere?"}`;
  }
  // No resumo, o código acrescenta o que fica de fora, duração, tom e dicas (do estado) e a pergunta final, em variações.
  // Revisão feita pelo modelo: dica, tom e duração só entram pela frase determinística (que compara com o estado).
  if (texto && passo.tipo === "resumo_final" && passo.revisao) {
    texto = removerLogisticaDaRevisao(texto);
  }
  if (texto && resumoCompleto) {
    const variante = Math.floor(Math.random() * 3);
    texto = [
      texto,
      fraseNaoAvaliado(naoAvaliadoParaFalar(sessao)),
      fraseLogistica(sessao.rascunho, sessao.preferencias, variante),
      fechamentoDoResumo(),
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (!texto) throw new ErroChat(`Totti devolveu fala vazia (${resposta.provedor}/${resposta.model})`, resposta.tentativas);

  return {
    texto,
    provedor: resposta.provedor,
    model: resposta.model,
    ms,
    fallback: tentativas.some((t) => t.erro !== undefined),
    tentativas,
    mensagens,
    respostaCrua,
  };
}
