/**
 * 20 candidatos fictícios (2 por vaga). Nomes e e-mails inventados.
 * Os dois de cada vaga têm perfis diferentes de propósito (um mais alinhado,
 * outro com lacuna clara), para o agente ter o que priorizar na entrevista.
 */
import { Candidate } from "../candidate";

export const CANDIDATES: Candidate[] = [
  // --- backend-pleno ---
  {
    id: "c01",
    name: "Rafael Moura",
    email: "rafael.moura@example.com",
    jobPostingId: "backend-pleno",
    yearsExperience: 4,
    currentRole: "Dev Backend em e-commerce",
    skills: ["Python", "PostgreSQL", "Celery", "Docker"],
    resumeSummary:
      "Quatro anos com APIs em Django. Reduziu o tempo de uma consulta de relatório de 12 s para 800 ms com índices e reescrita de query. Sem experiência com Kafka.",
    stage: "entrevista_agendada",
  },
  {
    id: "c02",
    name: "Camila Duarte",
    email: "camila.duarte@example.com",
    jobPostingId: "backend-pleno",
    yearsExperience: 6,
    currentRole: "Engenheira de Software em banco digital",
    skills: ["Go", "Kafka", "PostgreSQL", "gRPC"],
    resumeSummary:
      "Seis anos em serviços de pagamento, com consumidores idempotentes em Kafka. Forte em concorrência; menos exposição a Python.",
    stage: "entrevistado",
  },

  // --- frontend-senior ---
  {
    id: "c03",
    name: "Bruno Siqueira",
    email: "bruno.siqueira@example.com",
    jobPostingId: "frontend-senior",
    yearsExperience: 8,
    currentRole: "Tech Lead Frontend em healthtech",
    skills: ["React", "TypeScript", "Next.js", "Storybook"],
    resumeSummary:
      "Liderou a criação de um design system usado por 6 squads. Listas virtualizadas na agenda de clínicas e redução de LCP de 4 s para 1,6 s. Nunca passou por uma auditoria de LGPD no front.",
    stage: "entrevista_agendada",
  },
  {
    id: "c04",
    name: "Eduardo Cavalcanti",
    email: "eduardo.cavalcanti@example.com",
    jobPostingId: "frontend-senior",
    yearsExperience: 10,
    currentRole: "Engenheiro Frontend Sênior em telemedicina",
    skills: ["React", "TypeScript", "Redux", "Jest", "WCAG"],
    resumeSummary:
      "Dez anos, referência interna em acessibilidade (WCAG AA). Mascarou dados de pacientes em telas e logs. Mentorou 5 pessoas. Pouco contato com Next.js.",
    stage: "triagem",
  },

  // --- ml-engineer ---
  {
    id: "c05",
    name: "Beatriz Leal",
    email: "beatriz.leal@example.com",
    jobPostingId: "ml-engineer",
    yearsExperience: 3,
    currentRole: "Cientista de Dados em varejo",
    skills: ["Python", "scikit-learn", "Prophet", "MLflow"],
    resumeSummary:
      "Três anos treinando modelos de previsão de vendas (Prophet, gradient boosting). Quer migrar para engenharia; colocou um modelo em produção com ajuda do time de plataforma e não sabe monitorar drift.",
    stage: "triagem",
  },
  {
    id: "c06",
    name: "Henrique Salgado",
    email: "henrique.salgado@example.com",
    jobPostingId: "ml-engineer",
    yearsExperience: 6,
    currentRole: "ML Engineer Sênior em transportadora",
    skills: ["Python", "LightGBM", "Airflow", "Kubernetes", "MLflow"],
    resumeSummary:
      "Seis anos, três deles com previsão de demanda por rota. Montou o monitoramento de drift e retreino automático. Menos prática com otimização de estoque.",
    stage: "entrevista_agendada",
  },

  // --- data-engineer ---
  {
    id: "c07",
    name: "Diego Marques",
    email: "diego.marques@example.com",
    jobPostingId: "data-engineer",
    yearsExperience: 4,
    currentRole: "Engenheiro de Dados em varejo e distribuição",
    skills: ["Python", "SQL", "Airflow", "BigQuery", "dbt"],
    resumeSummary:
      "Quatro anos construindo pipelines batch de vendas e estoque com Airflow e dbt. Reduziu o custo mensal de BigQuery em 40%. Sem streaming.",
    stage: "entrevista_agendada",
  },
  {
    id: "c08",
    name: "Natália Freitas",
    email: "natalia.freitas@example.com",
    jobPostingId: "data-engineer",
    yearsExperience: 2,
    currentRole: "Analytics Engineer em transportadora",
    skills: ["SQL", "dbt", "Looker", "Python"],
    resumeSummary:
      "Dois anos, SQL muito sólido e boa modelagem dimensional de entregas e rotas. Python ainda básico; nunca usou Airflow em produção.",
    stage: "triagem",
  },

  // --- sre-devops ---
  {
    id: "c09",
    name: "Otávio Pimentel",
    email: "otavio.pimentel@example.com",
    jobPostingId: "sre-devops",
    yearsExperience: 7,
    currentRole: "SRE Sênior em streaming de vídeo",
    skills: ["Kubernetes", "Terraform", "Prometheus", "Go", "AWS"],
    resumeSummary:
      "Sete anos. Definiu SLOs e error budgets para 12 serviços; conduziu mais de 30 postmortems e operou transmissões ao vivo com 20x o tráfego normal. Escreve operadores Kubernetes em Go.",
    stage: "entrevista_agendada",
  },
  {
    id: "c10",
    name: "Vanessa Coutinho",
    email: "vanessa.coutinho@example.com",
    jobPostingId: "sre-devops",
    yearsExperience: 5,
    currentRole: "DevOps Pleno em plataforma de áudio",
    skills: ["Terraform", "GitHub Actions", "AWS", "Python"],
    resumeSummary:
      "Cinco anos, muito forte em IaC e pipelines de CI/CD. Lida com picos de lançamento só com autoscaling simples. Experiência limitada com Kubernetes em escala e com SLOs formais.",
    stage: "triagem",
  },

  // --- pm-senior ---
  {
    id: "c11",
    name: "Carolina Veloso",
    email: "carolina.veloso@example.com",
    jobPostingId: "pm-senior",
    yearsExperience: 7,
    currentRole: "Senior PM em marketplace de delivery",
    skills: ["Discovery", "A/B testing", "Roadmap", "Amplitude"],
    resumeSummary:
      "Sete anos. Subiu a conversão da busca ao pedido em 9% com mudanças de ranking e filtros. Foco forte em dados; menos em monetização.",
    stage: "entrevista_agendada",
  },
  {
    id: "c12",
    name: "Mateus Brandão",
    email: "mateus.brandao@example.com",
    jobPostingId: "pm-senior",
    yearsExperience: 6,
    currentRole: "Product Owner em banco",
    skills: ["Backlog", "Scrum", "Jira", "Stakeholders"],
    resumeSummary:
      "Seis anos como PO em ambiente corporativo, forte em execução e refinamento. Pouca prática de discovery e de definir métricas de sucesso.",
    stage: "triagem",
  },

  // --- coordenador-obras ---
  {
    id: "c13",
    name: "Marcelo Torres",
    email: "marcelo.torres@example.com",
    jobPostingId: "coordenador-obras",
    yearsExperience: 11,
    currentRole: "Coordenador de Obras em incorporadora",
    skills: ["MS Project", "Lean construction", "NR-18", "Gestão de empreiteiros"],
    resumeSummary:
      "Onze anos, entregou três torres residenciais de 24 pavimentos no prazo. Replanejou o caminho crítico após atraso de fundação. Pouco contato com BIM.",
    stage: "entrevista_agendada",
  },
  {
    id: "c14",
    name: "Luciana Barreto",
    email: "luciana.barreto@example.com",
    jobPostingId: "coordenador-obras",
    yearsExperience: 7,
    currentRole: "Engenheira de Obras Pleno",
    skills: ["AutoCAD", "Medições", "Segurança do trabalho", "Excel"],
    resumeSummary:
      "Sete anos em obra, forte em medição e controle de custos. Nunca coordenou mais de uma obra ao mesmo tempo.",
    stage: "triagem",
  },

  // --- planejador-orcamentista ---
  {
    id: "c15",
    name: "Roberto Câmara",
    email: "roberto.camara@example.com",
    jobPostingId: "planejador-orcamentista",
    yearsExperience: 5,
    currentRole: "Orçamentista em construtora",
    skills: ["SINAPI", "Excel avançado", "MS Project", "Sienge"],
    resumeSummary:
      "Cinco anos, monta orçamentos e curva S de edifícios residenciais. Quando o realizado desvia mais de 5%, revisa a EAP. Sem BIM.",
    stage: "entrevista_agendada",
  },
  {
    id: "c16",
    name: "Patrícia Nogueira",
    email: "patricia.nogueira@example.com",
    jobPostingId: "planejador-orcamentista",
    yearsExperience: 3,
    currentRole: "Assistente de Planejamento",
    skills: ["MS Project", "Excel", "Quantitativos"],
    resumeSummary:
      "Três anos levantando quantitativos de projetos. Composição de custos própria ainda é ponto a investigar.",
    stage: "triagem",
  },

  // --- engenheiro-seguranca ---
  {
    id: "c17",
    name: "Vinícius Ferraz",
    email: "vinicius.ferraz@example.com",
    jobPostingId: "engenheiro-seguranca",
    yearsExperience: 6,
    currentRole: "Engenheiro de Segurança em construtora",
    skills: ["NR-18", "NR-35", "PGR", "Investigação de acidentes"],
    resumeSummary:
      "Seis anos em obras verticais. Reorganizou o layout de um canteiro apertado separando a circulação de pessoas e de máquinas e zerou acidentes com afastamento por um ano. Pouca experiência com espaço confinado.",
    stage: "entrevista_agendada",
  },
  {
    id: "c18",
    name: "Helena Rocha",
    email: "helena.rocha@example.com",
    jobPostingId: "engenheiro-seguranca",
    yearsExperience: 3,
    currentRole: "Técnica de Segurança do Trabalho",
    skills: ["Checklists", "Treinamentos", "NR-35"],
    resumeSummary:
      "Três anos aplicando treinamentos e inspeções. Mapeamento de risco por etapa e desenho de controles ainda é ponto a investigar.",
    stage: "triagem",
  },

  // --- arquiteto-comercial ---
  {
    id: "c19",
    name: "Ricardo Amaral",
    email: "ricardo.amaral@example.com",
    jobPostingId: "arquiteto-comercial",
    yearsExperience: 6,
    currentRole: "Arquiteto em escritório de projetos de varejo",
    skills: ["Revit", "Layout de lojas", "Fluxo de clientes", "Franquias"],
    resumeSummary:
      "Seis anos projetando lojas de rede. Reposicionou o caixa e a área de espera de uma loja âncora e a conversão subiu. Defende bem as decisões para o cliente; BIM só no básico.",
    stage: "entrevista_agendada",
  },
  {
    id: "c20",
    name: "Fernanda Lopes",
    email: "fernanda.lopes@example.com",
    jobPostingId: "arquiteto-comercial",
    yearsExperience: 3,
    currentRole: "Arquiteta de interiores",
    skills: ["SketchUp", "AutoCAD", "Interiores", "Renders"],
    resumeSummary:
      "Três anos em interiores comerciais, forte na parte visual. Pouca prática em setorização, fluxo de abastecimento e programa de necessidades.",
    stage: "triagem",
  },
];
