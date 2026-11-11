// Scorecard final (seção 8 do planejamento): UMA chamada estruturada ao modelo final + guardas
// DETERMINÍSTICAS depois. O modelo propõe; o servidor garante: todo critério da rubrica aparece uma
// vez, nota sem prova vira null, citação de fala tem que existir de verdade, desenho tem que
// referenciar ids/horários reais, a nota geral é recalculada e a recomendação perde força quando
// faltam provas. A recomendação é só sugestão: quem decide é o humano.
import { neutralizar, tentativasEmTextos } from "../seguranca/injecao";
import { z } from "zod";
import type { EventoArmazenado } from "./armazenamento/repositorio";
import { ErroLlm, type LlmCliente } from "./llm/cliente";
import { criterioSoPorFala, type Criterio, type Kit, type Problema } from "./kits/tipos";
import { ehItemGenerico, ehPedidoDeRepeticao, falaDeProximaConversa, fatoDeCobertura, semTermosInternos, textoCulpaOCandidatoPorPedido } from "../totti/relatorio";
import {
  montarSistemaDinamicoScorecard,
  montarSistemaEstaticoScorecard,
  NIVEIS_ADAPTACAO,
  NOME_SCHEMA_SCORECARD,
} from "./prompts/scorecard";

export { NIVEIS_ADAPTACAO, ehItemGenerico };
import { tempoDaEntrevista, type EstadoSessao } from "./sessao/estado";
import { extrairIdsDoGrafo } from "./sessao/politica";
import type { SquadRule } from "../contracts";
import { blocoDasRegras, regrasDoCriterio } from "../squad-memory/prompt";

export const MODELO_FINAL_PADRAO = "anthropic/claude-opus-5.5";
// Medido em produção (Vercel): o scorecard com raciocínio passou de 45 s e a geração estourava sem salvar nada.
export const TIMEOUT_SCORECARD_MS = 290_000;
/** Teto configurável: cabe no maxDuration (300 s) da rota, com folga para salvar. */
export const TIMEOUT_SCORECARD_MAX_MS = 290_000;
export function timeoutScorecardMs(): number {
  const valor = Number(process.env.AGENTE_TIMEOUT_SCORECARD_MS);
  return Number.isInteger(valor) && valor > 0 && valor <= TIMEOUT_SCORECARD_MAX_MS ? valor : TIMEOUT_SCORECARD_MS;
}
/** O GLM-5.2 da Featherless usa 6–11,7 mil tokens com o raciocínio; com 6000 a resposta saía cortada (ver lib/llm, papel relatorio). */
export const MAX_TOKENS_SCORECARD = 12_000;
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
  /** O que o candidato propôs (componentes, fluxo de dados, escolhas principais). "" em scorecards antigos. */
  resumo_da_solucao: z.string().default(""),
  /** Como a entrevista foi: o que foi bem, o que faltou e a reação à mudança. "" em scorecards antigos. */
  resumo_da_entrevista: z.string().default(""),
  /** Como o candidato reagiu à mudança no problema. null quando não houve mudança. Fora da nota geral. */
  adaptacao: z.object({
    nota: z.number().nullable(),
    justificativa: z.string(),
    /** Só falas do candidato depois da mudança, copiadas literalmente. */
    evidencias: z.array(z.object({ horario: z.string(), texto: z.string() })),
  }).nullable().optional(),
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
  /** Regras da squad que afetam este critério: a tela marca "critério aprendido com o time". */
  regras_squad?: SquadRule[];
};

/** A mudança no problema e como o candidato se adaptou. Não entra na nota geral. */
export type AdaptacaoAvaliada = {
  /** O requisito novo, como foi escrito no quadro. */
  mudanca: string;
  anunciada_em: string;
  forcada: boolean;
  nota: number | null;
  justificativa: string;
  evidencias: Evidencia[];
  /** Fatos medidos pela linha do tempo, sem o modelo. */
  desenhos_depois: number;
  falas_depois: number;
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
  /** Ausentes em scorecards guardados antes deste campo: trate "" (ou ausente) como sem resumo. */
  resumo_da_solucao?: string;
  resumo_da_entrevista?: string;
  gerado_em: string;
  origem: "llm" | "fake";
  /** O que as guardas corrigiram (para o recrutador/dev; vazio = nada). */
  ajustes: string[];
  /** Presente quando o entrevistador trouxe a mudança no problema. */
  adaptacao?: AdaptacaoAvaliada;
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
  desenhos: { horario: string; ids: Set<string>; grafo: string }[];
  /** Cópia do livro; desenho.horario resolvido ao evento real ou desenho removido se não verificável. */
  observacoes: EstadoSessao["observacoes"];
};

const dadosComo = (d: unknown): Record<string, unknown> =>
  d && typeof d === "object" ? (d as Record<string, unknown>) : {};

export function extrairFontes(estado: EstadoSessao, eventos: EventoArmazenado[], imagens: ImagemRef[]): FontesDeProva {
  const falas: FontesDeProva["falas"] = [];
  const idsDeDesenho = new Map<string, string>();
  const horariosDeDesenho = new Set<number>();
  let grafoFinal = "";
  let horarioFinal = -Infinity;
  const desenhos: FontesDeProva["desenhos"] = [];
  const adicionarDesenho = (horario: string, grafo: string) => {
    if (!Number.isFinite(Date.parse(horario))) return;
    if (Date.parse(horario) >= horarioFinal) {
      horarioFinal = Date.parse(horario);
      grafoFinal = grafo;
    }
    const ids = extrairIdsDoGrafo(grafo);
    // Um grafo vazio não prova que algo foi desenhado.
    if (ids.size === 0) return;
    desenhos.push({ horario, ids, grafo });
    horariosDeDesenho.add(Date.parse(horario));
    for (const id of ids) if (!idsDeDesenho.has(id)) idsDeDesenho.set(id, horario);
  };
  for (const e of [...eventos].sort((a, b) => Date.parse(a.horario) - Date.parse(b.horario))) {
    const d = dadosComo(e.dados);
    if (e.tipo === "desenho" && typeof d.grafo === "string") {
      adicionarDesenho(e.horario, d.grafo);
    } else if ((e.tipo === "fala" && d.quem === "candidato" || e.tipo === "resposta" && (d.quem === undefined || d.quem === "candidato")) && typeof d.texto === "string" && d.texto.trim() && d.texto !== "(respondeu)") {
      falas.push({ horario: e.horario, texto: d.texto });
    }
  }
  for (const f of estado.conversa) {
    if (f.quem === "candidato" && f.texto.trim() && f.texto !== "(respondeu)") {
      falas.push({ horario: new Date(f.em).toISOString(), texto: f.texto });
    }
  }
  desenhos.sort((a, b) => Date.parse(a.horario) - Date.parse(b.horario));
  // A captura do /analisar comprova o que foi observado, não quando o candidato
  // desenhou. Resolve no fim da sessão, quando inclusive os lotes tardios chegaram.
  const registros = [...eventos].filter(e => e.tipo === "desenho" && typeof dadosComo(e.dados).grafo === "string")
    .sort((a, b) => Date.parse(a.horario) - Date.parse(b.horario));
  // Pedido de repetição não é sinal sobre o candidato: a observação "pediu repetições sucessivas" nunca vira prova.
  const observacoes = estado.observacoes.filter(o => !textoCulpaOCandidatoPorPedido(o.evidencia)).map(o => {
    if (!o.desenho) return o;
    const anteriores = registros.filter(e => Date.parse(e.horario) <= Date.parse(o.desenho!.horario));
    let indice = anteriores.length - 1;
    if (indice < 0 || dadosComo(anteriores[indice].dados).grafo !== o.desenho.grafo) {
      // Nunca liga a observação a uma versão antiga só porque o mesmo grafo já existiu.
      const { desenho: _snapshot, ...semAncora } = o;
      return semAncora;
    }
    // Reanálise ou upload tardio da mesma versão não mudam o momento do desenho.
    while (indice > 0 && dadosComo(anteriores[indice - 1].dados).grafo === o.desenho.grafo) indice--;
    return { ...o, desenho: { ...o.desenho, horario: anteriores[indice].horario } };
  });
  return { falas, idsDeDesenho, horariosDeDesenho, imagens, grafoFinal, desenhos, observacoes };
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

/** Todos os trechos, inclusive negações curtas, precisam existir na ordem em UMA fala. */
export function citacaoExiste(citacao: string, falas: { texto: string }[]): { horario?: number; ok: boolean; indice: number } {
  const trechos = citacao
    .split(/\.{3}|…/)
    .map(normalizar)
    .filter(Boolean);
  if (trechos.join("").length < 4) return { ok: false, indice: -1 };
  const normalizadas = falas.map((f) => normalizar(f.texto));
  const indice = normalizadas.findIndex((n) => {
    let inicio = 0;
    const fala = ` ${n} `;
    return trechos.every(t => {
      const posicao = fala.indexOf(` ${t} `, inicio);
      if (posicao < 0) return false;
      inicio = posicao + t.length + 1;
      return true;
    });
  });
  if (indice >= 0) return { ok: true, indice };
  return { ok: false, indice: -1 };
}

function imagemValida(valor: string | null | undefined, imagens: ImagemRef[], sessaoId: string): string | null {
  if (!valor) return null;
  const m = valor.trim().match(/^(\d+)$/) ?? valor.trim().match(/^imagem\s+(\d+)\b/i)
    ?? valor.trim().match(/^\/imagens\/(\d+)$/)
    ?? valor.trim().match(new RegExp(`^/api/sessoes/${encodeURIComponent(sessaoId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/imagens/(\\d+)$`));
  if (!m) return null;
  const n = Number(m[1]);
  return imagens.some((i) => i.numero === n) ? `/api/sessoes/${encodeURIComponent(sessaoId)}/imagens/${n}` : null;
}

export type ParametrosGuardas = {
  sessaoId: string;
  candidatoId: string;
  problemaId: string;
  rubrica: (Pick<Criterio, "id"> & Partial<Pick<Criterio, "niveis" | "nome" | "provaSoPorFala">>)[];
  fontes: FontesDeProva;
  origem: "llm" | "fake";
  agora?: () => Date;
  aoUsar?: (uso: { modelo?: string; provedor?: string; reservaDisparada?: boolean; ms: number; entrada?: number; saida?: number; cache?: number; custo?: number }) => void;
  /** Quanto durou a entrevista e quanto estava previsto. Ausente: duração desconhecida (conta só a cobertura). */
  duracao?: DuracaoDaSessao | null;
  /** Sinais esperados do problema: dizem o que faltou observar nos critérios sem prova. */
  problema?: Pick<Problema, "sinaisEsperados">;
};

export type DuracaoDaSessao = { decorridoMin: number; previstoMin: number };

/** "Não avançar" exige entrevista com pelo menos esta fração do tempo previsto... */
export const FRACAO_MINIMA_DE_DURACAO = 0.6;
/** ...ou esta fração dos critérios com nota. */
export const FRACAO_MINIMA_DE_COBERTURA = 2 / 3;

/**
 * Do começo ao último registro da sessão (não até "agora": gerar de novo depois não alonga a entrevista).
 * null quando a sessão não guardou o começo (estado antigo): a duração fica desconhecida.
 */
export function duracaoDaSessao(estado: EstadoSessao, eventos: EventoArmazenado[]): DuracaoDaSessao | null {
  if (!estado.iniciadaEm) return null;
  const fim = Math.max(estado.iniciadaEm,
    // Uso de modelo (o do relatório chega na hora de gerar) não é a entrevista acontecendo.
    ...eventos.filter(e => !e.tipo.endsWith("_uso")).map(e => Date.parse(e.horario)).filter(Number.isFinite),
    ...estado.conversa.map(f => f.em));
  const previstoMin = tempoDaEntrevista(estado, fim).totalMin;
  return previstoMin > 0 ? { decorridoMin: (fim - estado.iniciadaEm) / 60_000, previstoMin } : null;
}

const LIMITADA_AS_REFERENCIAS = "Avaliação limitada às referências verificadas abaixo.";

/** "Nome (xxx)" -> "Nome": tira UM parêntese final, se o nome terminar com um. */
function semParenteses(nome: string): string {
  const t = nome.trim();
  if (!t.endsWith(")")) return t;
  const abre = t.lastIndexOf("(");
  if (abre < 0) return t;
  const dentro = t.slice(abre + 1, -1);
  if (dentro.includes("(") || dentro.includes(")")) return t;
  return t.slice(0, abre).trim();
}

/** Tira . ; : do fim do texto. */
function semPontuacaoFinal(texto: string): string {
  let fim = texto.length;
  while (fim > 0 && ".;:".includes(texto[fim - 1])) fim--;
  return texto.slice(0, fim);
}

/**
 * O que faltou observar num critério sem prova, a partir dos sinais esperados do problema que combinam com o
 * critério (por raiz de palavra do nome). Sem sinal que combine, diz isso com franqueza em vez de inventar.
 */
export function textoDoQueFaltou(nome: string, id: string, soPorFala: boolean, sinaisEsperados: string[]): string {
  if (soPorFala) return `${nome}: não houve fala do candidato explicando ou respondendo algo de conteúdo; vale ouvi-lo explicar a solução.`;
  const raizes = (s: string) => normalizar(s).split(" ").filter(w => w.length >= 5).map(w => w.slice(0, 5));
  const chaves = new Set([...raizes(nome), ...raizes(id.replaceAll("_", " "))]);
  const sinal = sinaisEsperados.find(s => raizes(s).some(r => chaves.has(r)));
  if (!sinal) return `${nome}: sem prova nesta entrevista; vale perguntar diretamente sobre isso.`;
  const frase = semPontuacaoFinal(sinal.trim());
  return `${nome}: sem prova nesta entrevista. Sinal esperado que não apareceu: ${frase[0].toLowerCase()}${frase.slice(1)}.`;
}

const arred1 = (n: number) => Math.round(n * 10) / 10;
export const JANELA_DESENHO_MS = 1500;

function humanizador(p: ParametrosGuardas): (texto: string) => string {
  const nomes = new Map<string, string>();
  for (const d of p.fontes.desenhos) {
    for (const [, id, descricao] of d.grafo.matchAll(/^- \[([^\]]+)\]\s+(.+)$/gm)) {
      const nome = descricao.replace(/\s{2}dentro de \[.*$/, "").replace(/, perto de \[.*$/, "")
        .replace(/\s*\([^()]*\)$/, "").replace(/^"(.*)"$/, "$1").trim();
      if (nome) nomes.set(id.toLowerCase(), nome);
    }
  }
  for (const c of p.rubrica) if (c.nome && c.nome !== c.id) nomes.set(c.id.toLowerCase(), c.nome);
  if (!nomes.size) return texto => texto;
  const legiveis = new Set([...nomes.values()].map(nome => nome.toLowerCase()));
  const termos = [...new Set([...nomes.values(), ...nomes.keys()])].sort((a, b) => b.length - a.length)
    .map(termo => termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const padrao = new RegExp(`(^|[^\\p{L}\\p{N}_])(${termos.join("|")})(?=$|[^\\p{L}\\p{N}_])`, "giu");
  // Preserva nomes já legíveis ("Requisitos e escopo" contém o id "requisitos").
  // Uma só passagem: nomes substituídos não viram novas referências técnicas.
  return texto => texto.replace(padrao, (_, prefixo: string, termo: string) => prefixo
    + (legiveis.has(termo.toLowerCase()) ? termo : nomes.get(termo.toLowerCase())));
}

function validarDesenho(e: SaidaScorecardLlm["criterios"][number]["evidencias"][number], criterio: string, p: ParametrosGuardas): Evidencia | null {
  const { fontes } = p;
  const imagem = imagemValida(e.imagem, fontes.imagens, p.sessaoId);
  const refImagem = imagem ? fontes.imagens.find(i => imagem.endsWith(`/imagens/${i.numero}`)) : undefined;
  const desejado = Date.parse(e.horario);
  const compativeis = fontes.desenhos.filter(d => !e.texto || fontes.observacoes.some(o => o.criterio === criterio
    && o.evidencia === e.texto && o.desenho?.horario === d.horario && o.desenho.grafo === d.grafo));
  const proximos = [...compativeis].sort((a, b) => Math.abs(Date.parse(a.horario) - desejado) - Math.abs(Date.parse(b.horario) - desejado));
  let desenho = proximos.find(d => Math.abs(Date.parse(d.horario) - desejado) <= JANELA_DESENHO_MS);
  const ids = [...new Set(e.elementos)];
  // IDs têm que coexistir no MESMO snapshot. Nunca junte versões distintas do quadro.
  if (!desenho && ids.length) desenho = compativeis.find(d => ids.every(id => d.ids.has(id)));
  if (!desenho && refImagem) desenho = compativeis.find(d => Math.abs(Date.parse(d.horario) - Date.parse(refImagem.horario)) <= JANELA_DESENHO_MS);
  if (!desenho && !refImagem) return null;
  const elementos = desenho ? ids.filter(id => desenho.ids.has(id)) : [];
  if (ids.length && elementos.length === 0) return null;
  // Texto de desenho só entra quando copiado de uma observação deste critério,
  // registrada no servidor sobre este snapshot. Nunca promove fala do entrevistador a prova.
  const observacao = e.texto && desenho ? fontes.observacoes.find(o => o.criterio === criterio && o.desenho
    && o.desenho.horario === desenho.horario && o.desenho.grafo === desenho.grafo
    && o.evidencia === e.texto) : undefined;
  if (e.texto && !observacao) return null;
  const imagemCoerente = refImagem && (!desenho || Math.abs(Date.parse(refImagem.horario) - Date.parse(desenho.horario)) <= JANELA_DESENHO_MS);
  return {
    tipo: "desenho", horario: desenho?.horario ?? refImagem!.horario,
    ...(elementos.length ? { elementos } : {}),
    ...(observacao ? { texto: observacao.evidencia } : {}),
    ...(imagemCoerente && imagem ? { imagem } : {}),
  };
}

/** A saída do modelo com os resumos opcionais: a entrada do zod (com default) pode não trazê-los tipados. */
type SaidaParaGuardas = Omit<SaidaScorecardLlm, "resumo_da_solucao" | "resumo_da_entrevista"> & Partial<Pick<SaidaScorecardLlm, "resumo_da_solucao" | "resumo_da_entrevista">>;

export function aplicarGuardas(saida: SaidaParaGuardas, p: ParametrosGuardas): Scorecard {
  const ajustes: string[] = [];
  const { fontes } = p;
  const vistos = new Set<string>();

  const criterios: CriterioAvaliado[] = p.rubrica.map(({ id, niveis, nome, provaSoPorFala }) => {
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
        // Pedir para repetir, dizer que não entendeu, corrigir o entrevistador ou pedir para encerrar é neutro:
        // nunca prova nota nenhuma. Se era a única prova, a nota cai para "sem prova" logo abaixo.
        if (ehPedidoDeRepeticao(e.texto)) {
          ajustes.push(`evidência de fala descartada em ${id}: pedido de repetição ou esclarecimento não é prova`);
          continue;
        }
        const origem = fontes.falas[r.indice];
        evidencias.push({ tipo: "fala", horario: origem?.horario ?? e.horario, texto: e.texto });
      } else {
        if (criterioSoPorFala({ id, nome, provaSoPorFala })) {
          ajustes.push(`evidência de desenho descartada em ${id}: rubrica exige fala`);
          continue;
        }
        const validada = validarDesenho(e, id, p);
        if (!validada) {
          ajustes.push(`evidência de desenho descartada em ${id}: sem id nem horário válido`);
          continue;
        }
        if (e.elementos.length !== (validada.elementos?.length ?? 0)) ajustes.push(`ids inexistentes removidos em ${id}`);
        if (e.horario !== validada.horario) ajustes.push(`horário de desenho corrigido em ${id}`);
        if (e.imagem && !validada.imagem) ajustes.push(`imagem inválida ou de outro horário removida em ${id}`);
        evidencias.push(validada);
      }
    }

    let nota: number | null = c.nota !== null && Number.isInteger(c.nota) && c.nota >= 1 && c.nota <= 4 ? c.nota : null;
    if (c.nota !== null && nota === null) ajustes.push(`nota de ${id} removida: deve ser inteira entre 1 e 4`);
    let justificativa = c.justificativa.trim();
    const observacoesCitadas = fontes.observacoes.filter(o => o.criterio === id && o.desenho
      && evidencias.some(e => e.tipo === "desenho" && (!e.texto || e.texto === o.evidencia) && e.horario === o.desenho?.horario));
    if (nota === 4 && niveis && /espontan|antecip/.test(normalizar(niveis[4]))
      && !observacoesCitadas.some(o => o.espontaneo)
      && evidencias.every(e => e.tipo === "desenho")) {
      nota = 3;
      justificativa = "As referências visuais não têm registro de iniciativa espontânea que comprove o nível 4.";
      ajustes.push(`nota de ${id} limitada a 3: evidência visual não comprova espontaneidade`);
    }
    if (nota !== null && evidencias.length === 0) {
      ajustes.push(`nota de ${id} removida: sem evidência`);
      nota = null;
    }
    if (nota === null) justificativa = SEM_EVIDENCIA;
    else if (evidencias.length < c.evidencias.length) justificativa = "Avaliação limitada às referências verificadas abaixo; a justificativa original foi removida após descarte de evidências.";
    else if (textoCulpaOCandidatoPorPedido(justificativa)) {
      ajustes.push(`justificativa de ${id} trocada: culpava o candidato por pedir repetição`);
      justificativa = LIMITADA_AS_REFERENCIAS;
    }
    return { criterio: id, nota, justificativa, evidencias };
  });

  for (const c of saida.criterios) {
    if (!vistos.has(c.criterio)) ajustes.push(`critério desconhecido ignorado: ${c.criterio}`);
  }

  const notas = criterios.map((c) => c.nota).filter((n): n is number => n !== null);
  const notaGeral = notas.length ? arred1(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
  const insuficiente = notas.length === 0 || notas.length * 2 < criterios.length;
  if (insuficiente) ajustes.push("menos da metade dos critérios com evidência: recomendação neutra");
  let recomendacao: Recomendacao = insuficiente ? "evidencia_insuficiente"
    : notaGeral! < 2 ? "nao_avancar" : notaGeral! < 3 ? "avancar_com_ressalvas" : "avancar";
  // Cobertura parcial não permite avanço sem ressalvas.
  if (recomendacao === "avancar" && notas.length < criterios.length) recomendacao = "avancar_com_ressalvas";
  // "Não avançar" é a recomendação mais pesada: só com entrevista que durou o bastante OU critérios cobertos. Uma
  // entrevista curta com metade da rubrica sem prova (como a encerrada aos 8 de 15 minutos) não permite concluir isso.
  const duracao = p.duracao ?? null;
  const duracaoSuficiente = duracao !== null && duracao.decorridoMin >= FRACAO_MINIMA_DE_DURACAO * duracao.previstoMin;
  const coberturaSuficiente = criterios.length > 0 && notas.length / criterios.length >= FRACAO_MINIMA_DE_COBERTURA;
  if (recomendacao === "nao_avancar" && !duracaoSuficiente && !coberturaSuficiente) {
    recomendacao = "evidencia_insuficiente";
    ajustes.push("recomendação 'não avançar' trocada por evidência insuficiente: entrevista curta e menos de 2/3 dos critérios com prova");
  }
  if (recomendacao !== saida.recomendacao) ajustes.push(`recomendação corrigida de ${saida.recomendacao} para ${recomendacao}: média e cobertura da rubrica`);
  const corrigiuCriterios = ajustes.some(a => !a.startsWith("recomendação") && !a.startsWith("menos da metade"));
  const reverResumo = corrigiuCriterios || insuficiente || notas.length < criterios.length;
  const humanizar = humanizador(p);
  const nomes = new Map(p.rubrica.map(c => [c.id, c.nome ?? c.id]));
  let corrigiuTexto = false;
  const legivel = (texto: string) => {
    const resultado = semTermosInternos(humanizar(texto));
    corrigiuTexto ||= resultado !== texto;
    return resultado;
  };
  const criteriosLegiveis = criterios.map(c => ({ ...c, justificativa: legivel(c.justificativa) }));

  // Quando as guardas mexeram nas notas, os textos do modelo que falam de critério SEM prova deixam de valer, mas
  // o resto fica: só some o que se apoiava em prova que não existe mais. Nunca vira frase fixa para todo critério.
  const nomeLegivel = (id: string) => semParenteses(semTermosInternos(nomes.get(id) ?? id));
  const semNota = criterios.filter(c => c.nota === null);
  const chavesSemNota = semNota.flatMap(c => [nomeLegivel(c.criterio), c.criterio.replaceAll("_", " ")]).map(normalizar).filter(Boolean);
  const citaCriterioSemProva = (texto: string) => {
    const t = normalizar(texto);
    return chavesSemNota.some(k => t.includes(k));
  };
  const aproveitavel = (texto: string) => texto.trim() !== "" && !textoCulpaOCandidatoPorPedido(texto)
    && !(reverResumo && citaCriterioSemProva(texto));
  const sinais = p.problema?.sinaisEsperados ?? [];
  const soPorFala = new Map(p.rubrica.map(c => [c.id, criterioSoPorFala(c)]));
  const pontosFortes = saida.pontos_fortes.filter(aproveitavel).map(legivel);
  const doModelo = saida.pontos_a_aprofundar.filter(t => aproveitavel(t) && !ehItemGenerico(t));
  const faltas = reverResumo ? [
    ...semNota.map(c => textoDoQueFaltou(nomeLegivel(c.criterio), c.criterio, soPorFala.get(c.criterio) ?? false, sinais)),
  ] : [];
  const pontosAAprofundar = [...doModelo, ...faltas].map(legivel);

  const fato = fatoDeCobertura({
    duracaoMin: duracao ? duracao.decorridoMin : null,
    previstoMin: duracao?.previstoMin ?? null,
    criteriosSemProva: semNota.length,
    totalCriterios: criterios.length,
  });
  const listaSemProva = semNota.map(c => nomeLegivel(c.criterio)).join(", ");
  const briefingDoModelo = saida.briefing_para_proxima_etapa.trim();
  const modeloServe = !reverResumo && briefingDoModelo !== "" && !textoCulpaOCandidatoPorPedido(briefingDoModelo)
    // "Não avançar" não manda a conversa para a próxima etapa.
    && !(recomendacao === "nao_avancar" && falaDeProximaConversa(normalizar(briefingDoModelo)));
  const briefingComposto = [
    recomendacao === "evidencia_insuficiente" ? "Sem evidência suficiente para recomendar avançar ou não avançar." : "",
    fato ?? "",
    listaSemProva ? `Sem prova: ${listaSemProva}.` : "",
    recomendacao !== "nao_avancar" && semNota.length ? "Vale cobrir esses pontos na próxima conversa." : "",
  ].filter(Boolean).join(" ");
  const briefing = legivel(modeloServe ? briefingDoModelo : briefingComposto);
  // O resumo da entrevista fica quando não fala de critério sem prova; senão, vira um resumo factual das provas aceitas.
  const resumoDoModelo = (saida.resumo_da_entrevista ?? "").trim();
  const comProva = criterios.filter(c => c.nota !== null);
  const resumoFactual = reverResumo ? [
    comProva.length
      ? `Houve prova em ${comProva.length} de ${criterios.length} critérios: ${comProva.map(c => `${nomeLegivel(c.criterio)} (${c.nota} de 4)`).join(", ")}.`
      : "Nenhum critério teve prova suficiente.",
    fato ?? "",
  ].filter(Boolean).join(" ") : "";
  const resumoDaEntrevista = legivel(resumoDoModelo && aproveitavel(resumoDoModelo) ? resumoDoModelo : resumoFactual);
  const resumoDaSolucao = legivel((saida.resumo_da_solucao ?? "").trim());
  const ajustesLegiveis = [...new Set(ajustes)].map(legivel);
  if (corrigiuTexto) ajustesLegiveis.push("Referências técnicas substituídas por nomes nos textos explicativos.");

  return {
    candidato_id: p.candidatoId,
    problema_id: p.problemaId,
    nota_geral: notaGeral,
    recomendacao,
    criterios: criteriosLegiveis,
    pontos_fortes: pontosFortes,
    pontos_a_aprofundar: pontosAAprofundar,
    briefing_para_proxima_etapa: briefing,
    resumo_da_solucao: resumoDaSolucao,
    resumo_da_entrevista: resumoDaEntrevista,
    gerado_em: (p.agora?.() ?? new Date()).toISOString(),
    origem: p.origem,
    ajustes: ajustesLegiveis,
  };
}

/**
 * Adaptação à mudança: só existe se a mudança foi anunciada. Prova só com falas do candidato DEPOIS do
 * anúncio, que existam de verdade; nota sem prova vira null. Os números (desenhos e falas depois) vêm
 * da linha do tempo, não do modelo.
 */
export function avaliarAdaptacao(saida: SaidaScorecardLlm["adaptacao"], estado: EstadoSessao, fontes: FontesDeProva): { adaptacao?: AdaptacaoAvaliada; ajustes: string[] } {
  const e = estado.empecilho;
  if (!e) return { ajustes: saida ? ["adaptação ignorada: não houve mudança no problema"] : [] };
  const ajustes: string[] = [];
  const depois = (horario: string) => Date.parse(horario) >= e.anunciadoEm;
  // A mesma fala pode vir da linha do tempo e da conversa do estado: conta uma vez.
  const falasDepois = [...new Map(fontes.falas.filter((f) => depois(f.horario)).map((f) => [f.texto.trim(), f])).values()];
  const evidencias: Evidencia[] = [];
  for (const ev of saida?.evidencias ?? []) {
    const r = citacaoExiste(ev.texto, falasDepois);
    if (!r.ok) {
      ajustes.push("evidência de adaptação descartada: citação não encontrada depois da mudança");
      continue;
    }
    evidencias.push({ tipo: "fala", horario: falasDepois[r.indice].horario, texto: ev.texto });
  }
  const bruta = saida?.nota ?? null;
  let nota = bruta !== null && Number.isInteger(bruta) && bruta >= 1 && bruta <= 4 ? bruta : null;
  if (bruta !== null && nota === null) ajustes.push("nota de adaptação removida: deve ser inteira entre 1 e 4");
  if (nota !== null && evidencias.length === 0) {
    ajustes.push("nota de adaptação removida: sem fala do candidato depois da mudança");
    nota = null;
  }
  const desenhosDepois = new Set(fontes.desenhos.filter((d) => depois(d.horario)).map((d) => d.grafo)).size;
  const justificativa = nota === null
    ? falasDepois.length === 0 && desenhosDepois === 0
      ? "O candidato não falou nem mexeu no desenho depois da mudança."
      : "Sem fala do candidato que mostre como ele lidou com a mudança."
    : saida?.justificativa.trim() || NIVEIS_ADAPTACAO[nota as 1 | 2 | 3 | 4];
  return {
    adaptacao: {
      mudanca: e.requisito,
      anunciada_em: new Date(e.anunciadoEm).toISOString(),
      forcada: e.forcado,
      nota,
      justificativa,
      evidencias,
      desenhos_depois: desenhosDepois,
      falas_depois: falasDepois.length,
    },
    ajustes,
  };
}

function comAdaptacao(scorecard: Scorecard, saida: SaidaScorecardLlm["adaptacao"], estado: EstadoSessao, fontes: FontesDeProva): Scorecard {
  const { adaptacao, ajustes } = avaliarAdaptacao(saida, estado, fontes);
  return { ...scorecard, ajustes: [...scorecard.ajustes, ...ajustes], ...(adaptacao ? { adaptacao } : {}) };
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
      return `candidato abriu a pergunta do entrevistador: ${cortar(String(d.pergunta ?? ""), 300)}`;
    case "fase":
      return `fase=${String(d.fase ?? "")}`;
    case "empecilho":
      return `o entrevistador trouxe uma mudança no problema: ${cortar(String(d.fala ?? ""), 600)} (escrito no quadro: ${cortar(String(d.requisito ?? ""), 100)})`;
    default:
      return "";
  }
}

export function montarEntradaDoPrompt(entrada: EntradaScorecard, fontes: FontesDeProva) {
  const eventos = [...entrada.eventos].sort((a, b) => Date.parse(a.horario) - Date.parse(b.horario));
  const completa = eventos.map((e) => `${e.horario} | ${e.tipo} | ${neutralizar(resumoDoEvento(e))}`).join("\n");
  const linhaDoTempo = completa.length <= 40_000 ? completa
    : completa.slice(0, 8000) + "\n[miolo omitido por tamanho; fim preservado]\n" + completa.slice(-31_900);
  const conversaCompleta = entrada.estado.conversa
    .map((f) => `${new Date(f.em).toISOString()} ${f.quem === "agente" ? "Entrevistador" : "Candidato"}: ${neutralizar(f.texto)}`)
    .join("\n");
  const conversa = conversaCompleta.length <= 20_000 ? conversaCompleta : "[início omitido]\n" + conversaCompleta.slice(-19_950);
  const observacoes = fontes.observacoes
    .map((o) => `- ${JSON.stringify({ criterio: o.criterio, sinal: o.sinal, espontaneo: o.espontaneo,
      horario: new Date(o.em).toISOString(), fase: o.fase, evidencia: o.evidencia,
      desenho: o.desenho ? { horario: o.desenho.horario, elementos: [...extrairIdsDoGrafo(o.desenho.grafo)] } : null })}`)
    .join("\n");
  const imagens = entrada.imagens.map((i) => `- imagem ${i.numero} (${i.horario})`).join("\n");
  const regrasDaSquad = blocoDasRegras(entrada.estado.plano?.regrasSquad, "observar");
  const e = entrada.estado.empecilho;
  const mudanca = e ? { horario: new Date(e.anunciadoEm).toISOString(), fala: e.fala, exige: e.exige } : undefined;
  return { linhaDoTempo, conversa, observacoes, grafoFinal: cortar(neutralizar(fontes.grafoFinal), 20_000), imagens,
    ...(regrasDaSquad ? { regrasDaSquad } : {}), ...(mudanca ? { mudanca } : {}) };
}

export type DepsScorecard = {
  llm: LlmCliente;
  kit: Kit;
  problema: Problema;
  modelo?: string;
  agora?: () => Date;
  aoUsar?: (uso: { modelo?: string; provedor?: string; reservaDisparada?: boolean; ms: number; entrada?: number; saida?: number; cache?: number; custo?: number }) => void;
};

export async function gerarScorecard(deps: DepsScorecard, entrada: EntradaScorecard): Promise<Scorecard> {
  const fontes = extrairFontes(entrada.estado, entrada.eventos, entrada.imagens);
  const timeoutMs = timeoutScorecardMs();
  const controle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => {
      rejeitar(new ErroLlm("timeout", "Prazo do scorecard excedido"));
      controle.abort();
    }, timeoutMs);
  });
  try {
    const r = await Promise.race([prazo, deps.llm.completarJson({
      sistema: { estatico: montarSistemaEstaticoScorecard(deps.kit, deps.problema) },
      mensagens: [{ role: "user", content: montarSistemaDinamicoScorecard(montarEntradaDoPrompt(entrada, fontes)) + "\nEscreva o scorecard desta entrevista conforme as regras do sistema." }],
      schema: EsquemaSaidaScorecardLlm,
      nomeSchema: NOME_SCHEMA_SCORECARD,
      modelo: deps.modelo ?? (process.env.AGENTE_MODELO_FINAL || MODELO_FINAL_PADRAO),
      maxTokens: MAX_TOKENS_SCORECARD,
      raciocinio: true,
      timeoutMs,
      sinal: controle.signal,
    })]);
    deps.aoUsar?.({ modelo: r.modelo, provedor: r.provedor, reservaDisparada: r.reservaDisparada, ms: r.ms, entrada: r.uso?.entrada, saida: r.uso?.saida, cache: r.uso?.cache, custo: r.uso?.custo });
    return comAlertaDeInjecao(comAdaptacao(marcarRegrasDaSquad(aplicarGuardas(r.dados, {
      sessaoId: entrada.sessaoId,
      candidatoId: entrada.candidatoId,
      problemaId: deps.problema.id,
      rubrica: deps.kit.criterios,
      fontes,
      origem: "llm",
      agora: deps.agora,
      duracao: duracaoDaSessao(entrada.estado, entrada.eventos),
      problema: deps.problema,
    }), entrada.estado), r.dados.adaptacao, entrada.estado, fontes), entrada.eventos);
  } finally {
    clearTimeout(timer);
  }
}

/** Scorecard determinístico (AGENTE_FAKE=1): monta a saída a partir do livro de observações e passa pelas mesmas guardas. */
export function gerarScorecardFalso(deps: Omit<DepsScorecard, "llm">, entrada: EntradaScorecard): Scorecard {
  const fontes = extrairFontes(entrada.estado, entrada.eventos, entrada.imagens);

  const criterios = deps.kit.criterios.map((c) => {
    const obs = fontes.observacoes.filter((o) => o.criterio === c.id && o.desenho && extrairIdsDoGrafo(o.desenho.grafo).size > 0);
    if (obs.length === 0) return { criterio: c.id, nota: null, justificativa: "Sem observações.", evidencias: [] };
    const positivos = obs.some(o => o.sinal === "positivo");
    const negativos = obs.some(o => o.sinal === "negativo");
    const evidencias: SaidaScorecardLlm["criterios"][number]["evidencias"] = [];
    for (const o of obs) evidencias.push({ tipo: "desenho", horario: o.desenho!.horario,
      texto: o.evidencia, elementos: [...extrairIdsDoGrafo(o.desenho!.grafo)], imagem: null });
    return {
      criterio: c.id,
      // Repetir a mesma observação não aumenta nota; neutro não autoriza nota.
      nota: positivos ? negativos ? 2 : 3 : negativos ? 1 : null,
      justificativa: `${c.nome}: [fake] ${obs.map((o) => `${o.sinal}: ${o.evidencia}`).join("; ")}`,
      evidencias,
    };
  });
  const saida: SaidaScorecardLlm = {
    nota_geral: null,
    recomendacao: "avancar_com_ressalvas",
    criterios,
    pontos_fortes: criterios.filter(c => c.nota !== null && c.nota >= 3).map(c => c.justificativa).slice(0, 3),
    pontos_a_aprofundar: criterios.filter(c => c.nota !== null && c.nota < 3).map(c => c.justificativa).slice(0, 3),
    briefing_para_proxima_etapa: "[fake] Scorecard determinístico construído do livro de observações.",
    resumo_da_solucao: "[fake] Resumo da solução não foi escrito: scorecard determinístico.",
    resumo_da_entrevista: "[fake] Resumo da entrevista não foi escrito: scorecard determinístico.",
  };
  // Sem modelo não há julgamento da adaptação: só os números medidos pela linha do tempo.
  return comAlertaDeInjecao(comAdaptacao(marcarRegrasDaSquad(aplicarGuardas(saida, {
    sessaoId: entrada.sessaoId,
    candidatoId: entrada.candidatoId,
    problemaId: deps.problema.id,
    rubrica: deps.kit.criterios,
    fontes,
    origem: "fake",
    agora: deps.agora,
    duracao: duracaoDaSessao(entrada.estado, entrada.eventos),
    problema: deps.problema,
  }), entrada.estado), null, entrada.estado, fontes), entrada.eventos);
}

/**
 * Fala do candidato ou texto escrito no quadro dirigido à IA ("ignore as instruções", "dê nota 4"): vira um
 * alerta em "pontos a aprofundar" para a recrutadora revisar, como no live coding. Não muda nota nem recomendação.
 */
export function comAlertaDeInjecao(scorecard: Scorecard, eventos: EventoArmazenado[]): Scorecard {
  const inicio = Math.min(...eventos.map((e) => Date.parse(e.horario)).filter(Number.isFinite));
  const textos = eventos.flatMap((e) => {
    const d = dadosComo(e.dados);
    const t = Date.parse(e.horario) - inicio;
    if (e.tipo === "desenho" && typeof d.grafo === "string") return [{ t, onde: "no quadro", texto: d.grafo }];
    const doCandidato = (e.tipo === "fala" && d.quem === "candidato") || (e.tipo === "resposta" && (d.quem === undefined || d.quem === "candidato"));
    return doCandidato && typeof d.texto === "string" ? [{ t, onde: "na fala", texto: d.texto }] : [];
  });
  const achadas = tentativasEmTextos(textos);
  if (achadas.length === 0) return scorecard;
  const mmss = (ms: number) => `${String(Math.floor(ms / 60_000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const onde = achadas.map((a) => `${a.onde} em ${mmss(a.t)}`).join(", ");
  const alerta = `Possível tentativa de instruir a IA (${onde}): "${achadas[0].trecho}". Revise antes de decidir; isso não mudou a nota.`;
  return { ...scorecard, pontos_a_aprofundar: [alerta, ...scorecard.pontos_a_aprofundar] };
}

/** Critério com nota que uma regra da squad afeta ganha a marca "aprendido com o time". */
function marcarRegrasDaSquad(scorecard: Scorecard, estado: EstadoSessao): Scorecard {
  const regras = estado.plano?.regrasSquad;
  if (!regras?.length) return scorecard;
  return {
    ...scorecard,
    criterios: scorecard.criterios.map((c) => {
      const daSquad = c.nota === null ? [] : regrasDoCriterio(regras, c.criterio);
      return daSquad.length ? { ...c, regras_squad: daSquad } : c;
    }),
  };
}
