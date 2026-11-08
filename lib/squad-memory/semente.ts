/**
 * Semente da demo: o que a empresa da demo já tem na memória antes da primeira decisão ao vivo.
 * Duas vagas anteriores já decididas e a atual em andamento, para a concordância Totti × Tech Lead
 * aparecer subindo (60% → 75% → 92%; a reprovação ao vivo da demo leva a atual para 85%).
 * O `empresaId` de cada item é trocado pelo da empresa na hora de semear (ver `estadoDa` em `store.ts`).
 */
import type { DecisaoRegistrada, DecisaoTechLead, MotivoIgnorado, RecomendacaoTotti, RegraSquad } from "./tipos";

const VAGA_A = { vagaId: "backend-pagamentos-ago", vagaTitulo: "Backend Pleno · Pagamentos" };
const VAGA_B = { vagaId: "dados-pleno-set", vagaTitulo: "Engenharia de Dados Pleno" };
/** A vaga do card de demo do Slack (`/api/slack/demo`). */
const VAGA_C = { vagaId: "demo-backend-pleno", vagaTitulo: "Backend Pleno" };

type Linha = [candidato: string, totti: RecomendacaoTotti, techLead: DecisaoTechLead, dia: string];

function decisoes(vaga: { vagaId: string; vagaTitulo: string }, linhas: Linha[]): DecisaoRegistrada[] {
  return linhas.map(([candidato, recomendacaoTotti, decisaoTechLead, dia], i) => ({
    id: `semente-${vaga.vagaId}-${i}`,
    empresaId: "",
    ...vaga,
    candidato,
    recomendacaoTotti,
    decisaoTechLead,
    decididaEm: `${dia}T15:00:00.000Z`,
  }));
}

export const SEMENTE: { regras: RegraSquad[]; decisoes: DecisaoRegistrada[]; ignorados: MotivoIgnorado[] } = {
  regras: [
    {
      id: "semente-regra-observabilidade",
      empresaId: "",
      texto: "Valoriza quem pergunta sobre observabilidade antes de codar",
      efeito: "valoriza",
      criterio: "gargalos_falhas",
      origem: { tipo: "aprovacao", candidato: "Marina Lopes", ...VAGA_A },
      ativa: true,
      criadaEm: "2026-08-14T15:00:00.000Z",
    },
    {
      id: "semente-regra-bordas",
      empresaId: "",
      texto: "Penaliza quem só testa o caminho feliz: reprovou quem não tratou lista vazia",
      efeito: "penaliza",
      criterio: "bordas",
      origem: { tipo: "reprovacao", candidato: "Caio Ferreira", ...VAGA_A },
      ativa: false,
      criadaEm: "2026-08-19T15:00:00.000Z",
    },
    {
      id: "semente-regra-modelagem",
      empresaId: "",
      texto: "Valoriza modelagem de dados: o Tech Lead pediu mais modelagem e menos algoritmo",
      efeito: "valoriza",
      criterio: "componentes",
      origem: { tipo: "ajuste_plano", vagaId: VAGA_B.vagaId },
      ativa: true,
      criadaEm: "2026-09-22T15:00:00.000Z",
    },
    {
      id: "semente-regra-estimativa",
      empresaId: "",
      texto: "Penaliza quem escolhe o banco sem estimar o volume de escrita",
      efeito: "penaliza",
      criterio: "estimativa",
      origem: { tipo: "reprovacao", candidato: "Diego Martins", ...VAGA_B },
      ativa: true,
      criadaEm: "2026-10-03T15:00:00.000Z",
    },
  ],
  decisoes: [
    // Vaga A: o Totti ainda não conhecia o time. 3 de 5.
    ...decisoes(VAGA_A, [
      ["Marina Lopes", "avancar", "aprovado", "2026-08-14"],
      ["Caio Ferreira", "avancar", "reprovado", "2026-08-19"],
      ["Lívia Prado", "nao_avancar", "reprovado", "2026-08-20"],
      ["Otávio Reis", "nao_avancar", "aprovado", "2026-08-22"],
      ["Bianca Nunes", "avancar", "aprovado", "2026-08-25"],
    ]),
    // Vaga B: com as primeiras regras. 6 de 8 (um "talvez" fica de fora da conta).
    ...decisoes(VAGA_B, [
      ["Gustavo Lima", "avancar", "aprovado", "2026-09-24"],
      ["Diego Martins", "avancar", "reprovado", "2026-10-03"],
      ["Helena Duarte", "nao_avancar", "reprovado", "2026-10-04"],
      ["Rafaela Costa", "avancar", "aprovado", "2026-10-06"],
      ["Thiago Moura", "talvez", "aprovado", "2026-10-07"],
      ["Sofia Almeida", "nao_avancar", "reprovado", "2026-10-08"],
      ["Bruno Teixeira", "nao_avancar", "aprovado", "2026-10-09"],
      ["Clara Mendes", "avancar", "aprovado", "2026-10-10"],
      ["Pedro Antunes", "nao_avancar", "reprovado", "2026-10-13"],
    ]),
    // Vaga C (a atual): 11 de 12 até aqui.
    ...decisoes(VAGA_C, [
      ["Luana Ribeiro", "avancar", "aprovado", "2026-10-27"],
      ["Mateus Carvalho", "nao_avancar", "reprovado", "2026-10-28"],
      ["Isabela Rocha", "avancar", "aprovado", "2026-10-28"],
      ["Fernando Dias", "nao_avancar", "reprovado", "2026-10-29"],
      ["Juliana Pires", "avancar", "aprovado", "2026-10-30"],
      ["Rodrigo Sales", "nao_avancar", "reprovado", "2026-10-31"],
      ["Camila Freitas", "avancar", "reprovado", "2026-11-03"],
      ["Vinícius Barros", "avancar", "aprovado", "2026-11-04"],
      ["Natália Gomes", "nao_avancar", "reprovado", "2026-11-04"],
      ["André Souza", "avancar", "aprovado", "2026-11-05"],
      ["Beatriz Lima", "nao_avancar", "reprovado", "2026-11-05"],
      ["Eduardo Campos", "avancar", "aprovado", "2026-11-06"],
    ]),
  ],
  ignorados: [
    {
      id: "semente-ignorado-idade",
      empresaId: "",
      trecho: "muito novo para liderar o time",
      porque: "idade não é critério técnico",
      origem: { tipo: "reprovacao", candidato: "Pedro Antunes", ...VAGA_B },
      criadoEm: "2026-10-13T15:00:00.000Z",
    },
  ],
};
