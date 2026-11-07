# Propostas de Diferenciais de Produto (Área de Tecnologia)

Documento consolidado após 3 rodadas de auditoria contra concorrentes internacionais (**Mercor, micro1, Apriora/Alex, Ribbon, CodeSignal, HackerRank, Codility, Woven, Karat, Byteboard, Metaview e HelloInterview**) e validação direta contra a arquitetura existente no repositório.

---

## As 5 Propostas Blindadas

### 1. Incidente Consciente da Topologia (Chaos Injection Espacial sem Atropelar o Candidato)
- **Onde o mercado para hoje:** No B2B (*CodeSignal, HackerRank*), o System Design é estático ou exige entrevistador humano. Mocks B2C (*HelloInterview*) fazem follow-ups orais e *Byteboard* usa código legado assíncrono — mas **nenhuma plataforma B2B age espacialmente sobre o diagrama vivo do candidato em tempo real**.
- **Como funciona na ferramenta:**
  1. **Respeito ao Fluxo Cognitivo (Zero "Jumpscare"):** Coerente com nossa regra anti-interrupção (`esperarCandidatoLivre()` + `Plin`), o incidente **nunca corta o candidato no meio de um traço**. Ele entra como marco natural da transição `ALTO_NIVEL → APROFUNDAMENTO`, levantando um **Plin de Incidente** para o candidato abrir quando concluir o pensamento atual.
  2. **Adaptação à Topologia (`conversor.ts`):**
     - *Sem redundância no grafo (ex.: `API → Redis → Postgres`):* A mão do agente (`coreografia.ts`) circula o `Redis`, anota `[QUEDA: 40 mil req/s]` no quadro e pergunta como proteger o Postgres da debandada de conexões (*thundering herd*).
     - *Com redundância já desenhada por candidato sênior:* O agente reconhece a defesa e escala para falha de **2º nível** (*"Você já previu réplica no Redis: se o primário cair antes de replicar chaves de idempotência em voo, como sua API evita cobrança duplicada?"*).
  3. **Critério Padronizado:** Avalia as 4 etapas formais de resposta a incidente (isolamento → detecção de cascata → contenção → degradação graciosa), não quem responde mais rápido no improviso.

---

### 2. Sabatina por Contrato de Invariante (Anti-Cola e Anti-"Teleprompter Invisível", sem Spyware)
- **Onde o mercado para hoje:** *CodeSignal, Codility e Filtered* punem colagens com *Suspicion Score* e tentam combater overlays invisíveis (*Cluely, Interview Coder, UltraCode*) instalando agentes invasivos no PC do candidato (o que afasta devs seniores). Já *HackerRank* e *Mercor* pedem apenas para *"explicar o código"*, permitindo que o candidato leia a tela em voz alta.
- **Como funciona na ferramenta (Design Pedagógico em vez de Vigilância):**
  1. **Duplo Gatilho (`detectKeyMoment` em `analyst.ts`):**
     - *Gatilho Imediato:* Colagem externa relevante — ignora código que já estava no `codeHistory` da própria sessão (`Ctrl+X / Ctrl+V` de refatoração) e ignora boilerplate sem fluxo de controle (`if/for/while`/estruturas de dados).
     - *Gatilho de Estabilização (Anti-Teleprompter):* Mesmo que o candidato digite tudo letra por letra lendo de uma segunda tela/overlay sem dar `Ctrl+V`, o **primeiro `run` com todos os testes visíveis passando** dispara a verificação sobre a implementação entregue.
  2. **Pergunta de Invariante Neutro (Zero Acusação Alucinada):** Sem acusar bugs inexistentes (respeitando o isolamento de `suspiciousLines` em `prompts/interviewer.ts`), o agente grifa 2–3 linhas críticas (`highlight_range`) e cobra o contrato do código concreto (*"Nas linhas 14–18, qual condição garante que chaves repetidas não sobrescrevam o índice anterior?"*). Teleprompters genéricos travam em perguntas amarradas às linhas exatas do candidato.
  3. **Domínio Auditável no Relatório:** Substitui o contador frio de `pastes` (`evaluator.ts`) pelo cruzamento `gatilho + probeOutcome`, atestando **Domínio sobre o Código Entregue**.

---

### 3. Card de Trilha Cognitiva (3 Estados com Prova Visual e Diff Semântico)
- **Onde o mercado para hoje:** *CodeSignal* exibe apenas player bruto de teclas (*Session Replay*); *Metaview/BrightHire* citam trechos de áudio de entrevistas humanas; *Karat* trata dicas apenas como perda de pontos (*Handholding*). Ninguém correlaciona **intervenção socrática ↔ evolução estrutural do artefato** lado a lado.
- **Duas armadilhas evitadas:**
  - Não medimos "segundos brutos até clicar" (que puniria o sênior que reflete 60s em silêncio antes de redesenhar certo).
  - Não deixamos o card vazio quando um candidato excelente acerta tudo de primeira sem precisar corrigir rota.
- **Como funciona no `Relatorio.tsx` (Renderização em 3 Estados):**
  - **Estado A — Antecipação Autônoma (`espontaneo: true`):** Selo *"Arquitetura Defensiva Espontânea"*. Mostra `[Desenho Inicial já blindado] → [Estresse de 2º nível do Agente] → [Sustentação Técnica Firme]` (sinal Sênior/Staff com zero tutela).
  - **Estado B — Inflexão Adaptativa:** Mostra lado a lado `[Miniatura Antes (gargalo)] → [Provocação Exata do Agente] → [Miniatura Depois + Diff Semântico (+Cache, +Fila)]`.
  - **Estado C — Rigidez Técnica:** Mostra `[Miniatura Antes] → [Provocação / Dica] → [Manteve o gargalo sem convergir]`.

---

### 4. Reverse Pitch com Grounding Estrito + Handoff Cirúrgico para o Tech Lead
- **Onde o mercado para hoje:** Bots de triagem (*Mercor, micro1, Apriora, Ribbon*) fazem interrogatórios unilaterais que geram desistência de seniores e deixam um abismo entre a triagem automatizada e a entrevista final humana.
- **Como funciona na ferramenta:**
  1. **Mesa Invertida no `FECHAMENTO`:** Nos 2 minutos finais, o candidato pode sabatinar o agente sobre stack, arquitetura e rotina do time. O agente responde **estritamente** com o que foi documentado na pré-entrevista com o Totti, encaminhando salário, bônus e políticas de RH para a etapa humana (zero risco de promessa indevida).
  2. **Sinal de Senioridade + Pauta Pronta (`briefing_para_proxima_etapa` / `nextSteps`):** O relatório classifica a maturidade das perguntas feitas pelo candidato e entrega o **Guia de Handoff do Tech Lead** — indicando exatamente quais 2 pontos ficaram parciais na triagem para o líder humano aprofundar sem repetir perguntas.

---

### 5. Calibração Instantânea da Régua em 1,5s (Ponte Totti → Rubrica → Slack)
- **Onde o mercado para hoje:** Em *HackerRank* e *TestGorilla*, calibrar a régua exige que engenheiros gastem horas testando a prova manualmente; no *CodeSignal*, depende de milhares de candidatos históricos.
- **Como funciona para qualquer vaga (mesmo inédita):**
  - Na pré-entrevista, o Totti traduz o alinhamento com a recrutadora nas **4 Áreas de Foco Estratégico** (`tecnico`, `pressao`, `escala_produto`, `uso_ia` em `contracts.ts` / `FocusPoint` em `job-posting.ts`), cujos pesos modulam os **4 Critérios Universais de Engenharia** (`entendimento_problema`, `estrutura_raciocinio`, `tradeoffs_priorizacao`, `comunicacao` em `gerador-kit.ts`) e os critérios específicos da vaga.
  - Ao clicar em **"Simular Régua da Vaga"**, o sistema executa em **~1,5s** uma **projeção determinística** dessa matriz de pesos e travas sobre os perfis-âncora calibrados (`cenarios.ts`) e posta na thread de revisão do Tech Lead no Slack (`slack/notify.ts`):
    > *"Com 40% em Pressão e 35% em Escala, esta régua aprova o Perfil-Âncora Sênior (3,6/4), deixa o Pleno em ressalva (2,5/4) e retém o Júnior (1,7/4). Aprovar régua e disparar convites?"*

---

## Estratégia de Execução e Palco (180 Segundos vs. Q&A)

| Papel no Pitch | Combinação | Roteiro exato (sem estourar os 3 minutos) | Esforço no código |
| :--- | :--- | :--- | :--- |
| **1. Fio Condutor Oficial de Palco (180s)** — *Combo Campeão (5 + 1 + 3 + Handoff)* | **Do Alinhamento Blindado ao Caos Auditável** | **0:00–0:40:** Totti fecha a vaga com a recrutadora e posta a Calibração Instantânea (1,5s) aprovada no Slack.<br>**0:40–1:55:** No Excalidraw (já aberto com seed inicial `Cliente → API` para não perder tempo desenhando do zero), o candidato conecta `Redis → Postgres`; na transição para Aprofundamento, a mão do agente anota o `Incidente Consciente da Topologia` e o candidato adapta.<br>**1:55–3:00:** Abre o `Relatorio.tsx` exibindo o **Card de Trilha Cognitiva** (`Antes → Incidente → Depois` com fotos reais), o Handoff do Tech Lead e a aprovação indo para o Slack. | **Baixo–Médio** (reaproveita `coreografia.ts`, `conversor.ts`, `Relatorio.tsx`, `cenarios.ts` e `slack/notify.ts`, com gatilho determinístico para zero risco de rede). |
| **2. Carta na Manga de Arquitetura Dual (Slide + Q&A)** — *Combo Live Coding (2 + 3)* | **Sabatina de Invariante na Era de Código Assistido** | Em 1 frase no pitch (e pronta na aba `/entrevista` para o Q&A): *"Quando o Totti recomenda Live Coding em vez de System Design, a mesma filosofia atua: zero spyware invasivo, Sabatina de Invariante no código colado ou recém-passado e o mesmo Card de Trilha Cognitiva no final."* | **Baixo** (`analyst.ts` já tem `detectKeyMoment` para `paste` e primeiro `run` verde + grifo no Monaco; falta só o filtro de `codeHistory`/complexidade). |

---

## Defesa Rápida para as 4 Perguntas Mais Difíceis da Banca (Q&A)

1. **"Se o incidente muda conforme o desenho, como garantir isonomia jurídica entre candidatos?"**
   A prova estática só mede quem decorou o problema antes. Nossa isonomia está na **Rubrica Invariante de Resiliência** (isolamento, cascata, contenção e degradação graciosa) aplicada igual para todos, somada a **100% de prova material auditável** (foto do quadro + fala com timestamp exato) para decisão final sempre humana no Slack.
2. **"E se o candidato usar overlays invisíveis como Cluely / Interview Coder sem dar Ctrl+V?"**
   Em vez de entrar na corrida perdida de instalar spyware invasivo na máquina do candidato, vencemos por **design pedagógico**: overlays invisíveis não conseguem redesenhar um incidente espacial injetado na topologia própria do candidato no Excalidraw, nem sustentar perguntas de invariante amarradas às linhas específicas que ele acabou de escrever.
3. **"Qual o custo de IA e latência por entrevista em escala B2B?"**
   Em vez de mandar screenshots contínuos para modelos de visão caros, o `conversor.ts` traduz o Excalidraw em grafo textual determinístico + diff (~US$ 0,0012 e ~2,8s por análise ao vivo), rodando o modelo pesado de scorecard apenas **1 vez de forma assíncrona** ao encerrar — mantendo o custo total na casa de centavos por entrevista.
4. **"A mão desenhando incidente não parece 'gamificado' demais para um engenheiro sênior?"**
   O que repele seniores é webcam policialesca e bot que interrompe o raciocínio. Um agente que espera o dev terminar de desenhar (`Plin`), discute *thundering herd* e replicação sobre a arquitetura dele e abre os minutos finais para responder sobre os desafios reais do time trata o candidato como engenheiro sênior, não como suspeito.
