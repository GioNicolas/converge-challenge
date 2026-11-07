/**
 * 20 candidatos fictícios (4 por vaga). Nomes e e-mails inventados.
 * Perfis variam de propósito: alguns bem alinhados, outros com lacunas,
 * para o agente ter o que priorizar na entrevista.
 */
import { Candidate } from "../candidate";

export const CANDIDATES: Candidate[] = [
  // --- backend-pleno ---
  {
    id: "c01", name: "Rafael Moura", email: "rafael.moura@example.com", jobPostingId: "backend-pleno",
    yearsExperience: 4, currentRole: "Dev Backend na uma e-commerce",
    skills: ["Python", "PostgreSQL", "Celery", "Docker"],
    resumeSummary: "Quatro anos com APIs em Django. Reduziu o tempo de uma consulta de relatório de 12 s para 800 ms com índices e reescrita de query. Sem experiência com Kafka.",
    stage: "entrevista_agendada",
  },
  {
    id: "c02", name: "Camila Duarte", email: "camila.duarte@example.com", jobPostingId: "backend-pleno",
    yearsExperience: 6, currentRole: "Engenheira de Software em banco digital",
    skills: ["Go", "Kafka", "PostgreSQL", "gRPC"],
    resumeSummary: "Seis anos em serviços de pagamento, com consumidores idempotentes em Kafka. Forte em concorrência; menos exposição a Python.",
    stage: "triagem",
  },
  {
    id: "c03", name: "Thiago Nascimento", email: "thiago.nascimento@example.com", jobPostingId: "backend-pleno",
    yearsExperience: 2, currentRole: "Dev Júnior em consultoria",
    skills: ["Java", "Spring", "MySQL"],
    resumeSummary: "Dois anos em CRUDs corporativos em Spring. Estudando algoritmos por conta própria; pouca experiência com sistemas de alto volume.",
    stage: "triagem",
  },
  {
    id: "c04", name: "Larissa Prado", email: "larissa.prado@example.com", jobPostingId: "backend-pleno",
    yearsExperience: 5, currentRole: "Backend em logística",
    skills: ["Python", "FastAPI", "Redis", "AWS SQS"],
    resumeSummary: "Cinco anos, migrou um monólito para filas com SQS. Declara usar bastante IA para gerar código e quer mostrar como valida o resultado.",
    stage: "entrevistado",
  },

  // --- frontend-senior ---
  {
    id: "c05", name: "Bruno Siqueira", email: "bruno.siqueira@example.com", jobPostingId: "frontend-senior",
    yearsExperience: 8, currentRole: "Tech Lead Frontend em healthtech",
    skills: ["React", "TypeScript", "Next.js", "Storybook"],
    resumeSummary: "Liderou a criação de um design system usado por 6 squads. Listas virtualizadas na agenda de clínicas e redução de LCP de 4 s para 1,6 s. Nunca passou por uma auditoria de LGPD no front.",
    stage: "entrevista_agendada",
  },
  {
    id: "c06", name: "Marina Teixeira", email: "marina.teixeira@example.com", jobPostingId: "frontend-senior",
    yearsExperience: 5, currentRole: "Frontend Pleno em agência",
    skills: ["React", "JavaScript", "Tailwind", "D3"],
    resumeSummary: "Cinco anos com muita visualização de dados em D3, incluindo dashboards clínicos para clientes de saúde. TypeScript recente; acessibilidade e privacidade de dados no front são pontos a investigar.",
    stage: "triagem",
  },
  {
    id: "c07", name: "Eduardo Cavalcanti", email: "eduardo.cavalcanti@example.com", jobPostingId: "frontend-senior",
    yearsExperience: 10, currentRole: "Engenheiro Frontend Sênior em telemedicina",
    skills: ["React", "TypeScript", "Redux", "Jest", "WCAG"],
    resumeSummary: "Dez anos, referência interna em acessibilidade (WCAG AA). Mascarou dados de pacientes em telas e logs. Mentorou 5 pessoas. Pouco contato com Next.js.",
    stage: "triagem",
  },
  {
    id: "c08", name: "Júlia Albuquerque", email: "julia.albuquerque@example.com", jobPostingId: "frontend-senior",
    yearsExperience: 7, currentRole: "Fullstack em startup",
    skills: ["React", "Node.js", "TypeScript", "GraphQL"],
    resumeSummary: "Sete anos, perfil fullstack que se inclina para o front. Gerencia cache com React Query, mas nunca definiu política de expiração para dados sensíveis; nunca trabalhou com listas muito grandes.",
    stage: "triagem",
  },

  // --- staff-arquiteto ---
  {
    id: "c09", name: "Fernando Lacerda", email: "fernando.lacerda@example.com", jobPostingId: "staff-arquiteto",
    yearsExperience: 12, currentRole: "Principal Engineer em varejo",
    skills: ["Java", "Kafka", "Kubernetes", "Event Sourcing"],
    resumeSummary: "Doze anos. Desenhou o checkout que sustentou 15x o tráfego normal na Black Friday. Adotou CQRS em dois domínios.",
    stage: "entrevista_agendada",
  },
  {
    id: "c10", name: "Patrícia Bezerra", email: "patricia.bezerra@example.com", jobPostingId: "staff-arquiteto",
    yearsExperience: 9, currentRole: "Arquiteta de Soluções em fintech",
    skills: ["AWS", "PostgreSQL", "Terraform", "Redis"],
    resumeSummary: "Nove anos, forte em desenho de soluções e documentação (ADRs). Menos tempo mão na massa recente.",
    stage: "triagem",
  },
  {
    id: "c11", name: "Gustavo Rangel", email: "gustavo.rangel@example.com", jobPostingId: "staff-arquiteto",
    yearsExperience: 8, currentRole: "Senior Engineer em plataforma de pagamentos",
    skills: ["Go", "Kafka", "Cassandra", "Kubernetes"],
    resumeSummary: "Oito anos em sistemas distribuídos, migrou um serviço para multi-região. Primeira vez que se candidata a Staff.",
    stage: "triagem",
  },
  {
    id: "c12", name: "Aline Figueiredo", email: "aline.figueiredo@example.com", jobPostingId: "staff-arquiteto",
    yearsExperience: 14, currentRole: "Engineering Manager",
    skills: ["Java", "Microserviços", "DDD", "Observabilidade"],
    resumeSummary: "Catorze anos, os últimos três em gestão. Quer voltar para papel técnico; precisa checar profundidade técnica atual.",
    stage: "triagem",
  },

  // --- data-ml-engineer ---
  {
    id: "c13", name: "Diego Marques", email: "diego.marques@example.com", jobPostingId: "data-ml-engineer",
    yearsExperience: 4, currentRole: "Engenheiro de Dados em varejo e distribuição",
    skills: ["Python", "SQL", "Airflow", "BigQuery", "dbt"],
    resumeSummary: "Quatro anos construindo pipelines batch de vendas e estoque com Airflow e dbt. Reduziu o custo mensal de BigQuery em 40%. Sem streaming e sem modelos de previsão.",
    stage: "entrevista_agendada",
  },
  {
    id: "c14", name: "Beatriz Leal", email: "beatriz.leal@example.com", jobPostingId: "data-ml-engineer",
    yearsExperience: 3, currentRole: "Cientista de Dados",
    skills: ["Python", "scikit-learn", "SQL", "MLflow"],
    resumeSummary: "Três anos treinando modelos de previsão de vendas (Prophet, gradient boosting). Quer migrar para engenharia; colocou um modelo em produção com ajuda do time de plataforma e não sabe monitorar drift.",
    stage: "triagem",
  },
  {
    id: "c15", name: "Henrique Salgado", email: "henrique.salgado@example.com", jobPostingId: "data-ml-engineer",
    yearsExperience: 6, currentRole: "Data Engineer Sênior em adtech",
    skills: ["Spark", "Kafka", "Python", "Scala", "Delta Lake"],
    resumeSummary: "Seis anos com streaming em Spark. Opera pipelines de bilhões de eventos por dia; SQL é bom, mas não é o ponto mais forte.",
    stage: "triagem",
  },
  {
    id: "c16", name: "Natália Freitas", email: "natalia.freitas@example.com", jobPostingId: "data-ml-engineer",
    yearsExperience: 2, currentRole: "Analytics Engineer em transportadora",
    skills: ["SQL", "dbt", "Looker", "Python"],
    resumeSummary: "Dois anos, SQL muito sólido e boa modelagem dimensional de entregas e rotas. Python ainda básico; nunca usou Airflow em produção.",
    stage: "triagem",
  },

  // --- sre-devops ---
  {
    id: "c17", name: "Otávio Pimentel", email: "otavio.pimentel@example.com", jobPostingId: "sre-devops",
    yearsExperience: 7, currentRole: "SRE Sênior em streaming de vídeo",
    skills: ["Kubernetes", "Terraform", "Prometheus", "Go", "AWS"],
    resumeSummary: "Sete anos. Definiu SLOs e error budgets para 12 serviços; conduziu mais de 30 postmortems e operou transmissões ao vivo com 20x o tráfego normal. Escreve operadores Kubernetes em Go.",
    stage: "entrevista_agendada",
  },
  {
    id: "c18", name: "Vanessa Coutinho", email: "vanessa.coutinho@example.com", jobPostingId: "sre-devops",
    yearsExperience: 5, currentRole: "DevOps Pleno em plataforma de áudio",
    skills: ["Terraform", "GitHub Actions", "AWS", "Python"],
    resumeSummary: "Cinco anos, muito forte em IaC e pipelines de CI/CD. Lida com picos de lançamento só com autoscaling simples. Experiência limitada com Kubernetes em escala e com SLOs formais.",
    stage: "triagem",
  },
  {
    id: "c19", name: "Rodrigo Azevedo", email: "rodrigo.azevedo@example.com", jobPostingId: "sre-devops",
    yearsExperience: 9, currentRole: "Infra Lead em banco",
    skills: ["Kubernetes", "Ansible", "Datadog", "Bash"],
    resumeSummary: "Nove anos em ambiente regulado, plano de DR testado trimestralmente. Automação mais em Bash/Ansible que em linguagem de programação.",
    stage: "triagem",
  },
  {
    id: "c20", name: "Isabela Monteiro", email: "isabela.monteiro@example.com", jobPostingId: "sre-devops",
    yearsExperience: 6, currentRole: "Platform Engineer",
    skills: ["Kubernetes", "Terraform", "Go", "ArgoCD", "FinOps"],
    resumeSummary: "Seis anos construindo plataforma interna self-service. Cortou 30% do gasto de nuvem com rightsizing. Pouca experiência liderando incidentes.",
    stage: "entrevistado",
  },

  // --- pm-senior ---
  {
    id: "c21", name: "Carolina Veloso", email: "carolina.veloso@example.com", jobPostingId: "pm-senior",
    yearsExperience: 7, currentRole: "Senior PM em marketplace de delivery",
    skills: ["Discovery", "A/B testing", "Roadmap", "Amplitude"],
    resumeSummary: "Sete anos. Subiu a conversão da busca ao pedido em 9% com mudanças de ranking e filtros. Foco forte em dados; menos em monetização.",
    stage: "entrevista_agendada",
  },
  {
    id: "c22", name: "Leandro Pacheco", email: "leandro.pacheco@example.com", jobPostingId: "pm-senior",
    yearsExperience: 5, currentRole: "PM Pleno em fintech",
    skills: ["Roadmap", "SQL", "Figma", "OKRs"],
    resumeSummary: "Cinco anos em produto B2C financeiro. Bom em priorização e comunicação com stakeholders. Nunca trabalhou com dois lados de mercado.",
    stage: "triagem",
  },
  {
    id: "c23", name: "Sabrina Motta", email: "sabrina.motta@example.com", jobPostingId: "pm-senior",
    yearsExperience: 9, currentRole: "Head de Produto em startup",
    skills: ["Estratégia", "Pricing", "Discovery", "Gestão de times"],
    resumeSummary: "Nove anos, liderou 3 PMs. Definiu o modelo de monetização do produto atual. Anda longe do dia a dia de dados e experimentos.",
    stage: "triagem",
  },
  {
    id: "c24", name: "Mateus Brandão", email: "mateus.brandao@example.com", jobPostingId: "pm-senior",
    yearsExperience: 6, currentRole: "Product Owner em banco",
    skills: ["Backlog", "Scrum", "Jira", "Stakeholders"],
    resumeSummary: "Seis anos como PO em ambiente corporativo, forte em execução e refinamento. Pouca prática de discovery e de definir métricas de sucesso.",
    stage: "triagem",
  },

  // --- tpm-plataforma ---
  {
    id: "c25", name: "Priscila Andrade", email: "priscila.andrade@example.com", jobPostingId: "tpm-plataforma",
    yearsExperience: 4, currentRole: "PM de APIs em empresa de pagamentos",
    skills: ["REST", "OpenAPI", "Webhooks", "Developer Experience"],
    resumeSummary: "Quatro anos em API pública de pagamentos. Conduziu a migração de v1 para v2 com período de depreciação e comunicação a parceiros.",
    stage: "entrevista_agendada",
  },
  {
    id: "c26", name: "Vítor Ramalho", email: "vitor.ramalho@example.com", jobPostingId: "tpm-plataforma",
    yearsExperience: 6, currentRole: "Engenheiro que virou PM",
    skills: ["Go", "gRPC", "Roadmap", "SDKs"],
    resumeSummary: "Cinco anos de engenharia e um ano como PM. Domina a parte técnica; ainda desenvolvendo priorização com dados e visão de mercado.",
    stage: "triagem",
  },
  {
    id: "c27", name: "Tatiana Queiroz", email: "tatiana.queiroz@example.com", jobPostingId: "tpm-plataforma",
    yearsExperience: 3, currentRole: "PM em SaaS B2B",
    skills: ["Discovery", "Roadmap", "SQL", "Figma"],
    resumeSummary: "Três anos em produto B2B voltado a usuários finais. Entende pouco de integração e de como parceiros consomem a API.",
    stage: "triagem",
  },
  {
    id: "c28", name: "André Falcão", email: "andre.falcao@example.com", jobPostingId: "tpm-plataforma",
    yearsExperience: 8, currentRole: "Solutions Architect",
    skills: ["Integrações", "Pré-vendas", "REST", "Documentação"],
    resumeSummary: "Oito anos ajudando clientes a integrar com uma plataforma. Conhece de perto as dores de quem integra; nunca foi dono de roadmap.",
    stage: "triagem",
  },

  // --- product-analyst ---
  {
    id: "c29", name: "Renata Queirós", email: "renata.queiros@example.com", jobPostingId: "product-analyst",
    yearsExperience: 4, currentRole: "Analista de Produto em app de mobilidade",
    skills: ["SQL", "Python", "Amplitude", "Experimentação"],
    resumeSummary: "Quatro anos desenhando e analisando testes A/B. Identificou que um ganho de conversão era efeito de novidade e evitou um rollout errado.",
    stage: "entrevista_agendada",
  },
  {
    id: "c30", name: "Caio Vasconcelos", email: "caio.vasconcelos@example.com", jobPostingId: "product-analyst",
    yearsExperience: 2, currentRole: "Analista de BI",
    skills: ["SQL", "Looker", "Excel"],
    resumeSummary: "Dois anos em BI, muito bom em dashboards. Estatística de experimento ainda é ponto fraco; nunca participou de um A/B.",
    stage: "triagem",
  },
  {
    id: "c31", name: "Débora Linhares", email: "debora.linhares@example.com", jobPostingId: "product-analyst",
    yearsExperience: 5, currentRole: "Cientista de Dados em e-commerce",
    skills: ["Python", "Estatística", "SQL", "Causal Inference"],
    resumeSummary: "Cinco anos, rigor estatístico forte. Comunicação para áreas de negócio é o ponto a observar.",
    stage: "triagem",
  },
  {
    id: "c32", name: "Felipe Arruda", email: "felipe.arruda@example.com", jobPostingId: "product-analyst",
    yearsExperience: 3, currentRole: "Growth Analyst",
    skills: ["SQL", "Amplitude", "Marketing", "Funis"],
    resumeSummary: "Três anos em growth, ótimo com funis e aquisição. Retenção e coortes de longo prazo são menos explorados.",
    stage: "entrevistado",
  },
];
