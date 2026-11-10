/**
 * Casos fixos de conversa da pré-entrevista: a recrutadora pede para repetir, diz que não entendeu, pede um tempo
 * ou pergunta outra coisa, num ponto escolhido da conversa. Roda com o LLM e o Jev reais, pelas mesmas funções do
 * servidor (`criarSessao`, `abrirConversa`, `conduzirTurno`), sem HTTP.
 *
 *   npm run pre:conversa                       # todos os casos
 *   npm run pre:conversa -- repetir-resumo     # só um (ou vários ids)
 *
 * Cada caso leva a conversa até o ponto desejado com um histórico de falas dela. Como o caminho depende do modelo,
 * o caso confere antes o passo em que a conversa está: se não chegou lá, sai como "não montado", sem contar como falha.
 * O script lista todas as falhas, sem parar na primeira, e sai com erro se houver alguma.
 *
 * Precisa de `.env.local` com FEATHERLESS_API_KEY e TYPESAFE_API_KEY. A OpenRouter (modelos pagos de produção) só
 * entra com `--pago`, e aí precisa também de OPENROUTER_API_KEY (ver `scripts/_gasto.ts`).
 */
import { pago } from "../_gasto";
import { isDeepStrictEqual } from "node:util";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import { sobreposicao } from "@/lib/agente/guardas";
import { classificarVaga, type Classificacao, type Vaga } from "@/lib/pre-entrevista/classificador";
import { extrairCompetencias, type ResultadoCompetencias } from "@/lib/pre-entrevista/competencias";
import { contarFrases } from "@/lib/pre-entrevista/conversa";
import { normalizarTexto } from "@/lib/pre-entrevista/frases";
import { descreverPasso, nivelEmAberto, type Passo } from "@/lib/pre-entrevista/planejador";
import { criarSessao, extrairAgora, type Sessao } from "@/lib/pre-entrevista/sessoes";
import { abrirConversa, conduzirTurno } from "@/lib/pre-entrevista/turno";
import { checarEstilo } from "./checagens";

/** Quanto a pergunta nova precisa ter das palavras da anterior para contar como a mesma pergunta. */
const LIMIAR_MESMA_PERGUNTA = 0.5;
/** Fala curta: resposta a pedido de tempo ou a comentário de conversa. */
const MAX_PALAVRAS_FALA_CURTA = 30;

/** O estado que um pedido de repetição não pode mudar. */
interface Foto {
  ultimoPasso?: Passo;
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

interface Checagem {
  nome: string;
  ok: boolean;
  detalhe?: string;
}

interface Resultado {
  antes: Foto;
  depois: Foto;
  /** Passo que `conduzirTurno` devolveu para a fala testada. */
  passo: Passo;
  sessao: Sessao;
}

interface Caso {
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

/** A parte da fala que é a pergunta: a última frase terminada em "?". */
function perguntaDe(fala: string): string {
  return fala.match(/[^.!?]*\?/g)?.at(-1)?.trim() ?? "";
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
  const s = sobreposicao(perguntaDe(r.depois.fala), perguntaDe(r.antes.fala));
  return { nome, ok: s >= LIMIAR_MESMA_PERGUNTA, detalhe: `sobreposição ${s.toFixed(2)} (limiar ${LIMIAR_MESMA_PERGUNTA})` };
}

/** Foco, ênfase, formato, nível, preferências e decisões de troca iguais aos de antes da fala. */
function planoIgual(r: Resultado): Checagem {
  const campos: Array<keyof Foto> = ["foco", "modo", "nivelConfirmado", "enfase", "preferencias", "decisoesTradeoff"];
  const mudaram = campos.filter((c) => !isDeepStrictEqual(r.antes[c], r.depois[c]));
  return { nome: "foco, ênfase e preferências iguais aos de antes", ok: mudaram.length === 0, detalhe: mudaram.length ? `mudou: ${mudaram.join(", ")}` : undefined };
}

/** O passo em curso não avançou: mesmo último passo, mesmas contagens de pergunta e de resumo. */
function passoNaoAvanca(r: Resultado): Checagem {
  const diferencas: string[] = [];
  if (!isDeepStrictEqual(r.antes.ultimoPasso, r.depois.ultimoPasso)) {
    diferencas.push(`passo foi de ${descrever(r.antes.ultimoPasso)} para ${descrever(r.depois.ultimoPasso)}`);
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

/** Sem pergunta nova: ou não pergunta nada, ou a pergunta é a que já estava em aberto. */
function semPerguntaNova(r: Resultado): Checagem {
  const pergunta = perguntaDe(r.depois.fala);
  const s = pergunta ? sobreposicao(pergunta, perguntaDe(r.antes.fala)) : 1;
  return { nome: "sem pergunta nova", ok: !pergunta || s >= LIMIAR_MESMA_PERGUNTA, detalhe: pergunta ? `pergunta: "${pergunta}" (sobreposição ${s.toFixed(2)})` : undefined };
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

function contem(r: Resultado, nome: string, trechos: string[]): Checagem {
  const fala = normalizarTexto(r.depois.fala);
  const faltam = trechos.filter((t) => !fala.includes(normalizarTexto(t)));
  return { nome, ok: faltam.length === 0, detalhe: faltam.length ? `falta: ${faltam.join(", ")}` : undefined };
}

const descrever = (passo: Passo | undefined) => (passo ? descreverPasso(passo) : "(nenhum)");

/** O passo em curso (a dúvida respondida não conta: vale o passo que ela retomou). */
function emCurso(sessao: Sessao): Passo | undefined {
  const ultimo = sessao.plano.ultimoPasso;
  return ultimo?.tipo === "responder_duvida" ? ultimo.retomar : ultimo;
}

/** A última pergunta do Totti foi de aprofundamento (sozinha ou emendada numa confirmação de mudança de foco). */
function emAprofundamento(sessao: Sessao): boolean {
  const passo = emCurso(sessao);
  return passo?.tipo === "aprofundar" || (passo?.tipo === "confirmar_mudanca_foco" && passo.proximo !== undefined);
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

const NO_APROFUNDAMENTO = { descricao: "último passo do Totti: aprofundar", chegou: emAprofundamento };
/** Leva a vaga de pagamentos até a primeira pergunta de aprofundamento. */
const ATE_APROFUNDAR = ["isso, pode seguir assim", "é isso mesmo, system design e nível sênior"];

/** Vaga que não diz o nível: nenhuma das fixas de `vagas.ts` serve, todas dizem. */
const VAGA_SEM_NIVEL: Vaga = {
  roleTitle: "Desenvolvedor(a) Backend",
  jobDescription:
    "Empresa de logística procura pessoa desenvolvedora backend para o time de roteirização.\n\n" +
    "Você vai escrever e manter APIs em Node.js e PostgreSQL, cuidar da qualidade do código com testes e participar das revisões do time.\n\n" +
    "Buscamos alguém que goste de resolver problemas de lógica e de escrever código limpo.",
};

const CASOS: Caso[] = [
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
        ok: !["perguntar_contexto", "resumo_final"].includes(r.depois.ultimoPasso?.tipo ?? ""),
        detalhe: `passo em curso depois da fala: ${descrever(r.depois.ultimoPasso)}`,
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
        const s = sobreposicao(r.depois.fala, r.antes.fala);
        return { nome: "é sobre o mesmo assunto", ok: s >= 0.25, detalhe: `sobreposição com a fala anterior ${s.toFixed(2)} (limiar 0.25)` };
      })(),
      semJargaoNemRotulo(r),
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
    historico: [],
    situacao: {
      descricao: "a abertura perguntou o nível (vaga sem nível)",
      chegou: (s) => nivelEmAberto(s.plano, s.classificacao.confirmar, s.rascunho.confirmado.seniority),
    },
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
    historico: [],
    situacao: { descricao: "a abertura ofereceu a troca de formato", chegou: (s) => s.plano.tradeoffNaAbertura === true },
    fala: "não entendi, quais eram as opções mesmo",
    conferir: (r) => [
      {
        nome: "nenhuma decisão de troca registrada",
        ok: Object.keys(r.depois.decisoesTradeoff).length === 0,
        detalhe: JSON.stringify(r.depois.decisoesTradeoff),
      },
      contem(r, "a fala traz os caminhos de novo", ["system design", "próxima etapa"]),
      planoIgual(r),
    ],
  },
  {
    id: "repetir-resumo",
    vaga: "backend-senior-pagamentos",
    historico: [
      "isso, pode seguir assim",
      "o pior é não pensar no que acontece quando a rede cai no meio do pagamento",
      "reprova direto quem trata o pagamento como se a rede nunca falhasse",
      "não tenho mais nada, pode resumir",
      "é só isso",
      "pode resumir",
    ],
    situacao: { descricao: "último passo do Totti: resumo_final", chegou: (s) => emCurso(s)?.tipo === "resumo_final" },
    fala: "pode repetir o resumo",
    conferir: (r) => [
      { nome: "não encerra", ok: r.passo.tipo !== "encerrar" && r.depois.ultimoPasso?.tipo !== "encerrar", detalhe: `passo: ${descrever(r.passo)}` },
      { nome: "não conta outro resumo", ok: r.depois.resumos === r.antes.resumos, detalhe: `resumos: ${r.antes.resumos} -> ${r.depois.resumos}` },
      passoNaoAvanca(r),
      contem(r, "a fala traz o formato e a duração de novo", [r.antes.modo === "system_design" ? "system design" : "live coding", "minutos"]),
      (() => {
        const s = sobreposicao(r.depois.fala, r.antes.fala);
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
      {
        nome: "responde antes de voltar à pergunta",
        ok: contarFrases(r.depois.fala) >= 2,
        detalhe: `${contarFrases(r.depois.fala)} frase(s)`,
      },
      {
        nome: "a contagem de perguntas não muda",
        ok: isDeepStrictEqual(r.antes.perguntasPorTopico, r.depois.perguntasPorTopico),
        detalhe: `${JSON.stringify(r.antes.perguntasPorTopico)} -> ${JSON.stringify(r.depois.perguntasPorTopico)}`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

type Desfecho = "passou" | "falhou" | "nao_montado" | "erro";

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
  return typeof movimento === "string" ? movimento : "(sem o campo)";
}

async function rodarCaso(caso: Caso): Promise<Desfecho> {
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
      console.log(`  NÃO MONTADO: a conversa não chegou ao ponto (passo em curso: ${descrever(sessao.plano.ultimoPasso)})`);
      return "nao_montado";
    }

    const antes = fotografar(sessao);
    const { passo } = await conduzirTurno(sessao, caso.fala);
    const depois = fotografar(sessao);
    console.log(`  >> Recrutadora: ${caso.fala}`);
    console.log(`  >> Totti [${descreverPasso(passo)} | movimento: ${movimentoDaUltimaFala(sessao)}]: ${depois.fala}`);

    const checagens = caso.conferir({ antes, depois, passo, sessao });
    for (const c of checagens) console.log(`  ${c.ok ? "PASS" : "FAIL"} ${c.nome}${c.detalhe ? ` | ${c.detalhe}` : ""}`);
    return checagens.every((c) => c.ok) ? "passou" : "falhou";
  } catch (err) {
    console.log(`  ERRO: ${err instanceof Error ? err.message : String(err)}`);
    return "erro";
  }
}

async function main(): Promise<void> {
  const faltam = CHAVES.filter((c) => !process.env[c]);
  if (faltam.length > 0) throw new Error(`faltam chaves no .env.local: ${faltam.join(", ")}`);
  silenciarLogsDoServidor();

  const filtros = process.argv.slice(2);
  const desconhecidos = filtros.filter((f) => !CASOS.some((c) => c.id === f));
  if (desconhecidos.length > 0) {
    throw new Error(`caso(s) "${desconhecidos.join(", ")}" não existe(m): ${CASOS.map((c) => c.id).join(", ")}`);
  }
  const casos = filtros.length ? CASOS.filter((c) => filtros.includes(c.id)) : CASOS;

  const desfechos: Array<[string, Desfecho]> = [];
  for (const caso of casos) desfechos.push([caso.id, await rodarCaso(caso)]);

  const ROTULO: Record<Desfecho, string> = { passou: "PASSOU", falhou: "FALHOU", nao_montado: "NÃO MONTADO", erro: "ERRO" };
  console.log(`\n================================================================`);
  console.log("placar dos casos de conversa");
  for (const [id, d] of desfechos) console.log(`  ${ROTULO[d].padEnd(11)} ${id}`);
  const contar = (d: Desfecho) => desfechos.filter(([, x]) => x === d).length;
  console.log(`  ${contar("passou")} passou | ${contar("falhou")} falhou | ${contar("erro")} com erro | ${contar("nao_montado")} não montado`);
  if (contar("falhou") + contar("erro") > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
