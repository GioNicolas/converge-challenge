/**
 * Cobertura e sinais: o que a conversa já deixou claro e o que a recrutadora quer avaliar.
 *
 * O Jev responde, em uma chamada, uma pergunta de sim/não por item (`noul` = probabilidade de sim).
 *  - Tópicos (`topicosDo`) são cumulativos: uma vez cobertos (probabilidade de pelo menos 0,6), seguem cobertos.
 *  - Sinais (`sinaisDo`) valem a leitura do turno atual, porque a recrutadora pode mudar de ideia:
 *    quer/dispensa por área, se a última resposta foi vaga e se ela aprovou o resumo.
 * O planejador (`planejador.ts`) usa os sinais para escolher o próximo passo do Totti.
 */
import { choice, noul } from "@typesafe-ai/sdk";
import { FocusArea } from "@/lib/contracts";
import { mede } from "./catalogo";
import { NIVEIS_ENFASE, type NivelEnfase } from "./enfase";
import { jev } from "./jev";
import { areasFora, type DecisoesTradeoff, type Rascunho, type Turno } from "./rascunho";

/** Probabilidade a partir da qual um tópico está coberto e um sinal conta como verdadeiro. */
export const LIMIAR = 0.6;

export const AREAS = FocusArea.options;

/** Nome da área do jeito que o Totti fala. Nunca os rótulos internos. */
export const NOME_AREA_FALA: Record<FocusArea, string> = {
  tecnico: "algoritmos e código",
  pressao: "lidar com pressão e imprevistos",
  escala_produto: "escalabilidade",
  uso_ia: "IA aplicada",
};

export interface Pergunta {
  id: string;
  /** Pergunta de sim/não que o Jev responde sobre a transcrição. */
  pergunta: string;
  sinal_sim: string;
  sinal_nao: string;
}

export interface Topico extends Pergunta {
  /** Área a que o tópico pertence (só os `criterio_<area>`). */
  area?: FocusArea;
  /** Não bloqueia o resumo: se ela falar, entra; se não, o resumo usa o padrão. */
  opcional?: boolean;
}

/** Pergunta/resposta crua do Jev, guardada no log para reproduzir a avaliação. */
export interface ChamadaJev {
  /** Exatamente o que foi enviado: `state` (contexto) e `questions` (as perguntas). */
  request: { state: unknown; questions: unknown };
  /** Respostas cruas do Jev, por nome de pergunta, como o SDK devolveu. */
  answers: unknown;
  model: string;
  usage: { input_tokens: number | null; output_tokens: number | null };
}

/** Nível que a recrutadora disse na última fala (ver `NIVEL_DITO`). */
export type NivelDito = "nao_disse" | "junior" | "pleno" | "senior";

/** A última fala dela diz o nível? Só a última fala conta: um nível dito antes já está em `rascunho.seniority`. */
const NIVEL_DITO = choice("Na ÚLTIMA fala da recrutadora, ela disse qual é o nível da vaga?", {
  nao_disse: {
    quando: "a fala não diz nível nenhum: fala de formato, de foco, de duração, de tom ou outra coisa.",
    exemplos: "'live coding', 'pode ser', 'foco em algoritmos', 'uns 40 minutos'",
  },
  junior: {
    quando: "disse que é júnior, estágio, trainee ou nível inicial.",
    exemplos: "'júnior', 'pode ser júnior', 'é estágio'",
  },
  pleno: {
    quando: "disse que é pleno ou nível intermediário.",
    exemplos: "'pleno', 'isso, pleno', 'nível II'",
  },
  senior: {
    quando: "disse que é sênior, staff, principal ou lead, inclusive corrigindo outro nível.",
    exemplos: "'sênior', 'é sênior, não pleno', 'staff'",
  },
});

export interface Cobertura extends ChamadaJev {
  /** Probabilidade acumulada de cada tópico estar coberto, por id. */
  cobertura: Record<string, number>;
  /** Nível que ela disse na última fala, se disse (ver `NIVEL_DITO`). */
  nivelDito: NivelDito;
  /** Sinais deste turno (quer/dispensa/falou por área, resposta vaga, aprovação do resumo), por id. */
  sinais: Record<string, number>;
  /** Tópicos obrigatórios das áreas em jogo que ainda não estão cobertos. */
  faltando: Topico[];
  ms: number;
}

export interface ContextoCobertura {
  /** Última fala do Totti, para os sinais que dependem do que foi perguntado (resposta vaga, aprovação do resumo). */
  ultimaFalaAgente?: string;
}

const TAREFA_COBERTURA =
  "Você lê uma conversa de pré-entrevista e responde perguntas de sim/não sobre o que a recrutadora disse. " +
  "As falas da recrutadora são a resposta; as falas do agente só mostram o que foi perguntado. " +
  "Se a resposta dela for parcial ou vaga, responda não, exceto quando a pergunta pedir só uma concordância geral.";

/** Exemplos concretos de comportamento observável, por área. Usados nas regras de sim/não. */
const EXEMPLOS_CRITERIO: Record<FocusArea, string> = {
  tecnico:
    "'ruim é não tratar lista vazia e só perceber quando alguém aponta'; 'bom é escolher a estrutura de dados certa e explicar a escolha'",
  pressao: "'bom é continuar explicando o raciocínio quando o requisito muda'; 'ruim é travar ou desistir quando algo muda no meio'",
  escala_produto:
    "'bom é resolver com solução simples e complexidade baixa'; 'ruim é complexidade muito alta que fica ruim com muitos dados'",
  uso_ia: "'bom é mostrar onde o LLM entra no desenho e como o agente trata erro'; 'ruim é tratar a IA como caixa-preta'",
};

const EXEMPLOS_QUER: Record<FocusArea, string> = {
  tecnico: "'implementar bem os algoritmos', 'código limpo e testado', 'saber estrutura de dados'",
  pressao: "'quero ver como ele lida com prazo curto', 'ambiente acelerado, com prioridade mudando toda semana'",
  escala_produto: "'escalabilidade', 'algoritmo que aguente volume', 'soluções simples com complexidade baixa'",
  uso_ia: "'IA aplicada', 'construir agentes', 'RAG e tool calling', 'integrar LLM no produto'",
};

const EXEMPLOS_DISPENSA: Record<FocusArea, string> = {
  tecnico: "'isso não é tão importante pra gente', 'pode diminuir a parte de algoritmo'",
  pressao: "'coloca menos pressão', 'pressão eu tiraria', 'não precisa ser muito rigoroso com prazo'",
  escala_produto: "'escala não é prioridade agora', 'pode tirar a parte de escalabilidade'",
  uso_ia: "'pode tirar IA', 'IA aplicada não pesa tanto'",
};

function criterioDaArea(area: FocusArea): Topico {
  const nome = NOME_AREA_FALA[area];
  return {
    id: `criterio_${area}`,
    area,
    pergunta: `A recrutadora descreveu pelo menos um comportamento concreto e observável, bom ou ruim, SOBRE ${nome}?`,
    sinal_sim:
      `Sim se o comportamento descrito é sobre ${nome}: algo que se vê na entrevista, bom ou ruim, nessa área. Basta um lado. ` +
      `Exemplos: ${EXEMPLOS_CRITERIO[area]}. Falar de outra área não conta: por exemplo, falar de algoritmos ou de escala não serve para ${nome}.`,
    sinal_nao:
      `Não se ela foi genérica, ou só disse que a área é importante, ou o comportamento que descreveu é de outra área, sem nada observável em ${nome}. ` +
      "Exemplos de genérico: 'quero alguém bom', 'alguém que saiba bem', 'um pouco de cada', 'implementar bem os algoritmos'.",
  };
}

function quererDaArea(area: FocusArea): Pergunta {
  const nome = NOME_AREA_FALA[area];
  return {
    id: `quer_${area}`,
    pergunta: `Considerando a conversa inteira, a recrutadora quer avaliar ${nome}?`,
    sinal_sim: `Sim se ela disse que quer avaliar ou priorizar ${nome}, mesmo com outras palavras. Exemplos: ${EXEMPLOS_QUER[area]}.`,
    sinal_nao: `Não se ela não pediu isso. Citar a área de passagem, sem querer avaliá-la, não conta.`,
  };
}

function dispensaDaArea(area: FocusArea): Pergunta {
  const nome = NOME_AREA_FALA[area];
  return {
    id: `dispensa_${area}`,
    pergunta: `A recrutadora disse que ${nome} não importa para a avaliação, ou que pode tirar ou diminuir essa área?`,
    sinal_sim: `Sim se ela disse que a área não é prioridade ou que pode tirar ou diminuir. Exemplos: ${EXEMPLOS_DISPENSA[area]}.`,
    sinal_nao:
      `Não se ela não disse que ${nome} perde importância. Se ela só falou de outra área (ex.: 'foco em escalabilidade'), ` +
      "isso não tira as outras do foco.",
  };
}

/**
 * Tópicos de cobertura, na ordem: confirmação inicial → critério por área (área do foco primeiro) → opcionais.
 * Áreas que o formato não mede não têm critério, então não viram tópico.
 */
export function topicosDo(r: Rascunho): Topico[] {
  const doFoco = [...r.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area);
  const areas = [...new Set([...doFoco, ...AREAS])].filter((a) => mede(r.mode, a));
  return [
    {
      id: "confirmou_inicio",
      pergunta: "A recrutadora respondeu à proposta do agente (formato, senioridade e foco) concordando ou corrigindo algum dos três?",
      sinal_sim:
        "Sim se ela concordou com a proposta (ex.: 'faz sentido', 'pode ser', 'confere', 'isso, pleno') " +
        "ou corrigiu algum dos três (ex.: 'pode continuar pela de live coding', 'tava pensando em focar mais em algoritmos', 'é sênior, não pleno').",
      sinal_nao:
        "Não se a resposta não fala de formato, senioridade nem foco (ex.: só cumprimenta ou pergunta outra coisa sobre a vaga), " +
        "e não há nenhuma concordância nem correção.",
    },
    ...areas.map(criterioDaArea),
    {
      id: "eliminatorios",
      opcional: true,
      pergunta: "A recrutadora disse que algo reprova o candidato sozinho, sem depender do resto (eliminatório)?",
      sinal_sim:
        "Sim se ela citou um ponto eliminatório de forma explícita: usou 'eliminatório', 'reprovo', 'desclassifica', " +
        "ou disse que um comportamento específico reprova direto (ex.: 'se não considerar falha de rede, eliminatório').",
      sinal_nao:
        "Não se ela não citou nenhum ponto que reprove sozinho. Um critério de nota (ex.: 'código confuso é ruim') não é eliminatório.",
    },
    {
      id: "logistica",
      opcional: true,
      pergunta: "A recrutadora falou de duração da entrevista, de tom ou de dicas para o candidato?",
      sinal_sim:
        "Sim se ela disse uma duração em minutos (ex.: 'uns 40 minutos'), um tom (ex.: 'mais amigável', 'mais desafiadora') " +
        "ou se pode haver dicas (ex.: 'dica leve se travar', 'sem dicas, que se vire').",
      sinal_nao: "Não se ela não falou de duração, tom nem dicas.",
    },
  ];
}

/** Ela disse, nesta última fala, que algo reprova o candidato sozinho? Por turno, para o guia (ver `pesos.ts`). */
const DISSE_ELIMINATORIO: Pergunta = {
  id: "disse_eliminatorio",
  pergunta: "Na última fala da recrutadora, ela disse que algo reprova o candidato sozinho, sem depender do resto (eliminatório)?",
  sinal_sim:
    "Sim se, nessa última fala, ela citou um ponto eliminatório: 'eliminatório', 'reprovo', 'desclassifica', ou um comportamento que reprova direto.",
  sinal_nao: "Não se a última fala não citou nenhum ponto que reprove sozinho. Um critério de nota não é eliminatório.",
};

/**
 * Sinais do turno: quer/dispensa por área, resposta vaga, dúvida, pedido de mudança, aprovação do resumo e a escolha
 * sobre a troca de formato (só faz sentido logo depois da oferta, mas o Jev responde sempre; o planejador decide se usa).
 */
function sinaisDo(): Pergunta[] {
  return [
    ...AREAS.map(quererDaArea),
    ...AREAS.map(dispensaDaArea),
    DISSE_ELIMINATORIO,
    {
      id: "escolheu_trocar_formato",
      pergunta:
        "Na última fala, a recrutadora escolheu trocar para o outro formato de entrevista, o que o Totti ofereceu como alternativa?",
      sinal_sim:
        "Sim se ela escolheu o outro formato: 'vamos de system design', 'pode ser system design', 'troca pra system design', 'prefiro desenhar'.",
      sinal_nao: "Não se ela escolheu manter o formato atual, deixou a área para depois, ou respondeu outra coisa, inclusive uma dúvida.",
    },
    {
      id: "escolheu_proxima_etapa",
      pergunta: "Na última fala, a recrutadora escolheu deixar a área que o formato não mede para a próxima etapa do processo?",
      sinal_sim:
        "Sim se ela disse que a área fica para depois, na próxima etapa ou fase do processo: 'deixa pra próxima etapa', 'IA fica pra depois', 'isso vai pra próxima fase'.",
      sinal_nao: "Não se ela escolheu outro formato, disse que a área não precisa ser avaliada de jeito nenhum, ou respondeu outra coisa.",
    },
    {
      id: "escolheu_seguir_sem",
      pergunta: "Na última fala, a recrutadora escolheu seguir a entrevista sem essa área, sem avaliá-la nem deixá-la para depois?",
      sinal_sim:
        "Sim se ela disse para seguir sem a área, sem avaliar: 'segue sem isso', 'pode seguir sem IA', 'não precisa avaliar isso'.",
      sinal_nao:
        "Não se ela escolheu outro formato ou deixar para a próxima etapa, ou respondeu outra coisa. Deixar para a próxima etapa é outra escolha.",
    },
    {
      id: "resposta_vaga",
      pergunta: "A última fala da recrutadora foi genérica, sem nenhum comportamento observável, como resposta à última fala do agente?",
      sinal_sim:
        "Sim se ela respondeu de forma vaga: 'quero alguém bom', 'alguém que saiba bem', 'um pouco de cada', " +
        "'implementar bem os algoritmos', 'depende'. Genérico continua sendo genérico mesmo que seja bem-intencionado.",
      sinal_nao:
        "Não se ela deu um comportamento concreto ('ruim é não saber explicar o que a solução faz'), escolheu entre opções concretas, ou respondeu outra coisa.",
    },
    {
      id: "pediu_system_design",
      pergunta: "Na última fala, a recrutadora pediu para fazer system design (desenhar a arquitetura num quadro) nesta entrevista?",
      sinal_sim:
        "Sim se ela pediu o formato de system design: 'quero system design', 'prefiro desenhar a arquitetura', 'faz system design'.",
      sinal_nao:
        "Não se ela só perguntou ou criticou o system design ('por que system design?'), escolheu live coding, ou respondeu outra coisa.",
    },
    {
      id: "quer_tom_desafiador",
      pergunta: "Na última fala, a recrutadora pediu um tom mais desafiador, exigente ou firme para a entrevista?",
      sinal_sim: "Sim se ela pediu tom mais duro: 'mais desafiadora', 'quero um tom mais firme', 'bem exigente'.",
      sinal_nao: "Não se ela não falou de tom, ou pediu tom mais leve.",
    },
    {
      id: "quer_tom_amigavel",
      pergunta: "Na última fala, a recrutadora pediu um tom mais amigável, leve ou tranquilo para a entrevista?",
      sinal_sim: "Sim se ela pediu tom mais leve: 'mais amigável', 'tranquilo', 'sem clima pesado', 'mais de boa'.",
      sinal_nao: "Não se ela não falou de tom, ou pediu tom mais duro.",
    },
    {
      id: "quer_sem_dicas",
      pergunta: "Na última fala, a recrutadora pediu que não haja dicas para o candidato, ou que se tire a dica?",
      sinal_sim: "Sim se ela pediu sem dicas: 'tira a dica', 'sem dicas', 'que se vire', 'nada de dica'.",
      sinal_nao: "Não se ela não falou de dicas, ou pediu dica leve ou dica se ele travar.",
    },
    {
      id: "quer_dicas",
      pergunta: "Na última fala, a recrutadora pediu que haja dicas para o candidato (leves, se ele travar, ou ajuda)?",
      sinal_sim: "Sim se ela pediu dicas: 'dica leve se travar', 'pode dar uma dica', 'com dica'.",
      sinal_nao: "Não se ela não falou de dicas, ou pediu para tirar.",
    },
    {
      id: "fez_pergunta",
      pergunta:
        "A última fala da recrutadora é uma pergunta ou dúvida dirigida ao Totti (sobre o formato, a avaliação ou o processo), e não uma resposta?",
      sinal_sim:
        "Sim se ela perguntou ao Totti como a entrevista é avaliada, como funciona o formato ou o processo: " +
        "'mas como isso vai ser avaliado num live code?', 'isso acontece na entrevista toda?', 'e se ele não usar IA, conta?'.",
      sinal_nao:
        "Não se ela respondeu ao Totti (concordou, corrigiu, escolheu uma opção, descreveu um comportamento), pediu mudança " +
        "('tira a dica leve', 'muda pra quarenta e cinco'), aprovou o resumo ('pode finalizar?', 'tá bom') ou fez pergunta que não é sobre a entrevista.",
    },
    {
      id: "pediu_mudanca",
      pergunta: "Na última fala, a recrutadora pediu para mudar, tirar ou acrescentar algo?",
      sinal_sim:
        "Sim se ela pediu uma alteração: 'tira a dica leve', 'muda o tom', 'põe quarenta e cinco minutos', " +
        "'acrescenta que falha de rede é eliminatória', 'sem pressão'.",
      sinal_nao: "Não se ela só aprovou ('pode finalizar', 'tá bom'), respondeu ao Totti sem pedir nada novo, ou só fez uma pergunta.",
    },
    {
      id: "aprovou_resumo",
      pergunta: "A última fala da recrutadora aprova o resumo que o agente acabou de fazer e autoriza finalizar?",
      sinal_sim: "Sim se ela concordou em finalizar: 'pode finalizar', 'tá bom', 'beleza, pode', 'confirmo', 'perfeito'.",
      sinal_nao: "Não se ela pediu mudança ('muda o tom', 'tira pressão', 'espera'), fez pergunta ou respondeu outra coisa.",
    },
  ];
}

/** Última fala do agente na transcrição, se houver. */
export function ultimaFalaDoAgente(transcricao: Turno[]): string | undefined {
  return transcricao.filter((t) => t.role === "agente").at(-1)?.text;
}

/** Junta duas leituras de cobertura: para cada tópico vale o maior valor. Só sobe. Função pura. */
export function mesclarCobertura(anterior: Record<string, number>, nova: Record<string, number>): Record<string, number> {
  const resultado = { ...anterior };
  for (const [id, p] of Object.entries(nova)) resultado[id] = Math.max(anterior[id] ?? 0, p);
  return resultado;
}

/**
 * Áreas "em jogo" agora: as do foco do rascunho, mais as que ela quer avaliar, menos as que ela dispensou
 * e menos as que ela deixou de fora pela troca de formato (`decisoes`). Usa os sinais mais recentes, então vale
 * antes de o extrator (lento) atualizar o rascunho. Função pura.
 */
export function areasEmJogo(
  focus: Array<{ area: FocusArea }>,
  sinais: Record<string, number>,
  decisoes: DecisoesTradeoff = {},
): FocusArea[] {
  const sinal = (id: string) => sinais[id] ?? 0;
  const noFoco = focus.map((f) => f.area);
  const pedidas = AREAS.filter((a) => sinal(`quer_${a}`) >= LIMIAR);
  const dispensadas = new Set(AREAS.filter((a) => sinal(`dispensa_${a}`) >= LIMIAR));
  const deixadas = new Set(areasFora(decisoes));
  return [...new Set<FocusArea>([...noFoco, ...pedidas])].filter((a) => !dispensadas.has(a) && !deixadas.has(a));
}

function faltandoDo(topicos: Topico[], cobertura: Record<string, number>, emJogo: FocusArea[]): Topico[] {
  return topicos.filter((t) => !t.opcional && (t.area === undefined || emJogo.includes(t.area)) && (cobertura[t.id] ?? 0) < LIMIAR);
}

/**
 * Chama o Jev para os tópicos e os sinais. A cobertura é cumulativa (`mesclarCobertura`);
 * os sinais são a leitura deste turno. Não muta `r`.
 */
export async function avaliarCobertura(r: Rascunho, transcricao: Turno[], contexto: ContextoCobertura = {}): Promise<Cobertura> {
  const topicos = topicosDo(r);
  const sinais = sinaisDo();
  const inicio = Date.now();

  const request = {
    state: {
      tarefa: TAREFA_COBERTURA,
      rascunho_atual: { mode: r.mode, seniority: r.seniority, focus: r.focus },
      ultima_fala_do_agente: contexto.ultimaFalaAgente ?? "(nenhuma)",
      transcricao,
    },
    questions: {
      ...Object.fromEntries([...topicos, ...sinais].map((p) => [p.id, noul(p.pergunta, { true: p.sinal_sim, false: p.sinal_nao })])),
      nivel_dito: NIVEL_DITO,
    },
  };
  const { answers, model, usage } = await jev().systemOne(request);
  // As perguntas são `noul` (sim/não), `score` ou `choice`; o tipo do SDK não distingue, então lê-se aqui.
  const respostas = answers as Record<string, { noul?: number; score?: number; choice?: string }>;
  const escolhidoNivel = respostas.nivel_dito?.choice;
  const nivelDito: NivelDito =
    escolhidoNivel === "junior" || escolhidoNivel === "pleno" || escolhidoNivel === "senior" ? escolhidoNivel : "nao_disse";

  const cobertura = mesclarCobertura(r.cobertura, Object.fromEntries(topicos.map((t) => [t.id, respostas[t.id].noul ?? 0])));
  const sinaisDoTurno: Record<string, number> = Object.fromEntries(sinais.map((s) => [s.id, respostas[s.id].noul ?? 0]));
  const emJogo = areasEmJogo(r.focus, sinaisDoTurno);

  return {
    cobertura,
    nivelDito,
    sinais: sinaisDoTurno,
    faltando: faltandoDo(topicos, cobertura, emJogo),
    ms: Date.now() - inicio,
    request,
    answers,
    model,
    usage,
  };
}

/**
 * Grava a cobertura no rascunho e recalcula `pendencias` (só as áreas em jogo, sem os opcionais).
 * Sem `emJogo`, vale o foco do rascunho. Função pura.
 */
export function aplicarCobertura(r: Rascunho, cobertura: Record<string, number>, emJogo = areasEmJogo(r.focus, {})): Rascunho {
  const pendencias = faltandoDo(topicosDo(r), cobertura, emJogo).map((t) => t.id);
  return { ...r, cobertura, pendencias };
}

/** Nível de ênfase de uma área na última fala da recrutadora. Os exemplos são os que o Jev usa para escolher. */
function nivelDaFala(area: FocusArea) {
  const nome = NOME_AREA_FALA[area];
  return choice(`Na ÚLTIMA fala da recrutadora, o que ela disse sobre ${nome}?`, {
    nao_falou: { quando: "a fala não tocou nessa área, nem de passagem." },
    dispensou: {
      quando: "disse que a área não precisa, que pode tirar, que é sem muita ênfase ou que não é tanto sobre ela.",
      exemplos: "'não precisa', 'sem muita pressão', 'pode tirar', 'não é tanto sobre algoritmos'",
    },
    secundaria: {
      quando: "disse que a área pesa menos, ou que também conta.",
      exemplos: "'pesa menos', 'um pouco', 'também conta'",
    },
    respondeu: {
      quando: "descreveu o que espera nessa área, inclusive ao responder uma pergunta do Totti sobre ela.",
      exemplos: "'quero ver se implementam algoritmos de forma simples', 'vejo quando ele calcula o custo'",
    },
    central: {
      quando: "disse que é o principal ou o mais importante, que é eliminatório, ou trouxe a área por conta própria como foco.",
      exemplos: "'o principal é', 'o mais importante', 'é eliminatório', 'quero focar em idempotência e falhas'",
    },
  });
}

/** O que a última fala da recrutadora diz sobre cada área, e o que foi perguntado (ver `enfase.ts`). */
export interface EnfaseFala {
  niveis: Partial<Record<FocusArea, NivelEnfase>>;
  ms: number;
  model: string;
  request: { state: unknown; questions: unknown };
  answers: unknown;
}

/**
 * Classifica só a última fala da recrutadora, com a última pergunta do Totti, em um nível por área.
 * A conversa inteira não entra aqui: quem acumula é `acumularEnfase`.
 */
export async function avaliarEnfaseDaFala(transcricao: Turno[]): Promise<EnfaseFala> {
  const dela = transcricao.filter((t) => t.role === "recrutadora").at(-1)?.text;
  const perguntaDaTotti = transcricao.filter((t) => t.role === "agente").at(-1)?.text ?? "(nenhuma)";
  const request = {
    state: {
      tarefa:
        "Você lê UMA fala da recrutadora numa pré-entrevista e diz o que ela disse sobre cada área, em relação à pergunta do Totti logo antes.",
      ultima_pergunta_da_totti: perguntaDaTotti,
      ultima_fala_da_recrutadora: dela ?? "(nenhuma)",
    },
    questions: Object.fromEntries(AREAS.map((area) => [`enfase_fala_${area}`, nivelDaFala(area)])),
  };
  if (!dela) return { niveis: {}, ms: 0, model: "", request, answers: {} };

  const inicio = Date.now();
  const { answers, model } = await jev().systemOne(request);
  const respostas = answers as Record<string, { choice?: string }>;
  const niveis: Partial<Record<FocusArea, NivelEnfase>> = {};
  for (const area of AREAS) {
    const escolhido = respostas[`enfase_fala_${area}`]?.choice;
    niveis[area] = NIVEIS_ENFASE.includes(escolhido as NivelEnfase) ? (escolhido as NivelEnfase) : "nao_falou";
  }
  return { niveis, ms: Date.now() - inicio, model, request, answers };
}
