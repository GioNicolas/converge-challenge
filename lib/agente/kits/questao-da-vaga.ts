/**
 * Questão do quadro gerada para a vaga. Só servidor.
 *
 * Quando a recrutadora fecha o plano (system design), o gerador de kits escreve um problema novo a partir da
 * descrição da vaga e do que ela combinou com o Totti. Uma questão por vaga: todo candidato da mesma vaga resolve
 * o mesmo problema, então dá para comparar. Confirmar o plano vale como aprovação humana do problema.
 *
 * Do kit gerado só fica o PROBLEMA (enunciado, fala, ficha, sinais, armadilhas). A rubrica, a persona e os tipos
 * de pergunta continuam os do kit fixo do formato, que o scorecard e o relatório já conhecem.
 *
 * A geração leva ~100 s. Enquanto ela não termina (ou se falhar), a sessão usa o problema fixo de antes
 * (`avaliacaoDoPlano`): o candidato nunca espera nem fica sem entrevista.
 */
import type { InterviewConfig } from "@/lib/contracts";
import { JobPosting } from "../../hiring/job-posting";
import type { LlmCliente } from "../llm/cliente";
import { avaliacaoDoPlano } from "../plano";
import { gerarKitDetalhado, idProblemaDaVaga } from "./gerar";
import { resolverAvaliacaoEstatica } from "./index";
import { repositorioAvaliacoesPadrao, type RepositorioAvaliacoes } from "./repositorio";
import type { Kit } from "./tipos";

/** Avaliação padrão do quadro, quando a config não aponta outra. */
const AVALIACAO_PADRAO = "demo";

/** Id da avaliação gerada para a config. Fixo por config: quem cria a sessão acha sem consultar outro índice. */
export const avaliacaoGeradaDaConfig = (configId: string) => `questao-${configId}`;

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

/** A vaga no formato do gerador. A pré-entrevista só tem o cargo e o texto colado. */
function vagaDaConfig(config: InterviewConfig): JobPosting {
  return JobPosting.parse({
    id: config.id,
    title: config.roleTitle,
    seniority: config.seniority,
    description: config.jobDescription?.trim() || config.roleTitle,
    responsibilities: [],
    requirements: [],
    stack: [],
  });
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

export type DepsQuestao = { llm: LlmCliente; repositorio?: RepositorioAvaliacoes };

/**
 * Gera o problema da vaga, monta o kit (base do formato + problema novo), salva e aprova.
 * Devolve o id da avaliação, ou undefined quando a config não gera questão. Erros sobem para quem chama.
 */
export async function gerarQuestaoDaVaga(config: InterviewConfig, deps: DepsQuestao): Promise<string | undefined> {
  if (!geraQuestao(config)) return undefined;
  const repositorio = deps.repositorio ?? repositorioAvaliacoesPadrao();
  const base = kitBase(config);
  const r = await gerarKitDetalhado({ llm: deps.llm, vaga: vagaDaConfig(config), contexto: contextoDaConfig(config) });
  const gerado = r.kit.problemas[0];
  // Sem empecilho: ele é escrito à mão por problema (ver `Empecilho` em tipos.ts), e o quadro segue sem ele.
  const problema = { ...gerado, id: idProblemaDaVaga(config.id) };
  const kit: Kit = {
    ...base,
    termosTranscricao: [...new Set([...base.termosTranscricao, ...r.kit.termosTranscricao])].slice(0, 80),
    problemas: [problema],
  };
  const avaliacaoId = avaliacaoGeradaDaConfig(config.id);
  await repositorio.criar({ avaliacaoId, kit, problema, vagaId: config.vagaId ?? config.id });
  await repositorio.aprovar(avaliacaoId);
  console.warn("[agente] questao_da_vaga_gerada", {
    config_id: config.id,
    avaliacao_id: avaliacaoId,
    titulo: problema.titulo,
    modelo: r.modelo,
    ms: r.ms,
    tentativas: r.tentativas,
  });
  return avaliacaoId;
}

/**
 * Avaliação que a sessão do quadro usa para a config: a questão gerada da vaga, se já existe e está aprovada;
 * senão, o problema fixo escolhido pelo catálogo. Config que não aponta nada: undefined.
 */
export async function avaliacaoDaConfig(
  config: InterviewConfig,
  repositorio: RepositorioAvaliacoes = repositorioAvaliacoesPadrao(),
): Promise<string | undefined> {
  if (geraQuestao(config)) {
    const gerada = await repositorio.obter(avaliacaoGeradaDaConfig(config.id)).catch(() => undefined);
    if (gerada?.aprovado) return gerada.avaliacaoId;
  }
  return avaliacaoDoPlano(config);
}
