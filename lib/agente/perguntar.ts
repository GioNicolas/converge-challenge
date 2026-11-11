// Loop rápido (o "/perguntar"): o candidato fala com o entrevistador. Responde só pela ficha.
// Registra CANDIDATO_FALOU / AGENTE_FALOU no estado. Não lança por causa do LLM.
import { neutralizar, REGRA_DADOS } from "../seguranca/injecao";
import { blocoDoBriefing } from "./briefing";
import { aceitaEncerrar, aplicarGuardas, comVezDevolvida, eSoReacao, limitarFrases, OFERTA_DE_ENCERRAR, semPerguntaNoFim } from "./guardas";
import { reacaoNeutra } from "../totti/guardas";
import {
  avisoDePerguntaSemResposta, avisosDeQueVaiOlhar, comRespostaDeReserva, decidirTurno, deSaidaDoQuadro, ficouSemResposta, sinalDeConclusao,
  type SituacaoDoTurno,
} from "../totti/turno";
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
import { blocosDoSistemaDinamicoPerguntarV2, FALAS_NO_PROMPT_V2, montarSistemaEstaticoPerguntarV2, NOME_SCHEMA_PERGUNTAR_V2, tamanhoDosBlocos, type NomeDoBloco } from "./prompts/entrevistador-v2";
import { historicoDaConversa } from "./prompts/contexto";
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
  /** Há quantos segundos ele não mexe no desenho. Ausente: o quadro não informou. */
  desenhoParadoHaS?: number;
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
  /** Custo e tamanho do prompt deste turno, quando o modelo respondeu (a rota grava por sessão). */
  uso?: UsoPerguntar;
  estado: EstadoSessao;
};

/** O que um turno do /perguntar gastou e de que se compôs o prompt dinâmico (issue #63). */
export type UsoPerguntar = {
  modelo: string;
  provedor: string;
  ms?: number;
  tokens_entrada?: number;
  tokens_saida?: number;
  /** Tokens de entrada servidos do cache do provedor, quando ele informa. */
  tokens_cache?: number;
  custo_usd?: number;
  /** Caracteres de cada parte do prompt dinâmico (no v1, tudo em `resto`). */
  blocos: Record<NomeDoBloco, number>;
  /** Tamanho da foto do quadro enviada (caracteres do data URL; 0 sem foto). */
  foto: number;
  /** Falas da conversa que foram no prompt. */
  falas_no_prompt: number;
};

/** Ele disse que terminou: o Totti avisa que vai olhar o desenho, e a pergunta seguinte vem da análise. */
export const AVISOS_DE_QUE_VAI_OLHAR = avisosDeQueVaiOlhar("quadro");

/** A segunda geração (ele fez uma pergunta clara e o modelo ficou quieto) só roda se a primeira foi rápida... */
const MAX_MS_PARA_GERAR_DE_NOVO = 3500;
/** ...e tem este prazo, para as duas caberem no prazo da rota. */
const PRAZO_SEGUNDA_GERACAO_MS = 3500;

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
  const medida: { uso?: UsoPerguntar } = {};
  const r = await responderFala(deps, estado, entrada, agora, sinal, medida);
  return medida.uso ? { ...r, uso: medida.uso } : r;
}

async function responderFala(
  deps: DepsPerguntar,
  estado: EstadoSessao,
  entrada: EntradaPerguntar,
  agora: number,
  sinal: AbortSignal | undefined,
  medida: { uso?: UsoPerguntar },
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
  // O convite do fim varia: não repete um que o Totti acabou de dizer.
  const jaDitas = estado.conversa.filter((f) => f.quem === "agente").slice(-MAX_FALAS_PARA_VARIAR_CONVITE).map((f) => f.texto);
  const minhaUltima = jaDitas.at(-1);
  // O desfecho só vale quando havia pergunta ativa: sem ela, não há assunto para encerrar.
  const haPerguntaAtiva = !!(entrada.perguntaAtiva || estado.perguntaAtiva);
  // Quantas vezes ele já tinha dito que terminou, antes desta.
  const conclusoesAntes = estado.conclusoes ?? 0;
  // A leitura do turno é a do Totti único (lib/totti/turno.ts), a mesma do live coding.
  const situacao: SituacaoDoTurno = {
    sala: "quadro",
    falaDoCandidato: entrada.texto,
    respondiaAoTotti: haPerguntaAtiva || !!minhaUltima?.trim().endsWith("?"),
    falasDoTotti: jaDitas,
    conclusoes: conclusoesAntes,
    paradoHaS: entrada.desenhoParadoHaS,
  };
  let saida;
  try {
    const blocos = v2
      ? blocosDoSistemaDinamicoPerguntarV2(estado, deps.kit, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64, blocoDoBriefing(deps.kit, estado, agora))
      : [{ bloco: "resto" as const, texto: montarSistemaDinamicoPerguntar(estado, entrada.fase, entrada.requisitosAtuais ?? [], entrada.grafo, entrada.perguntaAtiva, entrada.gestosRecentes, agora, entrada.conversaDoQuadro, entrada.mudancas, !!entrada.imagemBase64, blocoDoBriefing(deps.kit, estado, agora)) }];
    const pedido = {
      sistema: {
        estatico: `${v2 ? montarSistemaEstaticoPerguntarV2(deps.kit, deps.problema) : montarSistemaEstaticoPerguntar(deps.kit, deps.problema)}\n\n${REGRA_DADOS}`,
        dinamico: blocos.map((b) => b.texto).join(""),
      },
      // A fala vai como está (é o que o modelo responde), só sem etiqueta falsa.
      mensagens: [{ role: "user" as const, content: neutralizar(entrada.texto) }],
      schema: EsquemaSaidaPerguntar,
      nomeSchema: v2 ? NOME_SCHEMA_PERGUNTAR_V2 : NOME_SCHEMA_PERGUNTAR,
      modelo: deps.modelo,
      maxTokens: deps.maxTokens ?? 200,
      sinal,
      imagem: entrada.imagemBase64 ?? null,
    };
    const r = await deps.llm.completarJson(pedido);
    saida = r.dados;
    // Quem respondeu de fato este turno: com reserva e disjuntor no `lib/llm`, o modelo configurado nem sempre é
    // o que fala. Sem isso não dá para saber se o Totti "burro" era o modelo forte ou a reserva.
    medida.uso = {
      modelo: r.modelo ?? "desconhecido",
      provedor: r.provedor ?? "desconhecido",
      ms: r.ms,
      tokens_entrada: r.uso?.entrada,
      tokens_saida: r.uso?.saida,
      ...(r.uso?.cache !== undefined ? { tokens_cache: r.uso.cache } : {}),
      custo_usd: r.uso?.custo,
      blocos: tamanhoDosBlocos(blocos),
      foto: entrada.imagemBase64?.length ?? 0,
      falas_no_prompt: historicoDaConversa(estado.conversa, entrada.conversaDoQuadro, v2 ? FALAS_NO_PROMPT_V2 : undefined).length,
    };
    log("perguntar_llm", { sessao_id: entrada.sessao_id, versao: v2 ? "v2" : "v1", ...medida.uso });
    // Ele fez uma pergunta clara ("o que tu acha", "posso usar um cache?") e o modelo ficou quieto: gera de novo,
    // uma vez, avisando. Se esta falhar, vale a primeira leitura (e a fala de reserva, mais abaixo).
    if (r.ms <= MAX_MS_PARA_GERAR_DE_NOVO && ficouSemResposta(deSaidaDoQuadro(saida, situacao), situacao)) {
      log("perguntar_pergunta_sem_resposta", { sessao_id: entrada.sessao_id, fase: entrada.fase });
      const deNovo = await deps.llm
        .completarJson({
          ...pedido,
          sistema: { ...pedido.sistema, dinamico: `${pedido.sistema.dinamico}\n\n${avisoDePerguntaSemResposta("responder")}` },
          timeoutMs: PRAZO_SEGUNDA_GERACAO_MS,
        })
        .catch(() => null);
      if (deNovo) saida = deNovo.dados;
    }
  } catch (e) {
    log("perguntar_falhou", {
      sessao_id: entrada.sessao_id,
      fase: entrada.fase,
      codigo: (e as { codigo?: string }).codigo ?? "desconhecido",
    });
    return { ...mudo(), falhou: true };
  }

  // Se o candidato terminou é o modelo quem interpreta. O código só serve de rede: "terminei" ou "acho que é isso"
  // com o desenho parado há alguns segundos conta mesmo que o modelo não tenha marcado (lib/totti/turno.ts).
  const peloSinal = saida.concluiu !== true && saida.encerrar !== true && sinalDeConclusao(situacao);
  if (peloSinal) log("perguntar_turno", { sessao_id: entrada.sessao_id, fase: entrada.fase, regras: ["sinal_de_conclusao"] });
  const concluiu = saida.concluiu === true || peloSinal;
  const comConclusao = (e: EstadoSessao) => concluiu ? transicionar(e, { tipo: "CANDIDATO_CONCLUIU" }, agora).estado : e;
  const desfecho = haPerguntaAtiva ? (saida.desfecho ?? null) : null;
  const mudoOuConcluiu = (): ResultadoPerguntar => ({ ...mudo(), concluiu, desfecho, estado: comConclusao(comFala) });
  /** Silêncio, a não ser que ele tenha feito uma pergunta clara: essa nunca fica sem resposta (regra comum às salas). */
  const calar = (): ResultadoPerguntar => {
    const reserva = comRespostaDeReserva(deSaidaDoQuadro({ ...saida, responder: false, texto: "", concluiu }, situacao), situacao);
    if (!reserva.regras.length) return mudoOuConcluiu();
    log("perguntar_turno", { sessao_id: entrada.sessao_id, fase: entrada.fase, regras: reserva.regras });
    const fala = reserva.leitura.texto;
    const final = transicionar(comConclusao(comFala), { tipo: "AGENTE_FALOU", texto: fala, ...(v2 ? { perguntou: true } : {}) }, agora).estado;
    return { responder: true, texto: fala, requisito: null, concluiu, desfecho, estado: final, ...(v2 ? { perguntou: true } : {}) };
  };
  // Pedido para encerrar a entrevista: quem fecha é o quadro (com a despedida), nada mais a decidir aqui.
  if (saida.encerrar === true) return { ...mudo(), encerrar: true };
  const fasesDeDesenho = entrada.fase === "ALTO_NIVEL" || entrada.fase === "APROFUNDAMENTO" || entrada.fase === "FECHAMENTO";
  // As travas da fala são as do Totti único (lib/totti/guardas.ts), as mesmas do live coding: cumprimento fora da
  // abertura, validação, eco do que o candidato disse, reação vazia repetida e, no v2, pergunta que ele já ouviu
  // (do Totti na conversa, da análise do desenho ou da mudança no problema) ou que só devolve a condução.
  const guardada = aplicarGuardas(saida.texto, {
    falaDoCandidato: entrada.texto,
    falasDoTotti: jaDitas,
    perguntasJaFeitas: v2
      ? [
        ...estado.conversa.filter((f) => f.quem === "agente" && f.texto.includes("?")).map((f) => f.texto),
        ...estado.perguntas.flatMap((p) => [p.pergunta, ...(p.seguimentos ?? [])]),
      ]
      : undefined,
    barrarConducao: v2 && fasesDeDesenho,
  });
  if (guardada.travas.length) log("perguntar_travas", { sessao_id: entrada.sessao_id, fase: entrada.fase, travas: guardada.travas });
  const perguntaBarrada = guardada.travas.includes("pergunta_repetida") || guardada.travas.includes("pergunta_de_conducao");
  // Até 3 frases: acolher + reagir + um follow-up curto. O prompt pede falas de uma ou duas.
  const curto = limitarFrases(guardada.texto, MAX_FRASES_FALA);
  let texto: string;
  let seguimento = false;
  if (v2) {
    // No v2 quem conduz é o Conversador: depois de uma resposta ele pode puxar um fio; só "não sei"/"pula" perdem a
    // pergunta (e o convite enlatado entra apenas se não sobrar fala nenhuma).
    // (O convite enlatado, a troca da pergunta por um convite e a vez devolvida são decisões comuns às duas salas.)
    let base = curto;
    // A fala inteira era eco ou cumprimento e saiu, mas ele acabou de responder a uma pergunta do Totti e espera uma
    // reação: entra uma curta e neutra no lugar (o convite vem com a vez devolvida).
    const soEcoOuCumprimento = guardada.travas.length > 0 && guardada.travas.every((t) => t === "eco" || t === "cumprimento" || t === "validacao");
    if (saida.responder && !base && saida.texto.trim() && situacao.respondiaAoTotti && soEcoOuCumprimento) base = reacaoNeutra(jaDitas);
    // "Hm." atrás de "Hm." vira bordão na voz: a segunda reação vazia seguida fica em silêncio (a vez já é dele).
    if (eSoReacao(base) && eSoReacao(minhaUltima)) base = "";
    // "Não sei" ou "pula" não ganham pergunta nova, e quem acabou de responder a uma pergunta do Totti não ouve só
    // um "Tá." ou um fato solto: sem pergunta nem próximo passo, entra um convite.
    const decidido = decidirTurno(deSaidaDoQuadro({ ...saida, texto: base, concluiu }, situacao), situacao);
    if (decidido.regras.length) log("perguntar_turno", { sessao_id: entrada.sessao_id, fase: entrada.fase, regras: decidido.regras });
    texto = decidido.leitura.texto;
    // Ele já disse duas vezes que terminou e diz de novo: o Totti não devolve a vez com outro convite, oferece fechar.
    // (Na primeira e na segunda, a pergunta seguinte vem da análise do desenho, que roda logo depois.)
    if (concluiu && conclusoesAntes >= 2 && fasesDeDesenho && !haPerguntaAtiva) {
      // `concluiu` vai false: a oferta já é a vez dele, e nenhuma pergunta nova deve vir atrás dela.
      const final = transicionar(comFala, { tipo: "AGENTE_FALOU", texto: OFERTA_DE_ENCERRAR, perguntou: true }, agora).estado;
      return { responder: true, texto: OFERTA_DE_ENCERRAR, requisito: null, concluiu: false, desfecho, estado: final, perguntou: true };
    }
    // A fala era só a pergunta que a trava barrou (repetida ou de condução): ele fica quieto.
    if (perguntaBarrada && !texto) return calar();
    // Ele disse que terminou: a pergunta seguinte é a da análise do desenho (concreta, com a peça marcada). Um convite
    // vago aqui ("quer detalhar algo?") deixava ele sem saber o que fazer e ainda derrubava a pergunta pronta.
    if (concluiu && !texto.trim().endsWith("?") && fasesDeDesenho && !haPerguntaAtiva) {
      const aviso = AVISOS_DE_QUE_VAI_OLHAR[conclusoesAntes % AVISOS_DE_QUE_VAI_OLHAR.length];
      // A pergunta da análise vem logo atrás deste aviso (a conclusão é um marco: ver `motivoBloqueioPlin`).
      return { responder: true, texto: aviso, requisito: null, concluiu, desfecho,
        estado: transicionar(comConclusao(comFala), { tipo: "AGENTE_FALOU", texto: aviso }, agora).estado };
    }
    if (!saida.responder || !texto) return calar();
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
    if (!saida.responder || !texto) return calar();
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
