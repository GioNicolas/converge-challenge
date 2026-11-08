// As vagas de partida do painel: as seis feitas à mão (das vagas de exemplo) e as geradas de forma determinística.
// Só dados, sem React: o painel (`workspace.ts`) e o servidor (`lib/config/store.ts`, que dá um plano de entrevista
// para cada uma) leem a mesma lista, então o link do candidato abre no formato que o painel mostra.
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import { entre, escolher, semente, sorteador } from "./aleatorio";
import type { Area, Resumo, Senioridade, VagaEmpresa } from "./workspace";

export const NOME_SENIORIDADE_VAGA: Record<Senioridade, string> = {
  estagio: "Estágio",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
};

export const descricaoDe = (id: string) => VAGAS.find((v) => v.id === id)?.jobDescription ?? "";
export const contextoDe = (id: string) => VAGAS.find((v) => v.id === id)?.context;
export const cargoDe = (id: string) => VAGAS.find((v) => v.id === id)?.roleTitle ?? id;

/** As vagas publicadas no primeiro acesso. */
export const INICIAIS: VagaEmpresa[] = [
  {
    id: "backend-links",
    cargo: "Desenvolvedor(a) Backend Pleno · Links",
    area: "engenharia",
    senioridade: "pleno",
    time: "Links e Compartilhamento",
    local: "Híbrido · São Paulo",
    descricao: `Procuramos uma pessoa desenvolvedora backend para o serviço de links curtos, usado em todo compartilhamento do app.

Responsabilidades:
- Evoluir o serviço que gera e redireciona milhões de links por dia
- Cuidar de latência, cache e disponibilidade do redirecionamento
- Medir cliques e acessos sem atrasar o redirecionamento`,
    abertaHaDias: 12,
    etapa: "entrevistas",
    resumo: {
      configId: "config-backend-links",
      formato: "system_design",
      duracaoMin: 40,
      foco: [
        { area: "escala_produto", peso: 0.5 },
        { area: "pressao", peso: 0.3 },
        { area: "uso_ia", peso: 0.2 },
      ],
    },
    funil: { inscritos: 3_820, convidados: 1_140, emAndamento: 36, concluiram: 410, novos: 52 },
    responsavel: "Marina Azevedo",
  },
  {
    id: "frontend-junior",
    cargo: cargoDe("frontend-junior"),
    area: "engenharia",
    senioridade: "junior",
    time: "Web",
    local: "Remoto",
    descricao: descricaoDe("frontend-junior"),
    contexto: contextoDe("frontend-junior"),
    abertaHaDias: 15,
    etapa: "entrevistas",
    resumo: {
      configId: "config-frontend-junior",
      formato: "live_coding",
      duracaoMin: 45,
      foco: [
        { area: "tecnico", peso: 0.6 },
        { area: "pressao", peso: 0.25 },
        { area: "uso_ia", peso: 0.15 },
      ],
    },
    funil: { inscritos: 70_412, convidados: 12_380, emAndamento: 214, concluiram: 4_906, novos: 312 },
    responsavel: "Paulo Henrique",
  },
  {
    id: "ia-pleno",
    cargo: cargoDe("ia-pleno"),
    area: "engenharia",
    senioridade: "pleno",
    time: "Plataforma de IA",
    local: "Remoto",
    descricao: descricaoDe("ia-pleno"),
    contexto: contextoDe("ia-pleno"),
    abertaHaDias: 9,
    etapa: "entrevistas",
    resumo: {
      configId: "config-ia-pleno",
      formato: "system_design",
      duracaoMin: 50,
      foco: [
        { area: "uso_ia", peso: 0.5 },
        { area: "tecnico", peso: 0.35 },
        { area: "escala_produto", peso: 0.15 },
      ],
    },
    funil: { inscritos: 2_904, convidados: 860, emAndamento: 18, concluiram: 233, novos: 21 },
    responsavel: "Renata Siqueira",
  },
  {
    id: "fullstack-startup",
    cargo: cargoDe("fullstack-startup"),
    area: "engenharia",
    senioridade: "pleno",
    time: "Produto",
    local: "Remoto",
    descricao: descricaoDe("fullstack-startup"),
    contexto: contextoDe("fullstack-startup"),
    abertaHaDias: 2,
    etapa: "entrevistas",
    resumo: {
      configId: "config-fullstack-startup",
      formato: "live_coding",
      duracaoMin: 45,
      foco: [
        { area: "pressao", peso: 0.45 },
        { area: "tecnico", peso: 0.4 },
        { area: "uso_ia", peso: 0.15 },
      ],
    },
    funil: { inscritos: 0, convidados: 0, emAndamento: 0, concluiram: 0, novos: 0 },
    responsavel: "Paulo Henrique",
  },
  {
    id: "staff-plataforma",
    cargo: cargoDe("staff-plataforma"),
    area: "engenharia",
    senioridade: "senior",
    time: "Plataforma",
    local: "Remoto",
    descricao: descricaoDe("staff-plataforma"),
    contexto: contextoDe("staff-plataforma"),
    abertaHaDias: 40,
    etapa: "encerrada",
    encerradaHaDias: 6,
    resumo: {
      configId: "config-staff-plataforma",
      formato: "system_design",
      duracaoMin: 60,
      foco: [
        { area: "escala_produto", peso: 0.6 },
        { area: "tecnico", peso: 0.4 },
      ],
    },
    funil: { inscritos: 640, convidados: 120, emAndamento: 0, concluiram: 96, novos: 0 },
    responsavel: "Renata Siqueira",
  },
  {
    // Encerrada há 3 meses: as 3 contratações passaram dos 90 dias (ou estão passando). É a demo do ciclo dos 90 dias.
    id: "backend-pagamentos",
    cargo: "Backend Pleno · Pagamentos",
    area: "engenharia",
    senioridade: "pleno",
    time: "Pagamentos",
    local: "Híbrido · São Paulo",
    descricao: `Buscamos uma pessoa desenvolvedora backend para o time de Pagamentos, que processa o checkout e os repasses.

Responsabilidades:
- Evoluir os serviços de cobrança e conciliação (Node.js e PostgreSQL)
- Tratar falhas de gateway, estornos e pagamentos duplicados sem perder dinheiro
- Escrever testes para os casos que quebram em produção

Requisitos:
- 3+ anos com backend em produção
- Experiência com filas, idempotência e bancos relacionais`,
    abertaHaDias: 128,
    etapa: "encerrada",
    encerradaHaDias: 93,
    resumo: {
      configId: "config-backend-pagamentos",
      formato: "live_coding",
      duracaoMin: 45,
      foco: [
        { area: "tecnico", peso: 0.55 },
        { area: "pressao", peso: 0.3 },
        { area: "uso_ia", peso: 0.15 },
      ],
    },
    funil: { inscritos: 1_870, convidados: 410, emAndamento: 0, concluiram: 212, novos: 0 },
    responsavel: "Diego Fontes",
    contratados: 3,
  },
];

// ---------------------------------------------------------------------------
// O resto do quadro de uma empresa grande: vagas geradas de forma determinística, para a lista
// mostrar como fica com dezenas de vagas, times e responsáveis (e números de verdade de escala).
// ---------------------------------------------------------------------------

const MODELOS: { cargo: string; area: Area; time: string }[] = [
  { cargo: "Desenvolvedor(a) Backend", area: "engenharia", time: "Logística" },
  { cargo: "Desenvolvedor(a) Android", area: "engenharia", time: "App do Cliente" },
  { cargo: "Desenvolvedor(a) iOS", area: "engenharia", time: "App do Entregador" },
  { cargo: "Engenheiro(a) de Dados", area: "dados", time: "Plataforma de Dados" },
  { cargo: "Cientista de Dados", area: "dados", time: "Preços" },
  { cargo: "Analista de Dados", area: "dados", time: "Marketplace" },
  { cargo: "Engenheiro(a) de Machine Learning", area: "dados", time: "Recomendação" },
  { cargo: "Product Manager", area: "produto", time: "Pagamentos" },
  { cargo: "Product Designer", area: "produto", time: "Restaurantes" },
  { cargo: "Product Manager", area: "produto", time: "Fidelidade" },
  { cargo: "Engenheiro(a) de Analytics", area: "dados", time: "Retenção" },
  { cargo: "Desenvolvedor(a) Fullstack", area: "engenharia", time: "Aquisição" },
  { cargo: "Engenheiro(a) de Plataforma", area: "engenharia", time: "Developer Experience" },
  { cargo: "Engenheiro(a) de SRE", area: "engenharia", time: "Infraestrutura" },
  { cargo: "Engenheiro(a) de Segurança", area: "engenharia", time: "Segurança" },
  { cargo: "Desenvolvedor(a) Frontend", area: "engenharia", time: "Portal do Parceiro" },
];
const RESPONSAVEIS = ["Marina Azevedo", "Paulo Henrique", "Renata Siqueira", "Diego Fontes", "Aline Castro", "Bruno Tavares"];
const LOCAIS = ["Remoto", "Híbrido · São Paulo", "Híbrido · Campinas", "Presencial · Osasco"];
const SENIORIDADES: Senioridade[] = ["estagio", "junior", "junior", "pleno", "pleno", "pleno", "senior", "senior"];
const FOCOS: Resumo["foco"][] = [
  [{ area: "tecnico", peso: 0.5 }, { area: "escala_produto", peso: 0.3 }, { area: "pressao", peso: 0.2 }],
  [{ area: "escala_produto", peso: 0.55 }, { area: "pressao", peso: 0.25 }, { area: "uso_ia", peso: 0.2 }],
  [{ area: "tecnico", peso: 0.6 }, { area: "uso_ia", peso: 0.25 }, { area: "pressao", peso: 0.15 }],
];

function gerarSinteticas(): VagaEmpresa[] {
  const r = sorteador(semente("quadro-da-empresa"));
  return Array.from({ length: 34 }, (_, i) => {
    const m = MODELOS[i % MODELOS.length];
    const senioridade = escolher(r, SENIORIDADES);
    // Júnior e estágio atraem muito mais gente: a escala muda de ordem de grandeza.
    const teto = senioridade === "estagio" || senioridade === "junior" ? 48_000 : senioridade === "pleno" ? 6_000 : 1_800;
    const semCandidatos = r() < 0.12;
    const inscritos = semCandidatos ? 0 : Math.round(Math.exp(Math.log(60) + r() * (Math.log(teto) - Math.log(60))));
    const convidados = Math.round(inscritos * (0.08 + r() * 0.3));
    const concluiram = Math.round(convidados * (0.15 + r() * 0.5));
    const emAndamento = Math.min(convidados - concluiram, Math.round(convidados * r() * 0.03));
    const encerrada = !semCandidatos && r() < 0.12;
    const novos = encerrada ? 0 : Math.round(concluiram * r() * 0.12);
    const formato = m.area === "engenharia" && r() < 0.5 ? "live_coding" : "system_design";
    return {
      id: `vaga-${i + 1}-${m.time.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "-")}`,
      cargo: `${m.cargo} ${NOME_SENIORIDADE_VAGA[senioridade]}`,
      area: m.area,
      senioridade,
      time: m.time,
      local: escolher(r, LOCAIS),
      descricao: "",
      abertaHaDias: entre(r, 1, 70),
      etapa: encerrada ? "encerrada" : "entrevistas",
      encerradaHaDias: encerrada ? entre(r, 1, 20) : undefined,
      resumo: {
        configId: `config-vaga-${i + 1}`,
        formato,
        duracaoMin: escolher(r, [30, 40, 45, 60]),
        foco: escolher(r, FOCOS),
        criterios: entre(r, 4, 7),
      },
      funil: { inscritos, convidados, emAndamento, concluiram, novos },
      responsavel: escolher(r, RESPONSAVEIS),
    } satisfies VagaEmpresa;
  });
}

export const SINTETICAS = gerarSinteticas();

/**
 * Todas as vagas de partida do painel (sem as publicadas no navegador). O servidor lê esta lista para ter um plano
 * de entrevista para cada uma (`lib/config/store.ts`): o link do candidato precisa abrir no formato que o painel mostra.
 */
export const VAGAS_DE_VITRINE: readonly VagaEmpresa[] = [...INICIAIS, ...SINTETICAS];
