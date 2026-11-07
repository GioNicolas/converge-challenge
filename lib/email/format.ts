const timeZone = () => process.env.EMAIL_TIMEZONE || "America/Sao_Paulo";

/** Data/hora com ano e fuso explícitos (padrão America/Sao_Paulo, via EMAIL_TIMEZONE). */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone(),
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** Primeiro nome, tolerando vazio/espaços extras. Retorna "" se não houver nome. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** "Oi, Maria" ou só "Oi" quando não há nome utilizável. */
export function greeting(prefix: string, fullName: string): string {
  const name = firstName(fullName);
  return name ? `${prefix}, ${name}` : prefix;
}

export const feedbackMessage: Record<"avancar" | "talvez" | "nao_avancar", string> = {
  avancar:
    "Boas notícias: você passou pra próxima etapa do processo. Em breve nosso time entra em contato com os próximos passos.",
  talvez:
    "Sua entrevista foi bem avaliada. O time ainda está decidindo os próximos passos e volta com uma posição em breve.",
  nao_avancar:
    "Depois de avaliar com calma, decidimos não seguir com sua candidatura pra essa vaga. Agradecemos o tempo e o esforço que você dedicou.",
};

const NOME_LINGUAGEM: Record<string, string> = {
  python: "Python",
  cpp: "C++",
  c: "C",
  java: "Java",
  javascript: "JavaScript",
  typescript: "TypeScript",
  go: "Go",
  rust: "Rust",
};

/** Nomes legíveis das linguagens: ["python","cpp"] → "Python ou C++". Desconhecida: mantém o id. */
export function nomeLinguagens(langs: string[]): string {
  const nomes = langs.map((l) => NOME_LINGUAGEM[l] ?? l);
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} ou ${nomes[nomes.length - 1]}`;
}
