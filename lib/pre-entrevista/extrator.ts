/**
 * Extrator (GLM): lê a conversa de pré-entrevista e devolve um patch com o que
 * a recrutadora disse ou aceitou. O patch é validado campo a campo e aplicado
 * ao rascunho. O código, não o modelo, garante as invariantes (pesos, foco dos
 * critérios, unicidade de ids).
 */
import { z } from "zod";
import { Criterion, FocusArea, InterviewMode } from "@/lib/contracts";
import { CATALOGO, criteriosIniciais, type CriterioModelo } from "./catalogo";
import { chat, extrairJson, type Alvo, type Mensagem } from "./llm";
import { alinharPesos, Rascunho, type Turno } from "./rascunho";

const TEMPERATURA = 0.2;
const MAX_TOKENS_EXTRATOR = 12000;

/**
 * Alvos do extrator, em ordem: Featherless (principal) e, se configurado, OpenRouter (plano B).
 * O GLM vai com o raciocínio desligado: sem isso uma chamada levava ~170 s.
 */
export function alvosDoExtrator(): Alvo[] {
  const alvos: Alvo[] = [
    {
      provedor: "featherless",
      model: process.env.EXTRACTOR_MODEL || "zai-org/GLM-5.2",
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
    },
  ];
  const fallback = process.env.EXTRACTOR_FALLBACK_MODEL;
  if (fallback) alvos.push({ provedor: "openrouter", model: fallback });
  return alvos;
}

const ConfirmadoParcial = Rascunho.shape.confirmado.partial();
const Foco = Rascunho.shape.focus.element;
const Senioridade = Rascunho.shape.seniority;

/** Campos que o modelo pode devolver. Todos opcionais; o que não vier fica como está. */
interface Patch {
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
   - Se ela pediu algo que o catálogo não cobre, adicione um critério novo com id em snake_case.
   - Se ela tirou uma área do foco, remova os critérios dessa área.
   - Critério do catálogo sobre o qual ela não falou fica como está.
   - weight é maior que 0; use valores maiores para o que ela disse que pesa mais (base 1).
   - focus de cada critério deve ser uma das áreas do foco.
5. focus: lista de { area, weight } com as áreas de foco. Os pesos devem somar 1 (aproxime; o código renormaliza).
6. recruiterNotes: texto curto com tom da entrevista, política de dicas, contexto do time e eliminatórios.
   Devolva o texto COMPLETO, acumulando o que já está em recruiterNotes com o que ela acrescentou.
7. confirmado: marque true só para mode, seniority ou focus que ela confirmou ou corrigiu explicitamente nesta conversa.
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

function avisar(msg: string): void {
  console.warn(`[extrator] ${msg}`);
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Valida um campo. Se for inválido, descarta com aviso e segue. */
function campo<T>(nome: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown): T | undefined {
  if (valor === undefined || valor === null) return undefined;
  const r = schema.safeParse(valor);
  if (r.success) return r.data;
  avisar(`campo "${nome}" descartado: ${r.error.issues[0]?.message ?? "inválido"}`);
  return undefined;
}

/** Valida uma lista item a item: itens inválidos saem, os válidos ficam. */
function lista<T>(nome: string, item: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown): T[] | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (!Array.isArray(valor)) {
    avisar(`campo "${nome}" não é uma lista; descartado`);
    return undefined;
  }
  const itens: T[] = [];
  valor.forEach((bruto, i) => {
    const r = item.safeParse(bruto);
    if (r.success) itens.push(r.data);
    else avisar(`${nome}[${i}] descartado: ${r.error.issues[0]?.message ?? "inválido"}`);
  });
  return itens;
}

function lerPatch(bruto: unknown): Patch {
  if (!ehObjeto(bruto)) {
    avisar("resposta não é um objeto JSON; nada aplicado");
    return {};
  }
  return {
    mode: campo("mode", InterviewMode, bruto.mode),
    seniority: campo("seniority", Senioridade, bruto.seniority),
    focus: lista("focus", Foco, bruto.focus),
    confirmado: campo("confirmado", ConfirmadoParcial, bruto.confirmado),
    criteria: lista("criteria", Criterion, bruto.criteria),
    durationMin: campo("durationMin", z.number().int().positive(), bruto.durationMin),
    recruiterNotes: campo("recruiterNotes", z.string(), bruto.recruiterNotes),
    problemId: campo("problemId", z.string().min(1), bruto.problemId),
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
function ajustarCriterios(criterios: Criterion[], areas: Set<FocusArea>, mode: InterviewMode): CriterioModelo[] {
  const porId = new Map<string, Criterion>();
  for (const c of criterios) {
    if (!areas.has(c.focus)) {
      avisar(`critério "${c.id}" descartado: foco "${c.focus}" fora das áreas de foco`);
      continue;
    }
    if (porId.has(c.id)) avisar(`id de critério repetido "${c.id}"; mantido o último`);
    porId.set(c.id, c);
  }
  if (porId.size === 0) {
    avisar("nenhum critério válido; voltando aos critérios do catálogo");
    return criteriosIniciais(mode, [...areas]);
  }
  return [...porId.values()];
}

/** Aplica o patch ao rascunho. Não muta o rascunho original. */
export function aplicarPatch(r: Rascunho, p: Patch): Rascunho {
  const modeMudou = p.mode !== undefined && p.mode !== r.mode;
  const mode = p.mode ?? r.mode;

  let focus = r.focus;
  if (p.focus !== undefined) {
    const novo = normalizarFoco(p.focus);
    if (novo.length > 0) focus = novo;
    else avisar("focus vazio; mantido o anterior");
  }
  const areas = new Set(focus.map((f) => f.area));

  // Critérios: a lista do patch é a final. Se o modo mudou sem lista nova, parte do catálogo do novo modo.
  const base = p.criteria ?? (modeMudou ? criteriosIniciais(mode, [...areas]) : r.criteria);

  return {
    ...r,
    mode,
    seniority: p.seniority ?? r.seniority,
    focus,
    criteria: alinharPesos(ajustarCriterios(base, areas, mode), focus),
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

export async function extrair(
  r: Rascunho,
  transcricao: Turno[],
): Promise<{ rascunho: Rascunho; ms: number; provedor: string; model: string }> {
  // A vaga fica de fora: o extrator só registra o que foi dito na conversa.
  const mensagens: Mensagem[] = montarMensagens(r, transcricao);

  // Modelo às vezes erra o JSON (aspas não escapadas nos textos). Pede a correção uma vez.
  let ms = 0;
  let provedor = "";
  let modelo = "";
  for (let tentativa = 1; ; tentativa++) {
    const resposta = await chat({
      alvos: alvosDoExtrator(),
      messages: mensagens,
      temperature: TEMPERATURA,
      // Raciocínio consome tokens e segundos antes do JSON. Com ele desligado a chamada cai para poucos segundos.
      maxTokens: MAX_TOKENS_EXTRATOR,
    });
    ms += resposta.ms;
    if (resposta.provedor !== "featherless") avisar(`respondeu ${resposta.provedor}/${resposta.model}`);
    provedor = resposta.provedor;
    modelo = resposta.model;
    try {
      const patch = lerPatch(extrairJson(resposta.content));
      return { rascunho: aplicarPatch(r, patch), ms, provedor, model: modelo };
    } catch (err) {
      if (tentativa >= 2) throw err;
      const motivo = err instanceof Error ? err.message : String(err);
      avisar(`JSON inválido na tentativa ${tentativa}; pedindo correção (${motivo.slice(0, 120)})`);
      mensagens.push(
        { role: "assistant", content: resposta.content },
        {
          role: "user",
          content:
            `Seu JSON não é válido (${motivo.slice(0, 200)}). Devolva o JSON completo de novo, corrigido. ` +
            "Não use aspas duplas dentro dos textos e não quebre linhas dentro das strings.",
        },
      );
    }
  }
}
