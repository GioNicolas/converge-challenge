/**
 * Cobertura e sinais: o que a conversa já deixou claro e o que a recrutadora quer avaliar.
 *
 * O Jev responde, em uma chamada, uma pergunta de sim/não por item (`noul` = probabilidade de sim).
 *  - Tópicos (`topicosDo`) são cumulativos: uma vez cobertos (probabilidade de pelo menos 0,6), seguem cobertos.
 *  - Sinais (`sinaisDo`) valem a leitura do turno atual, porque a recrutadora pode mudar de ideia:
 *    quer/dispensa por área, se a última resposta foi vaga e se ela aprovou o resumo.
 * O planejador (`planejador.ts`) usa os sinais para escolher o próximo passo da Totti.
 */
import { noul } from "@typesafe-ai/sdk";
import { FocusArea } from "@/lib/contracts";
import { jev } from "./jev";
import type { Rascunho, Turno } from "./rascunho";

/** Probabilidade a partir da qual um tópico está coberto e um sinal conta como verdadeiro. */
export const LIMIAR = 0.6;

export const AREAS = FocusArea.options;

/** Nome da área do jeito que a Totti fala. Nunca os rótulos internos. */
export const NOME_AREA_FALA: Record<FocusArea, string> = {
  tecnico: "algoritmos e código",
  pressao: "lidar com pressão",
  escala_produto: "escalabilidade",
  uso_ia: "uso de IA",
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

export interface Cobertura extends ChamadaJev {
  /** Probabilidade acumulada de cada tópico estar coberto, por id. */
  cobertura: Record<string, number>;
  /** Sinais deste turno (quer/dispensa por área, resposta vaga, aprovação do resumo), por id. */
  sinais: Record<string, number>;
  /** Tópicos obrigatórios das áreas em jogo que ainda não estão cobertos. */
  faltando: Topico[];
  ms: number;
}

export interface ContextoCobertura {
  /** Última fala da Totti, para os sinais que dependem do que foi perguntado (resposta vaga, aprovação do resumo). */
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
  uso_ia: "'bom é revisar o código gerado e achar um problema antes de rodar'; 'ruim é colar a resposta sem entender'",
};

const EXEMPLOS_QUER: Record<FocusArea, string> = {
  tecnico: "'implementar bem os algoritmos', 'código limpo e testado', 'saber estrutura de dados'",
  pressao: "'quero ver como ele lida com prazo curto', 'ambiente acelerado, com prioridade mudando toda semana'",
  escala_produto: "'escalabilidade', 'algoritmo que aguente volume', 'soluções simples com complexidade baixa'",
  uso_ia: "'IA', 'Copilot', 'Cursor', 'revisar o que a IA gera'",
};

const EXEMPLOS_DISPENSA: Record<FocusArea, string> = {
  tecnico: "'isso não é tão importante pra gente', 'pode diminuir a parte de algoritmo'",
  pressao: "'coloca menos pressão', 'pressão eu tiraria', 'não precisa ser muito rigoroso com prazo'",
  escala_produto: "'escala não é prioridade agora', 'pode tirar a parte de escalabilidade'",
  uso_ia: "'pode tirar IA', 'uso de IA não pesa tanto'",
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

/** Tópicos de cobertura, na ordem: confirmação inicial → critério por área (área do foco primeiro) → opcionais. */
export function topicosDo(r: Rascunho): Topico[] {
  const doFoco = [...r.focus].sort((a, b) => b.weight - a.weight).map((f) => f.area);
  const areas = [...new Set([...doFoco, ...AREAS])];
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

/** Sinais do turno: quer/dispensa por área, resposta vaga e aprovação do resumo. */
function sinaisDo(): Pergunta[] {
  return [
    ...AREAS.map(quererDaArea),
    ...AREAS.map(dispensaDaArea),
    {
      id: "resposta_vaga",
      pergunta: "A última fala da recrutadora foi genérica, sem nenhum comportamento observável, como resposta à última fala do agente?",
      sinal_sim:
        "Sim se ela respondeu de forma vaga: 'quero alguém bom', 'alguém que saiba bem', 'um pouco de cada', " +
        "'implementar bem os algoritmos', 'depende'. Genérico continua sendo genérico mesmo que seja bem-intencionado.",
      sinal_nao:
        "Não se ela deu um comportamento concreto ('ruim é colar o código sem entender'), escolheu entre opções concretas, ou respondeu outra coisa.",
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
 * Áreas "em jogo" agora: as do foco do rascunho, mais as que ela quer avaliar, menos as que ela dispensou.
 * Usa os sinais mais recentes, então vale antes de o extrator (lento) atualizar o rascunho. Função pura.
 */
export function areasEmJogo(focus: Array<{ area: FocusArea }>, sinais: Record<string, number>): FocusArea[] {
  const sinal = (id: string) => sinais[id] ?? 0;
  const noFoco = focus.map((f) => f.area);
  const pedidas = AREAS.filter((a) => sinal(`quer_${a}`) >= LIMIAR);
  const dispensadas = new Set(AREAS.filter((a) => sinal(`dispensa_${a}`) >= LIMIAR));
  return [...new Set<FocusArea>([...noFoco, ...pedidas])].filter((a) => !dispensadas.has(a));
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
    questions: Object.fromEntries([...topicos, ...sinais].map((p) => [p.id, noul(p.pergunta, { true: p.sinal_sim, false: p.sinal_nao })])),
  };
  const { answers, model, usage } = await jev().systemOne(request);

  const cobertura = mesclarCobertura(r.cobertura, Object.fromEntries(topicos.map((t) => [t.id, answers[t.id].noul])));
  const sinaisDoTurno: Record<string, number> = Object.fromEntries(sinais.map((s) => [s.id, answers[s.id].noul]));
  const emJogo = areasEmJogo(r.focus, sinaisDoTurno);

  return {
    cobertura,
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
