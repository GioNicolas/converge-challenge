/**
 * 10 vagas fictícias: 6 de tecnologia/produto e 4 de construção civil.
 * Cada uma pede um mix diferente de ferramentas, de propósito, para testar se o
 * agente interpreta a descrição em vez de aplicar um template.
 *
 * Ferramenta esperada (só referência para a demo; quem decide é o agente):
 *   backend-pleno ........ code_editor
 *   frontend-senior ...... code_editor (+ whiteboard)
 *   ml-engineer .......... code_editor + whiteboard
 *   data-engineer ........ code_editor + whiteboard
 *   sre-devops ........... whiteboard (+ code_editor)
 *   pm-senior ............ whiteboard
 *   coordenador-obras .... whiteboard
 *   planejador-orcamentista whiteboard
 *   engenheiro-seguranca . whiteboard (layout de canteiro, rotas de fuga, riscos)
 *   arquiteto-comercial .. whiteboard (setorização e fluxo, sem medidas)
 */
import { JobPosting } from "../job-posting";

export const JOB_POSTINGS: JobPosting[] = [
  // ---------------------------------------------------------------- Tecnologia
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
    id: "ml-engineer",
    title: "Engenheiro(a) de Machine Learning Pleno",
    seniority: "pleno",
    description:
      "Operadora logística com centros de distribuição em todo o país. O time de ML prevê a demanda por região e SKU para planejar estoque e frota. Você leva modelos de previsão da experimentação até produção e garante que continuem confiáveis.",
    responsibilities: [
      "Treinar, validar e colocar em produção modelos de previsão de demanda",
      "Monitorar erro e drift (sazonalidade, promoções, eventos)",
      "Construir features e pipelines de treino reprodutíveis",
    ],
    requirements: [
      "3+ anos com ML aplicado, de preferência séries temporais",
      "Python, scikit-learn e/ou gradient boosting",
      "Experiência levando modelos a produção com monitoramento",
    ],
    niceToHave: ["MLflow", "Feature store", "Otimização de estoque"],
    stack: ["Python", "scikit-learn", "MLflow", "Airflow", "BigQuery"],
  },
  {
    id: "data-engineer",
    title: "Engenheiro(a) de Dados Pleno",
    seniority: "pleno",
    description:
      "Rede de varejo com centenas de lojas. O time de dados constrói a base que alimenta vendas, estoque e relatórios da diretoria. Você garante pipelines confiáveis, dados testados e custo sob controle.",
    responsibilities: [
      "Construir e manter pipelines batch e streaming",
      "Escrever transformações em SQL e Python com testes de qualidade",
      "Modelar o data warehouse e controlar custo de consulta",
    ],
    requirements: [
      "3+ anos com engenharia de dados",
      "SQL avançado e Python",
      "Experiência com orquestração (Airflow ou similar)",
    ],
    niceToHave: ["Spark", "dbt", "Streaming com Kafka"],
    stack: ["Python", "SQL", "Airflow", "dbt", "BigQuery"],
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

  // ---------------------------------------------------------- Construção civil
  {
    id: "coordenador-obras",
    title: "Coordenador(a) de Obras Sênior",
    seniority: "senior",
    description:
      "Construtora de edifícios residenciais com três obras simultâneas. Você coordena equipes próprias e empreiteiros, protege o cronograma e o orçamento e garante a segurança no canteiro.",
    responsibilities: [
      "Sequenciar as etapas da obra e administrar o caminho crítico",
      "Organizar o layout do canteiro, a logística de materiais e o uso de grua e elevadores",
      "Gerir empreiteiros, medições e interferências entre disciplinas",
      "Garantir o cumprimento das normas de segurança (NR-18)",
    ],
    requirements: [
      "7+ anos em obra, formação em Engenharia Civil",
      "Planejamento com MS Project, Primavera ou similar",
      "Experiência com edifícios de múltiplos pavimentos",
    ],
    niceToHave: ["BIM", "Lean construction", "Pós-graduação em gerenciamento de obras"],
    stack: ["MS Project", "AutoCAD", "BIM", "Sienge"],
  },
  {
    id: "planejador-orcamentista",
    title: "Planejador(a) e Orçamentista de Obras Pleno",
    seniority: "pleno",
    description:
      "Construtora que precisa de previsibilidade de prazo e custo. Você transforma projetos em quantitativos, orçamento e cronograma físico-financeiro, e acompanha o desvio entre o previsto e o realizado.",
    responsibilities: [
      "Levantar quantitativos a partir dos projetos e compor custos",
      "Montar a EAP, o cronograma e a curva S da obra",
      "Acompanhar o realizado e propor ações quando houver desvio",
    ],
    requirements: [
      "3+ anos em planejamento ou orçamento de obras",
      "Domínio de composições de custo (SINAPI ou base própria)",
      "Excel avançado e MS Project",
    ],
    niceToHave: ["Orçamento paramétrico", "BIM 5D"],
    stack: ["Excel", "SINAPI", "MS Project", "Sienge"],
  },
  {
    id: "engenheiro-seguranca",
    title: "Engenheiro(a) de Segurança do Trabalho (Obras) Pleno",
    seniority: "pleno",
    description:
      "Construtora com várias frentes de obra ao mesmo tempo. Você antecipa riscos, organiza o canteiro para que as pessoas circulem e trabalhem com segurança e conduz o que fazer quando algo dá errado.",
    responsibilities: [
      "Planejar o layout seguro do canteiro: acessos, áreas de vivência, circulação de máquinas e rotas de fuga",
      "Mapear riscos por etapa da obra e definir controles (PGR/PCMAT)",
      "Desenhar o fluxo de permissão de trabalho para atividades críticas (altura, espaço confinado, içamento)",
      "Conduzir investigação de acidentes e plano de ação",
    ],
    requirements: [
      "3+ anos em segurança do trabalho em obras",
      "Domínio das NRs aplicáveis (NR-18, NR-35, NR-12)",
      "Capacidade de explicar risco e controle para equipes e empreiteiros",
    ],
    niceToHave: ["ISO 45001", "Experiência com obras verticais"],
    stack: ["AutoCAD", "PGR", "Checklists digitais"],
  },
  {
    id: "arquiteto-comercial",
    title: "Arquiteto(a) de Projetos Comerciais e Varejo Pleno",
    seniority: "pleno",
    description:
      "Escritório de arquitetura especializado em lojas, restaurantes e centros comerciais. Você transforma o objetivo do negócio em um espaço que funciona: onde o cliente entra, circula e compra, e como a operação se abastece sem atrapalhar.",
    responsibilities: [
      "Levantar o programa de necessidades com o cliente e traduzi-lo em setorização",
      "Desenhar o fluxo de clientes, funcionários e abastecimento",
      "Definir a implantação e a hierarquia de espaços (vitrine, circulação, caixa, estoque)",
      "Compatibilizar o conceito com restrições de norma, custo e cronograma",
    ],
    requirements: [
      "3+ anos em projeto comercial ou de varejo",
      "Conhecimento de acessibilidade e de rotas de saída em linhas gerais",
      "Capacidade de defender decisões de projeto para o cliente",
    ],
    niceToHave: ["Experiência com franquias", "BIM"],
    stack: ["Revit", "AutoCAD", "SketchUp"],
  },
];
