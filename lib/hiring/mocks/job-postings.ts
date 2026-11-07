/**
 * 10 vagas fictícias, todas de tecnologia. Toda entrevista termina em Live Coding
 * (code_editor) ou System Design (whiteboard), ou nos dois.
 * Cada uma pede um mix diferente de ferramentas, de propósito, para testar se o
 * agente interpreta a descrição em vez de aplicar um template.
 *
 * Ferramenta esperada (só referência para a demo; quem decide é o agente):
 *   backend-pleno ........ code_editor
 *   frontend-senior ...... code_editor (+ whiteboard)
 *   ml-engineer .......... code_editor + whiteboard
 *   data-engineer ........ code_editor + whiteboard
 *   sre-devops ........... whiteboard (+ code_editor)
 *   staff-engineer ....... whiteboard (system design puro: decomposição e contratos)
 *   sdet-qa .............. code_editor (+ whiteboard)
 *   appsec-engineer ...... code_editor (code review de vulnerabilidade) + whiteboard (threat model)
 *   android-senior ....... code_editor + whiteboard (app offline-first)
 *   embedded-iot ......... code_editor + whiteboard (telemetria de frota)
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
    id: "staff-engineer",
    title: "Engenheiro(a) Staff de Sistemas Distribuídos",
    seniority: "staff",
    description:
      "Marketplace com dezenas de squads e um monólito que já não acompanha o crescimento. Você define a arquitetura de referência, desenha as fronteiras entre serviços e conduz migrações grandes sem parar a operação, influenciando várias equipes sem ser dono de todas.",
    responsibilities: [
      "Decompor o monólito em serviços com contratos e donos claros",
      "Definir padrões de consistência, eventos e versionamento de APIs entre squads",
      "Conduzir migrações sem downtime, com plano de rollback e métricas de sucesso",
      "Escrever RFCs e destravar decisões de arquitetura entre times",
    ],
    requirements: [
      "8+ anos com sistemas distribuídos em produção",
      "Experiência de projetar e migrar sistemas de alto tráfego",
      "Capacidade de explicar trade-offs (consistência, custo, complexidade operacional) a pessoas de nível diferente",
    ],
    niceToHave: ["Event sourcing / CQRS", "Experiência em marketplaces ou e-commerce"],
    stack: ["Java", "Kafka", "PostgreSQL", "gRPC", "AWS"],
  },
  {
    id: "sdet-qa",
    title: "Engenheiro(a) de Qualidade (SDET) Pleno",
    seniority: "pleno",
    description:
      "Empresa de software para gestão de frotas com releases semanais. Você constrói a automação que dá segurança para entregar rápido: testes em vários níveis, ambientes previsíveis e pipelines que falham pelos motivos certos.",
    responsibilities: [
      "Escrever e manter testes automatizados de API, integração e ponta a ponta",
      "Reduzir testes instáveis (flaky) e o tempo de execução do pipeline",
      "Criar utilitários e fixtures de teste usados pelas squads",
      "Revisar código de outras pessoas com foco em testabilidade e casos de borda",
    ],
    requirements: [
      "3+ anos com automação de testes em código (não apenas ferramentas de gravação)",
      "Python ou TypeScript com boa prática de programação",
      "Experiência com CI (GitHub Actions ou similar) e testes de API",
    ],
    niceToHave: ["Testes de contrato", "Testes de carga", "Property-based testing"],
    stack: ["Python", "Pytest", "Playwright", "GitHub Actions", "Docker"],
  },
  {
    id: "appsec-engineer",
    title: "Engenheiro(a) de Segurança de Aplicações (AppSec) Pleno",
    seniority: "pleno",
    description:
      "Fintech que expõe APIs a parceiros e aplicativos móveis. Você encontra vulnerabilidades antes que cheguem à produção, ajuda as squads a corrigir e desenha controles para que os mesmos problemas não se repitam.",
    responsibilities: [
      "Revisar código e pull requests em busca de vulnerabilidades (injection, authz quebrada, SSRF, segredos expostos)",
      "Fazer threat modeling de novos fluxos de login, pagamento e integração com parceiros",
      "Automatizar verificações de segurança no pipeline (SAST, dependências, segredos)",
      "Apoiar a resposta a incidentes de segurança e a correção das causas",
    ],
    requirements: [
      "3+ anos em segurança de aplicações ou desenvolvimento com foco em segurança",
      "Domínio do OWASP Top 10 e de autenticação/autorização (OAuth2, JWT, sessões)",
      "Capacidade de ler e escrever código em pelo menos uma linguagem de backend",
    ],
    niceToHave: ["Experiência com PCI DSS", "Bug bounty", "Segurança de APIs móveis"],
    stack: ["Python", "OWASP", "Semgrep", "Burp Suite", "AWS"],
  },
  {
    id: "android-senior",
    title: "Desenvolvedor(a) Android Sênior",
    seniority: "senior",
    description:
      "App de entregas usado por entregadores em campo, muitas vezes com internet instável. Você cuida da arquitetura do app Android nativo, da sincronização offline e da bateria, para que o trabalho não pare quando a rede cai.",
    responsibilities: [
      "Definir a arquitetura do app (camadas, injeção de dependência, navegação)",
      "Implementar sincronização offline-first com resolução de conflitos",
      "Otimizar consumo de bateria, memória e tempo de inicialização",
      "Mentorar pessoas do time e revisar código",
    ],
    requirements: [
      "5+ anos com Android nativo em Kotlin",
      "Experiência com Jetpack Compose, coroutines/Flow e Room",
      "Vivência com publicação e monitoramento de apps em produção (crashes, ANRs)",
    ],
    niceToHave: ["WorkManager e geolocalização em segundo plano", "Testes de UI automatizados"],
    stack: ["Kotlin", "Jetpack Compose", "Room", "Coroutines", "Firebase"],
  },
  {
    id: "embedded-iot",
    title: "Engenheiro(a) de Software Embarcado / IoT Pleno",
    seniority: "pleno",
    description:
      "Empresa de rastreamento veicular com milhares de dispositivos em caminhões enviando telemetria por rede celular instável. Você escreve o firmware dos dispositivos e ajuda a desenhar o caminho dos dados até a nuvem, com pouca memória, pouca banda e muita necessidade de confiabilidade.",
    responsibilities: [
      "Implementar firmware em C/C++ ou Rust para dispositivos com recursos limitados",
      "Projetar protocolos de envio de telemetria com reenvio, buffer local e economia de dados",
      "Cuidar de atualização remota (OTA) segura e com rollback",
      "Depurar problemas de campo a partir de logs e métricas dos dispositivos",
    ],
    requirements: [
      "3+ anos com software embarcado em C, C++ ou Rust",
      "Entendimento de concorrência, interrupções e gerenciamento de memória",
      "Experiência com protocolos de comunicação (MQTT, UART, I2C ou similares)",
    ],
    niceToHave: ["RTOS (FreeRTOS/Zephyr)", "Experiência com dados de GPS e CAN bus"],
    stack: ["C++", "Rust", "MQTT", "FreeRTOS", "AWS IoT"],
  },
];
