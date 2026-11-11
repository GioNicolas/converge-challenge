/**
 * Banco de perguntas do Totti para a recrutadora: perguntas que DECIDEM algo da entrevista.
 *
 * O catálogo (`catalogo.ts`) já diz o que é bom e ruim em cada área ("mantém a calma quando trava"). Perguntar isso de
 * novo à recrutadora ("o que separa um ótimo de um fraco em pressão?") só rende o óbvio ("ter calma"), e a resposta não
 * muda nada. Aqui cada pergunta é uma escolha entre duas posturas legítimas, em que times diferentes respondem
 * diferente, e a resposta muda o peso ou a descrição de um critério, o tom ou as dicas. A linguagem é de RH: sem jargão
 * (complexidade, casos de borda, big O), porque a recrutadora quase nunca é técnica.
 *
 * O modelo escolhe e adapta uma delas à vaga; se a fala dele sair no molde tautológico, o código usa a do banco
 * (ver `perguntaObvia` e `conversa.ts`).
 */
import type { FocusArea, InterviewConfig, InterviewMode } from "@/lib/contracts";

export interface PerguntaDecisiva {
  id: string;
  /** A pergunta, pronta para ser falada. O modelo pode adaptar com as palavras da vaga. */
  texto: string;
  /** Só para estes níveis. Sem nada, vale para todos. */
  niveis?: InterviewConfig["seniority"][];
  /** Se a vaga ou a fala dela tem estes termos, a pergunta vem primeiro. */
  puxadaPor?: RegExp;
}

export const PERGUNTAS: Record<InterviewMode, Partial<Record<FocusArea, PerguntaDecisiva[]>>> = {
  live_coding: {
    tecnico: [
      {
        id: "terminar_ou_explicar",
        texto: "Se o tempo acabar, o que conta mais pra você: ele ter uma solução funcionando, ou ter explicado bem o caminho mesmo sem terminar?",
      },
      {
        id: "pedir_ajuda",
        texto: "Pra esse nível, quando ele trava e pede ajuda, isso conta a favor ou contra ele?",
        niveis: ["junior", "pleno"],
        puxadaPor: /aprender|ajuda|pair|mentor|j[uú]nior|est[aá]gio/i,
      },
      {
        id: "simples_primeiro",
        texto: "Tudo bem ele começar por uma solução simples e mais lenta e melhorar depois, ou você quer ver ele buscar a melhor solução logo de cara?",
        niveis: ["pleno", "senior"],
      },
      {
        id: "testar_sozinho",
        texto: "Você quer que ele teste o próprio código sem ninguém pedir, ou tudo bem o entrevistador lembrar de testar?",
        puxadaPor: /testes?|qualidade|bugs?/i,
      },
    ],
    escala_produto: [
      {
        id: "custo_ou_otima",
        texto: "Basta ele saber dizer se a solução fica lenta com muitos dados e como melhoraria, ou ele precisa chegar na versão mais rápida?",
      },
    ],
    pressao: [
      {
        id: "mudar_requisito",
        texto: "Quer que o entrevistador mude uma regra do problema no meio pra ver como ele se adapta, ou prefere sem esse tipo de surpresa?",
        puxadaPor: /prioridades? mud|ambigu|startup|ritmo|r[aá]pid/i,
      },
      {
        id: "travar_sozinho",
        texto: "Quando ele travar, você prefere ver ele insistir sozinho por um tempo, ou pedir uma dica cedo e seguir?",
      },
    ],
  },
  system_design: {
    tecnico: [
      {
        id: "levantar_escopo",
        texto: "Você quer que ele descubra sozinho o que o sistema precisa fazer, ou pode receber o escopo pronto e ir direto pro desenho?",
      },
      {
        id: "largura_ou_fundo",
        texto: "Prefere que ele passe pelo sistema inteiro por alto, ou que aprofunde bem a parte mais crítica?",
        niveis: ["senior"],
      },
    ],
    escala_produto: [
      {
        id: "o_que_nao_pode_falhar",
        texto: "Nesse sistema, o que é pior: perder ou duplicar um dado, ou o sistema ficar fora do ar por um tempo?",
        puxadaPor: /pagamento|pedido|transa|financ|consist|sincroniz|offline/i,
      },
      {
        id: "contas_de_volume",
        texto: "Você quer ver ele fazer contas de volume antes de desenhar, ou basta ele raciocinar sobre o pico de uso?",
        puxadaPor: /milh[õo]es|volume|pico|escala/i,
      },
    ],
    pressao: [
      {
        id: "questionar_firme",
        texto: "Quer que o entrevistador questione as decisões dele com firmeza, ou só peça pra ele justificar as escolhas?",
      },
    ],
    uso_ia: [
      {
        id: "profundidade_ia",
        texto: "Basta ele mostrar onde a IA entra no desenho, ou você quer que ele detalhe como evita resposta errada e controla o custo?",
      },
    ],
  },
};

/** Perguntas da área, as que a vaga ou a fala dela puxam primeiro. Filtra pelo nível. Função pura. */
export function perguntasDaArea(
  modo: InterviewMode,
  area: FocusArea,
  nivel: InterviewConfig["seniority"],
  texto: string,
): PerguntaDecisiva[] {
  const todas = (PERGUNTAS[modo][area] ?? []).filter((p) => !p.niveis || p.niveis.includes(nivel));
  const puxada = (p: PerguntaDecisiva) => Number(Boolean(p.puxadaPor?.test(texto)));
  return [...todas].sort((a, b) => puxada(b) - puxada(a));
}

/**
 * Pergunta de contexto: o que a vaga não diz e só a recrutadora sabe. A resposta vira eliminatório ou contexto
 * nas notas do entrevistador (ver `extrator.ts` e `guia.ts`). É aberta: "Tem alguma coisa que...?" convidava um "Tem" seco.
 */
export const PERGUNTA_CONTEXTO =
  "O que reprova um candidato direto pra vocês, ou o que fez uma contratação passada não dar certo?";

/**
 * Ela disse que existe algo (que reprova direto, ou que deu errado numa contratação), sem dizer o quê: o Totti pergunta
 * só qual é (passo `pedir_o_que_faltou`). Cobre as duas metades da pergunta de contexto: "já aconteceu" fala da contratação.
 */
export const PERGUNTA_O_QUE_REPROVA = "E o que é: o que reprova direto, ou o que deu errado?";

/** Resposta vaga a um aprofundamento: sem pergunta na fala do modelo, o Totti pede um exemplo (passo `pedir_o_que_faltou`). */
export const PERGUNTA_EXEMPLO = "Pode me dar um exemplo de como isso apareceria na entrevista?";

/**
 * Molde de pergunta que só rende o óbvio: "o que separa / diferencia um ótimo de um fraco", "o que faz você achar
 * ótimo", "o que destaca". Comparado sem acento e sem caixa.
 */
const MOLDE_OBVIO =
  /\bo que (separa|diferencia|distingue|destaca|define|faz (voce|vc) (achar|considerar))\b|\b(otimo|excelente|bom|forte)\b[^?]{0,40}\b(fraco|mediano|comum|ruim|so bom|nao so bom)\b/;

/** A fala do Totti caiu no molde da pergunta óbvia? Função pura. */
export function perguntaObvia(fala: string): boolean {
  const sem = fala
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const pergunta = sem.match(/[^.!?]*\?/g)?.join(" ") ?? "";
  return MOLDE_OBVIO.test(pergunta);
}
