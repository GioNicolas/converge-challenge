// Planejador falso e determinístico (AGENTE_FAKE=1): 1º turno pergunta, depois propõe, depois revisa.
import { NOME_SCHEMA_PLANEJADOR } from "../prompts/planejador";

export function respostaFalsaDePlanejador(nomeSchema: string, mensagens: { content: string }[]): unknown {
  if (nomeSchema !== NOME_SCHEMA_PLANEJADOR) return undefined;
  const texto = mensagens[0]?.content ?? "";
  const colada = texto.match(/<descricao_colada>\n([\s\S]*?)\n<\/descricao_colada>/)?.[1] ?? "";
  const titulo = (colada.split("\n")[0] || "a vaga").replace(/\s*\([^)]*\)\s*$/, "").slice(0, 80) || "a vaga";
  const respondeu = /\n\[usuario\] /.test(texto);
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
  if (!respondeu && !comPlano) {
    return {
      mensagem: `Li a vaga de ${titulo}. Duas perguntas rápidas: (1) o que pesa mais nesta função? (2) algo que devo deixar de fora da entrevista?`,
      vaga,
      plano: null,
      pronto: false,
    };
  }
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
      ? "Ajustei o plano conforme pedido. Pode aprovar ou pedir mais mudanças."
      : "Proponho uma etapa de 30 min no quadro branco. Pode aprovar ou pedir ajustes.",
    vaga,
    plano,
    pronto: true,
  };
}
