// Handlers das rotas /api/sessoes/*. Os arquivos em app/api/ só repassam para cá (o Next não deixa
// exportar nada além de GET/POST/runtime etc. de um route.ts).
//
// Regras de ouro: a resposta tem EXATAMENTE o formato do contrato (o quadro rejeita outro); nada de
// ficha, sinais, armadilhas, rubrica ou diagnóstico sai daqui; o log leva só ids e metadados.
import { z } from "zod";
import { findConfig } from "@/lib/config/store";
import { comRegrasDaSquad } from "@/lib/squad-memory/config";
import { hidratarSquadMemory } from "@/lib/squad-memory/store";
import { ErroLimite } from "../armazenamento";
import { gerarAbertura, PRAZO_ABERTURA_MS } from "../abertura";
import { analisar, refiltrarComEstadoAtual, respostaSilencio } from "../analisar";
import { dadosPublicosDoProblema, resolverAvaliacao } from "../kits";
import type { LlmCliente } from "../llm/cliente";
import type { Kit, Problema } from "../kits/tipos";
import { apresentacaoReserva, DESPEDIDA_RESERVA, type Abertura, type ContextoAbertura } from "../prompts/abertura";
import { etapasEmTexto } from "../prompts/contexto";
import { escalarTempos, planoDaConfig } from "../plano";
import { avaliacaoDaConfig } from "../kits/questao-da-vaga";
import { perguntar } from "../perguntar";
import { transicionar, estadoInicial, TEMPOS_PADRAO, tempoDaEntrevista, type Desfecho, type EstadoSessao, type EventoSessao } from "../sessao/estado";
import {
  EsquemaFalaRecente,
  EsquemaImagemOpcional,
  EsquemaFase,
  EsquemaPedidoAnalise,
  type PedidoAnalise,
  type RespostaAnalise,
} from "../sessao/tipos";
import { kvPadrao } from "@/lib/storage/kv";
import { semFalaSubstituida } from "@/lib/conversa/substituir";
import { contarComponentes, esperaDoEmpecilho, esperaDoEmpecilhoForcado } from "../../sessao/empecilho";
import { registrarNoIndice } from "../resultados";
import { contexto } from "./contexto";
import { devHabilitado, finalizarEmSegundoPlano } from "./scorecard";
import { criarLimitador, erro, ipDe, json, lerJsonValidado, type ParamsId } from "./http";

export const PRAZO_ANALISE_MS = 8000;
export const MAX_ANALISES_POR_SESSAO = 200;
export const MAX_CORPO_JSON = 64 * 1024;
/** Cabe a foto do quadro (até 500 mil caracteres) além do grafo e da conversa. */
export const MAX_CORPO_ANALISE = 700_000;
export const MAX_CORPO_EVENTOS = 256 * 1024;
export const MAX_IMAGEM = 4 * 1024 * 1024;

/** 10 criações de sessão por minuto por IP. */
export const limitadorCriacao = criarLimitador(10, 60_000);

const MAGIA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const notFound = () => erro(404, "sessão não encontrada");

/** O ID é um UUID gerado por nós; qualquer outra coisa nem vai ao repositório. */
const eIdPlausivel = (id: string) => id.length > 0 && id.length <= 80;

// ---------------------------------------------------------------------------------------------
// POST /api/sessoes
// ---------------------------------------------------------------------------------------------

const EsquemaCriar = z.object({
  avaliacao_id: z.string().min(1).max(100),
  candidato_id: z.string().min(1).max(100),
  /** Plano de entrevista da vaga (InterviewConfig da pré-entrevista). Sem ele ou desconhecido: entrevista padrão. */
  config_id: z.string().min(1).max(80).optional(),
});

export async function criarSessaoHandler(req: Request): Promise<Response> {
  if (limitadorCriacao.estourou(ipDe(req))) return erro(429, "muitas sessões criadas; tente em instantes");
  const corpo = await lerJsonValidado(req, EsquemaCriar, MAX_CORPO_JSON);
  if (!corpo.ok) return corpo.resposta;

  // O plano da vaga (se vier) escolhe o kit e calibra a entrevista; config desconhecida cai na entrevista padrão.
  const encontrada = corpo.dados.config_id ? await findConfig(corpo.dados.config_id) : undefined;
  // Regras ativas da vaga no começo da sessão (só as aprendidas nesta vaga): o entrevistador e o scorecard
  // usam (ver `lib/squad-memory/config.ts`). Na Vercel cada lambda tem o próprio Map: hidrata do banco antes,
  // senão a sessão pode nascer sem as regras salvas em outra instância (a função não lança e tem cache curto).
  if (encontrada) await hidratarSquadMemory();
  const config = encontrada ? comRegrasDaSquad(encontrada) : undefined;
  const plano = config ? planoDaConfig(config) : null;
  // A questão gerada para a vaga, se já existe; senão o problema fixo do catálogo (ver `avaliacaoDaConfig`).
  const avaliacaoId = (config && (await avaliacaoDaConfig(config))) || corpo.dados.avaliacao_id;

  const alvo = await resolverAvaliacao(avaliacaoId);
  if (!alvo) return erro(404, "avaliação não encontrada");
  // Kit gerado só vai a candidato depois da aprovação humana (AGENTE_PERMITIR_NAO_APROVADA=1 libera, p/ demos).
  if (alvo.dinamica && !alvo.aprovado && process.env.AGENTE_PERMITIR_NAO_APROVADA !== "1") {
    return erro(403, "avaliação ainda não aprovada");
  }
  const { kit, problema } = alvo;

  const ctx = contexto();
  const inicial = estadoInicial({
    criterios: kit.criterios.map((c) => c.id),
    plano,
    tempos: plano ? escalarTempos(TEMPOS_PADRAO, plano.duracaoMin) : undefined,
  });
  const comeco = transicionar(inicial, { tipo: "COMECAR" }, ctx.agora());
  const sessao = await ctx.repositorio.criar({
    avaliacaoId,
    candidatoId: corpo.dados.candidato_id,
    estado: comeco.estado,
  });
  // A sessão aberta com a vaga entra no índice do painel (a tech lead acompanha e vê o resultado por ele).
  if (config) {
    try {
      await registrarNoIndice(kvPadrao(), {
        sessionId: sessao.id,
        configId: config.id,
        roleTitle: config.roleTitle,
        startedAt: sessao.criadaEm,
        ended: false,
        state: "running",
      });
    } catch (e) {
      console.warn("[agente] indice_nao_registrado", { sessao_id: sessao.id, erro: e instanceof Error ? e.name : "desconhecido" });
    }
  }
  // Apresentação e despedida escritas pelo modelo (1 chamada, guardada por kit+problema: só a primeira sessão paga a espera).
  // Sem LLM ou em erro: null, e o quadro não fala.
  // A abertura diz quanto tempo dura e quais as etapas: o tempo do plano, ou a soma das fases.
  const contextoAbertura = {
    duracaoMin: tempoDaEntrevista(sessao.estado, ctx.agora()).totalMin || undefined,
    etapas: etapasEmTexto(sessao.estado),
  };
  const gerada = ctx.llm ? await aberturaDaSessao(ctx.llm, kit, problema, contextoAbertura) : null;
  // Sem o modelo, uma apresentação fixa: o Totti nunca começa sem se apresentar.
  const abertura = gerada ?? (ctx.llm ? { apresentacao: apresentacaoReserva(kit, contextoAbertura), despedida: DESPEDIDA_RESERVA } : null);
  console.warn("[agente] sessao_criada", { sessao_id: sessao.id, kit: kit.id, plano: plano !== null, abertura: abertura !== null });
  return json({
    sessao_id: sessao.id,
    area: kit.area,
    problema: dadosPublicosDoProblema(problema),
    tempos: sessao.estado.tempos,
    apresentacao: abertura?.apresentacao ?? null,
    despedida: abertura?.despedida ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// POST /api/sessoes/[id]/analisar
// ---------------------------------------------------------------------------------------------

const EsquemaPedidoLimitado = EsquemaPedidoAnalise.extend({
  sessao_id: z.string().min(1).max(80),
  grafo: z.string().max(60_000),
  mudancas: z.string().max(20_000),
  conversa_recente: z
    .array(z.object({ quem: z.enum(["candidato", "agente"]), texto: z.string().max(4000) }))
    .max(40),
  perguntas_feitas: z.number().int().min(0).max(1000),
  imagem_url: z.string().max(2048).nullable(),
  imagem_base64: EsquemaImagemOpcional,
});

/** Leva o estado do servidor até a fase que o quadro informou (só avança), por evento da máquina. */
function sincronizarFase(estado: EstadoSessao, fase: EstadoSessao["fase"], agora: number): EstadoSessao {
  return transicionar(estado, { tipo: "SINCRONIZAR_FASE", fase }, agora).estado;
}

/** Aberturas já geradas, por LLM (os testes trocam o LLM) e por kit+problema. Só guarda sucesso; limite simples de tamanho. */
const cacheAbertura = new WeakMap<object, Map<string, Abertura>>();
const MAX_ABERTURAS_EM_CACHE = 200;

async function aberturaDaSessao(llm: LlmCliente, kit: Kit, problema: Problema, contexto: ContextoAbertura): Promise<Abertura | null> {
  const chave = `${kit.id}:${problema.id}:${problema.titulo}:${problema.enunciado}:${contexto.duracaoMin ?? ""}:${contexto.etapas ?? ""}`;
  let doLlm = cacheAbertura.get(llm);
  if (!doLlm) cacheAbertura.set(llm, (doLlm = new Map()));
  const guardada = doLlm.get(chave);
  if (guardada) return guardada;
  const nova = await comPrazo(
    gerarAbertura({ llm, kit, problema, ...contexto }, AbortSignal.timeout(PRAZO_ABERTURA_MS)),
    PRAZO_ABERTURA_MS,
    null,
  );
  if (nova) {
    if (doLlm.size >= MAX_ABERTURAS_EM_CACHE) doLlm.clear();
    doLlm.set(chave, nova);
  }
  return nova;
}

function comPrazo<T>(promessa: Promise<T>, ms: number, reserva: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const prazo = new Promise<T>((r) => {
    timer = setTimeout(() => r(reserva), ms);
  });
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(timer));
}

export async function analisarHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  const corpo = await lerJsonValidado(req, EsquemaPedidoLimitado, MAX_CORPO_ANALISE);
  if (!corpo.ok) return corpo.resposta;
  const pedido: PedidoAnalise = corpo.dados;
  if (!eIdPlausivel(id)) return notFound();
  if (pedido.sessao_id !== id) return erro(400, "sessao_id do corpo diferente da rota");

  const ctx = contexto();
  const sessao = await ctx.repositorio.obter(id);
  if (!sessao) return notFound();
  // Cada ida ao banco custa ~300 ms de Washington a São Paulo: a avaliação e a contagem andam juntas.
  const [alvo, analises] = await Promise.all([resolverAvaliacao(sessao.avaliacaoId), ctx.repositorio.contarAnalise(id)]);
  if (!alvo) return erro(500, "avaliação da sessão indisponível");
  if (analises > MAX_ANALISES_POR_SESSAO) {
    return erro(429, "limite de análises da sessão");
  }

  const t0 = ctx.agora();
  const estado = sincronizarFase(sessao.estado, pedido.fase, t0);
  let resposta: RespostaAnalise = respostaSilencio();
  let origem = "sem_llm";

  if (ctx.llm) {
    const sinal = AbortSignal.timeout(PRAZO_ANALISE_MS);
    const r = await comPrazo(
      analisar({ llm: ctx.llm, kit: alvo.kit, problema: alvo.problema }, estado, pedido, t0, sinal).catch(
        () => null,
      ),
      PRAZO_ANALISE_MS,
      null,
    );
    if (r) {
      resposta = r.resposta;
      origem = r.diagnostico.origem;
    } else {
      origem = "prazo";
    }
  }

  // Relê o estado: eventos podem ter chegado durante a análise (p. ex. uma fala do agente no /perguntar).
  // Refiltra a resposta com o estado fresco, para a regra "a bola está com o candidato" valer também aqui.
  const atual = await ctx.repositorio.obter(id);
  let novo = sincronizarFase(atual?.estado ?? estado, pedido.fase, t0);
  if (origem === "llm") {
    const fim = ctx.agora();
    resposta = refiltrarComEstadoAtual(novo, resposta, pedido, t0, fim);
    const anteriores = novo.observacoes.length;
    novo = transicionar(novo, { tipo: "ANALISE_RECEBIDA", resposta }, fim).estado;
    novo = {
      ...novo,
      observacoes: novo.observacoes.map((o, i) => i < anteriores ? o : {
        ...o, desenho: { horario: new Date(t0).toISOString(), grafo: pedido.grafo },
      }),
    };
  }
  await ctx.repositorio.salvarEstado(id, novo);
  console.warn("[agente] rota_analisar", { sessao_id: id, fase: pedido.fase, origem, status: resposta.status });

  // Formato exato do contrato (sem diagnóstico).
  return json({
    status: resposta.status,
    pergunta: resposta.pergunta,
    nota: resposta.nota,
    elementos: resposta.elementos,
    // Sem estes dois, os gestos do modelo nunca chegavam ao quadro e a fase não avançava sozinha.
    ...(resposta.visual !== undefined ? { visual: resposta.visual } : {}),
    degrau: resposta.degrau,
    observacoes: resposta.observacoes,
    ...(resposta.avancar_fase ? { avancar_fase: true } : {}),
  } satisfies RespostaAnalise);
}

// ---------------------------------------------------------------------------------------------
// POST /api/sessoes/[id]/perguntar
// ---------------------------------------------------------------------------------------------

const EsquemaPerguntar = z.object({
  sessao_id: z.string().min(1).max(80),
  fase: EsquemaFase,
  texto: z.string().min(1).max(2000),
  grafo: z.string().max(24000).optional(),
  pergunta_ativa: z.string().max(2000).optional(),
  requisitos: z.array(z.string().max(200)).max(30).optional(),
  gestos_recentes: z.array(z.string().max(250)).max(6).optional(),
  /** Foto leve do quadro (data URL JPEG). */
  imagem_base64: EsquemaImagemOpcional,
  /** O que acabou de mudar no desenho. */
  // Texto longo é cortado, não recusado: perder a fala do candidato por causa do contexto seria pior.
  mudancas: z.string().transform((v) => v.slice(0, 8000)).optional(),
  /** A fala junta a anterior, que ele continuou antes de ouvir a resposta: a anterior sai do histórico. */
  substitui: z.boolean().optional(),
  /** Falas recentes que o quadro tem e o servidor talvez não (apresentação, desafio). */
  conversa_do_quadro: z
    .array(EsquemaFalaRecente.extend({ texto: z.string().transform((v) => v.slice(0, 4000)) }))
    .transform((v) => v.slice(-30))
    .optional(),
});

/** Corpo do /perguntar: a foto do quadro não cabe no limite padrão. */
const MAX_CORPO_PERGUNTAR = 700_000;

/** A pergunta do agente que esta fala responde: a ativa, ou a última com o texto que o quadro mandou. */
function perguntaRespondida(estado: EstadoSessao, perguntaAtiva: string | undefined): number | null {
  if (estado.perguntaAtiva) return estado.perguntaAtiva.numero;
  const texto = perguntaAtiva?.trim();
  if (!texto) return null;
  return estado.perguntas.findLast((p) => p.pergunta.trim() === texto || p.seguimentos?.some((s) => s.trim() === texto))?.numero ?? null;
}

export async function perguntarHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  const corpo = await lerJsonValidado(req, EsquemaPerguntar, MAX_CORPO_PERGUNTAR);
  if (!corpo.ok) return corpo.resposta;
  if (!eIdPlausivel(id)) return notFound();
  if (corpo.dados.sessao_id !== id) return erro(400, "sessao_id do corpo diferente da rota");

  const ctx = contexto();
  const sessao = await ctx.repositorio.obter(id);
  if (!sessao) return notFound();
  const alvo = await resolverAvaliacao(sessao.avaliacaoId);
  if (!alvo) return erro(500, "avaliação da sessão indisponível");

  const agora = ctx.agora();
  const { fase, texto } = corpo.dados;
  let resposta: Pick<Awaited<ReturnType<typeof perguntar>>, "responder" | "texto" | "requisito" | "concluiu" | "seguimento" | "encerrar" | "visual"> = { responder: false, texto: "", requisito: null, concluiu: false };
  let desfecho: Desfecho | null = null;
  // A fala substitui a anterior (ele continuou antes de ouvir a resposta): a anterior e a resposta não ouvida saem.
  const semSubstituida = (e: EstadoSessao): EstadoSessao =>
    corpo.dados.substitui ? { ...e, conversa: semFalaSubstituida(e.conversa, texto) } : e;

  if (ctx.llm) {
    const estado = semSubstituida(sincronizarFase(sessao.estado, fase, agora));
    const r = await comPrazo(
      perguntar(
        { llm: ctx.llm, kit: alvo.kit, problema: alvo.problema },
        estado,
        { fase, texto, sessao_id: id, grafo: corpo.dados.grafo, perguntaAtiva: corpo.dados.pergunta_ativa ?? estado.perguntaAtiva?.pergunta, requisitosAtuais: corpo.dados.requisitos, gestosRecentes: corpo.dados.gestos_recentes,
          imagemBase64: corpo.dados.imagem_base64, mudancas: corpo.dados.mudancas, conversaDoQuadro: corpo.dados.conversa_do_quadro },
        agora,
        AbortSignal.timeout(PRAZO_ANALISE_MS),
      ).catch(() => null),
      PRAZO_ANALISE_MS,
      null,
    );
    if (!r || r.falhou) return erro(503, "Não foi possível preparar a resposta. Tente enviar sua fala novamente.");
    resposta = { responder: r.responder, texto: r.texto, requisito: r.requisito, concluiu: r.concluiu,
      ...(r.seguimento ? { seguimento: true } : {}), ...(r.encerrar ? { encerrar: true } : {}),
      ...(r.visual !== undefined ? { visual: r.visual } : {}) };
    desfecho = r.desfecho;
  }

  // Reaplica as falas sobre o estado mais recente (eventos podem ter mexido nele no meio do caminho).
  const atual = (await ctx.repositorio.obter(id))?.estado ?? sessao.estado;
  let novo = semSubstituida(sincronizarFase(atual, fase, agora));
  novo = transicionar(novo, { tipo: "CANDIDATO_FALOU", texto, fimDeResposta: false }, agora).estado;
  if (resposta.responder) novo = transicionar(novo, { tipo: "AGENTE_FALOU", texto: resposta.texto }, agora).estado;
  // Como ele reagiu à pergunta do agente fica na pergunta: "não sei" e "pula" encerram o assunto para a análise.
  const numeroDaPergunta = perguntaRespondida(novo, corpo.dados.pergunta_ativa);
  if (desfecho && numeroDaPergunta !== null) {
    novo = transicionar(novo, { tipo: "DESFECHO_DA_PERGUNTA", numero: numeroDaPergunta, desfecho, resposta: texto }, agora).estado;
  }
  if (resposta.seguimento && numeroDaPergunta !== null) {
    novo = transicionar(novo, { tipo: "SEGUIMENTO_FEITO", numero: numeroDaPergunta, pergunta: resposta.texto }, agora).estado;
  }
  await ctx.repositorio.salvarEstado(id, novo);
  console.warn("[agente] rota_perguntar", { sessao_id: id, fase, responder: resposta.responder,
    seguimento: !!resposta.seguimento, encerrar: !!resposta.encerrar, substitui: !!corpo.dados.substitui });

  return json(resposta);
}

// ---------------------------------------------------------------------------------------------
// POST /api/sessoes/[id]/empecilho
// ---------------------------------------------------------------------------------------------

const EsquemaEmpecilho = z.object({
  sessao_id: z.string().min(1).max(80),
  fase: EsquemaFase,
  grafo: z.string().max(60_000).optional(),
  /** Demo: solta a mudança agora, sem esperar a hora certa. Só fora de produção. */
  forcar: z.boolean().optional(),
});

/** Por que a mudança não pode sair agora (null = pode). */
function motivoDoEmpecilho(estado: EstadoSessao, grafo: string, forcar: boolean, agora: number): string | null {
  const jaAnunciado = !!estado.empecilho;
  if (forcar) return esperaDoEmpecilhoForcado({ fase: estado.fase, jaAnunciado });
  const ultimaDoAgente = estado.conversa.findLast((f) => f.quem === "agente");
  return esperaDoEmpecilho({
    agora,
    fase: estado.fase,
    faseIniciadaEm: estado.faseIniciadaEm,
    duracaoDaFaseS: estado.tempos[estado.fase],
    jaAnunciado,
    respondendoPergunta: estado.plin === "PERGUNTA_ATIVA",
    componentes: contarComponentes(grafo),
    ultimaFalaDoAgenteEm: ultimaDoAgente?.em ?? null,
  });
}

/**
 * O quadro pede a mudança no problema quando acha que é a hora (pausa do candidato, meio da entrevista).
 * O servidor confere de novo, entrega o texto pronto do kit (nunca gerado pelo modelo), guarda no estado
 * e registra o evento `empecilho` na linha do tempo. Resposta: { empecilho: { fala, requisito } | null, motivo }.
 */
export async function empecilhoHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  const corpo = await lerJsonValidado(req, EsquemaEmpecilho, MAX_CORPO_ANALISE);
  if (!corpo.ok) return corpo.resposta;
  const forcar = corpo.dados.forcar === true;
  if (forcar && !devHabilitado()) return erro(404, "indisponível");
  if (!eIdPlausivel(id)) return notFound();
  if (corpo.dados.sessao_id !== id) return erro(400, "sessao_id do corpo diferente da rota");

  const ctx = contexto();
  const sessao = await ctx.repositorio.obter(id);
  if (!sessao) return notFound();
  const alvo = await resolverAvaliacao(sessao.avaliacaoId);
  if (!alvo) return erro(500, "avaliação da sessão indisponível");
  const empecilho = alvo.problema.empecilho;
  if (!empecilho) return json({ empecilho: null, motivo: "problema sem mudança prevista" });

  const agora = ctx.agora();
  const estado = sincronizarFase(sessao.estado, corpo.dados.fase, agora);
  const motivo = motivoDoEmpecilho(estado, corpo.dados.grafo ?? "", forcar, agora);
  if (motivo) {
    // A fase avançou com este pedido: guarda, para o tempo da fase não recomeçar no próximo.
    if (estado !== sessao.estado) await ctx.repositorio.salvarEstado(id, estado);
    return json({ empecilho: null, motivo });
  }

  const novo = transicionar(estado, {
    tipo: "EMPECILHO_ANUNCIADO",
    empecilho: { id: empecilho.id, fala: empecilho.fala, requisito: empecilho.requisito, exige: empecilho.exige, forcado: forcar },
  }, agora).estado;
  await ctx.repositorio.salvarEstado(id, novo);
  await ctx.repositorio.anexarEventos(id, [{
    horario: new Date(agora).toISOString(),
    tipo: "empecilho",
    dados: { id: empecilho.id, tipo: empecilho.tipo, fala: empecilho.fala, requisito: empecilho.requisito, forcado: forcar },
  }]);
  console.warn("[agente] empecilho_anunciado", { sessao_id: id, fase: estado.fase, empecilho: empecilho.id, forcado: forcar });
  return json({ empecilho: { fala: empecilho.fala, requisito: empecilho.requisito }, motivo: null });
}

// ---------------------------------------------------------------------------------------------
// POST /api/sessoes/[id]/eventos
// ---------------------------------------------------------------------------------------------

const EsquemaEventos = z.object({
  eventos: z
    .array(
      z.object({
        horario: z.string().max(40).refine((h) => !Number.isNaN(Date.parse(h)), "horário inválido"),
        tipo: z.string().min(1).max(40),
        dados: z.unknown(),
      }),
    )
    .max(500),
});

function idsDe(dados: unknown): string[] {
  const d = (dados ?? {}) as { ids?: unknown; mudancas?: unknown };
  if (Array.isArray(d.ids)) return d.ids.filter((x): x is string => typeof x === "string").slice(0, 200);
  if (typeof d.mudancas === "string") return [...d.mudancas.matchAll(/\[([a-z]\d+)\]/g)].map((m) => m[1]);
  return [];
}

/** Desenho mínimo para sair de REQUISITOS: um traço solto no começo não encerra as perguntas de requisito. */
export const MIN_PECAS_PARA_SAIR_DOS_REQUISITOS = 2;

/** Componentes + conexões no grafo em texto (as linhas "- [id]" dessas duas seções). */
export function pecasDoDesenho(grafo: string): number {
  let secao = "";
  let n = 0;
  for (const linha of grafo.split("\n")) {
    const t = linha.trim();
    if (!t.startsWith("-")) secao = t;
    else if ((secao === "COMPONENTES" || secao === "CONEXÕES") && /^- \[/.test(t)) n++;
  }
  return n;
}

/** Traduz um evento da linha do tempo em eventos da máquina (tipos desconhecidos: nenhum). */
export function eventosDaMaquina(tipo: string, dados: unknown): EventoSessao[] {
  const d = (dados ?? {}) as Record<string, unknown>;
  switch (tipo) {
    case "fase": {
      const fase = EsquemaFase.safeParse(d.fase);
      return fase.success ? [{ tipo: "SINCRONIZAR_FASE", fase: fase.data }] : [];
    }
    case "pergunta":
      return [{ tipo: "PLIN_CLICADO" }];
    case "resposta":
      return [
        {
          tipo: "CANDIDATO_FALOU",
          texto: d.quem !== "agente" && typeof d.texto === "string" ? d.texto.slice(0, 2000) : "",
          fimDeResposta: true,
        },
      ];
    case "desenho": {
      const ids = idsDe(dados);
      // Sem grafo (cliente antigo), vale o comportamento de antes: qualquer desenho sai de REQUISITOS.
      const estruturado = typeof d.grafo !== "string" || pecasDoDesenho(d.grafo) >= MIN_PECAS_PARA_SAIR_DOS_REQUISITOS;
      const eventos: EventoSessao[] = estruturado ? [{ tipo: "CANDIDATO_DESENHOU" }] : [];
      if (ids.length) eventos.push({ tipo: "ELEMENTOS_ALTERADOS", ids });
      return eventos;
    }
    default:
      return [];
  }
}

export async function eventosHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  const corpo = await lerJsonValidado(req, EsquemaEventos, MAX_CORPO_EVENTOS);
  if (!corpo.ok) return corpo.resposta;
  if (!eIdPlausivel(id)) return notFound();

  const ctx = contexto();
  const sessao = await ctx.repositorio.obter(id);
  if (!sessao) return notFound();

  // Só os eventos novos (reenvio de lote não duplica nem reaplica transições).
  const novos = await ctx.repositorio.anexarEventos(
      id,
      corpo.dados.eventos.map((e) => ({ horario: e.horario, tipo: e.tipo, dados: e.dados ?? null })),
    );
  if (novos.length) {
    const agora = ctx.agora();
    const atual = (await ctx.repositorio.obter(id))?.estado ?? sessao.estado;
    let estado = atual;
    for (const e of novos) {
      for (const ev of eventosDaMaquina(e.tipo, e.dados)) estado = transicionar(estado, ev, agora).estado;
    }
    if (estado !== atual) await ctx.repositorio.salvarEstado(id, estado);
    // A entrevista de uma vaga acabou: o scorecard sai agora, em segundo plano, e aparece no painel.
    if (estado.fase === "ENCERRADA" && atual.fase !== "ENCERRADA" && estado.plano) finalizarEmSegundoPlano(id);
  }
  return json({ ok: true, recebidos: corpo.dados.eventos.length, novos: novos.length });
}

// ---------------------------------------------------------------------------------------------
// POST/GET /api/sessoes/[id]/imagens
// ---------------------------------------------------------------------------------------------

export async function imagemPostHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > MAX_IMAGEM + 64 * 1024) return erro(413, "imagem grande demais");
  if (!eIdPlausivel(id)) return notFound();
  const ctx = contexto();
  if (!(await ctx.repositorio.obter(id))) return notFound();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return erro(400, "multipart inválido");
  }
  const arquivo = form.get("imagem");
  const horario = form.get("horario");
  if (typeof arquivo === "string" || arquivo === null) return erro(400, "campo `imagem` ausente");
  if (typeof horario !== "string" || Number.isNaN(Date.parse(horario)) || horario.length > 40) {
    return erro(400, "campo `horario` inválido");
  }
  if (arquivo.size > MAX_IMAGEM) return erro(413, "imagem grande demais");
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGEM) return erro(413, "imagem grande demais");
  if (bytes.byteLength < MAGIA_PNG.length || !MAGIA_PNG.every((b, i) => bytes[i] === b)) {
    return erro(400, "a imagem precisa ser PNG");
  }
  let n: number;
  try {
    n = await ctx.repositorio.salvarImagem(id, { bytes, horario });
  } catch (e) {
    if (e instanceof ErroLimite) return erro(429, e.message);
    throw e;
  }
  return json({ url: `/api/sessoes/${encodeURIComponent(id)}/imagens/${n}` });
}

export async function imagemGetHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string; n: string }> },
): Promise<Response> {
  const { id, n } = await params;
  if (!eIdPlausivel(id) || !/^[1-9]\d{0,3}$/.test(n)) return notFound();
  const img = await contexto().repositorio.obterImagem(id, Number(n));
  if (!img) return erro(404, "imagem não encontrada");
  return new Response(img.bytes as BodyInit, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "Content-Length": String(img.bytes.byteLength) },
  });
}

// ---------------------------------------------------------------------------------------------
// Etapas futuras (voz)
// ---------------------------------------------------------------------------------------------

export function naoImplementado(): Response {
  return erro(501, "voz ainda não implementada");
}
