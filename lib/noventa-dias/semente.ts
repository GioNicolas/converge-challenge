/**
 * Semente da demo: as 3 contratações da vaga de Pagamentos (encerrada há 3 meses), as mesmas que a memória da
 * squad aprovou em julho e agosto (`lib/squad-memory/semente.ts`, vaga A).
 *   - Marina Lopes: a entrevista recomendou e deu certo. Já respondida.
 *   - Otávio Reis: a entrevista não recomendava (2 em Complexidade), o Tech Lead aprovou e deu certo. Já respondida;
 *     virou a regra "Valoriza quem melhora a solução depois de uma dica".
 *   - Bianca Nunes: a entrevista deu 4 em Casos de borda. Fez 90 dias agora e falta responder: é a demo.
 * Datas relativas a quando o servidor sobe, para a demo não envelhecer. O `empresaId` é trocado na hora de semear.
 */
import type { Contratacao, NotaDaEntrevista } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;
const haDias = (agora: number, d: number) => new Date(agora - d * DIA).toISOString();

const VAGA = { vagaId: "backend-pagamentos", vagaTitulo: "Backend Pleno · Pagamentos", cargo: "Backend Pleno" };

const NOMES: Record<string, string> = {
  abordagem: "Entendimento e abordagem",
  complexidade: "Complexidade",
  corretude: "Corretude e código",
  bordas: "Casos de borda",
  comunicacao: "Comunicação",
  pressao_adaptacao: "Pressão e adaptação",
};

/** Notas de live coding na ordem do catálogo. */
function notas(n: [number, number, number, number, number, number]): NotaDaEntrevista[] {
  return Object.keys(NOMES).map((id, i) => ({ id, nome: NOMES[id], nota: n[i] }));
}

export function sementeDasContratacoes(agora = Date.now()): Contratacao[] {
  return [
    {
      id: "contratacao-bianca-nunes",
      empresaId: "",
      ...VAGA,
      candidato: "Bianca Nunes",
      contratadoEm: haDias(agora, 91),
      entrevista: { recomendacao: "avancar", nota: 3.3, criterios: notas([3, 3, 3, 4, 3, 3]) },
    },
    {
      id: "contratacao-otavio-reis",
      empresaId: "",
      ...VAGA,
      candidato: "Otávio Reis",
      contratadoEm: haDias(agora, 104),
      entrevista: { recomendacao: "nao_avancar", nota: 2.3, criterios: notas([3, 2, 2, 2, 3, 2]) },
      resultado: {
        deuCerto: true,
        criterioErrado: "complexidade",
        surpresa: "Chegou na solução certa depois de uma dica e hoje é quem mais otimiza as consultas do time.",
        respondidoEm: haDias(agora, 14),
        regras: ["semente-regra-90-dias-otavio"],
        ignorados: [],
      },
    },
    {
      id: "contratacao-marina-lopes",
      empresaId: "",
      ...VAGA,
      candidato: "Marina Lopes",
      contratadoEm: haDias(agora, 118),
      entrevista: { recomendacao: "avancar", nota: 3.4, criterios: notas([4, 3, 3, 3, 4, 3]) },
      resultado: {
        deuCerto: true,
        surpresa: "Montou os alertas do serviço de pagamentos no primeiro mês.",
        respondidoEm: haDias(agora, 28),
        regras: [],
        ignorados: [],
      },
    },
  ];
}
