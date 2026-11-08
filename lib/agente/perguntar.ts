// Loop rápido (o "/perguntar"): o candidato fala com o entrevistador. Responde só pela ficha.
// Registra CANDIDATO_FALOU / AGENTE_FALOU no estado. Não lança por causa do LLM.
import { blocoDoBriefing } from "./briefing";
import { comVezDevolvida, eSoReacao, limitarFrases, semEcoNoComeco, semPerguntaNoFim, semPerguntaNoFimV2 } from "./guardas";
import { mapearAcoesVisuais, type AcaoVisual } from "../presenca/acoesVisuais";
import { extrairIdsDoGrafo } from "./sessao/politica";
import type { LlmCliente } from "./llm/cliente";
import type { Kit, Problema } from "./kits/tipos";
import {
  EsquemaSaidaPerguntar,
  montarSistemaDinamicoPerguntar,
  montarSistemaEstaticoPerguntar,
  NOME_SCHEMA_PERGUNTAR,
} from "./prompts/entrevistador";
import { montarSistemaDinamicoPerguntarV2, montarSistemaEstaticoPerguntarV2, NOME_SCHEMA_PERGUNTAR_V2 } from "./prompts/entrevistador-v2";
import { MAX_SEGUIMENTOS, transicionar, type Desfecho, type EstadoSessao } from "./sessao/estado";
import type { Fase, FalaRecente } from "./sessao/tipos";
import { logPadrao, type LogMeta } from "./analisar";

export type DepsPerguntar = {
  llm: LlmCliente;
  kit: Kit;
  problema: Problema;
  modelo?: string;
  maxTokens?: number;
  log?: LogMeta;
  /** Versão do Totti no quadro; sem valor, a de TOTTI_QUADRO (padrão v2). */
  versao?: VersaoTottiQuadro;
};

export type VersaoTottiQuadro = "v1" | "v2";

/**
 * Qual Totti responde no quadro: v2 (objetivos, docs/totti-v2-conversa.md), o padrão desde que foi aprovado na voz,
 * ou v1 (regras), só com TOTTI_QUADRO=v1.
 */
export function versaoTottiQuadro(): VersaoTottiQuadro {
  return process.env.TOTTI_QUADRO === "v1" ? "v1" : "v2";
}

export type EntradaPerguntar = {
  fase: Fase;
  texto: string;
  /** Itens que já estão no quadro de requisitos (para não repetir). Opcional. */
  requisitosAtuais?: string[];
  sessao_id?: string;
  grafo?: string;
  perguntaAtiva?: string;
  gestosRecentes?: string[];
  /** Falas recentes que o quadro tem e o servidor talvez não (apresentação, desafio). */
  conversaDoQuadro?: FalaRecente[];
  /** Foto leve do quadro (data URL), para o modelo ver o desenho além do grafo. */
  imagemBase64?: string | null;
  /** O que acabou de mudar no desenho. */
  mudancas?: string;
};

export type ResultadoPerguntar = {
  responder: boolean;
  texto: string;
  requisito: string | null;
  /** O candidato disse que terminou ("pronto"): o quadro avança/reanalisa. */
  concluiu: boolean;
  /** Como ele reagiu à pergunta ativa (só quando havia uma). */
  desfecho: Desfecho | null;
  /** A fala termina numa pergunta de continuação do mesmo fio: a pergunta ativa segue aberta. */
  seguimento?: boolean;
  /** Ele pediu para encerrar a entrevista: o quadro se despede e fecha. */
  encerrar?: boolean;
  /** Falha de infraestrutura: não confundir com a decisão deliberada de escutar. */
  falhou?: boolean;
  visual?: AcaoVisual[];
  /** A fala terminou numa pergunta do Conversador (v2): conta no intervalo do plin. */
  perguntou?: boolean;
  estado: EstadoSessao;
};

const MAX_CARACTERES_REQUISITO = 60;
/** Quantas falas recentes do agente o convite do fim evita repetir. */
const MAX_FALAS_PARA_VARIAR_CONVITE = 8;
export const MAX_FRASES_FALA = 3;

export async function perguntar(
  deps: DepsPerguntar,
  estado: EstadoSessao,
  entrada: EntradaPerguntar,
  agora: number,
  sinal?: AbortSignal,
): Promise<ResultadoPerguntar> {
  const log = deps.log ?? logPadrao;
  // A fala entra na conversa antes de o LLM ver o histórico (ele recebe a fala como mensagem).
  const comFala = transicionar(
    estado,
    { tipo: "CANDIDATO_FALOU", texto: entrada.texto, fimDeResposta: false },
    agora,
  ).estado;
  const mudo = (): ResultadoPerguntar => ({ responder: false, texto: "", requisito: null, concluiu: false, desfecho: null, estado: comFala });

  const v2 = (deps.versao ?? versaoTottiQuadro()) === "v2";
  let saida;
  try {
    const r = await deps.llm.completarJson({
      sistema: v2
        ? {
            estatico: montarSistemaEstaticoPerguntarV2(deps.kit, deps.problema),
            dinamico: montarSistemaDinamicoPerguntarV2(estado, deps.kit, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64, blocoDoBriefing(deps.kit, estado, agora)),
          }
        : {
            estatico: montarSistemaEstaticoPerguntar(deps.kit, deps.problema),
            dinamico: montarSistemaDinamicoPerguntar(estado, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64, blocoDoBriefing(deps.kit, estado, agora)),
          },
      mensagens: [{ role: "user", content: entrada.texto }],
      schema: EsquemaSaidaPerguntar,
      nomeSchema: v2 ? NOME_SCHEMA_PERGUNTAR_V2 : NOME_SCHEMA_PERGUNTAR,
      modelo: deps.modelo,
      maxTokens: deps.maxTokens ?? 200,
      sinal,
      imagem: entrada.imagemBase64 ?? null,
    });
    saida = r.dados;
    // Quem respondeu de fato este turno: com reserva e disjuntor no `lib/llm`, o modelo configurado nem sempre é
    // o que fala. Sem isso não dá para saber se o Totti "burro" era o modelo forte ou a reserva.
    log("perguntar_llm", {
      sessao_id: entrada.sessao_id,
      versao: v2 ? "v2" : "v1",
      modelo: r.modelo ?? "desconhecido",
      provedor: r.provedor ?? "desconhecido",
      ms: r.ms,
      tokens_entrada: r.uso?.entrada,
      tokens_saida: r.uso?.saida,
      custo_usd: r.uso?.custo,
    });
  } catch (e) {
    log("perguntar_falhou", {
      sessao_id: entrada.sessao_id,
      fase: entrada.fase,
      codigo: (e as { codigo?: string }).codigo ?? "desconhecido",
    });
    return { ...mudo(), falhou: true };
  }

  // Se o candidato terminou é o modelo quem interpreta; o código não procura palavras.
  const concluiu = saida.concluiu === true;
  // O desfecho só vale quando havia pergunta ativa: sem ela, não há assunto para encerrar.
  const haPerguntaAtiva = !!(entrada.perguntaAtiva || estado.perguntaAtiva);
  const desfecho = haPerguntaAtiva ? (saida.desfecho ?? null) : null;
  const mudoOuConcluiu = (): ResultadoPerguntar => ({ ...mudo(), concluiu, desfecho });
  // Pedido para encerrar a entrevista: quem fecha é o quadro (com a despedida), nada mais a decidir aqui.
  if (saida.encerrar === true) return { ...mudo(), encerrar: true };
  // Até 3 frases: acolher + reagir + um follow-up curto. O prompt pede falas de uma ou duas. Antes, sai a frase de
  // abertura que só repete o candidato ("Entendi que…", "Contador com base 62."): o modelo rápido fazia isso em quase toda fala.
  const curto = limitarFrases(semEcoNoComeco(saida.texto, entrada.texto), MAX_FRASES_FALA);
  // O convite do fim varia: não repete um que o Totti acabou de dizer.
  const jaDitas = estado.conversa.filter((f) => f.quem === "agente").slice(-MAX_FALAS_PARA_VARIAR_CONVITE).map((f) => f.texto);
  const minhaUltima = jaDitas.at(-1);
  let texto: string;
  let seguimento = false;
  if (v2) {
    // No v2 quem conduz é o Conversador: depois de uma resposta ele pode puxar um fio; só "não sei"/"pula" perdem a
    // pergunta (e o convite enlatado entra apenas se não sobrar fala nenhuma).
    const semAprofundar = desfecho === "nao_sabe" || desfecho === "pulou";
    texto = semAprofundar ? semPerguntaNoFimV2(curto) : curto;
    if (!saida.responder || !texto) return mudoOuConcluiu();
    // "Hm." atrás de "Hm." vira bordão na voz: a segunda reação vazia seguida fica em silêncio (a vez já é dele).
    if (eSoReacao(texto) && eSoReacao(minhaUltima)) return mudoOuConcluiu();
    // Ele acabou de responder a uma pergunta do Totti (ou disse "não sei"): a réplica não pode parar num "Tá." ou
    // "Tudo bem." solto, senão ele fica sem saber o que fazer. Sem pergunta nem próximo passo, entra um convite.
    const respondiaMinhaPergunta = haPerguntaAtiva || !!minhaUltima?.trim().endsWith("?");
    if (respondiaMinhaPergunta) texto = comVezDevolvida(texto, jaDitas);
  } else {
    // "Não sei" ou "pula": a vez volta com um convite, nunca com outra pergunta. Depois de uma resposta, o modelo
    // pode emendar UMA pergunta de continuação ("aprofundar"), que faz a entrevista andar no mesmo fio, até
    // MAX_SEGUIMENTOS por fio e só nas fases de desenho: depois disso o assunto muda pela análise.
    const ativa = estado.perguntaAtiva ?? (entrada.perguntaAtiva
      ? estado.perguntas.findLast((p) => p.pergunta === entrada.perguntaAtiva || p.seguimentos?.includes(entrada.perguntaAtiva!))
      : undefined);
    const fioAberto = (ativa?.seguimentos?.length ?? 0) < MAX_SEGUIMENTOS;
    const faseDeDesenho = entrada.fase === "ALTO_NIVEL" || entrada.fase === "APROFUNDAMENTO";
    const podeSeguir = desfecho === "respondeu" && saida.aprofundar === true && fioAberto && faseDeDesenho;
    const semAprofundar = desfecho === "nao_sabe" || desfecho === "pulou" || (desfecho === "respondeu" && !podeSeguir);
    texto = comVezDevolvida(semAprofundar ? semPerguntaNoFim(curto, jaDitas) : curto, jaDitas);
    if (!saida.responder || !texto) return mudoOuConcluiu();
    seguimento = podeSeguir && texto.endsWith("?");
  }
  const requisito = saida.requisito?.trim()
    ? saida.requisito.trim().slice(0, MAX_CARACTERES_REQUISITO)
    : null;
  const repetido = requisito !== null && (entrada.requisitosAtuais ?? []).includes(requisito);

  // v2: a pergunta do Conversador conta no intervalo do plin, para o Pensador não emendar outra logo em seguida.
  const perguntou = v2 && texto.trim().endsWith("?");
  const final = transicionar(comFala, { tipo: "AGENTE_FALOU", texto, ...(perguntou ? { perguntou } : {}) }, agora).estado;
  const ids = extrairIdsDoGrafo(entrada.grafo ?? "");
  const visual = mapearAcoesVisuais(saida.visual, (id) => ids.has(id) ? id : null);
  return { responder: true, texto, requisito: repetido ? null : requisito, concluiu, desfecho, estado: final,
    ...(perguntou ? { perguntou } : {}),
    ...(seguimento ? { seguimento } : {}),
    ...(visual !== undefined ? { visual } : {}) };
}
