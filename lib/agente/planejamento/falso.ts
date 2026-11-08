// Planejador falso e determinístico (AGENTE_FAKE=1): propõe o plano já no 1º turno e depois revisa.
import { NOME_SCHEMA_PLANEJADOR } from "../prompts/planejador";

export function respostaFalsaDePlanejador(nomeSchema: string, mensagens: { content: string }[]): unknown {
  if (nomeSchema !== NOME_SCHEMA_PLANEJADOR) return undefined;
  const texto = mensagens[0]?.content ?? "";
  const colada = texto.match(/<descricao_colada>\n([\s\S]*?)\n<\/descricao_colada>/)?.[1] ?? "";
  const titulo = (colada.split("\n")[0] || "a vaga").replace(/\s*\([^)]*\)\s*$/, "").slice(0, 80) || "a vaga";
  const comPlano = texto.includes("<plano_atual>");
  const vaga = {
    title: titulo,
    seniority: "pleno" as const,
    description: colada.slice(0, 500) || titulo,
    responsibilities: ["Responsabilidade principal da função"],
    requirements: ["Experiência na área"],
    niceToHave: [],
    stack: [],
  };
  const evidencia = colada.slice(0, 80) || titulo;
  const plano = {
    stages: [
      {
        tool: "whiteboard" as const,
        minutes: 30,
        challenge: { title: `Desafio de ${titulo}`, brief: "Desenhe como você organizaria o trabalho principal desta função." },
        rationale: "Reproduz uma situação típica descrita na vaga.",
      },
    ],
    focusPoints: [
      { topic: "Estrutura do raciocínio", evidenceFromPosting: evidencia, weight: 0.6 },
      { topic: "Trade-offs e priorização", evidenceFromPosting: evidencia, weight: 0.4 },
    ],
    outOfScope: comPlano ? ["Itens retirados a pedido do gestor"] : ["Conhecimentos fora do que a vaga pede"],
    summary: `Uma etapa de 30 min no quadro branco para ${titulo}.`,
  };
  return {
    mensagem: comPlano
      ? "Ajustei o plano conforme pedido. Quer ajustar mais algo ou posso aprovar?"
      : "Proponho uma etapa de 30 min no quadro branco, com foco em estrutura do raciocínio e trade-offs.\n" +
        "Premissas: ênfase no trabalho principal da função; uma etapa única; conhecimentos fora da vaga ficam de fora.\n" +
        "Quer ajustar algo ou posso aprovar?",
    vaga,
    plano,
    pronto: true,
  };
}
