// Loop rápido (o "/perguntar"): o candidato fala com o entrevistador. Responde só pela ficha.
// Registra CANDIDATO_FALOU / AGENTE_FALOU no estado. Não lança por causa do LLM.
import { neutralizar, REGRA_DADOS } from "../seguranca/injecao";
import { blocoDoBriefing } from "./briefing";
import { aceitaEncerrar, comVezDevolvida, frasesDe, eSoReacao, limitarFrases, OFERTA_DE_ENCERRAR, perguntaDeConducao, perguntaJaFeita, semEcoNoComeco, semPerguntaNoFim, semPerguntaNoFimV2 } from "./guardas";
import { garantirMarca, mapearAcoesVisuais, pecasCitadas, type AcaoVisual } from "../presenca/acoesVisuais";
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

/** Ele disse que terminou: o Totti avisa que vai olhar o desenho, e a pergunta seguinte vem da análise. */
export const AVISOS_DE_QUE_VAI_OLHAR = ["Tá, deixa eu dar uma olhada no desenho.", "Certo, só um instante que eu olho o que você fez."];

/** A fala sem as frases que terminam em pergunta ("" se era só a pergunta). */
function frasesSemPergunta(texto: string): string {
  return frasesDe(texto.trim()).filter((f) => !f.trim().endsWith("?")).join(" ").trim();
}

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
  // O Totti ofereceu encerrar e ele aceitou (ou só não tem mais nada a dizer): fecha, sem gastar uma chamada ao modelo.
  // Numa entrevista real ele pediu para terminar cinco vezes e o Totti seguiu devolvendo a vez.
  const ultimaDoAgente = estado.conversa.findLast((f) => f.quem === "agente")?.texto;
  if (ultimaDoAgente === OFERTA_DE_ENCERRAR && aceitaEncerrar(entrada.texto)) return { ...mudo(), encerrar: true };

  const v2 = (deps.versao ?? versaoTottiQuadro()) === "v2";
  let saida;
  try {
    const r = await deps.llm.completarJson({
      sistema: v2
        ? {
            estatico: `${montarSistemaEstaticoPerguntarV2(deps.kit, deps.problema)}\n\n${REGRA_DADOS}`,
            dinamico: montarSistemaDinamicoPerguntarV2(estado, deps.kit, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64, blocoDoBriefing(deps.kit, estado, agora)),
          }
        : {
            estatico: `${montarSistemaEstaticoPerguntar(deps.kit, deps.problema)}\n\n${REGRA_DADOS}`,
            dinamico: montarSistemaDinamicoPerguntar(estado, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64, blocoDoBriefing(deps.kit, estado, agora)),
          },
      // A fala vai como está (é o que o modelo responde), só sem etiqueta falsa.
      mensagens: [{ role: "user", content: neutralizar(entrada.texto) }],
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
  // Quantas vezes ele já tinha dito que terminou, antes desta.
  const conclusoesAntes = estado.conclusoes ?? 0;
  const comConclusao = (e: EstadoSessao) => concluiu ? transicionar(e, { tipo: "CANDIDATO_CONCLUIU" }, agora).estado : e;
  // O desfecho só vale quando havia pergunta ativa: sem ela, não há assunto para encerrar.
  const haPerguntaAtiva = !!(entrada.perguntaAtiva || estado.perguntaAtiva);
  const desfecho = haPerguntaAtiva ? (saida.desfecho ?? null) : null;
  const mudoOuConcluiu = (): ResultadoPerguntar => ({ ...mudo(), concluiu, desfecho, estado: comConclusao(comFala) });
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
    // Ele já disse duas vezes que terminou e diz de novo: o Totti não devolve a vez com outro convite, oferece fechar.
    // (Na primeira e na segunda, a pergunta seguinte vem da análise do desenho, que roda logo depois.)
    const fasesDeDesenho = entrada.fase === "ALTO_NIVEL" || entrada.fase === "APROFUNDAMENTO" || entrada.fase === "FECHAMENTO";
    if (concluiu && conclusoesAntes >= 2 && fasesDeDesenho && !haPerguntaAtiva) {
      // `concluiu` vai false: a oferta já é a vez dele, e nenhuma pergunta nova deve vir atrás dela.
      const final = transicionar(comFala, { tipo: "AGENTE_FALOU", texto: OFERTA_DE_ENCERRAR, perguntou: true }, agora).estado;
      return { responder: true, texto: OFERTA_DE_ENCERRAR, requisito: null, concluiu: false, desfecho, estado: final, perguntou: true };
    }
    // Pergunta que ele já ouviu (do Totti na conversa, da análise do desenho ou da mudança no problema) não sai de novo.
    const jaPerguntadas = [
      ...estado.conversa.filter((f) => f.quem === "agente" && f.texto.includes("?")).map((f) => f.texto),
      ...estado.perguntas.flatMap((p) => [p.pergunta, ...(p.seguimentos ?? [])]),
    ];
    // Nem a pergunta que só devolve a condução ("quer detalhar algo?"), nas fases de desenho.
    const repetida = texto.trim().endsWith("?") && perguntaJaFeita(texto, jaPerguntadas);
    if (repetida || (fasesDeDesenho && perguntaDeConducao(texto))) {
      log(repetida ? "perguntar_pergunta_repetida" : "perguntar_pergunta_de_conducao", { sessao_id: entrada.sessao_id, fase: entrada.fase });
      const sobrou = frasesSemPergunta(texto);
      if (!sobrou) return mudoOuConcluiu();
      texto = sobrou;
    }
    // Ele disse que terminou: a pergunta seguinte é a da análise do desenho (concreta, com a peça marcada). Um convite
    // vago aqui ("quer detalhar algo?") deixava ele sem saber o que fazer e ainda derrubava a pergunta pronta.
    if (concluiu && !texto.trim().endsWith("?") && fasesDeDesenho && !haPerguntaAtiva) {
      const aviso = AVISOS_DE_QUE_VAI_OLHAR[conclusoesAntes % AVISOS_DE_QUE_VAI_OLHAR.length];
      // A pergunta da análise vem logo atrás deste aviso (a conclusão é um marco: ver `motivoBloqueioPlin`).
      return { responder: true, texto: aviso, requisito: null, concluiu, desfecho,
        estado: transicionar(comConclusao(comFala), { tipo: "AGENTE_FALOU", texto: aviso }, agora).estado };
    }
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
  const final = transicionar(comConclusao(comFala), { tipo: "AGENTE_FALOU", texto, ...(perguntou ? { perguntou } : {}) }, agora).estado;
  const ids = extrairIdsDoGrafo(entrada.grafo ?? "");
  // A pergunta que cita uma peça pelo nome marca essa peça no quadro, mesmo que o modelo não tenha pedido gesto.
  const citadas = perguntou ? pecasCitadas(texto, entrada.grafo ?? "").filter((id) => ids.has(id)) : [];
  const visual = garantirMarca(mapearAcoesVisuais(saida.visual, (id) => ids.has(id) ? id : null), citadas, estado.conversa.length);
  return { responder: true, texto, requisito: repetido ? null : requisito, concluiu, desfecho, estado: final,
    ...(perguntou ? { perguntou } : {}),
    ...(seguimento ? { seguimento } : {}),
    ...(visual !== undefined ? { visual } : {}) };
}
