/**
 * O que muda na próxima entrevista quando a memória da squad ganha uma regra num critério. Só texto, sem estado:
 * a tela do cliente também usa (Plano combinado e a aba Contratações).
 */
import { nomeDoCriterio } from "@/lib/squad-memory/criterios";
import type { RegraSquad } from "@/lib/squad-memory/tipos";

/**
 * Por critério: o que cobrar quando a entrevista foi branda (`rigor`) ou dar crédito quando foi dura (`credito`),
 * e o que muda na próxima entrevista, em uma frase.
 */
export const MUDANCA: Record<string, { rigor: string; cobra: string; credito: string; valoriza: string }> = {
  abordagem: {
    rigor: "começar a codar sem explicar o plano",
    cobra: "pede o plano antes do código e cobra a justificativa",
    credito: "plano bem explicado, mesmo sem terminar o código",
    valoriza: "dá mais peso ao plano explicado do que ao código completo",
  },
  complexidade: {
    rigor: "complexidade dita sem justificar",
    cobra: "pede para justificar a complexidade apontando o código",
    credito: "quem melhora a solução depois de uma dica",
    valoriza: "conta como bom sinal chegar na solução melhor depois de uma dica",
  },
  corretude: {
    rigor: "código que só passa no exemplo",
    cobra: "só dá nota alta depois dos testes escondidos",
    credito: "solução simples e correta antes da otimizada",
    valoriza: "valoriza a solução correta antes da otimizada",
  },
  bordas: {
    rigor: "caso de borda só citado, sem teste",
    cobra: "pede para escrever o teste do caso de borda: não basta citar",
    credito: "quem testa casos de borda sem ninguém pedir",
    valoriza: "conta o teste de borda que ele escreve por conta própria",
  },
  comunicacao: {
    rigor: "explicação vaga do próprio código",
    cobra: "pede para explicar uma decisão do código com as palavras dele",
    credito: "quem explica bem mesmo travado",
    valoriza: "dá crédito à explicação clara mesmo quando o código trava",
  },
  pressao_adaptacao: {
    rigor: "travar na mudança sem pedir ajuda",
    cobra: "traz a mudança no meio mais cedo e observa a reação",
    credito: "quem se adapta rápido à mudança",
    valoriza: "dá mais peso à adaptação do que à primeira solução",
  },
  requisitos: {
    rigor: "desenhar sem perguntar os requisitos",
    cobra: "segura o desenho até ele perguntar escala e uso",
    credito: "quem fecha o escopo antes de desenhar",
    valoriza: "dá crédito a quem fecha o escopo antes de desenhar",
  },
  estimativa: {
    rigor: "escolher componente sem estimar o volume",
    cobra: "pede a conta de volume antes de aceitar o banco ou a fila",
    credito: "quem faz a conta de volume, mesmo aproximada",
    valoriza: "dá crédito à conta de volume, mesmo aproximada",
  },
  componentes: {
    rigor: "componentes sem o caminho dos dados",
    cobra: "pede o caminho de uma requisição de ponta a ponta",
    credito: "desenho simples com o fluxo claro",
    valoriza: "valoriza o desenho simples com o fluxo claro",
  },
  tradeoffs: {
    rigor: "escolha sem dizer o que perde",
    cobra: "pergunta o que ele perde com cada escolha",
    credito: "quem assume o que perde em cada escolha",
    valoriza: "dá crédito a quem assume o que perde em cada escolha",
  },
  gargalos_falhas: {
    rigor: "ignorar o que acontece quando um componente cai",
    cobra: "pergunta o que acontece quando um componente cai",
    credito: "quem pensa em falha sem ninguém perguntar",
    valoriza: "conta o plano de falha que ele traz sozinho",
  },
  uso_ia_criterio: {
    rigor: "aceitar a resposta da IA sem conferir",
    cobra: "pede para ele conferir o que a IA sugeriu",
    credito: "quem confere e corrige o que a IA sugere",
    valoriza: "dá crédito a quem confere o que a IA sugere",
  },
};

/** O que muda na próxima entrevista com esta regra, para a tela: "Casos de borda · mais rigor" + a frase. */
export function mudancaDaRegra(r: Pick<RegraSquad, "criterio" | "efeito">): {
  criterio: string;
  manchete: string;
  naEntrevista: string;
} {
  const m = MUDANCA[r.criterio];
  const criterio = nomeDoCriterio(r.criterio);
  return r.efeito === "penaliza"
    ? { criterio, manchete: "mais rigor", naEntrevista: m?.cobra ?? `cobra mais ${criterio.toLowerCase()}` }
    : { criterio, manchete: "mais crédito", naEntrevista: m?.valoriza ?? `dá mais crédito a ${criterio.toLowerCase()}` };
}
