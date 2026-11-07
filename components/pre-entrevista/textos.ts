// Nomes em português para o que a tela da pré-entrevista mostra.
import type { FocusArea, InterviewConfig, InterviewMode } from "@/lib/contracts";

export const NOME_AREA: Record<FocusArea, string> = {
  tecnico: "Domínio técnico",
  pressao: "Pressão e adaptação",
  escala_produto: "Escala e produto",
  uso_ia: "Uso de IA",
};

export const NOME_FORMATO: Record<InterviewMode, string> = {
  system_design: "System design",
  live_coding: "Código ao vivo",
};

export const DESCRICAO_FORMATO: Record<InterviewMode, string> = {
  system_design: "O candidato desenha a arquitetura num quadro, e o agente pergunta sobre o desenho.",
  live_coding: "O candidato resolve um problema na IDE, e o agente acompanha o código.",
};

export const NOME_SENIORIDADE: Record<InterviewConfig["seniority"], string> = {
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
};
