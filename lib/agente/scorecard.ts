// Scorecard final (seção 8 do planejamento): UMA chamada estruturada ao modelo final + guardas
// DETERMINÍSTICAS depois. O modelo propõe; o servidor garante: todo critério da rubrica aparece uma
// vez, nota sem prova vira null, citação de fala tem que existir de verdade, desenho tem que
// referenciar ids/horários reais, a nota geral é recalculada e a recomendação perde força quando
// faltam provas. A recomendação é só sugestão: quem decide é o humano.
import { z } from "zod";
import type { EventoArmazenado } from "./armazenamento/repositorio";
import type { LlmCliente } from "./llm/cliente";
import type { Criterio, Kit, Problema } from "./kits/tipos";
import {
  montarSistemaDinamicoScorecard,
  montarSistemaEstaticoScorecard,
  NOME_SCHEMA_SCORECARD,
} from "./prompts/scorecard";
import type { EstadoSessao } from "./sessao/estado";
import { extrairIdsDoGrafo } from "./sessao/politica";

export const MODELO_FINAL_PADRAO = "anthropic/claude-opus-5.5";
export const TIMEOUT_SCORECARD_MS = 120_000;
export const MAX_TOKENS_SCORECARD = 6000;
export const SEM_EVIDENCIA = "Sem evidência suficiente para atribuir nota a este critério.";

// ---------------------------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------------------------

/** Saída pedida ao modelo (modo estrito: tudo obrigatório, ausente = null/[]). */
export const EsquemaSaidaScorecardLlm = z.object({
  nota_geral: z.number().nullable(),
  recomendacao: z.enum(["avancar", "avancar_com_ressalvas", "nao_avancar"]),
  criterios: z.array(
    z.object({
      criterio: z.string(),
      nota: z.number().nullable(),
      justificativa: z.string(),
      evidencias: z.array(
        z.object({
          tipo: z.enum(["fala", "desenho"]),
          horario: z.string(),
          texto: z.string().nullable(),
          elementos: z.array(z.string()),
          imagem: z.string().nullable(),
        }),
      ),
    }),
  ),
  pontos_fortes: z.array(z.string()),
  pontos_a_aprofundar: z.array(z.string()),
  briefing_para_proxima_etapa: z.string(),
});
export type SaidaScorecardLlm = z.infer<typeof EsquemaSaidaScorecardLlm>;

export type Evidencia = {
  tipo: "fala" | "desenho";
  horario: string;
  texto?: string;
  elementos?: string[];
  imagem?: string;
};

export type CriterioAvaliado = {
  criterio: string;
  nota: number | null;
  justificativa: string;
  evidencias: Evidencia[];
};

export type Recomendacao = "avancar" | "avancar_com_ressalvas" | "nao_avancar" | "evidencia_insuficiente";

export type Scorecard = {
  candidato_id: string;
  problema_id: string;
  nota_geral: number | null;
  recomendacao: Recomendacao;
  criterios: CriterioAvaliado[];
  pontos_fortes: string[];
  pontos_a_aprofundar: string[];
  briefing_para_proxima_etapa: string;
  gerado_em: string;
  origem: "llm" | "fake";
  /** O que as guardas corrigiram (para o recrutador/dev; vazio = nada). */
  ajustes: string[];
};

// ---------------------------------------------------------------------------------------------
// Fontes de prova (extraídas da sessão)
// ---------------------------------------------------------------------------------------------

export type ImagemRef = { numero: number; horario: string };

export type FontesDeProva = {
  falas: { horario: string; texto: string }[];
  /** id do elemento -> horário do primeiro desenho em que apareceu. */
  idsDeDesenho: Map<string, string>;
  /** horários (ms) de eventos de desenho. */
  horariosDeDesenho: Set<number>;
  imagens: ImagemRef[];
  grafoFinal: string;
};

const dadosComo = (d: unknown): Record<string, unknown> =>
  d && typeof d === "object" ? (d as Record<string, unknown>) : {};

export function extrairFontes(estado: EstadoSessao, eventos: EventoArmazenado[], imagens: ImagemRef[]): FontesDeProva {
  const falas: FontesDeProva["falas"] = [];
  const idsDeDesenho = new Map<string, string>();
  const horariosDeDesenho = new Set<number>();
  let grafoFinal = "";
  for (const e of eventos) {
    const d = dadosComo(e.dados);
    if (e.tipo === "desenho" && typeof d.grafo === "string") {
      grafoFinal = d.grafo;
      horariosDeDesenho.add(Date.parse(e.horario));
      for (const id of extrairIdsDoGrafo(d.grafo)) if (!idsDeDesenho.has(id)) idsDeDesenho.set(id, e.horario);
    } else if ((e.tipo === "fala" || e.tipo === "resposta") && typeof d.texto === "string" && d.texto) {
      falas.push({ horario: e.horario, texto: d.texto });
    }
  }
  for (const f of estado.conversa) falas.push({ horario: new Date(f.em).toISOString(), texto: f.texto });
  return { falas, idsDeDesenho, horariosDeDesenho, imagens, grafoFinal };
}

// ---------------------------------------------------------------------------------------------
// Guardas determinísticas
// ---------------------------------------------------------------------------------------------

/** Minúsculas, sem acento, só letras/números separados por um espaço. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A citação existe numa fala? "..." separa trechos; cada trecho (>= 4 caracteres) precisa existir. */
export function citacaoExiste(citacao: string, falas: { texto: string }[]): { horario?: number; ok: boolean; indice: number } {
  const trechos = citacao
    .split(/\.{3}|…/)
    .map(normalizar)
    .filter((t) => t.length >= 4);
  if (trechos.length === 0) return { ok: false, indice: -1 };
  const normalizadas = falas.map((f) => normalizar(f.texto));
  const indice = normalizadas.findIndex((n) => trechos.every((t) => n.includes(t)));
  if (indice >= 0) return { ok: true, indice };
  // Trechos podem estar em falas diferentes do mesmo texto corrido.
  const tudo = normalizadas.join(" ");
  return trechos.every((t) => tudo.includes(t)) ? { ok: true, indice: 0 } : { ok: false, indice: -1 };
}

function imagemValida(valor: string | null | undefined, imagens: ImagemRef[], sessaoId: string): string | null {
  if (!valor) return null;
  const m = valor.match(/(\d+)(?!.*\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return imagens.some((i) => i.numero === n) ? `/api/sessoes/${encodeURIComponent(sessaoId)}/imagens/${n}` : null;
}

export type ParametrosGuardas = {
  sessaoId: string;
  candidatoId: string;
  problemaId: string;
  rubrica: Pick<Criterio, "id">[];
  fontes: FontesDeProva;
  origem: "llm" | "fake";
  agora?: () => Date;
};

const arred1 = (n: number) => Math.round(n * 10) / 10;

export function aplicarGuardas(saida: SaidaScorecardLlm, p: ParametrosGuardas): Scorecard {
  const ajustes: string[] = [];
  const { fontes } = p;
  const vistos = new Set<string>();

  const criterios: CriterioAvaliado[] = p.rubrica.map(({ id }) => {
    const candidatos = saida.criterios.filter((c) => c.criterio === id);
    if (candidatos.length > 1) ajustes.push(`critério ${id} repetido: usei o primeiro`);
    const c = candidatos[0];
    vistos.add(id);
    if (!c) {
      ajustes.push(`critério ${id} ausente na saída do modelo`);
      return { criterio: id, nota: null, justificativa: SEM_EVIDENCIA, evidencias: [] };
    }

    const evidencias: Evidencia[] = [];
    for (const e of c.evidencias) {
      if (e.tipo === "fala") {
        const r = e.texto ? citacaoExiste(e.texto, fontes.falas) : { ok: false, indice: -1 };
        if (!r.ok || !e.texto) {
          ajustes.push(`evidência de fala descartada em ${id}: citação não encontrada`);
          continue;
        }
        const origem = fontes.falas[r.indice];
        evidencias.push({ tipo: "fala", horario: origem?.horario ?? e.horario, texto: e.texto });
      } else {
        const elementos = [...new Set(e.elementos)].filter((x) => fontes.idsDeDesenho.has(x));
        const horarioOk = fontes.horariosDeDesenho.has(Date.parse(e.horario));
        const imagem = imagemValida(e.imagem, fontes.imagens, p.sessaoId);
        if (e.elementos.length !== elementos.length) ajustes.push(`ids inexistentes removidos em ${id}`);
        if (elementos.length === 0 && !horarioOk && !imagem) {
          ajustes.push(`evidência de desenho descartada em ${id}: sem id nem horário válido`);
          continue;
        }
        const horario = horarioOk ? e.horario : (fontes.idsDeDesenho.get(elementos[0] ?? "") ?? e.horario);
        evidencias.push({
          tipo: "desenho",
          horario,
          ...(elementos.length ? { elementos } : {}),
          ...(imagem ? { imagem } : {}),
        });
      }
    }

    let nota: number | null = c.nota === null || !Number.isFinite(c.nota) ? null : Math.min(4, Math.max(1, Math.round(c.nota)));
    let justificativa = c.justificativa.trim();
    if (nota !== null && evidencias.length === 0) {
      ajustes.push(`nota de ${id} removida: sem evidência`);
      nota = null;
    }
    if (nota === null) justificativa = SEM_EVIDENCIA;
    return { criterio: id, nota, justificativa, evidencias };
  });

  for (const c of saida.criterios) {
    if (!vistos.has(c.criterio)) ajustes.push(`critério desconhecido ignorado: ${c.criterio}`);
  }

  const notas = criterios.map((c) => c.nota).filter((n): n is number => n !== null);
  const notaGeral = notas.length ? arred1(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
  const insuficiente = notas.length * 2 < criterios.length;
  if (insuficiente) ajustes.push("menos da metade dos critérios com evidência: recomendação neutra");

  return {
    candidato_id: p.candidatoId,
    problema_id: p.problemaId,
    nota_geral: notaGeral,
    recomendacao: insuficiente ? "evidencia_insuficiente" : saida.recomendacao,
    criterios,
    pontos_fortes: saida.pontos_fortes,
    pontos_a_aprofundar: saida.pontos_a_aprofundar,
    briefing_para_proxima_etapa: saida.briefing_para_proxima_etapa,
    gerado_em: (p.agora?.() ?? new Date()).toISOString(),
    origem: p.origem,
    ajustes,
  };
}

// ---------------------------------------------------------------------------------------------
// Entrada, prompt e geração
// ---------------------------------------------------------------------------------------------

export type EntradaScorecard = {
  sessaoId: string;
  candidatoId: string;
  estado: EstadoSessao;
  eventos: EventoArmazenado[];
  imagens: ImagemRef[];
};

const cortar = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n) + "…");

function resumoDoEvento(e: EventoArmazenado): string {
  const d = dadosComo(e.dados);
  switch (e.tipo) {
    case "desenho":
      return `mudanças: ${cortar(String(d.mudancas ?? ""), 600).replace(/\n/g, " ; ")}`;
    case "fala":
    case "resposta":
      return `${d.quem ? String(d.quem) + ": " : ""}${cortar(String(d.texto ?? ""), 600)}`;
    case "analise":
      return `status=${String(d.status ?? "")}${d.pergunta ? ` pergunta="${cortar(String(d.pergunta), 300)}"` : ""}${
        Array.isArray(d.observacoes) ? ` observacoes=${JSON.stringify(d.observacoes).slice(0, 500)}` : ""
      }`;
    case "pergunta":
      return `candidato clicou no plin: ${cortar(String(d.pergunta ?? ""), 300)}`;
    case "fase":
      return `fase=${String(d.fase ?? "")}`;
    default:
      return "";
  }
}

export function montarEntradaDoPrompt(entrada: EntradaScorecard, fontes: FontesDeProva) {
  const eventos = [...entrada.eventos].sort((a, b) => Date.parse(a.horario) - Date.parse(b.horario));
  const linhaDoTempo = cortar(
    eventos.map((e) => `${e.horario} | ${e.tipo} | ${resumoDoEvento(e)}`).join("\n"),
    40_000,
  );
  const conversa = entrada.estado.conversa
    .map((f) => `${new Date(f.em).toISOString()} ${f.quem === "agente" ? "Entrevistador" : "Candidato"}: ${f.texto}`)
    .join("\n");
  const observacoes = entrada.estado.observacoes
    .map((o) => `- ${o.criterio} ${o.sinal}${o.espontaneo ? " (espontâneo)" : ""} [${o.fase}]: ${o.evidencia}`)
    .join("\n");
  const imagens = entrada.imagens.map((i) => `- imagem ${i.numero} (${i.horario})`).join("\n");
  return { linhaDoTempo, conversa, observacoes, grafoFinal: cortar(fontes.grafoFinal, 20_000), imagens };
}

export type DepsScorecard = {
  llm: LlmCliente;
  kit: Kit;
  problema: Problema;
  modelo?: string;
  agora?: () => Date;
};

export async function gerarScorecard(deps: DepsScorecard, entrada: EntradaScorecard): Promise<Scorecard> {
  const fontes = extrairFontes(entrada.estado, entrada.eventos, entrada.imagens);
  const r = await deps.llm.completarJson({
    sistema: {
      estatico: montarSistemaEstaticoScorecard(deps.kit, deps.problema),
      dinamico: montarSistemaDinamicoScorecard(montarEntradaDoPrompt(entrada, fontes)),
    },
    mensagens: [{ role: "user", content: "Escreva o scorecard desta entrevista." }],
    schema: EsquemaSaidaScorecardLlm,
    nomeSchema: NOME_SCHEMA_SCORECARD,
    modelo: deps.modelo ?? (process.env.AGENTE_MODELO_FINAL || MODELO_FINAL_PADRAO),
    maxTokens: MAX_TOKENS_SCORECARD,
    raciocinio: true,
    timeoutMs: TIMEOUT_SCORECARD_MS,
  });
  return aplicarGuardas(r.dados, {
    sessaoId: entrada.sessaoId,
    candidatoId: entrada.candidatoId,
    problemaId: deps.problema.id,
    rubrica: deps.kit.criterios,
    fontes,
    origem: "llm",
    agora: deps.agora,
  });
}

/** Scorecard determinístico (AGENTE_FAKE=1): monta a saída a partir do livro de observações e passa pelas mesmas guardas. */
export function gerarScorecardFalso(deps: Omit<DepsScorecard, "llm">, entrada: EntradaScorecard): Scorecard {
  const fontes = extrairFontes(entrada.estado, entrada.eventos, entrada.imagens);
  const ultimaFala = [...entrada.estado.conversa].reverse().find((f) => f.quem === "candidato");
  const primeiroId = [...fontes.idsDeDesenho.keys()][0];
  const horarioDesenho = primeiroId ? fontes.idsDeDesenho.get(primeiroId) : undefined;

  const criterios = deps.kit.criterios.map((c) => {
    const obs = entrada.estado.observacoes.filter((o) => o.criterio === c.id);
    if (obs.length === 0) return { criterio: c.id, nota: null, justificativa: "Sem observações.", evidencias: [] };
    const saldo = obs.filter((o) => o.sinal === "positivo").length - obs.filter((o) => o.sinal === "negativo").length;
    const evidencias: SaidaScorecardLlm["criterios"][number]["evidencias"] = [];
    if (ultimaFala) {
      evidencias.push({ tipo: "fala", horario: new Date(ultimaFala.em).toISOString(), texto: ultimaFala.texto.slice(0, 80), elementos: [], imagem: null });
    }
    if (primeiroId && horarioDesenho) {
      evidencias.push({ tipo: "desenho", horario: horarioDesenho, texto: null, elementos: [primeiroId], imagem: null });
    }
    return {
      criterio: c.id,
      nota: Math.min(4, Math.max(1, 2 + saldo)),
      justificativa: `[fake] ${obs.map((o) => `${o.sinal}: ${o.evidencia}`).join("; ")}`,
      evidencias,
    };
  });
  const saida: SaidaScorecardLlm = {
    nota_geral: null,
    recomendacao: "avancar_com_ressalvas",
    criterios,
    pontos_fortes: entrada.estado.observacoes.filter((o) => o.sinal === "positivo").map((o) => o.evidencia).slice(0, 3),
    pontos_a_aprofundar: entrada.estado.observacoes.filter((o) => o.sinal === "negativo").map((o) => o.evidencia).slice(0, 3),
    briefing_para_proxima_etapa: "[fake] Scorecard determinístico construído do livro de observações.",
  };
  return aplicarGuardas(saida, {
    sessaoId: entrada.sessaoId,
    candidatoId: entrada.candidatoId,
    problemaId: deps.problema.id,
    rubrica: deps.kit.criterios,
    fontes,
    origem: "fake",
    agora: deps.agora,
  });
}
