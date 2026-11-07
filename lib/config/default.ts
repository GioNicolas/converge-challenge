/**
 * Configuração usada enquanto a pré-entrevista não está integrada.
 * A pré-entrevista vai gerar objetos nesse mesmo formato (`InterviewConfig`).
 */
import { InterviewConfig } from "@/lib/contracts";

export const DEFAULT_CONFIG: InterviewConfig = InterviewConfig.parse({
  id: "default-backend-pleno",
  roleTitle: "Desenvolvedor(a) Backend Pleno",
  seniority: "pleno",
  focus: [
    { area: "tecnico", weight: 0.6 },
    { area: "escala_produto", weight: 0.4 },
  ],
  recruiterNotes: "",
  criteria: [
    { id: "abordagem", name: "Entendimento e abordagem", focus: "tecnico", weight: 1.25,
      description: "Entendeu o problema e explicou o plano antes de codar; justificou a escolha." },
    { id: "complexidade", name: "Complexidade", focus: "escala_produto", weight: 1,
      description: "Sabe dizer o custo de tempo e memória e o que acontece com entradas grandes." },
    { id: "corretude", name: "Corretude e código", focus: "tecnico", weight: 1,
      description: "Passa nos testes escondidos; nomes e estrutura claros." },
    { id: "bordas", name: "Casos de borda", focus: "tecnico", weight: 1,
      description: "Tratou por conta própria entradas vazias, repetidas e limites." },
    { id: "comunicacao", name: "Comunicação e resposta a dicas", focus: "tecnico", weight: 1.25,
      description: "Explicou o raciocínio com profundidade e usou bem as dicas que pediu." },
  ],
  problemId: "two-sum",
  languages: ["python", "cpp"],
  durationMin: 30,
});
