/**
 * Questão do quadro gerada para a vaga. Só servidor.
 *
 * Quando a recrutadora fecha o plano (system design), o modelo escreve um problema novo a partir da descrição
 * da vaga e do que ela combinou com o Totti. Uma questão por vaga: todo candidato da mesma vaga resolve o mesmo
 * problema, então dá para comparar. Confirmar o plano vale como aprovação humana do problema.
 *
 * Só o PROBLEMA é gerado (enunciado, fala, ficha, sinais, armadilhas). A rubrica, a persona e os tipos de
 * pergunta continuam os do kit fixo do formato, que o scorecard e o relatório já conhecem.
 *
 * A geração começa ao fechar o plano, em segundo plano. Quem cria a sessão do quadro ESPERA por ela (ou a
 * dispara, se nunca rodou: vaga antiga, função morta no meio): antes a sessão caía direto no problema fixo
 * quando o candidato entrava logo depois de a vaga ser criada, e todo mundo via o encurtador de URL. O problema
 * fixo do catálogo (`avaliacaoDoPlano`) só fica para quando a geração falha ou passa do prazo.
 */
import type { InterviewConfig } from "@/lib/contracts";
import { kvPadrao, type Kv } from "@/lib/storage/kv";
import type { LlmCliente } from "../llm/cliente";
import { ErroLlm } from "../llm/cliente";
import { avaliacaoDoPlano } from "../plano";
import {
  montarMensagemCorrecaoProblema,
  montarMensagemProblema,
  NOME_SCHEMA_PROBLEMA,
  SISTEMA_GERADOR_PROBLEMA,
} from "../prompts/gerador-problema";
import { idProblemaDaVaga } from "./gerar";
import { resolverAvaliacaoEstatica } from "./index";
import { repositorioAvaliacoesPadrao, type RepositorioAvaliacoes } from "./repositorio";
import { revisarProblema } from "./revisar";
import { Problema, type Kit } from "./tipos";
import { errosDoProblema } from "./validar";

/** Avaliação padrão do quadro, quando a config não aponta outra. */
const AVALIACAO_PADRAO = "demo";

/** Id da avaliação gerada para a config. Fixo por config: quem cria a sessão acha sem consultar outro índice. */
export const avaliacaoGeradaDaConfig = (configId: string) => `questao-${configId}`;

/** O que o modelo devolve: o problema sem id (o id sai da config, nunca do modelo). */
const ProblemaGerado = Problema.omit({ id: true });

/** Prazo de uma chamada ao modelo. São até duas (a segunda corrige o que o validador recusou). */
const TIMEOUT_PROBLEMA_MS = 60_000;
const MAX_TOKENS_PROBLEMA = 5000;
/** Uma reserva mais velha que isto é de uma geração que morreu no meio: outra pode assumir. */
const VALIDADE_RESERVA_MS = 4 * 60_000;
const NS_RESERVA = "questao-gerando";
const INTERVALO_CONSULTA_MS = 2000;

const ROTULO_FOCO: Record<InterviewConfig["focus"][number]["area"], string> = {
  tecnico: "domínio técnico",
  pressao: "como lida com pressão, imprevistos e travadas",
  escala_produto: "escala, trade-offs e evolução do produto",
  uso_ia: "uso de IA como parte da solução",
};

/** O que a recrutadora combinou, para o gerador: formato, nível, foco, critérios e notas. */
function contextoDaConfig(config: InterviewConfig): string {
  const foco = [...config.focus]
    .filter((f) => f.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((f) => `${ROTULO_FOCO[f.area]} (${Math.round(f.weight * 100)}%)`)
    .join(", ");
  const criterios = config.criteria.map((c) => `- ${c.name}: ${c.description}`).join("\n");
  return [
    "Formato: system design de SOFTWARE num quadro branco (arquitetura com caixas e setas). O problema é um sistema de software do domínio desta vaga, não um tema genérico de livro (encurtador de URL, Twitter, chat genérico).",
    `Senioridade: ${config.seniority} · duração: ${config.durationMin} min`,
    `Foco, do que mais pesa ao que menos pesa: ${foco || "sem preferência"}`,
    criterios ? `O que ela quer observar:\n${criterios}` : "",
    config.recruiterNotes.trim() ? `Notas dela: <notas>${config.recruiterNotes.trim().slice(0, 800)}</notas>` : "",
    "O que ela quer observar NÃO aparece no enunciado nem na fala do desafio: o candidato precisa chegar lá sozinho. " +
      "Use isso nos sinais esperados, nas armadilhas, nas perguntas sugeridas e na ficha (a resposta oficial quando ele perguntar).",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Kit fixo do formato da config (rubrica, persona, perguntas): o problema gerado entra nele. */
function kitBase(config: InterviewConfig): Kit {
  const alvo = resolverAvaliacaoEstatica(avaliacaoDoPlano(config) ?? AVALIACAO_PADRAO) ?? resolverAvaliacaoEstatica(AVALIACAO_PADRAO);
  if (!alvo) throw new Error("kit padrão do quadro indisponível");
  return alvo.kit;
}

/** Só vale gerar para system design com uma vaga de verdade (as configs de vitrine não têm descrição). */
export function geraQuestao(config: InterviewConfig): boolean {
  return config.mode === "system_design" && !!config.jobDescription?.trim();
}

/** Uma chamada para o problema e, se o validador recusar, uma segunda com os erros. */
export async function gerarProblema(config: InterviewConfig, llm: LlmCliente): Promise<{ problema: Problema; ms: number; modelo?: string; tentativas: number }> {
  const inicio = Date.now();
  const id = idProblemaDaVaga(config.id);
  const mensagens: { role: "user" | "assistant"; content: string }[] = [
    {
      role: "user",
      content: montarMensagemProblema(
        { cargo: config.roleTitle, descricao: config.jobDescription?.trim() || config.roleTitle },
        contextoDaConfig(config),
      ),
    },
  ];
  let erros: string[] = [];
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let modelo: string | undefined;
    try {
      const r = await llm.completarJson({
        sistema: { estatico: SISTEMA_GERADOR_PROBLEMA },
        mensagens,
        schema: ProblemaGerado,
        nomeSchema: NOME_SCHEMA_PROBLEMA,
        maxTokens: MAX_TOKENS_PROBLEMA,
        timeoutMs: TIMEOUT_PROBLEMA_MS,
      });
      modelo = r.modelo;
      const problema: Problema = { ...r.dados, id };
      erros = errosDoProblema(problema);
      if (!erros.length) return { problema, ms: Date.now() - inicio, modelo, tentativas: tentativa };
    } catch (e) {
      if (!(e instanceof ErroLlm && e.codigo === "invalido")) throw e;
      erros = [`schema: ${e.message}`];
    }
    mensagens.push(
      { role: "assistant", content: "(resposta recusada pelo validador)" },
      { role: "user", content: montarMensagemCorrecaoProblema(erros) },
    );
  }
  throw new Error(`questão da vaga ${config.id} inválida: ${erros.slice(0, 5).join("; ")}`);
}

export type DepsQuestao = { llm: LlmCliente; repositorio?: RepositorioAvaliacoes; kv?: Kv };

/**
 * Gera o problema da vaga, monta o kit (base do formato + problema novo), salva e aprova.
 * Devolve o id da avaliação, ou undefined quando a config não gera questão. Erros sobem para quem chama.
 */
export async function gerarQuestaoDaVaga(config: InterviewConfig, deps: DepsQuestao): Promise<string | undefined> {
  if (!geraQuestao(config)) return undefined;
  const repositorio = deps.repositorio ?? repositorioAvaliacoesPadrao();
  const base = kitBase(config);
  const gerado = await gerarProblema(config, deps.llm);
  // Revisão de texto (português, título, fala curta). Nunca falha nem bloqueia: sem revisão, vale o texto gerado.
  const rev = await revisarProblema(gerado.problema, deps.llm);
  const r = { ...gerado, problema: rev.problema };
  console.warn("[agente] questao_da_vaga_revisada", {
    config_id: config.id,
    aceita: rev.aceita,
    mudou: rev.mudou,
    problemas: rev.problemas.length,
    descartada: rev.descartada,
    modelo: rev.modelo,
    ms: rev.ms,
  });
  // Sem empecilho: ele é escrito à mão por problema (ver `Empecilho` em tipos.ts), e o quadro segue sem ele.
  const kit: Kit = { ...base, problemas: [r.problema] };
  const avaliacaoId = avaliacaoGeradaDaConfig(config.id);
  await repositorio.criar({ avaliacaoId, kit, problema: r.problema, vagaId: config.vagaId ?? config.id });
  await repositorio.aprovar(avaliacaoId);
  console.warn("[agente] questao_da_vaga_gerada", {
    config_id: config.id,
    avaliacao_id: avaliacaoId,
    titulo: r.problema.titulo,
    modelo: r.modelo,
    ms: r.ms,
    tentativas: r.tentativas,
  });
  return avaliacaoId;
}

/** A reserva é de outra instância: esta só espera a questão aparecer no banco. */
const OUTRA_INSTANCIA = Symbol("outra-instancia");
type Tarefa = Promise<string | undefined | typeof OUTRA_INSTANCIA>;

/** Gerações em andamento nesta instância: a sessão que chega espera a mesma promessa em vez de gerar outra. */
const CHAVE_ANDAMENTO = Symbol.for("convergechallenge.questoesEmAndamento");
function emAndamento(): Map<string, Tarefa> {
  const g = globalThis as unknown as Record<symbol, Map<string, Tarefa> | undefined>;
  return (g[CHAVE_ANDAMENTO] ??= new Map());
}

/**
 * Reserva a geração da config entre instâncias (Vercel). Falha no banco não impede gerar: no pior caso duas
 * instâncias geram, e a última a salvar vence (as duas questões servem).
 */
async function reservar(kv: Kv, configId: string, agora: number): Promise<boolean> {
  try {
    if (await kv.setIfAbsent(NS_RESERVA, configId, { desde: agora })) return true;
    const atual = await kv.get<{ desde?: number }>(NS_RESERVA, configId);
    if (atual?.desde && agora - atual.desde < VALIDADE_RESERVA_MS) return false;
    await kv.set(NS_RESERVA, configId, { desde: agora });
    return true;
  } catch (e) {
    console.warn("[agente] reserva da questão da vaga falhou; gera assim mesmo:", e instanceof Error ? e.message : e);
    return true;
  }
}

const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** A promessa até `ms`; passou do prazo (ou falhou), undefined. A promessa segue rodando. */
function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolver) => {
    const t = setTimeout(() => resolver(undefined), Math.max(0, ms));
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      () => {
        clearTimeout(t);
        resolver(undefined);
      },
    );
  });
}

/**
 * Garante a questão da vaga: devolve a que já existe; senão espera a geração em andamento (nesta ou em outra
 * instância) ou começa uma. Espera no máximo `esperarMs`; passou disso ou a geração falhou, undefined.
 */
export async function garantirQuestaoDaVaga(
  config: InterviewConfig,
  deps: DepsQuestao,
  opcoes: { esperarMs: number },
): Promise<string | undefined> {
  if (!geraQuestao(config)) return undefined;
  const repositorio = deps.repositorio ?? repositorioAvaliacoesPadrao();
  const kv = deps.kv ?? kvPadrao();
  const avaliacaoId = avaliacaoGeradaDaConfig(config.id);
  const pronta = async () => {
    const r = await repositorio.obter(avaliacaoId).catch(() => undefined);
    return r?.aprovado ? r.avaliacaoId : undefined;
  };

  const ja = await pronta();
  if (ja) return ja;
  const limite = Date.now() + opcoes.esperarMs;

  // Consulta e registro no mesmo tique (sem await no meio): duas chamadas juntas aqui dividem a mesma tarefa.
  const andamento = emAndamento();
  let tarefa = andamento.get(config.id);
  if (!tarefa) {
    tarefa = (async (): Promise<string | undefined | typeof OUTRA_INSTANCIA> => {
      if (!(await reservar(kv, config.id, Date.now()))) return OUTRA_INSTANCIA;
      try {
        return await gerarQuestaoDaVaga(config, { ...deps, repositorio });
      } catch (err) {
        console.error(`[agente] questão da vaga ${config.id} não foi gerada; o quadro usa o problema fixo:`, err);
        return undefined;
      } finally {
        void kv.delete(NS_RESERVA, config.id).catch(() => {});
      }
    })().finally(() => andamento.delete(config.id));
    andamento.set(config.id, tarefa);
  }
  const r = await comPrazo(tarefa, limite - Date.now());
  if (r !== OUTRA_INSTANCIA) return r;

  // Outra instância está gerando: espera ela salvar.
  while (Date.now() < limite) {
    await dormir(Math.min(INTERVALO_CONSULTA_MS, Math.max(0, limite - Date.now())));
    const id = await pronta();
    if (id) return id;
  }
  return undefined;
}

/**
 * Avaliação que a sessão do quadro usa para a config: a questão gerada da vaga (esperando por ela até
 * `esperarMs` quando há um modelo para gerar); senão, o problema fixo escolhido pelo catálogo.
 * Config que não aponta nada: undefined.
 */
export async function avaliacaoDaConfig(
  config: InterviewConfig,
  deps: { llm?: LlmCliente | null; repositorio?: RepositorioAvaliacoes; kv?: Kv; esperarMs?: number } = {},
): Promise<string | undefined> {
  if (geraQuestao(config)) {
    const repositorio = deps.repositorio ?? repositorioAvaliacoesPadrao();
    const gerada = deps.llm
      ? await garantirQuestaoDaVaga(config, { llm: deps.llm, repositorio, kv: deps.kv }, { esperarMs: deps.esperarMs ?? 0 })
      : await repositorio
          .obter(avaliacaoGeradaDaConfig(config.id))
          .then((r) => (r?.aprovado ? r.avaliacaoId : undefined))
          .catch(() => undefined);
    if (gerada) return gerada;
  }
  return avaliacaoDoPlano(config);
}
