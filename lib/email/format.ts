const formatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  return formatter.format(new Date(iso));
}

export const feedbackOpening: Record<string, string> = {
  avancar: "Boas notícias: você passou pra próxima etapa do processo.",
  talvez: "Sua entrevista foi bem avaliada. O time ainda está decidindo os próximos passos e volta com uma posição em breve.",
  nao_avancar: "Depois de avaliar com calma, decidimos não seguir com sua candidatura pra essa vaga.",
};

export const feedbackNextStepsLabel: Record<string, string> = {
  avancar: "Próximos passos",
  talvez: "O que olhamos de perto",
  nao_avancar: "Pontos pra desenvolver",
};
