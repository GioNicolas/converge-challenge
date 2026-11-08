// Bateria de conversa do Totti no quadro, com o LLM real: os casos que a equipe viu dar errado nos testes
// (perguntar quanto tempo dura, "não sei", "pula", esquecer o que já foi dito, perguntar o que já está na tela).
// Usa créditos do provedor. Só dados sintéticos.
//   npx tsx --env-file-if-exists=.env.local scripts/avaliar-totti-quadro.ts            (todos, 1 rodada)
//   RODADAS=3 SO=analise npx tsx --env-file-if-exists=.env.local scripts/avaliar-totti-quadro.ts
import { gerarAbertura } from "../lib/agente/abertura";
import { analisar } from "../lib/agente/analisar";
import { KIT_SYSTEM_DESIGN as kit } from "../lib/agente/kits/system-design";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { perguntar } from "../lib/agente/perguntar";
import { estadoInicial, type EstadoSessao, type FalaRegistrada, type PerguntaFeita } from "../lib/agente/sessao/estado";
import type { Fase, PedidoAnalise } from "../lib/agente/sessao/tipos";

const problema = kit.problemas[0];
const llm = criarClientePrincipal();
const MIN = 60_000;

const GRAFO = `COMPONENTES
- [r1] Cliente (retângulo)
- [r2] API de encurtamento (retângulo)
- [r3] Cache Redis (retângulo)
- [e1] Postgres (elipse)
- [t1] "código: base62 de 7 caracteres, vem de um contador"
CONEXÕES
- [s1] Cliente → API de encurtamento
- [s2] API de encurtamento → Cache Redis "lê primeiro"
- [s3] Cache Redis → Postgres "se não achar"`;

type Linha = [quem: "agente" | "candidato", texto: string];

/** Uma conversa longa (12 falas): o que importa está no começo, fora das últimas 8. */
const HISTORICO_LONGO: Linha[] = [
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

function conversa(linhas: Linha[], agora: number): FalaRegistrada[] {
  return linhas.map(([quem, texto], i) => ({ quem, texto, em: agora - (linhas.length - i) * 20_000 }));
}

function estado(fase: Fase, agora: number, extra: Partial<EstadoSessao> = {}): EstadoSessao {
  return {
    ...estadoInicial({ criterios: kit.criterios.map((c) => c.id) }),
    fase,
    faseIniciadaEm: agora - 4 * MIN,
    ...extra,
  };
}

function pergunta(numero: number, texto: string, nota: string, feitaEm: number, fase: Fase = "APROFUNDAMENTO"): PerguntaFeita {
  return { numero, status: "duvida", pergunta: texto, nota, elementos: [], degrau: null, fase, feitaEm };
}

type Resultado = { caso: string; ok: boolean; motivo?: string; texto: string; ms: number };
const resultados: Resultado[] = [];

function registrar(caso: string, texto: string, ms: number, falhas: string[]) {
  const ok = falhas.length === 0;
  resultados.push({ caso, ok, motivo: falhas.join("; ") || undefined, texto, ms });
  console.log(`${ok ? "OK  " : "FALHA"} ${caso} (${ms} ms)\n      ${JSON.stringify(texto)}${ok ? "" : `\n      -> ${falhas.join("; ")}`}`);
}

// ------------------------------------------------------------------ perguntar (fala com o candidato)

type CasoFala = {
  nome: string;
  texto: string;
  fase?: Fase;
  perguntaAtiva?: string;
  historico?: Linha[];
  extra?: (agora: number) => Partial<EstadoSessao>;
  checar: (texto: string, r: { responder: boolean }) => string[];
};

const TEMA_COLISAO = /colis|iguai|igual|duplic|repet|únic|unic|mesmo c[óo]digo|contador/i;
const PERGUNTA_COLISAO = "Como você garante que dois links diferentes nunca recebam o mesmo código curto?";

const CASOS_FALA: CasoFala[] = [
  {
    nome: "fala: quanto tempo dura",
    texto: "Quanto tempo dura a entrevista no total?",
    checar: (t, r) => [
      ...(!r.responder ? ["ficou calado"] : []),
      ...(!/\d+\s*min|minutos|meia hora|uma hora/i.test(t) ? ["não disse a duração"] : []),
      ...(/assum/i.test(t) ? ["mandou assumir algo sobre a própria entrevista"] : []),
    ],
  },
  {
    nome: "fala: quanto tempo falta",
    texto: "Quanto tempo eu ainda tenho?",
    checar: (t, r) => [
      ...(!r.responder ? ["ficou calado"] : []),
      ...(!/\d+\s*min|minutos/i.test(t) ? ["não disse o tempo restante"] : []),
      ...(/assum/i.test(t) ? ["mandou assumir"] : []),
    ],
  },
  {
    nome: "fala: como funciona",
    texto: "Como vai funcionar daqui pra frente? Você vai me fazer mais perguntas?",
    checar: (t, r) => [
      ...(!r.responder ? ["ficou calado"] : []),
      ...(/assum/i.test(t) ? ["mandou assumir"] : []),
      ...(t.length < 40 ? ["resposta vazia de conteúdo"] : []),
    ],
  },
  {
    nome: "fala: não sei (pergunta ativa)",
    texto: "Não sei, sinceramente não pensei nisso.",
    fase: "APROFUNDAMENTO",
    perguntaAtiva: PERGUNTA_COLISAO,
    checar: (t, r) => [
      ...(!r.responder ? ["ficou calado"] : []),
      ...(TEMA_COLISAO.test(t) ? ["insistiu no assunto que ele disse não saber"] : []),
      ...(/voc[êe] n[ãa]o sabe|n[ãa]o pensou/i.test(t) ? ["parafraseou o 'não sei' como robô"] : []),
    ],
  },
  {
    nome: "fala: pula (pergunta ativa)",
    texto: "Prefiro pular essa e seguir com o resto do desenho.",
    fase: "APROFUNDAMENTO",
    perguntaAtiva: PERGUNTA_COLISAO,
    checar: (t, r) => [
      ...(!r.responder ? ["ficou calado"] : []),
      ...(TEMA_COLISAO.test(t) ? ["insistiu no assunto que ele quis pular"] : []),
    ],
  },
  {
    nome: "fala: lembra do começo",
    texto: "Lá no começo eu falei de quantos caracteres ia ser o código curto. Você lembra quantos eu disse?",
    historico: HISTORICO_LONGO,
    checar: (t, r) => [...(!r.responder ? ["ficou calado"] : []), ...(!/\b7\b|sete/i.test(t) ? ["esqueceu o que ele disse no começo"] : [])],
  },
  {
    nome: "fala: dado já combinado",
    texto: "Só pra confirmar, quantas URLs novas por mês mesmo?",
    historico: HISTORICO_LONGO,
    checar: (t, r) => [...(!r.responder ? ["ficou calado"] : []), ...(!/100\s*milh/i.test(t) ? ["não repetiu o dado"] : [])],
  },
  {
    nome: "fala: explicou de novo o que já está na tela",
    texto: "Então, como dá pra ver aí, o Redis fica antes do Postgres e só vai no banco se não achar.",
    historico: HISTORICO_LONGO,
    checar: (t) => [
      ...(/por que.{0,40}(redis|cache).{0,30}(antes|primeiro|frente)/i.test(t) ? ["perguntou de novo o que ele já explicou"] : []),
    ],
  },
];

async function rodarFalas() {
  for (const caso of CASOS_FALA) {
    const agora = Date.now();
    const fase = caso.fase ?? "ALTO_NIVEL";
    const base = estado(fase, agora, {
      conversa: conversa(caso.historico ?? [], agora),
      ...(caso.perguntaAtiva
        ? {
            plin: "PERGUNTA_ATIVA" as const,
            perguntaAtiva: pergunta(1, caso.perguntaAtiva, "Códigos iguais?", agora - 30_000, fase),
            perguntas: [pergunta(1, caso.perguntaAtiva, "Códigos iguais?", agora - 30_000, fase)],
            perguntasFeitas: 1,
          }
        : {}),
      ...(caso.extra?.(agora) ?? {}),
    });
    const r = await perguntar(
      { llm, kit, problema },
      base,
      {
        fase,
        texto: caso.texto,
        grafo: GRAFO,
        perguntaAtiva: caso.perguntaAtiva,
        requisitosAtuais: ["100 milhões de URLs novas por mês", "Leituras: 4 mil/s; picos de 40 mil/s"],
      },
      agora,
    );
    const falhas = r.falhou ? ["falha do provedor"] : caso.checar(r.texto, r);
    registrar(caso.nome, r.texto, Date.now() - agora, falhas);
  }
}

// ------------------------------------------------------------------ analisar (perguntas por iniciativa)

type CasoAnalise = {
  nome: string;
  linhas: Linha[];
  perguntas: (agora: number) => PerguntaFeita[];
  /** Assunto que a próxima pergunta NÃO pode retomar. */
  proibido: RegExp;
  porque: string;
};

const CASOS_ANALISE: CasoAnalise[] = [
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

async function rodarAnalises(rodadas: number) {
  for (let rodada = 0; rodada < rodadas; rodada++) {
    for (const caso of CASOS_ANALISE) {
      const agora = Date.now();
      const perguntas = caso.perguntas(agora);
      const base = estado("APROFUNDAMENTO", agora, {
        conversa: conversa(caso.linhas, agora),
        perguntas,
        perguntasFeitas: perguntas.length,
        ultimaPerguntaEm: perguntas.length ? agora - 2 * MIN : null,
        ultimaRespostaEm: perguntas.length ? agora - 90_000 : null,
      });
      const pedido: PedidoAnalise = {
        sessao_id: "avaliacao-local",
        fase: "APROFUNDAMENTO",
        grafo: GRAFO,
        mudancas: "(nada mudou)",
        // Como o quadro manda hoje: só as últimas falas.
        conversa_recente: caso.linhas.slice(-6).map(([quem, texto]) => ({ quem, texto })),
        perguntas_feitas: perguntas.length,
        imagem_url: null,
        parado_ha_s: 25,
        requisitos: ["100 milhões de URLs novas por mês", "Leituras: 4 mil/s; picos de 40 mil/s"],
      };
      const r = await analisar({ llm, kit, problema }, base, pedido, agora);
      const fala = r.resposta.status === "ok" ? "(ok: ficou quieto)" : `[${r.resposta.status}] ${r.resposta.pergunta} | nota: ${r.resposta.nota}`;
      const falhas =
        r.diagnostico.origem === "erro"
          ? [`falha do provedor (${r.diagnostico.ajustes.join(",")})`]
          : r.resposta.status !== "ok" && caso.proibido.test(`${r.resposta.pergunta} ${r.resposta.nota}`)
            ? [caso.porque]
            : [];
      registrar(`${caso.nome}${rodadas > 1 ? ` #${rodada + 1}` : ""}`, fala, Date.now() - agora, falhas);
    }
  }
}

// ------------------------------------------------------------------ abertura

async function rodarAbertura() {
  const inicio = Date.now();
  const a = await gerarAbertura({ llm, kit, problema, duracaoMin: 35, etapas: "entender o problema (~5 min), visão geral (~10 min), aprofundar (~15 min), fechamento (~5 min)" });
  const texto = a?.apresentacao ?? "(sem abertura)";
  const falhas = [
    ...(!a ? ["abertura falhou"] : []),
    ...(!/totti/i.test(texto) ? ["não se apresentou pelo nome"] : []),
    ...(!/quadro|desenh/i.test(texto) ? ["não explicou como vai ser"] : []),
    ...(!/\d+\s*min|minutos/i.test(texto) ? ["não disse quanto tempo dura"] : []),
  ];
  registrar("abertura: se apresenta e explica", texto, Date.now() - inicio, falhas);
}

async function main() {
  const so = process.env.SO;
  const rodadas = Number(process.env.RODADAS) || 1;
  if (!so || so === "abertura") await rodarAbertura();
  if (!so || so === "fala") for (let i = 0; i < rodadas; i++) await rodarFalas();
  if (!so || so === "analise") await rodarAnalises(rodadas);
  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} casos ok`);
  if (falhas.length) process.exitCode = 1;
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
