/**
 * Vagas fictícias. Cada uma pede um mix diferente de ferramentas, de propósito,
 * para testar se o agente interpreta a descrição em vez de aplicar um template.
 */
import { JobPosting } from "../job-posting";

export const JOB_POSTINGS: JobPosting[] = [
  {
    id: "backend-pleno",
    title: "Desenvolvedor(a) Backend Pleno",
    seniority: "pleno",
    description:
      "Squad de pagamentos de uma fintech em crescimento. Você vai evoluir APIs que processam milhares de transações por minuto, com foco em corretude e performance.",
    responsibilities: [
      "Desenhar e implementar endpoints REST e consumidores de fila",
      "Otimizar consultas e estruturas de dados em caminhos críticos",
      "Escrever testes automatizados e participar de code review",
    ],
    requirements: [
      "3+ anos com backend em Python, Go ou Java",
      "Bom domínio de estruturas de dados e complexidade",
      "Experiência com PostgreSQL",
    ],
    niceToHave: ["Mensageria (Kafka/SQS)", "Idempotência em APIs de pagamento"],
    stack: ["Python", "PostgreSQL", "Kafka", "AWS"],
  },
  {
    id: "frontend-senior",
    title: "Desenvolvedor(a) Frontend Sênior",
    seniority: "senior",
    description:
      "Plataforma de saúde digital usada por clínicas e hospitais (prontuário eletrônico e agendamento), com dashboards pesados em dados clínicos. Buscamos alguém que cuide de performance, acessibilidade e da arquitetura do front, tratando dados sensíveis de pacientes com o cuidado que a LGPD exige.",
    responsibilities: [
      "Liderar decisões de arquitetura do front (estado, cache, design system)",
      "Garantir performance de renderização em listas e gráficos grandes",
      "Proteger dados sensíveis de pacientes no cliente: o que é exibido, armazenado em cache, logado e enviado a ferramentas de terceiros",
      "Mentorar pessoas do time",
    ],
    requirements: [
      "5+ anos com React e TypeScript",
      "Experiência com otimização de renderização e Core Web Vitals",
      "Boa prática de acessibilidade (WCAG), essencial para quem usa o sistema sob pressão no atendimento",
      "Noções de LGPD e segurança no front: XSS, armazenamento seguro, mascaramento de dados e controle de sessão",
    ],
    niceToHave: ["Next.js", "Visualização de dados", "Experiência com sistemas de saúde (HL7/FHIR)"],
    stack: ["React", "TypeScript", "Next.js", "Tailwind"],
  },
  {
    id: "staff-arquiteto",
    title: "Staff Engineer / Arquiteto(a) de Plataforma",
    seniority: "staff",
    description:
      "Plataforma de e-commerce com picos sazonais fortes (Black Friday). Você define a arquitetura de serviços críticos e orienta várias squads sobre trade-offs de escala e consistência.",
    responsibilities: [
      "Projetar sistemas distribuídos resilientes e observáveis",
      "Decidir limites entre serviços e estratégias de dados",
      "Conduzir design reviews entre squads",
    ],
    requirements: [
      "8+ anos de experiência, com sistemas de alta escala em produção",
      "Domínio de consistência, filas, cache e particionamento",
      "Capacidade de comunicar decisões arquiteturais por escrito e em diagramas",
    ],
    niceToHave: ["Event sourcing / CQRS", "Experiência em multi-região"],
    stack: ["Java", "Kafka", "Kubernetes", "PostgreSQL", "Redis"],
  },
  {
    id: "data-ml-engineer",
    title: "Engenheiro(a) de Dados / ML Pleno",
    seniority: "pleno",
    description:
      "Operadora logística com centros de distribuição em todo o país. O time de dados prevê a demanda por região e SKU para planejar estoque e frota. Você constrói pipelines confiáveis e leva modelos de previsão de experimentação até produção.",
    responsibilities: [
      "Construir e manter pipelines batch e streaming (pedidos, estoque, rotas, telemetria)",
      "Escrever transformações em SQL e Python com testes",
      "Colocar modelos de previsão de demanda em produção com monitoramento de erro e drift (sazonalidade, promoções, eventos)",
    ],
    requirements: [
      "3+ anos com engenharia de dados",
      "SQL avançado e Python",
      "Experiência com orquestração (Airflow ou similar)",
    ],
    niceToHave: ["Spark", "Feature store", "MLflow"],
    stack: ["Python", "SQL", "Airflow", "Spark", "BigQuery"],
  },
  {
    id: "sre-devops",
    title: "SRE / DevOps Sênior",
    seniority: "senior",
    description:
      "Plataforma de streaming de vídeo com picos de audiência em eventos ao vivo e lançamentos, e SLOs rígidos de disponibilidade e latência. Você automatiza infraestrutura, melhora a observabilidade e lidera resposta a incidentes.",
    responsibilities: [
      "Definir SLOs e error budgets com as squads",
      "Automatizar infraestrutura como código e pipelines de deploy",
      "Desenhar estratégias de alta disponibilidade e recuperação de desastres",
    ],
    requirements: [
      "5+ anos com infraestrutura em nuvem",
      "Kubernetes e Terraform em produção",
      "Scripting em Python ou Go para automação",
    ],
    niceToHave: ["Chaos engineering", "FinOps"],
    stack: ["Kubernetes", "Terraform", "AWS", "Prometheus", "Go"],
  },

  // --- Produto ---
  {
    id: "pm-senior",
    title: "Product Manager Sênior",
    seniority: "senior",
    description:
      "Marketplace de serviços com dois lados (clientes e prestadores). Você é dono do funil de contratação: da busca até o pagamento. Precisa transformar dados e conversas com usuários em apostas priorizadas.",
    responsibilities: [
      "Definir a estratégia e o roadmap do funil de contratação",
      "Priorizar entre iniciativas concorrentes com dados e trade-offs explícitos",
      "Definir métricas de sucesso e desenhar experimentos A/B",
      "Alinhar design e engenharia em torno de problemas, não de soluções",
    ],
    requirements: [
      "5+ anos como PM em produto digital com tração",
      "Capacidade de decompor métricas (conversão, retenção, LTV)",
      "Experiência conduzindo discovery com usuários",
    ],
    niceToHave: ["Marketplaces", "Monetização e pricing"],
    stack: ["Amplitude", "Figma", "Jira", "SQL básico"],
  },
  {
    id: "tpm-plataforma",
    title: "Technical Product Manager (Plataforma e APIs)",
    seniority: "pleno",
    description:
      "Produto de plataforma consumido por outras empresas via API. O público do produto são desenvolvedores, então você precisa entender integração, versionamento e experiência de quem desenvolve.",
    responsibilities: [
      "Definir o contrato e a evolução das APIs públicas junto com engenharia",
      "Priorizar melhorias de developer experience (docs, SDKs, sandbox)",
      "Decidir como lidar com mudanças que quebram compatibilidade",
      "Acompanhar adoção e confiabilidade da plataforma",
    ],
    requirements: [
      "3+ anos como PM, de preferência em produto técnico",
      "Entendimento de REST, autenticação, rate limiting e webhooks",
      "Conseguir conversar de igual para igual com times de engenharia",
    ],
    niceToHave: ["Já ter programado", "Experiência com programas de parceiros"],
    stack: ["OpenAPI", "Postman", "Datadog", "Jira"],
  },
  {
    id: "product-analyst",
    title: "Product Analyst Pleno",
    seniority: "pleno",
    description:
      "Time de produto de um app de consumo. Você traduz dúvidas do negócio em análises: onde o usuário abandona, o que mudou depois de um lançamento e se um experimento deve ir para 100%.",
    responsibilities: [
      "Analisar funis, coortes e retenção",
      "Desenhar e interpretar experimentos A/B",
      "Construir dashboards e acompanhar métricas-chave com o time",
      "Apresentar recomendações claras para PMs e liderança",
    ],
    requirements: [
      "3+ anos em análise de produto ou dados",
      "SQL avançado e noções de estatística (significância, viés)",
      "Boa comunicação de resultados para público não técnico",
    ],
    niceToHave: ["Python para análise", "Causal inference"],
    stack: ["SQL", "Amplitude", "Looker", "Python"],
  },
];
