/**
 * Vagas de teste do classificador, com o resultado que esperamos.
 * `focoPrincipal` é a área que deve vir em primeiro lugar.
 */
import type { FocusArea, InterviewConfig, InterviewMode } from "@/lib/contracts";
import type { Vaga } from "@/lib/pre-entrevista/classificador";

export interface VagaDeTeste extends Vaga {
  id: string;
  esperado: {
    mode: InterviewMode;
    seniority: InterviewConfig["seniority"];
    focoPrincipal: FocusArea;
  };
}

export const VAGAS: VagaDeTeste[] = [
  {
    id: "backend-senior-pagamentos",
    roleTitle: "Engenheiro(a) de Software Sênior — Backend",
    jobDescription: `Somos uma fintech que processa mais de 3 milhões de transações por dia. Procuramos uma pessoa sênior para o time de Pagamentos.

Responsabilidades:
- Desenhar e evoluir a arquitetura dos serviços de pagamento (microsserviços em Go e Kotlin)
- Garantir alta disponibilidade (99,99%) e consistência em fluxos distribuídos (sagas, idempotência)
- Definir estratégias de cache, filas (Kafka) e particionamento de banco (PostgreSQL)
- Conduzir revisões de design e mentorar engenheiros plenos e júniores
- Participar do on-call do time

Requisitos:
- 6+ anos com backend em produção
- Experiência comprovada com sistemas distribuídos de alto volume
- Vivência com observabilidade (métricas, tracing) e resposta a incidentes`,
    esperado: { mode: "system_design", seniority: "senior", focoPrincipal: "escala_produto" },
  },
  {
    id: "frontend-junior",
    roleTitle: "Desenvolvedor(a) Frontend Júnior",
    jobDescription: `Estamos contratando uma pessoa desenvolvedora frontend júnior para o time de produto de uma edtech.

Você vai:
- Implementar telas e componentes em React + TypeScript a partir dos designs do Figma
- Corrigir bugs e escrever testes unitários
- Participar de code review e pair programming com pessoas mais experientes

Buscamos:
- Até 2 anos de experiência (estágio conta!)
- Boa base de JavaScript, lógica de programação e HTML/CSS
- Vontade de aprender`,
    esperado: { mode: "live_coding", seniority: "junior", focoPrincipal: "tecnico" },
  },
  {
    id: "estagio-dados",
    roleTitle: "Estágio em Engenharia de Dados",
    jobDescription: `Vaga de estágio para estudantes de Computação, Engenharia ou áreas afins (a partir do 4º período).

Atividades:
- Escrever scripts em Python e consultas SQL para limpar e transformar dados
- Apoiar o time na manutenção de pipelines no Airflow
- Criar validações de qualidade de dados

Requisitos:
- Python e SQL básicos
- Raciocínio lógico e interesse por dados`,
    esperado: { mode: "live_coding", seniority: "junior", focoPrincipal: "tecnico" },
  },
  {
    id: "staff-plataforma",
    roleTitle: "Staff Engineer — Plataforma",
    jobDescription: `Buscamos uma pessoa Staff Engineer para liderar tecnicamente a área de Plataforma, que atende 12 times de produto.

O que você vai fazer:
- Definir a visão técnica e o roadmap da plataforma interna (Kubernetes, CI/CD, service mesh)
- Tomar decisões de arquitetura com impacto em toda a engenharia, equilibrando custo de cloud, confiabilidade e velocidade de entrega
- Liderar a migração de um monólito para serviços, sem downtime
- Escrever RFCs, conduzir revisões de arquitetura e mentorar tech leads

Requisitos:
- 10+ anos em engenharia de software, com pelo menos 3 em papel de liderança técnica
- Profundidade em sistemas distribuídos, confiabilidade (SLOs) e infraestrutura como código`,
    esperado: { mode: "system_design", seniority: "senior", focoPrincipal: "escala_produto" },
  },
  {
    id: "ia-pleno",
    roleTitle: "Engenheiro(a) de IA Pleno",
    jobDescription: `Startup de IA aplicada a atendimento ao cliente procura engenheiro(a) pleno para o time que constrói nossos agentes.

Você vai:
- Implementar agentes com LLMs (tool calling, RAG, avaliação de respostas) em TypeScript e Python
- Escrever e versionar prompts, criar avaliações automáticas e reduzir alucinações
- Usar Cursor/Claude Code no dia a dia — esperamos alta produtividade com ferramentas de IA, sem abrir mão de revisar o que é gerado
- Integrar os agentes com APIs de clientes

Requisitos:
- 3+ anos desenvolvendo software
- Experiência prática com APIs de LLM (OpenAI, Anthropic ou open-source)`,
    esperado: { mode: "live_coding", seniority: "pleno", focoPrincipal: "uso_ia" },
  },
  {
    id: "fullstack-startup",
    roleTitle: "Desenvolvedor(a) Full Stack Pleno",
    jobDescription: `Startup early-stage (time de 6 pessoas) buscando dev full stack pleno.

Nosso ritmo é intenso: entregamos para produção várias vezes por dia, as prioridades mudam toda semana e você vai falar direto com clientes para entender problemas e corrigir bugs urgentes.

Stack: Next.js, Node.js, PostgreSQL.

Buscamos alguém com 3+ anos de experiência, autonomia para resolver problemas sem especificação completa e calma para lidar com incidentes e prazos apertados.`,
    esperado: { mode: "live_coding", seniority: "pleno", focoPrincipal: "pressao" },
  },
  {
    id: "tech-lead-mobile",
    roleTitle: "Tech Lead Mobile",
    jobDescription: `Procuramos Tech Lead para o app de delivery (Android e iOS, 2 milhões de usuários ativos).

Responsabilidades:
- Liderar um time de 5 desenvolvedores mobile
- Definir a arquitetura do app (modularização, offline-first, sincronização de dados)
- Desenhar junto com o backend as APIs e estratégias de cache para picos de pedidos
- Garantir desempenho e estabilidade (crash-free acima de 99,8%)

Requisitos: 7+ anos com mobile, experiência com Kotlin e Swift, vivência liderando decisões técnicas.`,
    esperado: { mode: "system_design", seniority: "senior", focoPrincipal: "escala_produto" },
  },
];
