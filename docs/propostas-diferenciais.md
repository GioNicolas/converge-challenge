# Propostas de Diferenciais de Produto — Por Que Escolher o Totti

Ideias de funcionalidades e formatos para somar ao fluxo que o **Totti já tem hoje** (pré-entrevista de alinhamento da vaga + revisão do plano com o Tech Lead no Slack + entrevista ao vivo em código/quadro + relatório), focadas em:
1. **Deixar a entrevista genuinamente interessante de viver** (fim da prova escolar fria de *LeetCode* e do interrogatório robótico unilateral);
2. **Fazer uma empresa escolher o Totti em vez de CodeSignal, HackerRank, Karat, Mercor, micro1 ou Apriora**.

---

## O Problema Real das Ferramentas Gringas Hoje

| Categoria lá fora | Exemplos | Por que empresas e candidatos rejeitam |
| :--- | :--- | :--- |
| **Provas de algoritmo e vigilância** | *CodeSignal, HackerRank, Codility* | **60%+ de desistência de seniores** (fecham a aba ao ver puzzle tipo *Two Sum* e webcam policialesca), falsos positivos com colas de 2ª tela e zero relação com o dia a dia do time. |
| **Bots interrogadores de 1ª geração** | *Mercor, micro1 (Zara), Apriora (Alex), FloCareer* | **Interrogatório frio de mão única:** cortam o candidato, não sabem nada sobre a empresa real, não respondem dúvidas técnicas sobre a vaga e geram rejeição da marca empregadora. |
| **Fábricas terceirizadas humanas** | *Karat, Intervue* | Caríssimas (US$ 200–400 por entrevista), seguem roteiros engessados de telemarketing técnico e não conhecem a cultura nem a arquitetura da squad contratante. |

---

## Diferenciais Propostos para o Produto

### 1. Decisão em 60s no Slack com 3 Clipes de Ouro + Guia dos Primeiros 30 Dias
Elimina tanto a nota fria em que ninguém confia (`78/100`) quanto o relatório longo de 15 páginas que nenhum líder ocupado lê.

- **Como funciona no produto (evoluindo o card de decisão que já vai pro Slack):**
  - Assim que a entrevista acaba, o Tech Lead recebe no Slack o veredito acompanhado de **3 cortes clicáveis de 20 segundos** (voz do candidato + trecho exato do código ou da lousa sincronizados):
    - 🟢 **Onde brilhou (20s):** o momento exato em que destravou o gargalo principal;
    - 🟡 **Onde hesitou (20s):** o ponto específico para o líder explorar na conversa final humana (sem perder tempo repetindo o resto da entrevista);
    - 🔵 **Visão de time/produto (20s):** a melhor troca de trade-off ou pergunta feita pelo candidato sobre a vaga.
  - **Guia dos Primeiros 30 Dias:** 2 linhas práticas de onboarding caso seja contratado (*ex.: "Muito forte e pragmático em incidentes; nos primeiros 30 dias vale parear com alguém sênior da casa em modelagem relacional"*).
  - **Cada clique ensina o Totti:** o `Aprovar`/`Reprovar` desse card é a principal fonte de aprendizado da **Memória Viva da Squad (#5)**.
- **Por que faz a empresa escolher o Totti:** vicia o gestor técnico na primeira semana. Em **1 minuto pelo celular no Slack**, entre duas reuniões, o Tech Lead ouve a própria voz do candidato nos 3 lances decisivos e aprova com 100% de segurança — economizando 20+ horas de engenharia por mês.

---

### 2. Escolha de Arena pelo Candidato (`Choose Your Arena`)
Em vez de empurrar todo mundo para o mesmo teste engessado onde bons engenheiros travam ou desistem, o candidato escolhe **em qual arena quer provar sua senioridade**.

- **Como funciona na entrevista:**
  - **Checkpoint comum rápido (10 min):** todos passam por uma leitura/ajuste curto de código real para garantir base técnica comparável (ninguém foge de código).
  - **Arena principal escolhida pelo candidato (20 min):**
    1. **Parear na IDE:** evoluir e refatorar uma funcionalidade real lado a lado com o Totti;
    2. **Plantão de Incidente (`War Room`):** investigar um gargalo/queda de produção em dupla com o Totti; ou
    3. **Dissecar sua Própria Obra:** abrir um repositório público seu na IDE **ou** (para os 70% que trabalham sob NDA em bancos/empresas fechadas) desenhar na lousa, de forma anonimizada, o sistema mais crítico que já operou na carreira e ser sabatinado sobre os gargalos reais dele.
  - O Totti avalia **exatamente a mesma régua de critérios da vaga** (já alinhada na pré-entrevista) nas três arenas.
- **Por que faz a empresa escolher o Totti:** derruba o abandono de candidatos seniores (quem fecha a aba do *HackerRank* aceita na hora falar sobre sistemas reais ou escolher seu melhor formato) e inviabiliza cola pronta de ChatGPT.

---

### 3. O Totti como Colega de Squad, Não Fiscal de Prova (`Pair & War Room Cooperativo`)
Muda completamente o clima da sessão: o Totti deixa de ser um juiz mudo esperando o candidato errar e passa a agir como um **colega pleno do time trabalhando junto com você numa segunda-feira de manhã**.

- **Como funciona na entrevista:**
  - **Na IDE (Pareamento Vivo):** o Totti escreve um primeiro rascunho ou hipótese no código e puxa conversa de igual para igual (*"Escrevi esse retry na linha 42, mas se a fila engasgar acho que vamos estourar o pool de conexões — como você mudaria isso comigo?"*).
  - **Na Lousa / Incidente (`War Room`):** o Totti atua como o engenheiro de plantão ao seu lado — você pede para ele puxar logs, checar latência do banco ou testar hipóteses enquanto você lidera o diagnóstico (ele executa o apoio mecânico, mas nunca entrega a decisão pronta).
- **Por que faz a empresa escolher o Totti:** nenhuma empresa contrata dev para inverter árvore binária em silêncio; contrata para **trabalhar em equipe, revisar código alheio, orientar colegas e pensar sob imprevisto**. Nenhuma plataforma autônoma gringa avalia colaboração real de bancada — e nenhum *teleprompter* de cola sobrevive a um diálogo vivo a quatro mãos.

---

### 4. O Totti Abre o Capô da Vaga & Vende o Time (`Closer de Talentos`)
Transforma a entrevista de um filtro frio que espanta gente boa em um **ímã que faz os melhores engenheiros quererem trabalhar na empresa**.

- **Como funciona na entrevista:**
  - **Desafio-Espelho Anonimizado:** aproveitando o alinhamento prévio que o Totti já faz com a recrutadora e o Tech Lead, o problema é ambientado na mesma dor técnica real da vaga (*ex.: conciliação assíncrona de alto volume*), sem expor código, nomes internos ou dados confidenciais.
  - **Mesa Invertida nos Minutos Finais:** o Totti vira a chave — conta com transparência qual é o desafio real que espera a pessoa nos primeiros meses, como funcionam deploy e autonomia na squad, responde dúvidas técnicas do candidato e **avalia a maturidade das perguntas que ele faz**.
- **Por que faz a empresa escolher o Totti:** empresas disputam devs seniores a tapas. Nos bots gringos (*Mercor, micro1, Apriora*), o candidato sai desanimado sem saber nada da vaga; no Totti, ele sai empolgado com o problema real do time, aumentando diretamente a **taxa de aceite de propostas (`Offer Acceptance Rate`)**.

---

### 5. Memória Viva da Squad: o Totti Aprende com Cada Decisão do Tech Lead (`Squad Memory`) — ✅ Decidido: vamos fazer
Lá fora, a régua é **configurada uma vez por um humano e fica parada**: a *Karat* calibra com o cliente no início do contrato, e *CodeSignal*/*HackerRank* deixam montar testes próprios, mas nenhum muda sozinho depois. No Totti, **a régua muda a cada decisão do Tech Lead, sem formulário**, e o time vê exatamente o que mudou.

- **Como funciona no produto:**
  - **O Totti aprende com o que o Tech Lead já faz no Slack** (sem pedir nada a mais):
    - o motivo do `Reprovar` (*ex.: "reprovei porque propôs Kafka sem necessidade para esse volume"*);
    - uma linha opcional no `Aprovar` (*"o que te convenceu?"*);
    - os pedidos de `Ajustar` no plano da entrevista (*ex.: "menos algoritmo, mais modelagem de dados"*).
  - **Cada motivo vira uma regra técnica curta**, com origem rastreável (qual candidato ou qual plano gerou a regra):
    - 🔴 *"Penaliza over-engineering: reprovou quem propôs Kafka para volume baixo"*;
    - 🟢 *"Valoriza quem pergunta sobre observabilidade antes de codar"*.
  - **Tela "O que o Totti aprendeu sobre a squad":** lista de regras ativas, com origem, que o Tech Lead pode **editar, desligar ou apagar**. O aprendizado nunca fica escondido.
  - **Na entrevista seguinte**, as regras entram no plano e na avaliação. O scorecard marca quando um critério veio da squad (*"critério aprendido com o time"*).
  - **Concordância Totti × Tech Lead:** compara a recomendação do Totti (`avancar` / `nao_avancar`) com a decisão real do Tech Lead, vaga a vaga (*ex.: 60% na 1ª vaga → 85% na 3ª*). É o número que prova o aprendizado.
  - **Guarda-corpo contra viés:** o Totti só guarda critérios técnicos. Motivos como idade, faculdade, gênero, sotaque ou aparência **não viram regra**, e o card avisa o Tech Lead que aquilo foi ignorado.
- **Por que faz a empresa escolher o Totti:** cria um **fosso competitivo que cresce com o uso** dentro de cada cliente. Na 3ª vaga, o Totti já entrevista com a cabeça do Tech Lead da casa, e a concordância mostra isso em número. Trocar por uma ferramenta gringa significa voltar a uma régua que não conhece o time e recomeçar do zero.
- **Defesas de Q&A:**
  - *"Isso não é só guardar histórico no prompt?"* → É, de propósito. A memória é explícita, auditável e editável pelo humano, ao contrário de um modelo que aprende de forma opaca. A empresa sabe por que o Totti mudou de critério.
  - *"E se o Tech Lead tiver viés?"* → Só entram critérios técnicos, cada regra mostra de onde veio e pode ser desligada. A decisão final continua humana.
  - *"Precisa de meses de dados?"* → Não. Aprender com o **motivo** do Tech Lead funciona desde a 1ª decisão. A calibração com o resultado real da contratação (quem foi contratado e deu certo) é a etapa seguinte, no roadmap.

#### Plano de implementação no hackathon
O que já existe e será aproveitado (`lib/slack/`): o modal de `Reprovar` já coleta `reason`, o `Ajustar` já guarda `comments` no plano, e o `Report` já traz `recommendation`.

1. **Motivo opcional no `Aprovar`:** trocar o clique direto por um modal curto ("o que te convenceu?"), com o campo vazio permitido para não atrasar o Tech Lead.
2. **Extrator de regras:** nos hooks `onCandidateDecision` e `revisePlan`, uma chamada curta ao modelo transforma motivo + scorecard em 0 a 2 regras `{ texto, efeito: "valoriza" | "penaliza", criterio, origem }`. Motivos não técnicos são descartados e sinalizados.
3. **`SquadMemory`:** store por squad (no hackathon, por empresa/canal do Slack), em memória como o `SlackStore`, com regras ativas/desligadas e o histórico de decisões para a concordância.
4. **Uso nas próximas entrevistas:** injetar as regras ativas no gerador do plano e no prompt do avaliador, em um bloco "Critérios aprendidos com o Tech Lead desta squad". O scorecard cita a regra quando ela pesar.
5. **Tela "O que o Totti aprendeu":** lista de regras com origem, editar/desligar/apagar e o gráfico de concordância. Segue a identidade das telas da recrutadora (`/vagas`).
6. **Slack:** depois de cada decisão, o card responde na thread *"Aprendi: penaliza over-engineering para volume baixo. [Ver o que aprendi]"*.
7. **Dados da demo:** histórico sintético de 2 vagas anteriores já decididas, para a concordância aparecer subindo.

**Roteiro da demo (~20s):** o Tech Lead reprova no Slack com o motivo *"propôs Kafka sem necessidade"* → o Totti responde na thread *"Aprendi: …"* → na próxima entrevista, o Totti pergunta sobre o volume antes de aceitar a fila, e o scorecard mostra *"critério aprendido com o time"* → corta para a tela com a concordância em 85%.

---

## Combinações com o Fluxo Atual do Totti

| Combinação | Como soma ao que o Totti já faz | Por que ganha da concorrência na venda |
| :--- | :--- | :--- |
| **1. Alinhamento Totti + Decisão em 60s (`#1`)** | Pré-entrevista & revisão no Slack (já existentes) + **3 Clipes de 20s no Slack + Guia de 30 Dias (#1)** | **Adoção imediata pelo Tech Lead:** fecha a ponta final da jornada no Slack com prova real de áudio + código/quadro em 1 minuto, sem obrigar o líder a ler relatório longo ou confiar cegamente em nota numérica. |
| **2. Ímã de Seniores (`#2 + #3 + #4`)** | **Escolha de Arena (#2)** + **Totti Colega de Squad (#3)** + **Abre o Capô & Vende a Vaga (#4)** | **Conversão máxima de candidatos disputados:** zera a cara de prova escolar, transforma a entrevista em 30 minutos de trabalho real em dupla e faz o dev sair querendo aceitar a proposta da empresa. |
| **3. Fosso da Squad (`#1 + #5`)** | Card de decisão no Slack (**#1**) + **Memória Viva da Squad (#5)** | **Retenção do cliente:** cada `Aprovar`/`Reprovar` que o Tech Lead já faria vira critério da próxima entrevista. Quanto mais a empresa usa, mais difícil é trocar. |
| **4. Ciclo Completo Totti (`Fluxo Atual + #1 a #5`)** | Pré-entrevista do Totti ➔ **[#2 + #3 + #4]** na sala ➔ **#1** no Slack do Tech Lead ➔ **#5** aprende e melhora a próxima vaga | **Diferencial ponta a ponta contra qualquer gringa:** o Totti já nasce calibrado com a vaga, conduz uma sessão colaborativa que encanta seniores, entrega a decisão mastigada em 60s e **fica mais parecido com o Tech Lead a cada contratação**. |
