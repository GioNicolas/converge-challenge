// O fechamento comum do Totti (lib/totti/fechamento.ts) guardado na sessão do quadro.
//
// O núcleo decide a sequência e as falas (anúncio → perguntas finais → última palavra → despedida). Aqui fica só o
// que é do quadro: como o fechamento é guardado no estado da sessão, o que conta como "o caminho principal está
// desenhado" e o que conta como "ele voltou a desenhar de verdade" (peças novas no grafo, não um elemento movido nem
// o mesmo desenho mandado de novo). Funções puras, sem I/O e sem importar a máquina de estados.
import { aoVoltarATrabalhar, type EstadoFechamento } from "../../totti/fechamento";
import type { Fase } from "./tipos";

/** O fechamento em andamento na sessão do quadro. Só dados: vai para o banco com o resto do estado. */
export type FechamentoDaSessao = {
  /** O estado da sequência comum (lib/totti/fechamento.ts). */
  nucleo: EstadoFechamento;
  /**
   * O estado da sequência antes do último turno do candidato. Se a fala seguinte SUBSTITUI a anterior (ele continuou
   * antes de ouvir a resposta), o passo recomeça daqui, para a pergunta que ele não ouviu não ser pulada.
   * null: o último turno foi o que começou o fechamento (desfazer é voltar a antes dele).
   */
  antes: EstadoFechamento | null;
  iniciadoEm: number;
  /** A fase em que a entrevista estava, e desde quando: é para onde ela volta se ele retomar o desenho. */
  faseAnterior: Fase;
  faseAnteriorIniciadaEm: number | null;
};

/** O desenho como estava quando ele disse que terminou (ou quando o fechamento começou). */
export type DesenhoConcluido = {
  em: number;
  /** Ids das peças (componentes e conexões) do grafo naquele momento. null: o grafo não veio inteiro, não dá para comparar. */
  pecas: string[] | null;
};

/** O `/perguntar` manda o grafo cortado neste tamanho: um grafo cortado não serve de base para comparar. */
const MAX_GRAFO_COMPARAVEL = 24_000;
/** Peças do caminho principal: pelo menos três componentes ligados por duas conexões (cliente → serviço → dados). */
export const MIN_COMPONENTES_DO_CAMINHO = 3;
export const MIN_CONEXOES_DO_CAMINHO = 2;
/** Peças novas a partir das quais ele voltou a desenhar (um ajuste solto enquanto responde não é retomar o desenho). */
export const MIN_PECAS_PARA_VOLTAR = 2;

/** Os ids das linhas "- [id]" das seções COMPONENTES e CONEXÕES do grafo em texto. */
function pecasPorSecao(grafo: string): { componentes: string[]; conexoes: string[]; ligadas: string[] } {
  const componentes: string[] = [];
  const conexoes: string[] = [];
  /** Conexões que ligam duas peças (a seta solta ainda não liga nada). */
  const ligadas: string[] = [];
  let secao = "";
  for (const linha of grafo.split("\n")) {
    const t = linha.trim();
    if (!t.startsWith("-")) {
      secao = t;
      continue;
    }
    const id = /^- \[([^\]]+)\]/.exec(t)?.[1];
    if (!id) continue;
    if (secao === "COMPONENTES") componentes.push(id);
    else if (secao === "CONEXÕES") {
      conexoes.push(id);
      if (!t.includes("(seta solta")) ligadas.push(id);
    }
  }
  return { componentes, conexoes, ligadas };
}

/** As peças do desenho (componentes e conexões), para comparar depois. null quando o grafo pode ter vindo cortado. */
export function pecasDoGrafo(grafo: string | undefined): string[] | null {
  if (grafo === undefined || grafo.length >= MAX_GRAFO_COMPARAVEL) return null;
  const { componentes, conexoes } = pecasPorSecao(grafo);
  return [...new Set([...componentes, ...conexoes])];
}

/** O caminho principal está no quadro: há componentes ligados o bastante para se falar do desenho como um todo. */
export function caminhoPrincipalDesenhado(grafo: string | undefined): boolean {
  if (!grafo) return false;
  const { componentes, ligadas } = pecasPorSecao(grafo);
  return new Set(componentes).size >= MIN_COMPONENTES_DO_CAMINHO && new Set(ligadas).size >= MIN_CONEXOES_DO_CAMINHO;
}

/**
 * Ele voltou a desenhar de verdade desde a conclusão: entraram peças novas no grafo. Mover, redimensionar ou
 * renomear uma peça não cria id novo, e o mesmo desenho mandado de novo (o evento repetido com a imagem, a análise
 * seguinte) tem as mesmas peças: nada disso conta.
 */
export function voltouADesenhar(concluido: DesenhoConcluido | null | undefined, grafo: string | undefined): boolean {
  const atuais = pecasDoGrafo(grafo);
  if (!concluido?.pecas || !atuais) return false;
  const antes = new Set(concluido.pecas);
  return atuais.filter((id) => !antes.has(id)).length >= MIN_PECAS_PARA_VOLTAR;
}

/** O fechamento está em andamento (a sequência começou e ainda não foi suspensa). */
export function fechamentoAtivo(estado: { fechamento?: FechamentoDaSessao | null }): boolean {
  return !!estado.fechamento;
}

/** O fechamento ainda aceita ser suspenso: na despedida (e depois dela) já não há volta. */
export function fechamentoPodeSerSuspenso(fechamento: FechamentoDaSessao): boolean {
  return aoVoltarATrabalhar(fechamento.nucleo) === null;
}
