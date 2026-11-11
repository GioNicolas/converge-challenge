// Kit determinístico para o modo fake (AGENTE_FAKE=1, scripts --fake, testes). Genérico de propósito:
// só prova o encanamento (geração -> validação -> repositório -> sessão), não a qualidade do conteúdo.
import { NOME_SCHEMA_KIT } from "../prompts/gerador-kit";
import type { Kit } from "./tipos";

const niveis = (c: string) => ({
  1: `${c}: não aborda o ponto`,
  2: `${c}: aborda só quando provocado, de forma superficial`,
  3: `${c}: aborda com clareza e justifica`,
  4: `${c}: aborda espontaneamente, compara alternativas e antecipa riscos`,
});

export function kitFalso(titulo = "a vaga"): Kit {
  const criterios = [
    ["entendimento_problema", "Entendimento do problema e requisitos"],
    ["estrutura_raciocinio", "Estrutura do raciocínio"],
    ["tradeoffs_priorizacao", "Trade-offs e priorização"],
    ["comunicacao", "Comunicação"],
    ["dominio_da_area", "Domínio da área"],
    ["gestao_de_riscos", "Gestão de riscos"],
  ].map(([id, nome]) => ({ id, nome, niveis: niveis(nome) }));
  return {
    id: "kit_falso",
    area: `área de ${titulo}`,
    persona: `especialista sênior em ${titulo}`,
    tipoEntrevista: `desafio de ${titulo}`,
    modoLeitura: "grafo",
    criterios,
    tiposPergunta: ["Por quê", "E se", "Prioridade", "Risco"].map((nome) => ({
      nome,
      exemplo: `${nome}: o que muda se isso falhar?`,
      revela: "Raciocínio por trás da escolha",
    })),
    termosTranscricao: ["fluxo", "prazo", "risco", "prioridade", "lead time", "stakeholder"],
    problemas: [
      {
        id: "problema_falso",
        titulo: `Desafio de ${titulo}`,
        enunciado: `Desenhe como você organizaria o trabalho principal de ${titulo}.`,
        falaDoDesafio:
          "Hoje a ideia é você desenhar como organizaria o trabalho principal da função. Pergunte o que quiser antes de começar e vá pensando em voz alta.",
        ficha: Array.from({ length: 8 }, (_, i) => ({
          pergunta: `Pergunta provável ${i + 1}?`,
          resposta: `Resposta oficial ${i + 1}: valor ${(i + 3) * 7}.`,
        })),
        sinaisEsperados: ["Pergunta antes de desenhar", "Prioriza", "Justifica escolhas", "Prevê riscos"],
        armadilhas: ["Ir direto ao desenho", "Ignorar restrições", "Não priorizar"],
        perguntasSugeridas: ["Por que essa ordem?", "E se o prazo cortar pela metade?", "O que fica de fora?"],
      },
    ],
  };
}

/** Se o schema pedido é o do kit, devolve um kit falso (título tirado do JSON da vaga na mensagem). */
export function respostaFalsaDeKit(nomeSchema: string, mensagens: { content: string }[]): Kit | undefined {
  if (nomeSchema !== NOME_SCHEMA_KIT) return undefined;
  const texto = mensagens[0]?.content ?? "";
  const titulo = texto.match(/"title":\s*"([^"]+)"/)?.[1];
  return kitFalso(titulo);
}
