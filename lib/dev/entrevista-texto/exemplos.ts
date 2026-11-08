// Exemplos de grafo para a página de teste (cópia de scripts/exemplos). Notação: docs/contrato-quadro-cerebro.md.
const junta = (linhas: string[]) => linhas.join("\n");

export const GRAFO_RUIM = junta([
  "COMPONENTES",
  "- [r1] Cliente (retângulo)",
  "- [r2] API (retângulo)",
  "- [e1] Postgres (elipse)",
  "CONEXÕES",
  "- [s1] Cliente → API",
  '- [s2] API → Postgres ("lê e grava")',
  "ANOTAÇÕES SOLTAS",
  '- [t1] "gera código aleatório"',
  "ORDEM NA TELA (esquerda → direita)",
  "- Cliente, API, Postgres",
]);

export const GRAFO_BOM = junta([
  "COMPONENTES",
  "- [r1] Cliente (retângulo)",
  "- [l1] Load balancer (losango)",
  "- [r2] API de criação (retângulo)",
  "- [r3] API de redirecionamento (retângulo)",
  "- [e1] Redis (elipse)",
  "- [e2] Postgres + réplicas (elipse)",
  "- [r4] Fila de cliques (retângulo)",
  "CONEXÕES",
  "- [s1] Cliente → Load balancer",
  "- [s2] Load balancer → API de criação",
  "- [s3] Load balancer → API de redirecionamento",
  '- [s4] API de redirecionamento → Redis ("cache de leitura")',
  '- [s5] Redis → Postgres + réplicas ("cache miss")',
  "- [s6] API de criação → Postgres + réplicas",
  '- [s7] API de redirecionamento → Fila de cliques ("assíncrono")',
  "ANOTAÇÕES SOLTAS",
  '- [t1] "ID em base62, 7 caracteres, contador distribuído"',
  "ORDEM NA TELA (esquerda → direita)",
  "- Cliente, Load balancer, API de criação, API de redirecionamento, Redis, Postgres + réplicas, Fila de cliques",
]);

export const GRAFO_VAZIO = junta(["COMPONENTES", "CONEXÕES"]);

export const GRAFO_MODELO = junta([
  "COMPONENTES",
  "- [r1] Cliente (retângulo)",
  "CONEXÕES",
  "ANOTAÇÕES SOLTAS",
  "ORDEM NA TELA (esquerda → direita)",
]);
