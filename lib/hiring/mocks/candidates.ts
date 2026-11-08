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

  // --- staff-engineer ---
  {
    id: "c11",
    name: "Carolina Veloso",
    email: "carolina.veloso@example.com",
    jobPostingId: "staff-engineer",
    yearsExperience: 11,
    currentRole: "Principal Engineer em marketplace de delivery",
    skills: ["Java", "Kafka", "Arquitetura de eventos", "RFCs"],
    resumeSummary:
      "Onze anos. Liderou a extração do checkout de um monólito para serviços, com migração gradual e rollback por feature flag. Escreve RFCs que destravam decisões entre squads. Menos prática com consistência entre regiões.",
    stage: "entrevista_agendada",
  },
  {
    id: "c12",
    name: "Mateus Brandão",
    email: "mateus.brandao@example.com",
    jobPostingId: "staff-engineer",
    yearsExperience: 9,
    currentRole: "Tech Lead em banco",
    skills: ["Java", "Spring", "PostgreSQL", "Microsserviços"],
    resumeSummary:
      "Nove anos, liderou um time de oito pessoas em serviços de crédito. Domina um domínio a fundo, mas nunca definiu padrões que valessem para várias squads nem conduziu uma migração com downtime zero.",
    stage: "triagem",
  },

  // --- sdet-qa ---
  {
    id: "c13",
    name: "Marcelo Torres",
    email: "marcelo.torres@example.com",
    jobPostingId: "sdet-qa",
    yearsExperience: 5,
    currentRole: "SDET em empresa de logística",
    skills: ["Python", "Pytest", "Playwright", "GitHub Actions"],
    resumeSummary:
      "Cinco anos montando suítes de API e ponta a ponta. Reduziu o tempo do pipeline de 40 para 12 minutos paralelizando e eliminando testes instáveis. Sem experiência com testes de contrato.",
    stage: "entrevista_agendada",
  },
  {
    id: "c14",
    name: "Luciana Barreto",
    email: "luciana.barreto@example.com",
    jobPostingId: "sdet-qa",
    yearsExperience: 3,
    currentRole: "Analista de QA",
    skills: ["Testes manuais", "Postman", "Selenium IDE", "SQL"],
    resumeSummary:
      "Três anos em testes manuais e exploratórios, com bom olho para casos de borda. Automação em código ainda é básica e nunca escreveu utilitários de teste usados por outras pessoas.",
    stage: "triagem",
  },

  // --- appsec-engineer ---
  {
    id: "c15",
    name: "Roberto Câmara",
    email: "roberto.camara@example.com",
    jobPostingId: "appsec-engineer",
    yearsExperience: 5,
    currentRole: "Engenheiro de Segurança em fintech",
    skills: ["Python", "OWASP", "Semgrep", "Threat modeling", "OAuth2"],
    resumeSummary:
      "Cinco anos revisando código e modelando ameaças em fluxos de pagamento. Escreveu regras de Semgrep que pegaram uma falha de autorização entre contas. Pouca experiência com segurança de apps móveis.",
    stage: "entrevista_agendada",
  },
  {
    id: "c16",
    name: "Patrícia Nogueira",
    email: "patricia.nogueira@example.com",
    jobPostingId: "appsec-engineer",
    yearsExperience: 3,
    currentRole: "Analista de Segurança (SOC)",
    skills: ["SIEM", "Resposta a incidentes", "Burp Suite", "Python básico"],
    resumeSummary:
      "Três anos em monitoramento e resposta a incidentes, com bom conhecimento de ataques. Revisar e corrigir código de aplicação ainda é ponto a investigar.",
    stage: "triagem",
  },

  // --- android-senior ---
  {
    id: "c17",
    name: "Vinícius Ferraz",
    email: "vinicius.ferraz@example.com",
    jobPostingId: "android-senior",
    yearsExperience: 7,
    currentRole: "Engenheiro Android Sênior em app de mobilidade",
    skills: ["Kotlin", "Jetpack Compose", "Room", "WorkManager", "Coroutines"],
    resumeSummary:
      "Sete anos com Android nativo. Implementou sincronização offline com fila de operações e resolução de conflitos por versão, e reduziu os ANRs em 60%. Pouca experiência com testes de UI automatizados.",
    stage: "entrevista_agendada",
  },
  {
    id: "c18",
    name: "Helena Rocha",
    email: "helena.rocha@example.com",
    jobPostingId: "android-senior",
    yearsExperience: 4,
    currentRole: "Desenvolvedora Android Pleno",
    skills: ["Kotlin", "XML Views", "Retrofit", "MVVM"],
    resumeSummary:
      "Quatro anos em apps que dependem de internet constante, com views em XML. Não trabalhou com Compose nem com arquitetura offline-first; bateria e sincronização são ponto a investigar.",
    stage: "triagem",
  },

  // --- embedded-iot ---
  {
    id: "c19",
    name: "Ricardo Amaral",
    email: "ricardo.amaral@example.com",
    jobPostingId: "embedded-iot",
    yearsExperience: 6,
    currentRole: "Engenheiro de Firmware em empresa de telemetria",
    skills: ["C++", "FreeRTOS", "MQTT", "OTA", "CAN bus"],
    resumeSummary:
      "Seis anos com firmware de rastreadores. Implementou buffer local com reenvio e atualização OTA com rollback automático, e diminuiu o consumo de dados em 35%. Sem experiência com Rust.",
    stage: "entrevista_agendada",
  },
  {
    id: "c20",
    name: "Fernanda Lopes",
    email: "fernanda.lopes@example.com",
    jobPostingId: "embedded-iot",
    yearsExperience: 3,
    currentRole: "Desenvolvedora de Software Embarcado júnior-pleno",
    skills: ["C", "Arduino", "UART", "I2C"],
    resumeSummary:
      "Três anos com microcontroladores simples, forte em C e protocolos seriais. Nunca lidou com RTOS, rede celular instável nem com a parte de nuvem do fluxo de dados.",
    stage: "triagem",
  },
];
