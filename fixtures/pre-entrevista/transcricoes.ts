/**
 * Transcrições falsas de pré-entrevista, para testar a extração do rascunho.
 * `vagaId` aponta para uma vaga de `fixtures/pre-entrevista/vagas.ts`.
 */
import type { Turno } from "@/lib/pre-entrevista/rascunho";

export interface TranscricaoDeTeste {
  id: string;
  vagaId: string;
  turnos: Turno[];
}

export const TRANSCRICOES: TranscricaoDeTeste[] = [
  {
    id: "ia-pleno",
    vagaId: "ia-pleno",
    turnos: [
      {
        role: "agente",
        text: "Oi! Vou te fazer algumas perguntas pra montar a entrevista dessa vaga de Engenheiro de IA Pleno. Me conta o que o time mais precisa?",
      },
      { role: "recrutadora", text: "Oi! A gente precisa de alguém pra construir os agentes de atendimento, com LLM, tool calling e RAG." },
      {
        role: "agente",
        text: "Pelo que você colou, eu faria uma entrevista de live coding, com código na IDE. Faz sentido pra essa vaga?",
      },
      { role: "recrutadora", text: "Faz sentido, pode ser live coding." },
      { role: "agente", text: "E a senioridade, pleno mesmo, com uns três a cinco anos de experiência?" },
      { role: "recrutadora", text: "Isso, pleno. Precisa ter autonomia pra entregar funcionalidade de ponta a ponta." },
      { role: "agente", text: "Sobre o foco, eu daria mais peso a uso de IA e um pouco a domínio técnico. Acha que está certo?" },
      {
        role: "recrutadora",
        text: "Uso de IA é o principal, sim. Pra mim o mais importante é ver se a pessoa revisa o código que a IA gera e não só aceita. Domínio técnico também conta. Pressão eu tiraria do foco, não é tão relevante pra gente.",
      },
      { role: "agente", text: "Quando você fala em revisar, o que seria uma boa resposta pra você?" },
      {
        role: "recrutadora",
        text: "Ler o código que a IA sugeriu, explicar o que cada parte faz e achar pelo menos um problema ou caso de borda antes de rodar. Ruim é colar a resposta sem entender e não saber dizer por que ela funciona.",
      },
      { role: "agente", text: "Como você quer que seja o tom da entrevista? Mais amigável, ou mais pressionada?" },
      { role: "recrutadora", text: "Amigável, por favor. Quero que ele se sinta à vontade. A gente não faz maratona de algoritmo." },
      { role: "agente", text: "Quanto tempo reservamos pra entrevista? E posso dar dicas se ele travar?" },
      { role: "recrutadora", text: "Uns quarenta minutos. Pode dar dica leve se ele travar, sem entregar a solução." },
      { role: "agente", text: "Perfeito. Tem algo sobre o time ou o momento da contratação que eu deva considerar?" },
      { role: "recrutadora", text: "O time é pequeno, são quatro pessoas. Então precisa de autonomia. Anota aí." },
    ],
  },
  {
    id: "backend-senior-pagamentos",
    vagaId: "backend-senior-pagamentos",
    turnos: [
      {
        role: "agente",
        text: "Oi! Vamos montar a entrevista dessa vaga de Engenheiro Sênior de Backend. O que é mais importante pra vocês?",
      },
      {
        role: "recrutadora",
        text: "A gente processa uns três milhões de transações por dia. Preciso de alguém que desenhe a arquitetura dos serviços de pagamento.",
      },
      {
        role: "agente",
        text: "Pelo que você colou, eu faria uma entrevista de system design, desenhando a arquitetura num quadro. Confere?",
      },
      { role: "recrutadora", text: "Confere, system design." },
      { role: "agente", text: "E a senioridade é sênior mesmo, com mais de seis anos de experiência?" },
      { role: "recrutadora", text: "Sênior sim. Ele vai liderar decisões técnicas e mentorar o time." },
      { role: "agente", text: "Sobre o foco, eu daria peso a escala e produto, e a domínio técnico. Faz sentido?" },
      {
        role: "recrutadora",
        text: "Escala e produto é o principal. Domínio técnico também. O ponto central pra mim é idempotência e consistência: ele precisa evitar cobrança duplicada e manter o saldo certo quando algo falha no meio.",
      },
      { role: "agente", text: "Como seria uma boa resposta nesse ponto?" },
      {
        role: "recrutadora",
        text: "Bom é ele pensar em falhas e retries desde o começo: o que acontece se o cliente clicar duas vezes, se o serviço cair depois de cobrar, se a fila reenviar a mensagem. Ruim é desenhar só o caminho feliz e deixar as falhas pro final.",
      },
      { role: "agente", text: "Tem algo que faria alguém ser reprovado direto, independente do resto?" },
      { role: "recrutadora", text: "Sim: se ele não considerar falhas de rede. Isso é eliminatório pra mim." },
      { role: "agente", text: "Quanto tempo você quer reservar pra entrevista?" },
      { role: "recrutadora", text: "Eu tinha falado quarenta e cinco minutos, mas pensando melhor, sessenta. O desenho é grande." },
      { role: "agente", text: "Anotado, sessenta minutos. E o tom: prefere uma conversa mais amigável, ou mais desafiadora?" },
      {
        role: "recrutadora",
        text: "Mais desafiadora. Quero ver como ele defende uma decisão quando eu questiono. Sem dicas, ele que se vire.",
      },
    ],
  },
];
