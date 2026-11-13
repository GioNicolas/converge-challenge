/**
 * Casos fixos de conversa da pré-entrevista: a recrutadora pede para repetir, diz que não entendeu, pede um tempo
 * ou pergunta outra coisa, num ponto escolhido da conversa. Roda com o LLM e o Jev reais, pelas mesmas funções do
 * servidor (`criarSessao`, `abrirConversa`, `conduzirTurno`), sem HTTP.
 *
 *   npm run pre:conversa                       # todos os casos
 *   npm run pre:conversa -- repetir-resumo     # só um (ou vários ids)
 *   npm run pre:conversa -- --estrito          # caso não montado também conta como falha
 *
 * Cada caso leva a conversa até o ponto desejado com um histórico de falas dela. Como o caminho depende do modelo,
 * o caso confere antes o passo em que a conversa está: se não chegou lá, sai como "não montado", sem contar como falha
 * (a não ser com `--estrito`, ou quando nenhum caso chegou ao ponto). O script lista todas as falhas, sem parar na
 * primeira, sai com erro se houver alguma, e imprime o tempo de espera pela fala testada de cada caso (p50 / p95).
 *
 * Precisa de `.env.local` com FEATHERLESS_API_KEY e TYPESAFE_API_KEY. A OpenRouter (modelos pagos de produção) só
 * entra com `--pago`, e aí precisa também de OPENROUTER_API_KEY (ver `scripts/_gasto.ts`).
 */
import { pago } from "../_gasto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import { normalizar, sobreposicao } from "@/lib/agente/guardas";
import { classificarVaga, type Classificacao, type Vaga } from "@/lib/pre-entrevista/classificador";
import { extrairCompetencias, type ResultadoCompetencias } from "@/lib/pre-entrevista/competencias";
import { contarFrases, falaDelaNaoEraResposta } from "@/lib/pre-entrevista/conversa";
import { normalizarTexto } from "@/lib/pre-entrevista/frases";
import { descreverPasso, nivelEmAberto, type Passo } from "@/lib/pre-entrevista/planejador";
import { criarSessao, extrairAgora, type Sessao } from "@/lib/pre-entrevista/sessoes";
import { abrirConversa, conduzirTurno } from "@/lib/pre-entrevista/turno";
import { checarEstilo, descreverTempos } from "./checagens";

/** Quanto a pergunta nova precisa ter das palavras da anterior para contar como a mesma pergunta. */
const LIMIAR_MESMA_PERGUNTA = 0.5;
/** Fala curta: resposta a pedido de tempo ou a comentário de conversa. */
const MAX_PALAVRAS_FALA_CURTA = 30;

/** O estado que um pedido de repetição não pode mudar. */
export interface Foto {
  ultimoPasso?: Passo;
  /** O passo em curso: o último, ou o que a dúvida respondida retomou (ver `emCurso`). */
  emCurso?: Passo;
  perguntasPorTopico: Record<string, number>;
  resumos: number;
  decisoesTradeoff: Sessao["plano"]["decisoesTradeoff"];
  foco: Sessao["rascunho"]["focus"];
  modo: Sessao["rascunho"]["mode"];
  nivelConfirmado: boolean;
  enfase: Sessao["enfaseEstado"];
  preferencias: Sessao["preferencias"];
  /** Última fala do Totti. */
  fala: string;
}

function fotografar(sessao: Sessao): Foto {
  return structuredClone({
    ultimoPasso: sessao.plano.ultimoPasso,
    emCurso: emCurso(sessao),
    perguntasPorTopico: sessao.plano.perguntasPorTopico,
    resumos: sessao.plano.resumos,
    decisoesTradeoff: sessao.plano.decisoesTradeoff,
    foco: sessao.rascunho.focus,
    modo: sessao.rascunho.mode,
    nivelConfirmado: sessao.rascunho.confirmado.seniority,
    enfase: sessao.enfaseEstado,
    preferencias: sessao.preferencias,
    fala: sessao.transcricao.filter((t) => t.role === "agente").at(-1)?.text ?? "",
  });
}

export interface Checagem {
  nome: string;
  ok: boolean;
  detalhe?: string;
}

export interface Resultado {
  antes: Foto;
  depois: Foto;
  /** Passo que `conduzirTurno` devolveu para a fala testada. */
  passo: Passo;
  sessao: Sessao;
}

export interface Caso {
  id: string;
  /** Id de uma vaga de `fixtures/pre-entrevista/vagas.ts`, ou a vaga inteira quando nenhuma das fixas serve. */
  vaga: string | Vaga;
  /** Falas dela que levam a conversa até o ponto. Param de ser enviadas assim que a conversa chega lá. */
  historico: string[];
  /** O ponto em que a fala é testada. */
  situacao: { descricao: string; chegou: (sessao: Sessao) => boolean };
  fala: string;
  conferir: (r: Resultado) => Checagem[];
}

// ---------------------------------------------------------------------------
// Checagens reutilizadas pelos casos
// ---------------------------------------------------------------------------

/**
 * As frases da fala. Frase só termina em pontuação seguida de espaço ou do fim, para "R$ 1.000" ou "3.5" não
 * cortarem a frase no meio.
 */
export function frasesDe(fala: string): string[] {
  return fala.split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter(Boolean);
}

/** Todas as perguntas da fala: as frases terminadas em "?", na ordem. */
export function perguntasDe(fala: string): string[] {
  return frasesDe(fala).filter((f) => f.endsWith("?"));
}

/** A parte da fala que é a pergunta em aberto: a última frase terminada em "?". */
export function perguntaDe(fala: string): string {
  return perguntasDe(fala).at(-1) ?? "";
}

/** Palavras curtas e conectivos que não dizem de que a pergunta trata. */
const VAZIAS = new Set("como qual quais quando onde porque para pela pelo voce isso esse essa este esta mais muito sobre entao".split(" "));

/**
 * Semelhança entre duas falas. É a `sobreposicao` das guardas, mas sem o mínimo de 3 palavras de conteúdo: aqui a
 * pergunta curta repetida ("E o pagamento duplicado?") precisa contar como a mesma.
 */
function semelhanca(a: string, b: string): number {
  const s = sobreposicao(a, b);
  if (s > 0) return s;
  const conteudo = (t: string) => new Set(normalizar(t).split(" ").filter((p) => p.length > 2 && !VAZIAS.has(p)));
  const ta = conteudo(a);
  const tb = conteudo(b);
  const menor = Math.min(ta.size, tb.size);
  if (menor === 0) return 0;
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  return comum / menor;
}

function palavras(fala: string): number {
  return fala.split(/\s+/).filter(Boolean).length;
}

const terminaEmPergunta = (r: Resultado): Checagem => ({
  nome: 'a fala termina em "?"',
  ok: r.depois.fala.trim().endsWith("?"),
});

/** A pergunta da fala nova tem as palavras da pergunta que estava em aberto. */
function mesmaPergunta(r: Resultado, nome = "traz de novo a pergunta que estava em aberto"): Checagem {
  const s = semelhanca(perguntaDe(r.depois.fala), perguntaDe(r.antes.fala));
  return { nome, ok: s >= LIMIAR_MESMA_PERGUNTA, detalhe: `sobreposição ${s.toFixed(2)} (limiar ${LIMIAR_MESMA_PERGUNTA})` };
}

/** Foco, ênfase, formato, nível, preferências e decisões de troca iguais aos de antes da fala. */
function planoIgual(r: Resultado): Checagem {
  const campos: Array<keyof Foto> = ["foco", "modo", "nivelConfirmado", "enfase", "preferencias", "decisoesTradeoff"];
  const mudaram = campos.filter((c) => !isDeepStrictEqual(r.antes[c], r.depois[c]));
  return { nome: "foco, ênfase e preferências iguais aos de antes", ok: mudaram.length === 0, detalhe: mudaram.length ? `mudou: ${mudaram.join(", ")}` : undefined };
}

/**
 * O passo em curso não avançou: mesmo passo em curso, mesmas contagens de pergunta e de resumo. Responder a fala
 * como dúvida e retomar o mesmo passo (`responder_duvida`) não conta como avanço.
 */
function passoNaoAvanca(r: Resultado): Checagem {
  const diferencas: string[] = [];
  if (!isDeepStrictEqual(r.antes.emCurso, r.depois.emCurso)) {
    diferencas.push(`passo foi de ${descrever(r.antes.emCurso)} para ${descrever(r.depois.emCurso)}`);
  }
  if (!isDeepStrictEqual(r.antes.perguntasPorTopico, r.depois.perguntasPorTopico)) {
    diferencas.push(`perguntas por tópico: ${JSON.stringify(r.antes.perguntasPorTopico)} -> ${JSON.stringify(r.depois.perguntasPorTopico)}`);
  }
  if (r.antes.resumos !== r.depois.resumos) diferencas.push(`resumos: ${r.antes.resumos} -> ${r.depois.resumos}`);
  return { nome: "o passo em curso não avança", ok: diferencas.length === 0, detalhe: diferencas.join("; ") || undefined };
}

function falaCurta(r: Resultado): Checagem {
  const n = palavras(r.depois.fala);
  const frases = contarFrases(r.depois.fala);
  return { nome: "fala curta", ok: frases <= 2 && n <= MAX_PALAVRAS_FALA_CURTA, detalhe: `${frases} frase(s), ${n} palavra(s)` };
}

/**
 * Sem pergunta nova: ou não pergunta nada, ou toda pergunta da fala é a que já estava em aberto. Confere cada
 * pergunta, não só a última: "Qual a duração? E o pagamento duplicado?" traz uma pergunta nova antes da retomada.
 */
export function semPerguntaNova(r: Resultado): Checagem {
  const aberta = perguntaDe(r.antes.fala);
  const novas = perguntasDe(r.depois.fala)
    .map((p) => ({ p, s: semelhanca(p, aberta) }))
    .filter(({ s }) => s < LIMIAR_MESMA_PERGUNTA);
  return {
    nome: "sem pergunta nova",
    ok: novas.length === 0,
    detalhe: novas.length ? novas.map(({ p, s }) => `pergunta nova: "${p}" (sobreposição ${s.toFixed(2)})`).join("; ") : undefined,
  };
}

/**
 * A fala responde a dúvida antes de voltar à pergunta em aberto: a primeira frase não é a pergunta retomada e trata
 * do que ela perguntou, com pelo menos um dos termos esperados (comparados pelo começo da palavra, sem acento).
 * "Vamos continuar. E o pagamento duplicado?" tem duas frases e não responde nada.
 */
export function respondeAntes(r: Resultado, termos: string[]): Checagem {
  const nome = "responde antes de voltar à pergunta";
  const primeira = frasesDe(r.depois.fala)[0] ?? "";
  const retomada = primeira.endsWith("?") && semelhanca(primeira, perguntaDe(r.antes.fala)) >= LIMIAR_MESMA_PERGUNTA;
  if (!primeira || retomada) return { nome, ok: false, detalhe: `a primeira frase já é a pergunta retomada: "${primeira}"` };
  const palavrasDaFrase = normalizarTexto(primeira).split(" ");
  const achados = termos.filter((t) => palavrasDaFrase.some((p) => p.startsWith(normalizarTexto(t))));
  return {
    nome,
    ok: achados.length > 0,
    detalhe: achados.length ? `primeira frase trata da dúvida (${achados.join(", ")})` : `primeira frase não trata da dúvida: "${primeira}" (esperado um de: ${termos.join(", ")})`,
  };
}

function semJargaoNemRotulo(r: Resultado): Checagem {
  const avisos = checarEstilo([{ role: "agente", text: r.depois.fala }]);
  const jargao = /\b(big o|edge case|casos? de borda|complexidade|escalabilidade horizontal)\b/i.test(r.depois.fala);
  return {
    nome: "sem jargão nem rótulo interno",
    ok: avisos.length === 0 && !jargao,
    detalhe: [...avisos, ...(jargao ? ["usa jargão"] : [])].join("; ") || undefined,
  };
}

/** A fala tem cada trecho. Um trecho em lista vale se qualquer uma das formas aparecer ("minutos" ou "hora"). */
function contem(r: Resultado, nome: string, trechos: Array<string | string[]>): Checagem {
  const fala = normalizarTexto(r.depois.fala);
  const faltam = trechos
    .map((t) => (Array.isArray(t) ? t : [t]))
    .filter((formas) => !formas.some((f) => fala.includes(normalizarTexto(f))));
  return { nome, ok: faltam.length === 0, detalhe: faltam.length ? `falta: ${faltam.map((f) => f.join(" ou ")).join(", ")}` : undefined };
}

const descrever = (passo: Passo | undefined) => (passo ? descreverPasso(passo) : "(nenhum)");

/** O passo em curso (a dúvida respondida não conta: vale o passo que ela retomou). */
function emCurso(sessao: Sessao): Passo | undefined {
  const ultimo = sessao.plano.ultimoPasso;
  return ultimo?.tipo === "responder_duvida" ? ultimo.retomar : ultimo;
}

/**
 * A última pergunta do Totti foi de aprofundamento, sozinha. Emendada numa confirmação de mudança de foco, a resposta
 * vaga pode ser à mudança, e o planejador não pede o concreto (ver `pedirOQueFaltouPasso`).
 */
function emAprofundamento(sessao: Sessao): boolean {
  return emCurso(sessao)?.tipo === "aprofundar";
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

/**
 * Resposta à abertura, que só cumprimenta, diz o que entendeu da vaga e pergunta o que pesa mais (issue #127): sem
 * escolher nada, para o Totti propor o formato, o nível e o foco no passo seguinte.
 */
const PRIMEIRA_RESPOSTA = "pode ser, como você achar melhor";

const NO_APROFUNDAMENTO = { descricao: "último passo do Totti: aprofundar", chegou: emAprofundamento };
/** Leva a vaga de pagamentos até a primeira pergunta de aprofundamento. */
const ATE_APROFUNDAR = [PRIMEIRA_RESPOSTA, "isso, pode seguir assim", "é isso mesmo, system design e nível sênior"];

/** Leva a vaga de pagamentos até o resumo. */
const ATE_O_RESUMO = [
  PRIMEIRA_RESPOSTA,
  "isso, pode seguir assim",
  "o pior é não pensar no que acontece quando a rede cai no meio do pagamento",
  "reprova direto quem trata o pagamento como se a rede nunca falhasse",
  "não tenho mais nada, pode resumir",
  "é só isso",
  "pode resumir",
];
const NO_RESUMO = { descricao: "último passo do Totti: resumo_final", chegou: (s: Sessao) => emCurso(s)?.tipo === "resumo_final" };
const NA_OFERTA_DE_TROCA = {
  descricao: "último passo do Totti: oferecer_tradeoff (a oferta de troca de formato vem depois da abertura)",
  chegou: (s: Sessao) => emCurso(s)?.tipo === "oferecer_tradeoff",
};
const NA_PERGUNTA_DE_NIVEL = {
  descricao: "último passo do Totti: perguntar_nivel (vaga sem nível; a pergunta vem depois da abertura)",
  chegou: (s: Sessao) =>
    emCurso(s)?.tipo === "perguntar_nivel" && nivelEmAberto(s.plano, s.classificacao.confirmar, s.rascunho.confirmado.seniority),
};

const semDecisaoDeTroca = (r: Resultado): Checagem => ({
  nome: "nenhuma decisão de troca registrada",
  ok: Object.keys(r.depois.decisoesTradeoff).length === 0,
  detalhe: JSON.stringify(r.depois.decisoesTradeoff),
});
const naoEncerra = (r: Resultado): Checagem => ({
  nome: "não encerra",
  ok: r.passo.tipo !== "encerrar" && r.depois.ultimoPasso?.tipo !== "encerrar",
  detalhe: `passo: ${descrever(r.passo)}`,
});
const semOutroResumo = (r: Resultado): Checagem => ({
  nome: "não conta outro resumo",
  ok: r.depois.resumos === r.antes.resumos,
  detalhe: `resumos: ${r.antes.resumos} -> ${r.depois.resumos}`,
});

/** Vaga que não diz o nível: nenhuma das fixas de `vagas.ts` serve, todas dizem. */
const VAGA_SEM_NIVEL: Vaga = {
  roleTitle: "Desenvolvedor(a) Backend",
  jobDescription:
    "Empresa de logística procura pessoa desenvolvedora backend para o time de roteirização.\n\n" +
    "Você vai escrever e manter APIs em Node.js e PostgreSQL, cuidar da qualidade do código com testes e participar das revisões do time.\n\n" +
    "Buscamos alguém que goste de resolver problemas de lógica e de escrever código limpo.",
};

/** Termos de uma resposta a "o candidato vai ver essa conversa": de quem ela fala ou do que é visto. */
export const TERMOS_DUVIDA_CONVERSA = ["candidat", "conversa", "acess", "compartilh", "visivel", "enxerg", "mostr", "privad"];

// ---------------------------------------------------------------------------
// Resposta que faz sentido, mas não diz o conteúdo (issue #72): o planejador pede o que faltou, uma vez.
// ---------------------------------------------------------------------------

/**
 * Leva a vaga de pagamentos até a pergunta de contexto, com respostas concretas nos aprofundamentos (um ou dois,
 * conforme o modelo). Se a pergunta de contexto chegar antes, o resto do histórico não é enviado.
 */
const ATE_O_CONTEXTO = [
  PRIMEIRA_RESPOSTA,
  "isso, pode seguir assim",
  "o pior é cobrar o cliente duas vezes quando a rede cai no meio do pagamento",
  "quero ver se ele estima o volume de pagamentos antes de escolher o banco",
];
const NO_CONTEXTO = { descricao: "último passo do Totti: perguntar_contexto", chegou: (s: Sessao) => emCurso(s)?.tipo === "perguntar_contexto" };
const NO_PEDIDO_DO_CONTEXTO = {
  descricao: "último passo do Totti: pedir_o_que_faltou contexto",
  chegou: (s: Sessao) => {
    const passo = emCurso(s);
    return passo?.tipo === "pedir_o_que_faltou" && passo.sobre === "contexto";
  },
};

const passoE = (r: Resultado, esperado: string): Checagem => ({
  nome: `o passo é ${esperado}`,
  ok: descrever(r.passo).startsWith(esperado),
  detalhe: `passo: ${descrever(r.passo)}`,
});
const umaPerguntaSo = (r: Resultado): Checagem => {
  const n = perguntasDe(r.depois.fala).length;
  return { nome: "uma pergunta só", ok: n === 1, detalhe: `${n} pergunta(s)` };
};

const CASOS_O_QUE_FALTOU: Caso[] = [
  {
    id: "contexto-tem-seco",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_CONTEXTO,
    situacao: NO_CONTEXTO,
    fala: "Tem",
    conferir: (r) => [
      passoE(r, "pedir_o_que_faltou contexto"),
      terminaEmPergunta(r),
      umaPerguntaSo(r),
      contem(r, "pergunta qual é o que reprova", [["reprova", "elimina", "qual", "o que"]]),
      semOutroResumo(r),
    ],
  },
  {
    id: "contexto-tem-depois-diz",
    vaga: "backend-senior-pagamentos",
    // O "Tem" vai logo depois do primeiro aprofundamento, o caminho comum. Com um segundo aprofundamento, ele cai
    // na pergunta errada e o caso sai como não montado.
    historico: [...ATE_O_CONTEXTO.slice(0, 2), "Tem"],
    situacao: NO_PEDIDO_DO_CONTEXTO,
    fala: "reprova direto quem trata o pagamento como se a rede nunca falhasse",
    conferir: (r) => [
      passoE(r, "resumo_final"),
      contem(r, "o eliminatório que ela disse aparece no resumo", [["rede", "falha"]]),
      {
        nome: "o pedido do que faltou foi feito uma vez só",
        ok: (r.depois.perguntasPorTopico.faltou_contexto ?? 0) === 1,
        detalhe: `faltou_contexto: ${r.depois.perguntasPorTopico.faltou_contexto ?? 0}`,
      },
    ],
  },
  {
    id: "aprofundamento-resposta-vaga",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    // Com a pergunta "contas de volume, ou basta raciocinar sobre o pico?", "Somente que ele raciocine" é uma escolha,
    // não uma resposta vaga: o caso só vale para uma pergunta que não oferece o raciocínio como opção (a da tela:
    // "o que é pior: perder ou duplicar um dado, ou ficar fora do ar?").
    situacao: {
      descricao: "último passo do Totti: aprofundar, numa pergunta que não oferece 'raciocinar' como opção",
      chegou: (s: Sessao) => emAprofundamento(s) && !/raciocin/i.test(perguntaDe(s.transcricao.filter((t) => t.role === "agente").at(-1)?.text ?? "")),
    },
    fala: "Somente que ele raciocine.",
    conferir: (r) => [
      passoE(r, "pedir_o_que_faltou"),
      terminaEmPergunta(r),
      umaPerguntaSo(r),
      semJargaoNemRotulo(r),
      {
        nome: "não diz que a resposta foi vaga",
        ok: !/\b(vag[ao]|gen[ée]ric[ao])\b/i.test(r.depois.fala),
        detalhe: undefined,
      },
    ],
  },
  {
    // Vaga para qualquer pergunta do banco: este caso sempre monta, o de cima depende da pergunta que o modelo escolheu.
    id: "aprofundamento-resposta-generica",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    situacao: NO_APROFUNDAMENTO,
    fala: "ah, que ele seja bom nisso, que saiba o que tá fazendo",
    conferir: (r) => [passoE(r, "pedir_o_que_faltou"), terminaEmPergunta(r), umaPerguntaSo(r), semJargaoNemRotulo(r)],
  },
  {
    id: "aprofundamento-resposta-concreta",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    situacao: NO_APROFUNDAMENTO,
    fala: "o pior é cobrar o cliente duas vezes quando a rede cai no meio do pagamento",
    conferir: (r) => [
      {
        nome: "resposta concreta não ganha follow-up",
        ok: r.passo.tipo !== "pedir_o_que_faltou",
        detalhe: `passo: ${descrever(r.passo)}`,
      },
    ],
  },
];

export const CASOS: Caso[] = [
  {
    id: "repetir-aprofundamento",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    situacao: NO_APROFUNDAMENTO,
    fala: "desculpa, pode repetir a pergunta",
    conferir: (r) => [
      terminaEmPergunta(r),
      mesmaPergunta(r),
      planoIgual(r),
      passoNaoAvanca(r),
      {
        nome: "o passo seguinte não é a pergunta de contexto nem o resumo",
        ok: !["perguntar_contexto", "resumo_final"].includes(r.depois.emCurso?.tipo ?? ""),
        detalhe: `passo em curso depois da fala: ${descrever(r.depois.emCurso)}`,
      },
    ],
  },
  {
    id: "nao-entendeu",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    situacao: NO_APROFUNDAMENTO,
    fala: "como assim, não entendi o que você quer saber",
    conferir: (r) => [
      terminaEmPergunta(r),
      // Reformular troca as palavras: basta ser sobre o mesmo assunto, com um limiar mais baixo que o da repetição.
      (() => {
        const s = semelhanca(r.depois.fala, r.antes.fala);
        return { nome: "é sobre o mesmo assunto", ok: s >= 0.25, detalhe: `sobreposição com a fala anterior ${s.toFixed(2)} (limiar 0.25)` };
      })(),
      semJargaoNemRotulo(r),
      planoIgual(r),
      passoNaoAvanca(r),
    ],
  },
  // Transcrição quebrada depois de uma pergunta de escolha (issue #76): o Totti diz que não entendeu e refaz a pergunta.
  {
    id: "fala-sem-sentido",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    situacao: NO_APROFUNDAMENTO,
    fala: "Ele diz expresso.",
    conferir: (r) => [
      terminaEmPergunta(r),
      {
        nome: "movimento nao_entendi",
        ok: movimentoDaUltimaFala(r.sessao) === "nao_entendi",
        detalhe: `movimento: ${movimentoDaUltimaFala(r.sessao)}`,
      },
      {
        nome: "não repete a frase dela",
        ok: !normalizarTexto(r.depois.fala).includes("ele diz expresso"),
      },
      (() => {
        const s = semelhanca(perguntaDe(r.depois.fala), perguntaDe(r.antes.fala));
        return { nome: "refaz a pergunta em aberto", ok: s >= 0.25, detalhe: `sobreposição ${s.toFixed(2)} (limiar 0.25)` };
      })(),
      {
        nome: "a fala dela fica fora da extração",
        ok: r.sessao.transcricao.filter((t) => t.role === "recrutadora").at(-1)?.naoEntendida === true,
      },
      planoIgual(r),
      passoNaoAvanca(r),
    ],
  },
  {
    id: "pede-tempo",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    situacao: NO_APROFUNDAMENTO,
    fala: "pera, deixa eu abrir a descrição da vaga aqui",
    conferir: (r) => [falaCurta(r), semPerguntaNova(r), passoNaoAvanca(r)],
  },
  {
    id: "checagem-audio",
    vaga: "backend-senior-pagamentos",
    historico: [],
    situacao: { descricao: "qualquer ponto (logo depois da abertura)", chegou: () => true },
    fala: "tá me ouvindo?",
    conferir: (r) => [
      falaCurta(r),
      {
        nome: "não vira explicação de como a entrevista avalia",
        ok: !/\b(avali|observ|crit[ée]rio)/i.test(r.depois.fala),
        detalhe: undefined,
      },
      semPerguntaNova(r),
      passoNaoAvanca(r),
    ],
  },
  {
    id: "repetir-nivel",
    vaga: VAGA_SEM_NIVEL,
    historico: [PRIMEIRA_RESPOSTA],
    situacao: NA_PERGUNTA_DE_NIVEL,
    fala: "oi? não ouvi",
    conferir: (r) => [
      contem(r, "repete a pergunta de nível", ["júnior", "pleno", "sênior"]),
      terminaEmPergunta(r),
      {
        nome: "a contagem da pergunta de nível não aumenta",
        ok: (r.depois.perguntasPorTopico.nivel ?? 0) === (r.antes.perguntasPorTopico.nivel ?? 0),
        detalhe: `nivel: ${r.antes.perguntasPorTopico.nivel ?? 0} -> ${r.depois.perguntasPorTopico.nivel ?? 0}`,
      },
      planoIgual(r),
    ],
  },
  {
    id: "repetir-oferta-troca",
    vaga: "ia-pleno",
    historico: [PRIMEIRA_RESPOSTA],
    situacao: NA_OFERTA_DE_TROCA,
    fala: "não entendi, quais eram as opções mesmo",
    conferir: (r) => [
      semDecisaoDeTroca(r),
      contem(r, "a fala traz os caminhos de novo", ["system design", "próxima etapa"]),
      planoIgual(r),
    ],
  },
  // A abertura é curta e o resto vem aos poucos (issue #127).
  {
    id: "abertura-em-partes",
    vaga: "backend-senior-pagamentos",
    historico: [],
    situacao: { descricao: "logo depois da abertura", chegou: () => true },
    fala: PRIMEIRA_RESPOSTA,
    conferir: (r) => [
      {
        nome: "a abertura cabe em 2 frases",
        ok: frasesDe(r.antes.fala).length <= 2,
        detalhe: `${frasesDe(r.antes.fala).length} frase(s): "${r.antes.fala}"`,
      },
      {
        nome: "a abertura tem uma pergunta só",
        ok: perguntasDe(r.antes.fala).length === 1,
        detalhe: `${perguntasDe(r.antes.fala).length} pergunta(s)`,
      },
      {
        nome: "o passo seguinte é a proposta, o nível ou a oferta de troca (formato, nível e foco vêm depois da abertura)",
        ok: ["confirmar_inicio", "perguntar_nivel", "oferecer_tradeoff"].includes(r.passo.tipo),
        detalhe: `passo: ${descrever(r.passo)}`,
      },
      umaPerguntaSo(r),
    ],
  },
  // "Quero" para a pergunta de fechamento escolhe ajustar, não aprova (issue #127).
  {
    id: "quero-ao-fechamento",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "quero",
    conferir: (r) => [
      naoEncerra(r),
      semOutroResumo(r),
      passoE(r, "perguntar_ajuste"),
      falaCurta(r),
      umaPerguntaSo(r),
      contem(r, "pergunta o que mudar", [["mudar", "ajustar"]]),
    ],
  },
  {
    id: "quero-com-o-que-mudar",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "quero tirar a dica",
    conferir: (r) => [
      naoEncerra(r),
      {
        nome: "não pergunta o que mudar: ela já disse",
        ok: r.passo.tipo !== "perguntar_ajuste",
        detalhe: `passo: ${descrever(r.passo)}`,
      },
      terminaEmPergunta(r),
    ],
  },
  // "Não" para "quer mudar alguma coisa?" aprova.
  {
    id: "nao-ao-fechamento",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "não, tá ótimo",
    conferir: (r) => [
      {
        nome: "encerra",
        ok: r.passo.tipo === "encerrar" || r.depois.ultimoPasso?.tipo === "encerrar",
        detalhe: `passo: ${descrever(r.passo)}`,
      },
    ],
  },
  {
    id: "pode-finalizar-ao-fechamento",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "pode finalizar",
    conferir: (r) => [
      {
        nome: "encerra",
        ok: r.passo.tipo === "encerrar" || r.depois.ultimoPasso?.tipo === "encerrar",
        detalhe: `passo: ${descrever(r.passo)}`,
      },
    ],
  },
  {
    id: "repetir-resumo",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "pode repetir o resumo",
    conferir: (r) => [
      naoEncerra(r),
      semOutroResumo(r),
      passoNaoAvanca(r),
      contem(r, "a fala traz o formato e a duração de novo", [
        r.antes.modo === "system_design" ? ["system design", "desenho", "quadro"] : ["live coding", "codigo ao vivo", "programando"],
        ["minutos", "min", "hora"],
      ]),
      (() => {
        const s = semelhanca(r.depois.fala, r.antes.fala);
        return { nome: "a fala traz o resumo de novo (formato, foco e duração)", ok: s >= LIMIAR_MESMA_PERGUNTA, detalhe: `sobreposição com o resumo ${s.toFixed(2)}` };
      })(),
      planoIgual(r),
    ],
  },
  {
    id: "duvida-fora-da-entrevista",
    vaga: "backend-senior-pagamentos",
    historico: ATE_APROFUNDAR,
    situacao: NO_APROFUNDAMENTO,
    fala: "antes disso, o candidato vai ver essa conversa",
    conferir: (r) => [
      terminaEmPergunta(r),
      mesmaPergunta(r, "responde e volta à pergunta que estava em aberto"),
      respondeAntes(r, TERMOS_DUVIDA_CONVERSA),
      {
        nome: "a contagem de perguntas não muda",
        ok: isDeepStrictEqual(r.antes.perguntasPorTopico, r.depois.perguntasPorTopico),
        detalhe: `${JSON.stringify(r.antes.perguntasPorTopico)} -> ${JSON.stringify(r.depois.perguntasPorTopico)}`,
      },
    ],
  },
  // Resposta que não é escolha nem aprovação: o Totti pediu uma decisão e ela não decidiu (issue #27).
  {
    id: "troca-deixa-eu-pensar",
    vaga: "ia-pleno",
    historico: [PRIMEIRA_RESPOSTA],
    situacao: NA_OFERTA_DE_TROCA,
    fala: "hum, deixa eu pensar",
    conferir: (r) => [semDecisaoDeTroca(r), falaCurta(r), passoNaoAvanca(r)],
  },
  {
    id: "troca-pede-recomendacao",
    vaga: "ia-pleno",
    historico: [PRIMEIRA_RESPOSTA],
    situacao: NA_OFERTA_DE_TROCA,
    fala: "tanto faz, o que você recomenda?",
    conferir: (r) => [semDecisaoDeTroca(r), terminaEmPergunta(r), passoNaoAvanca(r)],
  },
  {
    id: "nivel-nao-sabe",
    vaga: VAGA_SEM_NIVEL,
    historico: [PRIMEIRA_RESPOSTA],
    situacao: NA_PERGUNTA_DE_NIVEL,
    fala: "não sei, o gestor não me falou",
    conferir: (r) => [
      contem(r, "diz que segue com a estimativa e que dá pra mudar na revisão", ["revisão"]),
      {
        nome: "não pergunta o nível de novo",
        ok: !/j[úu]nior.*pleno.*s[êe]nior/i.test(r.depois.fala),
        detalhe: undefined,
      },
      {
        nome: "a contagem da pergunta de nível não aumenta",
        ok: (r.depois.perguntasPorTopico.nivel ?? 0) === (r.antes.perguntasPorTopico.nivel ?? 0),
        detalhe: `nivel: ${r.antes.perguntasPorTopico.nivel ?? 0} -> ${r.depois.perguntasPorTopico.nivel ?? 0}`,
      },
    ],
  },
  {
    id: "resumo-pede-tempo",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "peraí, deixa eu ler aqui na tela",
    conferir: (r) => [falaCurta(r), naoEncerra(r), semOutroResumo(r)],
  },
  // Troca de formato pedida no resumo (issue #76): a confirmação fala do formato primeiro, e não só da duração.
  {
    id: "resumo-troca-formato",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "Eu quero de live coding a entrevista",
    conferir: (r) => {
      const primeira = normalizarTexto(frasesDe(r.depois.fala)[0] ?? "");
      return [
        { nome: "o formato muda", ok: r.depois.modo !== r.antes.modo, detalhe: `${r.antes.modo} -> ${r.depois.modo}` },
        {
          nome: "a primeira frase fala do formato",
          ok: /live coding|codigo|system design|quadro/.test(primeira),
          detalhe: `primeira frase: "${frasesDe(r.depois.fala)[0] ?? ""}"`,
        },
        { nome: "não começa pela duração", ok: !/minutos?/.test(primeira) },
        naoEncerra(r),
        terminaEmPergunta(r),
      ];
    },
  },
  {
    id: "resumo-pergunta-duracao",
    vaga: "backend-senior-pagamentos",
    historico: ATE_O_RESUMO,
    situacao: NO_RESUMO,
    fala: "acho que sim… a duração ficou quanto mesmo?",
    conferir: (r) => [naoEncerra(r), contem(r, "responde a duração", ["minutos"]), terminaEmPergunta(r), semOutroResumo(r)],
  },
  // Questão pedida pelo nome (#78): o Totti só confirma o que existe no banco, e nada é prometido.
  {
    id: "pede-two-sum",
    vaga: "frontend-junior",
    historico: ["isso, pode seguir assim"],
    situacao: NO_APROFUNDAMENTO,
    fala: "ah, e quero que use o two sum na entrevista",
    conferir: (r) => [
      contem(r, "confirma a questão", ["two sum"]),
      { nome: "não diz que anotou", ok: !/\banotad[oa]\b/i.test(r.depois.fala), detalhe: undefined },
      {
        nome: "a questão fica fixada no rascunho",
        ok: r.sessao.rascunho.problemId === "two-sum" && r.sessao.rascunho.pedidoProblema?.resultado === "reconhecido",
        detalhe: JSON.stringify(r.sessao.rascunho.pedidoProblema),
      },
    ],
  },
  {
    id: "pede-questao-que-nao-existe",
    vaga: "frontend-junior",
    historico: ["isso, pode seguir assim"],
    situacao: NO_APROFUNDAMENTO,
    fala: "quero o problema das N rainhas",
    conferir: (r) => [
      contem(r, "diz que não tem", [["não está disponível", "não temos", "não tenho", "não tem", "não está no banco", "não existe"]]),
      { nome: "não promete as N rainhas", ok: !/\b(anotad[oa]|vai ser (o|a)? ?(problema das )?n rainhas)\b/i.test(r.depois.fala), detalhe: undefined },
      terminaEmPergunta(r),
      { nome: "nenhuma questão fixada", ok: r.sessao.rascunho.problemId === undefined, detalhe: r.sessao.rascunho.problemId },
    ],
  },
  ...CASOS_O_QUE_FALTOU,
];

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

export type Desfecho = "passou" | "falhou" | "nao_montado" | "erro";

/**
 * Os eventos de erro do log da sessão (extrator, cobertura ou modelo que falharam), em toda a conversa: uma extração
 * que falhou no histórico também deixa o estado errado para a fala testada.
 */
export function errosDaSessao(logs: Sessao["logs"]): string[] {
  return logs.filter((e) => e.tipo === "erro").map((e) => e.resumo);
}

/**
 * Erro na sessão vence até um cenário não montado: uma falha no histórico pode ser justamente o motivo de não chegar
 * ao ponto esperado. "O plano não mudou" também não vale nada se a extração nem rodou.
 */
export function desfechoDoCaso(checagens: Checagem[], erros: string[], montado = true): Desfecho {
  if (erros.length > 0) return "erro";
  if (!montado) return "nao_montado";
  return checagens.every((c) => c.ok) ? "passou" : "falhou";
}

const CHAVES = ["FEATHERLESS_API_KEY", "TYPESAFE_API_KEY", ...(pago ? ["OPENROUTER_API_KEY"] : [])];
/** Logs do servidor que poluem a saída. As falas e os passos são impressos aqui. */
const PREFIXOS_SILENCIADOS = ["[pre-entrevista]", "[extrator]"];

function silenciarLogsDoServidor(): void {
  for (const metodo of ["log", "warn"] as const) {
    const original = console[metodo];
    console[metodo] = (...args: unknown[]) => {
      if (typeof args[0] === "string" && PREFIXOS_SILENCIADOS.some((p) => (args[0] as string).startsWith(p))) return;
      original(...args);
    };
  }
}

/** Classificação e competências por vaga: os casos da mesma vaga não repetem as chamadas. */
const preparadas = new Map<string, Promise<{ vaga: Vaga; classificacao: Classificacao; competencias: ResultadoCompetencias }>>();

function prepararVaga(ref: Caso["vaga"]) {
  const chave = typeof ref === "string" ? ref : ref.roleTitle;
  let preparada = preparadas.get(chave);
  if (!preparada) {
    preparada = (async () => {
      const fixa = typeof ref === "string" ? VAGAS.find((v) => v.id === ref) : ref;
      if (!fixa) throw new Error(`vaga "${chave}" não encontrada em fixtures/pre-entrevista/vagas.ts`);
      const vaga: Vaga = { roleTitle: fixa.roleTitle, jobDescription: fixa.jobDescription };
      return { vaga, classificacao: await classificarVaga(vaga), competencias: await extrairCompetencias(vaga) };
    })();
    preparadas.set(chave, preparada);
  }
  return preparada;
}

/** O `movimento` que o modelo declarou na última fala do Totti, lido do log da sessão. */
function movimentoDaUltimaFala(sessao: Sessao): string {
  const evento = [...sessao.logs].reverse().find((e) => e.tipo === "fala_agente");
  const movimento = (evento?.dados as { movimento?: unknown } | undefined)?.movimento;
  // O campo só existe a partir da issue #24: na linha de base sai sempre "(sem o campo)", e isso é esperado.
  return typeof movimento === "string" ? movimento : "(sem o campo)";
}

/** As travas que reescreveram a última fala do Totti, lidas do log da sessão. */
function travasDaUltimaFala(sessao: Sessao): Array<{ trava: string; antes: string; depois: string }> {
  const evento = [...sessao.logs].reverse().find((e) => e.tipo === "fala_agente");
  return (evento?.dados as { travas?: Array<{ trava: string; antes: string; depois: string }> } | undefined)?.travas ?? [];
}

interface Rodada {
  desfecho: Desfecho;
  /** Espera da recrutadora pela fala testada (cobertura + resposta do modelo), em ms. Só quando a fala rodou. */
  esperaMs?: number;
}

async function rodarCaso(caso: Caso): Promise<Rodada> {
  console.log(`\n================================================================`);
  console.log(`caso: ${caso.id}`);
  console.log(`situação: ${caso.situacao.descricao}`);
  console.log(`================================================================`);
  try {
    const { vaga, classificacao, competencias } = await prepararVaga(caso.vaga);
    const sessao = criarSessao(vaga, classificacao, Date.now(), competencias);
    abrirConversa(sessao);
    console.log(`  Totti [abertura]: ${sessao.transcricao[0].text}`);

    for (const fala of caso.historico) {
      if (caso.situacao.chegou(sessao)) break;
      const { passo } = await conduzirTurno(sessao, fala);
      // Como no servidor, a extração roda depois de cada fala; aqui, de forma síncrona.
      await extrairAgora(sessao);
      console.log(`  Recrutadora: ${fala}`);
      console.log(`  Totti [${descreverPasso(passo)}]: ${sessao.transcricao.at(-1)?.text}`);
    }
    if (!caso.situacao.chegou(sessao)) {
      console.log(`  NÃO MONTADO: a conversa não chegou ao ponto (passo em curso: ${descrever(emCurso(sessao))})`);
      const erros = errosDaSessao(sessao.logs);
      for (const e of erros) console.log(`  ERRO na sessão: ${e}`);
      return { desfecho: desfechoDoCaso([], erros, false) };
    }

    const antes = fotografar(sessao);
    const inicio = performance.now();
    const { passo } = await conduzirTurno(sessao, caso.fala);
    const esperaMs = Math.round(performance.now() - inicio);
    // A extração também roda depois da fala testada: ela pode mudar foco e preferências, e `planoIgual` precisa ver isso.
    // Como na rota `mensagem`, não roda em turno de `repetir`/`esclarecer`/`nao_entendi`.
    const movimentoTestado = movimentoDaUltimaFala(sessao);
    if (!falaDelaNaoEraResposta(movimentoTestado)) await extrairAgora(sessao);
    const depois = fotografar(sessao);
    console.log(`  >> Recrutadora: ${caso.fala}`);
    console.log(`  >> Totti [${descreverPasso(passo)} | movimento: ${movimentoTestado} | ${esperaMs} ms]: ${depois.fala}`);

    for (const trava of travasDaUltimaFala(sessao)) console.log(`     trava ${trava.trava}: "${trava.antes}" -> "${trava.depois}"`);

    const checagens = caso.conferir({ antes, depois, passo, sessao });
    for (const c of checagens) console.log(`  ${c.ok ? "PASS" : "FAIL"} ${c.nome}${c.detalhe ? ` | ${c.detalhe}` : ""}`);
    const erros = errosDaSessao(sessao.logs);
    for (const e of erros) console.log(`  ERRO na sessão: ${e}`);
    return { desfecho: desfechoDoCaso(checagens, erros), esperaMs };
  } catch (err) {
    console.log(`  ERRO: ${err instanceof Error ? err.message : String(err)}`);
    return { desfecho: "erro" };
  }
}

async function main(): Promise<void> {
  const faltam = CHAVES.filter((c) => !process.env[c]);
  if (faltam.length > 0) throw new Error(`faltam chaves no .env.local: ${faltam.join(", ")}`);
  silenciarLogsDoServidor();

  // --estrito: caso não montado conta como falha (sem ele, só conta quando nenhum caso chegou ao ponto).
  const estrito = process.argv.includes("--estrito");
  const filtros = process.argv.slice(2).filter((a) => a !== "--estrito");
  const desconhecidos = filtros.filter((f) => !CASOS.some((c) => c.id === f));
  if (desconhecidos.length > 0) {
    throw new Error(`caso(s) "${desconhecidos.join(", ")}" não existe(m): ${CASOS.map((c) => c.id).join(", ")}`);
  }
  const casos = filtros.length ? CASOS.filter((c) => filtros.includes(c.id)) : CASOS;

  const rodadas: Array<[string, Rodada]> = [];
  for (const caso of casos) rodadas.push([caso.id, await rodarCaso(caso)]);
  const desfechos = rodadas.map(([id, r]) => [id, r.desfecho] as const);

  const ROTULO: Record<Desfecho, string> = { passou: "PASSOU", falhou: "FALHOU", nao_montado: "NÃO MONTADO", erro: "ERRO" };
  console.log(`\n================================================================`);
  console.log("placar dos casos de conversa");
  for (const [id, d] of desfechos) console.log(`  ${ROTULO[d].padEnd(11)} ${id}`);
  const contar = (d: Desfecho) => desfechos.filter(([, x]) => x === d).length;
  console.log(`  ${contar("passou")} passou | ${contar("falhou")} falhou | ${contar("erro")} com erro | ${contar("nao_montado")} não montado`);
  const esperas = rodadas.flatMap(([, r]) => (r.esperaMs === undefined ? [] : [r.esperaMs]));
  console.log(`  espera pela fala testada (cobertura + Totti): ${descreverTempos(esperas)}${pago ? "" : " | sem --pago: NÃO são os tempos de produção"}`);

  const testados = casos.length - contar("nao_montado");
  if (testados === 0) console.log("  nenhum caso chegou ao ponto: nada foi testado, e isso conta como falha");
  else if (contar("nao_montado") > 0 && !estrito) console.log("  há casos não montados: com --estrito, eles contam como falha");
  const falhou = contar("falhou") + contar("erro") > 0 || testados === 0 || (estrito && contar("nao_montado") > 0);
  if (falhou) process.exit(1);
}

/** O arquivo foi chamado direto (`npm run pre:conversa`), não importado pelo teste. */
function executadoDireto(): boolean {
  const script = process.argv[1];
  if (!script) return false;
  const igual = (a: string, b: string) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
  return igual(resolve(fileURLToPath(import.meta.url)), resolve(script));
}

if (executadoDireto()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
