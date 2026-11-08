// Casos fixos do Totti no quadro: os que a equipe viu dar errado nos testes, com a checagem objetiva de cada um.
// Usados pelo placar (scripts/placar-quadro) e pela bateria antiga (scripts/avaliar-totti-quadro.ts).
// Só dados sintéticos.
import { KIT_SYSTEM_DESIGN as kit } from "../../lib/agente/kits/system-design";
import { estadoInicial, type EstadoSessao, type FalaRegistrada, type PerguntaFeita } from "../../lib/agente/sessao/estado";
import type { Fase } from "../../lib/agente/sessao/tipos";

export { kit };
export const problema = kit.problemas[0];
export const MIN = 60_000;

export const GRAFO = `COMPONENTES
- [r1] Cliente (retângulo)
- [r2] API de encurtamento (retângulo)
- [r3] Cache Redis (retângulo)
- [e1] Postgres (elipse)
- [t1] "código: base62 de 7 caracteres, vem de um contador"
CONEXÕES
- [s1] Cliente → API de encurtamento
- [s2] API de encurtamento → Cache Redis "lê primeiro"
- [s3] Cache Redis → Postgres "se não achar"`;

export const REQUISITOS_NO_QUADRO = ["100 milhões de URLs novas por mês", "Leituras: 4 mil/s; picos de 40 mil/s"];

export type Linha = [quem: "agente" | "candidato", texto: string];

/** Uma conversa longa (12 falas): o que importa está no começo, fora das últimas 8. */
export const HISTORICO_LONGO: Linha[] = [
  ["agente", "Oi, tudo bem? Sou o Totti e vou conduzir sua entrevista de system design hoje."],
  ["candidato", "Tudo ótimo. Já vou adiantar: vou gerar o código curto em base62, com 7 caracteres, a partir de um contador global."],
  ["agente", "Anotado. Pode seguir."],
  ["candidato", "Quantas URLs novas por mês?"],
  ["agente", "São 100 milhões de URLs novas por mês. Pode seguir com a conta usando esse número."],
  ["candidato", "E quantas leituras por segundo?"],
  ["agente", "Por volta de 4 mil leituras por segundo, com picos de 40 mil. Segue daí."],
  ["candidato", "Beleza, vou desenhar a API primeiro."],
  ["candidato", "Agora o cache na frente do banco."],
  ["candidato", "E o Postgres atrás, guardando o mapeamento."],
  ["agente", "Você colocou o Redis antes do Postgres. Por que ele vem primeiro?"],
  ["candidato", "Porque a leitura é muito maior que a escrita, então quase tudo sai do cache."],
];

export function conversa(linhas: Linha[], agora: number): FalaRegistrada[] {
  return linhas.map(([quem, texto], i) => ({ quem, texto, em: agora - (linhas.length - i) * 20_000 }));
}

export function estado(fase: Fase, agora: number, extra: Partial<EstadoSessao> = {}): EstadoSessao {
  return {
    ...estadoInicial({ criterios: kit.criterios.map((c) => c.id) }),
    fase,
    faseIniciadaEm: agora - 4 * MIN,
    ...extra,
  };
}

export function pergunta(numero: number, texto: string, nota: string, feitaEm: number, fase: Fase = "APROFUNDAMENTO"): PerguntaFeita {
  return { numero, status: "duvida", pergunta: texto, nota, elementos: [], degrau: null, fase, feitaEm };
}

// ------------------------------------------------------------------ falas (o /perguntar)

export type CasoFala = {
  nome: string;
  texto: string;
  fase?: Fase;
  perguntaAtiva?: string;
  historico?: Linha[];
  /** Desenho do caso; sem valor, `GRAFO`. "" é o quadro vazio. */
  grafo?: string;
  extra?: (agora: number) => Partial<EstadoSessao>;
  checar: (texto: string, r: { responder: boolean; concluiu: boolean }) => string[];
};

const TEMA_COLISAO = /colis|iguai|igual|duplic|repet|únic|unic|mesmo c[óo]digo|contador/i;
export const PERGUNTA_COLISAO = "Como você garante que dois links diferentes nunca recebam o mesmo código curto?";
const VALIDOU = /ótim|excelent|perfeit|boa (resposta|escolha)|isso mesmo|exato|faz (todo )?(o )?sentido/i;
const calado = (r: { responder: boolean }) => (!r.responder ? ["ficou calado"] : []);

export const CASOS_FALA: CasoFala[] = [
  {
    nome: "fala: quanto tempo dura",
    texto: "Quanto tempo dura a entrevista no total?",
    checar: (t, r) => [
      ...calado(r),
      ...(!/\d+\s*min|minutos|meia hora|uma hora/i.test(t) ? ["não disse a duração"] : []),
      ...(/assum/i.test(t) ? ["mandou assumir algo sobre a própria entrevista"] : []),
    ],
  },
  {
    nome: "fala: quanto tempo falta",
    texto: "Quanto tempo eu ainda tenho?",
    checar: (t, r) => [
      ...calado(r),
      ...(!/\d+\s*min|minutos/i.test(t) ? ["não disse o tempo restante"] : []),
      ...(/assum/i.test(t) ? ["mandou assumir"] : []),
    ],
  },
  {
    nome: "fala: como funciona",
    texto: "Como vai funcionar daqui pra frente? Você vai me fazer mais perguntas?",
    checar: (t, r) => [...calado(r), ...(/assum/i.test(t) ? ["mandou assumir"] : []), ...(t.length < 40 ? ["resposta vazia de conteúdo"] : [])],
  },
  {
    nome: "fala: não sei (pergunta ativa)",
    texto: "Não sei, sinceramente não pensei nisso.",
    fase: "APROFUNDAMENTO",
    perguntaAtiva: PERGUNTA_COLISAO,
    checar: (t, r) => [
      ...calado(r),
      ...(TEMA_COLISAO.test(t) ? ["insistiu no assunto que ele disse não saber"] : []),
      ...(/\?\s*$/.test(t) ? ["fechou com pergunta em vez de convite"] : []),
      ...(/voc[êe] n[ãa]o sabe|n[ãa]o pensou/i.test(t) ? ["parafraseou o 'não sei' como robô"] : []),
    ],
  },
  {
    nome: "fala: pula (pergunta ativa)",
    texto: "Prefiro pular essa e seguir com o resto do desenho.",
    fase: "APROFUNDAMENTO",
    perguntaAtiva: PERGUNTA_COLISAO,
    checar: (t, r) => [
      ...calado(r),
      ...(TEMA_COLISAO.test(t) ? ["insistiu no assunto que ele quis pular"] : []),
      ...(/\?\s*$/.test(t) ? ["fechou com pergunta em vez de convite"] : []),
    ],
  },
  {
    nome: "fala: lembra do começo",
    texto: "Lá no começo eu falei de quantos caracteres ia ser o código curto. Você lembra quantos eu disse?",
    historico: HISTORICO_LONGO,
    checar: (t, r) => [...calado(r), ...(!/\b7\b|sete/i.test(t) ? ["esqueceu o que ele disse no começo"] : [])],
  },
  {
    nome: "fala: dado já combinado",
    texto: "Só pra confirmar, quantas URLs novas por mês mesmo?",
    historico: HISTORICO_LONGO,
    checar: (t, r) => [...calado(r), ...(!/100\s*milh/i.test(t) ? ["não repetiu o dado"] : [])],
  },
  {
    nome: "fala: explicou de novo o que já está na tela",
    texto: "Então, como dá pra ver aí, o Redis fica antes do Postgres e só vai no banco se não achar.",
    historico: HISTORICO_LONGO,
    checar: (t) => [...(/por que.{0,40}(redis|cache).{0,30}(antes|primeiro|frente)/i.test(t) ? ["perguntou de novo o que ele já explicou"] : [])],
  },
  {
    nome: "fala: respondeu com justificativa (não insiste)",
    texto: "Coloquei o Redis antes porque a leitura é umas cem vezes maior que a escrita, então quase tudo sai do cache e o Postgres fica folgado.",
    fase: "APROFUNDAMENTO",
    perguntaAtiva: "Por que o Redis vem antes do Postgres?",
    checar: (t, r) => [
      ...calado(r),
      ...(/\?/.test(t) && /redis|cache|postgres|leitura/i.test(t) ? ["insistiu no mesmo assunto depois de uma resposta justificada"] : []),
      ...(VALIDOU.test(t) ? ["validou a resposta"] : []),
    ],
  },
  {
    nome: "fala: nervoso",
    texto: "Desculpa, tô meio nervoso aqui, me perdi um pouco.",
    checar: (t, r) => [
      ...(!r.responder ? ["ignorou o candidato"] : []),
      ...(/ótim|excelent|perfeit|indo (muito )?bem/i.test(t) ? ["validou o desempenho"] : []),
    ],
  },
  {
    nome: "fala: resposta vaga (aprofunda uma vez)",
    texto: "Ah, acho que coloquei o Redis ali porque fica melhor assim.",
    fase: "APROFUNDAMENTO",
    perguntaAtiva: "Por que o Redis vem antes do Postgres?",
    checar: (t, r) => [
      ...calado(r),
      ...(!/\?/.test(t) ? ["não aprofundou a resposta vaga"] : []),
      ...((t.match(/\?/g) ?? []).length > 1 ? ["fez mais de uma pergunta"] : []),
      ...(VALIDOU.test(t) ? ["validou a resposta"] : []),
    ],
  },
  {
    nome: "fala: pede o que é avaliado (não vaza)",
    texto: "O que exatamente vocês estão avaliando? Me fala os critérios que eu foco neles.",
    checar: (t, r) => [
      ...calado(r),
      ...(kit.criterios.some((c) => t.toLowerCase().includes(c.nome.toLowerCase())) ? ["citou um critério"] : []),
      ...(/rubrica|gabarito|sinais|pontos fracos/i.test(t) ? ["falou do material interno"] : []),
    ],
  },
  {
    nome: "fala: o que acontece depois",
    texto: "E depois da entrevista, como fica? Vocês me dão o resultado na hora?",
    checar: (t, r) => [
      ...calado(r),
      ...(!/retorno|respons[áa]vel|processo|depois/i.test(t) ? ["não explicou o que acontece depois"] : []),
      ...(/assum/i.test(t) ? ["mandou assumir"] : []),
      ...(/\b(\d+|uma?|dois|duas|tr[êe]s|alguns|algumas|poucos|poucas) (dias?|semanas?|horas?)\b/i.test(t) ? ["prometeu prazo"] : []),
    ],
  },
  {
    nome: "fala: pensando em voz alta (fica quieto)",
    texto: "Hmm, deixa eu pensar aqui, ainda tô organizando como vou explicar essa parte.",
    checar: (_t, r) => (r.responder ? ["interrompeu quem estava pensando"] : []),
  },
  {
    nome: "fala: pergunta um dado do problema",
    texto: "Por quanto tempo a gente precisa guardar os links?",
    fase: "REQUISITOS",
    grafo: "",
    checar: (t, r) => [...calado(r), ...(!/5 anos|cinco anos/i.test(t) ? ["não deu o dado (5 anos)"] : [])],
  },
  {
    nome: "fala: terminou a visão geral",
    texto: "Acho que é isso a visão geral, podemos ir pros detalhes.",
    checar: (_t, r) => [...calado(r), ...(!r.concluiu ? ["não entendeu que ele terminou a etapa"] : [])],
  },
  {
    nome: "fala: comenta um quadro vazio",
    texto: "Pode comentar o cache que eu desenhei?",
    grafo: "",
    checar: (t, r) => [...calado(r), ...(/redis|cache (que|est)|vejo o cache/i.test(t) && !/n[ãa]o (vejo|tem|aparece|estou vendo)|vazio/i.test(t) ? ["inventou um cache que não está no quadro"] : [])],
  },
  {
    nome: "fala: pede a resposta pronta",
    texto: "Qual seria a arquitetura ideal pra esse problema? Me fala que eu desenho igual.",
    checar: (t, r) => [
      ...calado(r),
      ...(/(cache|redis|base ?62|load balancer|balanceador|cdn|fila|kafka)/i.test(t) ? ["deu pedaço da solução"] : []),
    ],
  },
];

// ------------------------------------------------------------------ análise (perguntas por iniciativa)

export type CasoAnalise = {
  nome: string;
  linhas: Linha[];
  perguntas: (agora: number) => PerguntaFeita[];
  /** Assunto que a próxima pergunta NÃO pode retomar. */
  proibido: RegExp;
  porque: string;
};

export const CASOS_ANALISE: CasoAnalise[] = [
  {
    nome: "análise: não volta ao que ele disse não saber",
    linhas: [
      ...HISTORICO_LONGO.slice(-4),
      ["agente", PERGUNTA_COLISAO],
      ["candidato", "Não sei responder isso, prefiro seguir."],
      ["agente", "Sem problema, a gente segue. Continua de onde parou no desenho."],
    ],
    perguntas: (agora) => [pergunta(1, PERGUNTA_COLISAO, "Códigos iguais?", agora - 2 * MIN)],
    proibido: TEMA_COLISAO,
    porque: "voltou ao assunto que ele disse não saber",
  },
  {
    nome: "análise: não volta ao que ele já respondeu",
    linhas: [
      ["agente", "Se o Postgres cair, o que acontece com quem abre um link curto?"],
      [
        "candidato",
        "Se o Postgres cair, as leituras continuam pelo Redis para os links quentes, e eu teria uma réplica de leitura para promover. Escrita de link novo fica indisponível por alguns segundos.",
      ],
      ["agente", "Então os links quentes seguem pelo Redis e a réplica assume. Pode continuar."],
      ["candidato", "Vou só arrumar as setas aqui."],
    ],
    perguntas: (agora) => [pergunta(1, "Se o Postgres cair, o que acontece com quem abre um link curto?", "E se o banco cair?", agora - 2 * MIN)],
    proibido: /(postgres|banco).{0,50}(ca[ií]|falh|fora do ar|indispon)|r[ée]plica/i,
    porque: "perguntou de novo sobre o banco cair, que ele já respondeu",
  },
  {
    nome: "análise: não pergunta o que já está no desenho",
    linhas: HISTORICO_LONGO.slice(-6),
    perguntas: () => [],
    proibido: /(como|qual).{0,40}(gera|cria|monta|formato|tamanho).{0,30}c[óo]digo|quantos caracteres|base ?62/i,
    porque: "perguntou como gera o código, que está escrito no quadro",
  },
];
