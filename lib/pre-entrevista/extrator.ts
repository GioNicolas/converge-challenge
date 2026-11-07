/**
 * Extrator (GLM): lê a conversa de pré-entrevista e devolve um patch com o que
 * a recrutadora disse ou aceitou. O patch é validado campo a campo e aplicado
 * ao rascunho. O código, não o modelo, garante as invariantes (pesos, foco dos
 * critérios, unicidade de ids).
 *
 * Além do rascunho, devolve tudo o que foi preciso para reproduzir a rodada:
 * as mensagens enviadas, as respostas cruas, o patch lido e os avisos de validação.
 */
import { z } from "zod";
import { Criterion, FocusArea, InterviewMode } from "@/lib/contracts";
import { CATALOGO, criteriosIniciais, type CriterioModelo } from "./catalogo";
import { chat, ErroChat, extrairJson, type Alvo, type Mensagem, type Tentativa } from "./llm";
import { alinharPesos, Rascunho, type Turno } from "./rascunho";

const TEMPERATURA = 0.2;
const MAX_TOKENS_EXTRATOR = 12000;

/**
 * Alvos do extrator, em ordem: Featherless (principal) e, se configurado, OpenRouter (plano B).
 * O GLM vai com o raciocínio desligado: sem isso uma chamada levava ~170 s.
 * Se o Featherless passar de 15 s, a chamada cai para a OpenRouter.
 */
export function alvosDoExtrator(): Alvo[] {
  const alvos: Alvo[] = [
    {
      provedor: "featherless",
      model: process.env.EXTRACTOR_MODEL || "zai-org/GLM-5.2",
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      timeoutMs: 15000,
    },
  ];
  const fallback = process.env.EXTRACTOR_FALLBACK_MODEL || "google/gemini-2.5-flash-lite";
  alvos.push({ provedor: "openrouter", model: fallback });
  // Terceiro alvo: outro modelo na Featherless, com mais tempo, para quando o GLM e a OpenRouter falham.
  alvos.push({ provedor: "featherless", model: "google/gemma-4-26B-A4B-it", timeoutMs: 20000 });
  return alvos;
}

const ConfirmadoParcial = Rascunho.shape.confirmado.partial();
const Foco = Rascunho.shape.focus.element;
const Senioridade = Rascunho.shape.seniority;

/** Campos que o modelo pode devolver. Todos opcionais; o que não vier fica como está. */
export interface Patch {
  mode?: InterviewMode;
  seniority?: z.infer<typeof Senioridade>;
  focus?: Array<z.infer<typeof Foco>>;
  confirmado?: z.infer<typeof ConfirmadoParcial>;
  criteria?: Criterion[];
  durationMin?: number;
  recruiterNotes?: string;
  problemId?: string;
}

const PROMPT_SISTEMA = `Você extrai, de uma conversa de pré-entrevista, a configuração de uma entrevista técnica.
A recrutadora conversa com um assistente de voz para descrever a vaga e o que quer avaliar.
Sua tarefa: ler a conversa e devolver SOMENTE um JSON com as mudanças em relação ao rascunho atual.

Regras:
1. Registre só o que a recrutadora disse ou aceitou. Nunca invente preferências.
   Se ela não falou de um campo, não o inclua no JSON.
2. Falas do assistente não são preferências. Só valem como aceite quando a recrutadora concordou
   ou corrigiu explicitamente ("pode ser", "isso mesmo", "na verdade são 60 minutos").
3. Se ela mudou de ideia no meio da conversa, vale a última posição dela.
4. criteria: devolva a lista COMPLETA e final de critérios, não só os que mudaram.
   - Parta dos critérios do catálogo que forem enviados e personalize a description com o que ela disse.
   - description sempre em comportamento observável, no formato "Bom: ... Ruim: ...", com 1 a 3 frases curtas em português.
     Evite termos vagos como "boa comunicação" ou "bom conhecimento"; diga o que se vê na entrevista.
   - Se ela descreveu só o lado bom (ou só o ruim), deduza o outro lado como o oposto razoável. Escreva sempre os dois lados.
   - Se ela pediu algo que o catálogo não cobre, adicione um critério novo com id em snake_case.
   - Se ela tirou uma área do foco, remova os critérios dessa área.
   - Critério do catálogo sobre o qual ela não falou fica como está.
   - weight é maior que 0; use valores maiores para o que ela disse que pesa mais (base 1).
   - focus de cada critério deve ser uma das áreas do foco.
5. focus: lista de { area, weight } com as áreas de foco. Os pesos devem somar 1 (aproxime; o código renormaliza).
   - Se ela disse para tirar uma área, remova-a do foco.
   - Se ela disse que uma área pesa menos, pode diminuir ou não importa muito, mantenha a área com cerca da metade do peso anterior.
   - Área nova que ela pediu entra no foco, com pelo menos um critério personalizado com o que ela disse.
6. recruiterNotes: texto curto em frases curtas. NÃO repita o que já tem campo próprio (modo, senioridade, foco,
   duração, critérios). Guarde só tom, política de dicas, contexto do time/empresa e eliminatórios.
   Devolva o texto COMPLETO, acumulando o que já está em recruiterNotes com o que ela acrescentou.
7. confirmado: marque true só para mode, seniority ou focus que ela confirmou ou corrigiu explicitamente nesta conversa.
   Um "sim" a uma proposta que cobre formato, senioridade e foco de uma vez conta para os três.
8. durationMin: inteiro, em minutos, só se ela disse.
9. problemId: só se ela pediu um problema específico. Caso contrário, não envie.

Áreas válidas: tecnico, pressao, escala_produto, uso_ia.
Modos válidos: live_coding, system_design.
Senioridades válidas: junior, pleno, senior.

Dentro dos textos (description, recruiterNotes), não use aspas duplas: se precisar citar, use aspas simples.
Use o JSON válido: strings em uma linha só, sem vírgula sobrando.

Formato de saída (apenas o JSON, sem texto antes ou depois, sem cercas de código):
{
  "mode": "...", "seniority": "...",
  "focus": [{"area": "...", "weight": 0.5}],
  "confirmado": {"mode": true, "seniority": true, "focus": true},
  "criteria": [{"id": "...", "name": "...", "focus": "...", "weight": 1, "description": "Bom: ... Ruim: ..."}],
  "durationMin": 40, "recruiterNotes": "...", "problemId": "..."
}
Inclua apenas as chaves que mudaram.`;

/** Acumula avisos de validação: vão para o console e para o retorno de `extrair` (e de lá para o log). */
type Avisos = string[];

/** Número ou tempo que a recrutadora pode ter dito: dígitos, dez a noventa, cem, "uma hora", "meia hora". */
const TEMPO_NA_FALA =
  /\d|\b(dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)\b|\b(uma|duas|meia)\s+hora/i;

/**
 * Só aceita `durationMin` se alguma fala da recrutadora tem número ou tempo. Sem isso, a duração veio da
 * Totti ou foi inventada pelo modelo, e descarta com aviso. Função pura quanto ao patch (devolve outro objeto).
 */
export function checarDuracao(patch: Patch, transcricao: Turno[], avisos: Avisos): Patch {
  if (patch.durationMin === undefined) return patch;
  if (transcricao.some((t) => t.role === "recrutadora" && TEMPO_NA_FALA.test(t.text))) return patch;
  avisar(avisos, `durationMin=${patch.durationMin} descartado: a recrutadora não falou de número ou tempo`);
  return { ...patch, durationMin: undefined };
}

function avisar(avisos: Avisos, msg: string): void {
  avisos.push(msg);
  console.warn(`[extrator] ${msg}`);
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Valida um campo. Se for inválido, descarta com aviso e segue. */
function campo<T>(nome: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown, avisos: Avisos): T | undefined {
  if (valor === undefined || valor === null) return undefined;
  const r = schema.safeParse(valor);
  if (r.success) return r.data;
  avisar(avisos, `campo "${nome}" descartado: ${r.error.issues[0]?.message ?? "inválido"}`);
  return undefined;
}

/** Valida uma lista item a item: itens inválidos saem, os válidos ficam. */
function lista<T>(nome: string, item: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown, avisos: Avisos): T[] | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (!Array.isArray(valor)) {
    avisar(avisos, `campo "${nome}" não é uma lista; descartado`);
    return undefined;
  }
  const itens: T[] = [];
  valor.forEach((bruto, i) => {
    const r = item.safeParse(bruto);
    if (r.success) itens.push(r.data);
    else avisar(avisos, `${nome}[${i}] descartado: ${r.error.issues[0]?.message ?? "inválido"}`);
  });
  return itens;
}

function lerPatch(bruto: unknown, avisos: Avisos): Patch {
  if (!ehObjeto(bruto)) {
    avisar(avisos, "resposta não é um objeto JSON; nada aplicado");
    return {};
  }
  return {
    mode: campo("mode", InterviewMode, bruto.mode, avisos),
    seniority: campo("seniority", Senioridade, bruto.seniority, avisos),
    focus: lista("focus", Foco, bruto.focus, avisos),
    confirmado: campo("confirmado", ConfirmadoParcial, bruto.confirmado, avisos),
    criteria: lista("criteria", Criterion, bruto.criteria, avisos),
    durationMin: campo("durationMin", z.number().int().positive(), bruto.durationMin, avisos),
    recruiterNotes: campo("recruiterNotes", z.string(), bruto.recruiterNotes, avisos),
    problemId: campo("problemId", z.string().min(1), bruto.problemId, avisos),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Remove áreas repetidas, descarta peso zero (quando há outras áreas) e renormaliza
 * para somar 1. O arredondamento vai na primeira área.
 */
function normalizarFoco(itens: Array<z.infer<typeof Foco>>): Array<z.infer<typeof Foco>> {
  const unicos = [...new Map(itens.map((i) => [i.area, i])).values()];
  const positivos = unicos.filter((i) => i.weight > 0);
  const base = positivos.length > 0 ? positivos : unicos;
  const soma = base.reduce((acc, i) => acc + i.weight, 0);
  const pesos = base.map((i) => ({
    area: i.area,
    weight: soma > 0 ? round2(i.weight / soma) : round2(1 / base.length),
  }));
  const diff = round2(1 - pesos.reduce((acc, p) => acc + p.weight, 0));
  pesos[0].weight = round2(pesos[0].weight + diff);
  return pesos;
}

/** Garante ids únicos e focus dentro das áreas. Se nada sobrar, volta ao catálogo. */
function ajustarCriterios(criterios: Criterion[], areas: Set<FocusArea>, mode: InterviewMode, avisos: Avisos): CriterioModelo[] {
  const porId = new Map<string, Criterion>();
  for (const c of criterios) {
    if (!areas.has(c.focus)) {
      avisar(avisos, `critério "${c.id}" descartado: foco "${c.focus}" fora das áreas de foco`);
      continue;
    }
    if (porId.has(c.id)) avisar(avisos, `id de critério repetido "${c.id}"; mantido o último`);
    porId.set(c.id, c);
  }
  if (porId.size === 0) {
    avisar(avisos, "nenhum critério válido; voltando aos critérios do catálogo");
    return criteriosIniciais(mode, [...areas]);
  }
  return [...porId.values()];
}

/** Aplica o patch ao rascunho. Não muta o rascunho original. Os avisos, se houver lista, são acumulados nela. */
export function aplicarPatch(r: Rascunho, p: Patch, avisos: Avisos = []): Rascunho {
  const modeMudou = p.mode !== undefined && p.mode !== r.mode;
  const mode = p.mode ?? r.mode;

  let focus = r.focus;
  if (p.focus !== undefined) {
    const novo = normalizarFoco(p.focus);
    if (novo.length > 0) focus = novo;
    else avisar(avisos, "focus vazio; mantido o anterior");
  }
  const areas = new Set(focus.map((f) => f.area));

  // Critérios: a lista do patch é a final. Se o modo mudou sem lista nova, parte do catálogo do novo modo.
  const base = p.criteria ?? (modeMudou ? criteriosIniciais(mode, [...areas]) : r.criteria);

  return {
    ...r,
    mode,
    seniority: p.seniority ?? r.seniority,
    focus,
    criteria: alinharPesos(ajustarCriterios(base, areas, mode, avisos), focus),
    recruiterNotes: p.recruiterNotes ?? r.recruiterNotes,
    durationMin: p.durationMin ?? r.durationMin,
    // Problema escolhido para o modo antigo não serve para o novo; volta ao padrão do modo.
    problemId: p.problemId ?? (modeMudou ? undefined : r.problemId),
    // Confirmação é irreversível: uma vez que ela confirmou, não volta para falso.
    confirmado: {
      mode: r.confirmado.mode || p.confirmado?.mode === true,
      seniority: r.confirmado.seniority || p.confirmado?.seniority === true,
      focus: r.confirmado.focus || p.confirmado?.focus === true,
    },
  };
}

function formatarTranscricao(turnos: Turno[]): string {
  return turnos.map((t, i) => `${i + 1}. ${t.role}: ${t.text}`).join("\n");
}

/** Mensagens enviadas ao modelo: prompt de sistema + rascunho, catálogo do modo e transcrição. */
export function montarMensagens(r: Rascunho, transcricao: Turno[]): Mensagem[] {
  // A vaga fica de fora: o extrator só registra o que foi dito na conversa.
  const semVaga = { ...r, jobDescription: undefined };
  const entrada = [
    `RASCUNHO ATUAL:\n${JSON.stringify(semVaga, null, 2)}`,
    `CRITÉRIOS DO CATÁLOGO PARA O MODO ATUAL (${r.mode}):\n${JSON.stringify(CATALOGO[r.mode], null, 2)}`,
    `TRANSCRIÇÃO:\n${formatarTranscricao(transcricao)}`,
  ].join("\n\n");
  return [
    { role: "system", content: PROMPT_SISTEMA },
    { role: "user", content: entrada },
  ];
}

/** Uma resposta do modelo que não virou patch válido (JSON quebrado), para o log. */
export interface TentativaJson {
  resposta: string;
  erro?: string;
}

/** Falha da extração depois de esgotar as tentativas de JSON. Carrega o que foi enviado e recebido. */
export class ErroExtracao extends Error {
  constructor(
    mensagem: string,
    readonly detalhes: { mensagens: Mensagem[]; tentativasJson: TentativaJson[]; tentativas: Tentativa[]; avisos: Avisos },
  ) {
    super(mensagem);
    this.name = "ErroExtracao";
  }
}

export interface ResultadoExtracao {
  rascunho: Rascunho;
  /** Tempo somado de todas as chamadas ao modelo. */
  ms: number;
  provedor: string;
  model: string;
  /** Mensagens da última chamada enviada ao modelo (prompt completo, incluindo correção de JSON se houve). */
  mensagens: Mensagem[];
  /** Resposta crua da última chamada, a que originou o patch. */
  respostaCrua: string;
  /** Cada resposta lida ao tentar extrair o JSON, com o erro de parse quando houve. */
  tentativasJson: TentativaJson[];
  /** Patch já validado, como foi aplicado (só as chaves que vieram e passaram na validação). */
  patch: Patch;
  /** Avisos de validação (campos descartados, critérios ajustados). Os mesmos que foram ao console. */
  avisos: Avisos;
  /** Tentativas HTTP de todas as chamadas, na ordem. Mostra quando houve fallback de provedor. */
  tentativas: Tentativa[];
}

export async function extrair(r: Rascunho, transcricao: Turno[]): Promise<ResultadoExtracao> {
  const avisos: Avisos = [];
  const tentativas: Tentativa[] = [];
  const tentativasJson: TentativaJson[] = [];
  const mensagens: Mensagem[] = montarMensagens(r, transcricao);

  // Modelo às vezes erra o JSON (aspas não escapadas nos textos). Pede a correção uma vez.
  let ms = 0;
  let provedor = "";
  let modelo = "";
  for (let rodada = 1; ; rodada++) {
    const enviadas = mensagens.map((m) => ({ ...m }));
    let resposta: Awaited<ReturnType<typeof chat>>;
    try {
      resposta = await chat({
        alvos: alvosDoExtrator(),
        messages: enviadas,
        temperature: TEMPERATURA,
        // Raciocínio consome tokens e segundos antes do JSON. Com ele desligado a chamada cai para poucos segundos.
        maxTokens: MAX_TOKENS_EXTRATOR,
      });
    } catch (err) {
      if (err instanceof ErroChat) tentativas.push(...err.tentativas);
      throw err;
    }
    tentativas.push(...resposta.tentativas);
    ms += resposta.ms;
    if (resposta.provedor !== "featherless") avisar(avisos, `respondeu ${resposta.provedor}/${resposta.model}`);
    provedor = resposta.provedor;
    modelo = resposta.model;

    let patch: Patch;
    try {
      patch = lerPatch(extrairJson(resposta.content), avisos);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      tentativasJson.push({ resposta: resposta.content, erro: motivo });
      if (rodada >= 2) {
        throw new ErroExtracao(motivo, { mensagens: enviadas, tentativasJson, tentativas, avisos });
      }
      avisar(avisos, `JSON inválido na tentativa ${rodada}; pedindo correção (${motivo.slice(0, 120)})`);
      mensagens.push(
        { role: "assistant", content: resposta.content },
        {
          role: "user",
          content:
            `Seu JSON não é válido (${motivo.slice(0, 200)}). Devolva o JSON completo de novo, corrigido. ` +
            "Não use aspas duplas dentro dos textos e não quebre linhas dentro das strings.",
        },
      );
      continue;
    }

    tentativasJson.push({ resposta: resposta.content });
    const aceito = checarDuracao(patch, transcricao, avisos);
    return {
      rascunho: aplicarPatch(r, aceito, avisos),
      ms,
      provedor,
      model: modelo,
      mensagens: enviadas,
      respostaCrua: resposta.content,
      tentativasJson,
      patch: aceito,
      avisos,
      tentativas,
    };
  }
}
