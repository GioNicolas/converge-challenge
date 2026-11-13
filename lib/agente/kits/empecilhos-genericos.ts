/**
 * Mudanças genéricas do kit de system design: a reserva quando o problema não tem uma (a questão da vaga não
 * trouxe, ou a que trouxe não passou nas regras de `validar.ts`). A escolha é feita na hora da mudança, pela
 * cobertura da entrevista, para testar o que ainda não apareceu. Texto sem domínio: serve a qualquer sistema.
 * Só servidor.
 */
import type { Empecilho, Kit, Problema } from "./tipos";

/** Kits que têm mudanças genéricas. Nos outros, problema sem mudança prevista segue sem mudança. */
export const KITS_COM_EMPECILHO_GENERICO: readonly string[] = ["system_design", "system_design_ia"];

export const EMPECILHOS_GENERICOS: Record<"volume" | "dependencia" | "orcamento", Empecilho> = {
  volume: {
    id: "generico_volume_10x",
    tipo: "requisito_muda",
    fala:
      "Uma mudança no problema: o volume cresceu dez vezes, e a resposta tem que continuar rápida do mesmo jeito. Olhando o que você já desenhou, onde isso pega primeiro?",
    requisito: "Mudança: volume 10x",
    exige:
      "Rever gargalos com dez vezes mais carga: escrita e leitura, particionamento ou réplicas, cache, e o que hoje é síncrono e pode virar fila.",
  },
  dependencia: {
    id: "generico_dependencia_fora",
    tipo: "parte_cai",
    fala:
      "Uma mudança no problema: um serviço externo de que o sistema depende ficou fora do ar por uns dez minutos, sem aviso, e nada pode se perder nem ser feito duas vezes. No que você desenhou, o que acontece nesse intervalo?",
    requisito: "Mudança: serviço externo cai por 10 min",
    exige:
      "Tratar a falha de uma dependência: tempo limite, nova tentativa segura (idempotência), fila para o que não pode esperar, estado pendente visível e reconciliação depois.",
  },
  orcamento: {
    id: "generico_orcamento_metade",
    tipo: "restricao_nova",
    fala:
      "Uma mudança no problema: o orçamento de infraestrutura foi cortado pela metade, e o volume continua o mesmo. O que você mexeria primeiro no seu desenho?",
    requisito: "Restrição: orçamento cai 50%",
    exige:
      "Reduzir custo sem perder o essencial: menos réplicas e armazenamento, dados frios em outro lugar, cache, processamento em lote e o que pode ser assíncrono; dizer o que se sacrifica.",
  },
};

/**
 * A genérica para a cobertura no momento: sem evidência de escalabilidade, o volume 10x; senão, sem evidência de
 * dados e consistência, a dependência fora do ar; senão, sem evidência de trade-offs, o orçamento pela metade.
 * Sem nenhuma pista, o volume 10x. Função pura: `semEvidencia` são os ids dos critérios sem evidência
 * (`criteriosSemEvidencia`, lib/agente/sessao/estado.ts).
 */
export function escolherEmpecilhoGenerico(semEvidencia: string[]): Empecilho {
  const falta = new Set(semEvidencia);
  if (falta.has("escalabilidade")) return EMPECILHOS_GENERICOS.volume;
  if (falta.has("dados_consistencia")) return EMPECILHOS_GENERICOS.dependencia;
  if (falta.has("tradeoffs")) return EMPECILHOS_GENERICOS.orcamento;
  return EMPECILHOS_GENERICOS.volume;
}

/** A entrevista tem uma mudança para trazer: a do problema, ou uma genérica do kit. */
export function temMudancaPrevista(kit: Pick<Kit, "id">, problema: Pick<Problema, "empecilho">): boolean {
  return !!problema.empecilho || KITS_COM_EMPECILHO_GENERICO.includes(kit.id);
}
