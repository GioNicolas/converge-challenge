// Handlers das rotas /api/sessoes/*. Os arquivos em app/api/ só repassam para cá (o Next não deixa
// exportar nada além de GET/POST/runtime etc. de um route.ts).
//
// Regras de ouro: a resposta tem EXATAMENTE o formato do contrato (o quadro rejeita outro); nada de
// ficha, sinais, armadilhas, rubrica ou diagnóstico sai daqui; o log leva só ids e metadados.
import { z } from "zod";
import { ErroLimite } from "../armazenamento";
import { gerarAbertura, PRAZO_ABERTURA_MS } from "../abertura";
import { analisar, respostaSilencio } from "../analisar";
import { dadosPublicosDoProblema, resolverAvaliacao } from "../kits";
import type { LlmCliente } from "../llm/cliente";
import type { Kit, Problema } from "../kits/tipos";
import type { Abertura } from "../prompts/abertura";
import { perguntar } from "../perguntar";
import { transicionar, estadoInicial, type EstadoSessao, type EventoSessao } from "../sessao/estado";
import {
  EsquemaFase,
  EsquemaPedidoAnalise,
  type PedidoAnalise,
  type RespostaAnalise,
} from "../sessao/tipos";
import { contexto } from "./contexto";
import { criarLimitador, erro, ipDe, json, lerJsonValidado, type ParamsId } from "./http";

export const PRAZO_ANALISE_MS = 8000;
export const MAX_ANALISES_POR_SESSAO = 200;
export const MAX_CORPO_JSON = 64 * 1024;
export const MAX_CORPO_ANALISE = 160 * 1024;
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
});

export async function criarSessaoHandler(req: Request): Promise<Response> {
  if (limitadorCriacao.estourou(ipDe(req))) return erro(429, "muitas sessões criadas; tente em instantes");
  const corpo = await lerJsonValidado(req, EsquemaCriar, MAX_CORPO_JSON);
  if (!corpo.ok) return corpo.resposta;

  const alvo = await resolverAvaliacao(corpo.dados.avaliacao_id);
  if (!alvo) return erro(404, "avaliação não encontrada");
  // Kit gerado só vai a candidato depois da aprovação humana (AGENTE_PERMITIR_NAO_APROVADA=1 libera, p/ demos).
  if (alvo.dinamica && !alvo.aprovado && process.env.AGENTE_PERMITIR_NAO_APROVADA !== "1") {
    return erro(403, "avaliação ainda não aprovada");
  }
  const { kit, problema } = alvo;

  const ctx = contexto();
  const inicial = estadoInicial({ criterios: kit.criterios.map((c) => c.id) });
  const comeco = transicionar(inicial, { tipo: "COMECAR" }, ctx.agora());
  const sessao = await ctx.repositorio.criar({
    avaliacaoId: corpo.dados.avaliacao_id,
    candidatoId: corpo.dados.candidato_id,
    estado: comeco.estado,
  });
  // Apresentação e despedida escritas pelo modelo (1 chamada, guardada por kit+problema: só a primeira sessão paga a espera).
  // Sem LLM ou em erro: null, e o quadro não fala.
  const abertura = ctx.llm ? await aberturaDaSessao(ctx.llm, kit, problema) : null;
  console.warn("[agente] sessao_criada", { sessao_id: sessao.id, kit: kit.id, abertura: abertura !== null });
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
});

/** Leva o estado do servidor até a fase que o quadro informou (só avança), por evento da máquina. */
function sincronizarFase(estado: EstadoSessao, fase: EstadoSessao["fase"], agora: number): EstadoSessao {
  return transicionar(estado, { tipo: "SINCRONIZAR_FASE", fase }, agora).estado;
}

/** Aberturas já geradas, por LLM (os testes trocam o LLM) e por kit+problema. Só guarda sucesso; limite simples de tamanho. */
const cacheAbertura = new WeakMap<object, Map<string, Abertura>>();
const MAX_ABERTURAS_EM_CACHE = 200;

async function aberturaDaSessao(llm: LlmCliente, kit: Kit, problema: Problema): Promise<Abertura | null> {
  const chave = `${kit.id}:${problema.id}:${problema.titulo}:${problema.enunciado}`;
  let doLlm = cacheAbertura.get(llm);
  if (!doLlm) cacheAbertura.set(llm, (doLlm = new Map()));
  const guardada = doLlm.get(chave);
  if (guardada) return guardada;
  const nova = await comPrazo(
    gerarAbertura({ llm, kit, problema }, AbortSignal.timeout(PRAZO_ABERTURA_MS)),
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
  const alvo = await resolverAvaliacao(sessao.avaliacaoId);
  if (!alvo) return erro(500, "avaliação da sessão indisponível");

  if ((await ctx.repositorio.contarAnalise(id)) > MAX_ANALISES_POR_SESSAO) {
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

  // Relê o estado: eventos podem ter chegado durante a análise. Reaplica só a resposta (já filtrada).
  const atual = await ctx.repositorio.obter(id);
  let novo = sincronizarFase(atual?.estado ?? estado, pedido.fase, t0);
  if (origem === "llm") {
    const anteriores = novo.observacoes.length;
    novo = transicionar(novo, { tipo: "ANALISE_RECEBIDA", resposta }, ctx.agora()).estado;
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
    degrau: resposta.degrau,
    observacoes: resposta.observacoes,
  } satisfies RespostaAnalise);
}

// ---------------------------------------------------------------------------------------------
// POST /api/sessoes/[id]/perguntar
// ---------------------------------------------------------------------------------------------

const EsquemaPerguntar = z.object({
  sessao_id: z.string().min(1).max(80),
  fase: EsquemaFase,
  texto: z.string().min(1).max(2000),
});

export async function perguntarHandler(req: Request, { params }: ParamsId): Promise<Response> {
  const { id } = await params;
  const corpo = await lerJsonValidado(req, EsquemaPerguntar, MAX_CORPO_JSON);
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
  let resposta = { responder: false, texto: "", requisito: null as string | null, concluiu: false };

  if (ctx.llm) {
    const estado = sincronizarFase(sessao.estado, fase, agora);
    const r = await comPrazo(
      perguntar(
        { llm: ctx.llm, kit: alvo.kit, problema: alvo.problema },
        estado,
        { fase, texto, sessao_id: id },
        agora,
        AbortSignal.timeout(PRAZO_ANALISE_MS),
      ).catch(() => null),
      PRAZO_ANALISE_MS,
      null,
    );
    if (r) resposta = { responder: r.responder, texto: r.texto, requisito: r.requisito, concluiu: r.concluiu };
  }

  // Reaplica as falas sobre o estado mais recente (eventos podem ter mexido nele no meio do caminho).
  const atual = (await ctx.repositorio.obter(id))?.estado ?? sessao.estado;
  let novo = sincronizarFase(atual, fase, agora);
  novo = transicionar(novo, { tipo: "CANDIDATO_FALOU", texto, fimDeResposta: false }, agora).estado;
  if (resposta.responder) novo = transicionar(novo, { tipo: "AGENTE_FALOU", texto: resposta.texto }, agora).estado;
  await ctx.repositorio.salvarEstado(id, novo);
  console.warn("[agente] rota_perguntar", { sessao_id: id, fase, responder: resposta.responder });

  return json({ responder: resposta.responder, texto: resposta.texto, requisito: resposta.requisito, concluiu: resposta.concluiu });
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
      const eventos: EventoSessao[] = [{ tipo: "CANDIDATO_DESENHOU" }];
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
