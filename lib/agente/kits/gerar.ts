/**
 * Gerador de kits: vaga (+ plano) -> Kit de avaliação, para qualquer área.
 *
 * UMA chamada ao LLM (raciocínio ligado, saída grande, timeout longo) + validação determinística
 * (./validar.ts). Se inválido: UM retry devolvendo os erros ao modelo; depois, erro tipado.
 * O modelo NUNCA define ids que o servidor usa: kit.id e problema.id saem do id da vaga.
 */
import { ErroLlm, type LlmCliente } from "../llm/cliente";
import type { InterviewPlan, JobPosting } from "../../hiring/job-posting";
import {
  montarMensagemCorrecao,
  montarMensagemVaga,
  NOME_SCHEMA_KIT,
  SISTEMA_GERADOR_KIT,
} from "../prompts/gerador-kit";
import { Kit } from "./tipos";
import { paraSlug, validarKit } from "./validar";

/** Padrão: o melhor modelo disponível. Se o id não existir na OpenRouter, use o fallback abaixo. */
export const MODELO_FINAL_PADRAO = "anthropic/claude-opus-5.5";
/** Fallback documentado (AGENTE_MODELO_FINAL=anthropic/claude-sonnet-5.5): usado automaticamente se o padrão devolver 400/404. */
export const MODELO_FINAL_FALLBACK = "anthropic/claude-sonnet-5.5";
export const MAX_TOKENS_KIT = 12000;
export const TIMEOUT_KIT_MS = 150_000; // medido: opus-5.5 com raciocínio levou ~100 s

export type CodigoErroGeracao = "invalido" | "llm";

/** Erro tipado: `invalido` = o kit não passou na validação nem após o retry; `llm` = falha de transporte. */
export class ErroGeracaoKit extends Error {
  constructor(
    readonly codigo: CodigoErroGeracao,
    mensagem: string,
    readonly erros: string[] = [],
    readonly causa?: ErroLlm,
  ) {
    super(mensagem);
    this.name = "ErroGeracaoKit";
  }
}

export type ArgsGerarKit = {
  llm: LlmCliente;
  vaga: JobPosting;
  plano?: InterviewPlan;
  modelo?: string;
  sinal?: AbortSignal;
  timeoutMs?: number;
};

export type UsoGeracao = { entrada: number; saida: number; custo?: number };

export type ResultadoGeracao = {
  kit: Kit;
  avisos: string[];
  modelo: string;
  tentativas: number;
  ms: number;
  uso: UsoGeracao;
  /** Erros do validador na 1ª tentativa (vazio se passou de primeira). */
  errosPrimeiraTentativa: string[];
};

export const idKitDaVaga = (vagaId: string) => paraSlug(vagaId, "vaga");
export const idProblemaDaVaga = (vagaId: string) => `${idKitDaVaga(vagaId)}_p1`.slice(0, 64);

/** Impõe os ids do servidor (o modelo não escolhe ids que viram chave/URL). */
export function imporIds(kit: Kit, vagaId: string): Kit {
  const id = idKitDaVaga(vagaId);
  const p = kit.problemas[0];
  return { ...kit, id, problemas: p ? [{ ...p, id: idProblemaDaVaga(vagaId) }, ...kit.problemas.slice(1)] : kit.problemas };
}

/** AGENTE_TIMEOUT_KIT_MS sobrescreve o padrão (150 s) — útil para modelos mais lentos. */
export function timeoutKit(): number {
  const n = Number(process.env.AGENTE_TIMEOUT_KIT_MS);
  return Number.isFinite(n) && n >= 10_000 ? n : TIMEOUT_KIT_MS;
}

export function modeloFinal(): string {
  return process.env.AGENTE_MODELO_FINAL?.trim() || MODELO_FINAL_PADRAO;
}

export async function gerarKitDetalhado(args: ArgsGerarKit): Promise<ResultadoGeracao> {
  const { llm, vaga, plano } = args;
  let modelo = args.modelo ?? modeloFinal();
  const podeFallback = !args.modelo && !process.env.AGENTE_MODELO_FINAL?.trim();
  const inicio = Date.now();
  const uso: UsoGeracao = { entrada: 0, saida: 0 };
  const mensagens: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: montarMensagemVaga(vaga, plano) },
  ];
  let errosPrimeira: string[] = [];
  let ultimosErros: string[] = [];

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let dados: Kit;
    try {
      const chamar = () =>
        llm.completarJson({
          sistema: { estatico: SISTEMA_GERADOR_KIT },
          mensagens,
          schema: Kit,
          nomeSchema: NOME_SCHEMA_KIT,
          modelo,
          maxTokens: MAX_TOKENS_KIT,
          raciocinio: true,
          timeoutMs: args.timeoutMs ?? timeoutKit(),
          sinal: args.sinal,
        });
      let r;
      try {
        r = await chamar();
      } catch (e) {
        if (podeFallback && e instanceof ErroLlm && e.codigo === "http" && (e.status === 400 || e.status === 404)) {
          modelo = MODELO_FINAL_FALLBACK;
          r = await chamar();
        } else throw e;
      }
      uso.entrada += r.uso?.entrada ?? 0;
      uso.saida += r.uso?.saida ?? 0;
      if (r.uso?.custo !== undefined) uso.custo = (uso.custo ?? 0) + r.uso.custo;
      dados = r.dados;
    } catch (e) {
      if (e instanceof ErroLlm && e.codigo === "invalido") {
        // Saída fora do schema: conta como tentativa inválida e usa o erro como feedback.
        ultimosErros = [`schema: ${e.message}`];
        if (tentativa === 1) errosPrimeira = ultimosErros;
        mensagens.push(
          { role: "assistant", content: "(resposta fora do schema)" },
          { role: "user", content: montarMensagemCorrecao(ultimosErros) },
        );
        continue;
      }
      if (e instanceof ErroLlm) throw new ErroGeracaoKit("llm", `falha ao chamar o LLM (${e.codigo})`, [], e);
      throw e;
    }

    const kit = imporIds(dados, vaga.id);
    const v = validarKit(kit);
    if (v.ok) {
      return {
        kit: v.kit,
        avisos: v.avisos,
        modelo,
        tentativas: tentativa,
        ms: Date.now() - inicio,
        uso,
        errosPrimeiraTentativa: errosPrimeira,
      };
    }
    ultimosErros = v.erros;
    if (tentativa === 1) errosPrimeira = v.erros;
    mensagens.push(
      { role: "assistant", content: JSON.stringify(dados) },
      { role: "user", content: montarMensagemCorrecao(v.erros) },
    );
  }
  throw new ErroGeracaoKit(
    "invalido",
    `kit gerado inválido após 2 tentativas (${ultimosErros.length} violações)`,
    ultimosErros,
  );
}

export async function gerarKit(args: ArgsGerarKit): Promise<Kit> {
  return (await gerarKitDetalhado(args)).kit;
}
