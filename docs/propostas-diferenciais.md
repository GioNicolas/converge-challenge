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
  - **Memória cumulativa da squad:** quando o Tech Lead clica em `Aprovar` ou `Reprovar` no Slack e deixa 1 linha de motivo, o Totti passa a incorporar esse critério nas próximas entrevistas daquele time.
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

## Combinações com o Fluxo Atual do Totti

| Combinação | Como soma ao que o Totti já faz | Por que ganha da concorrência na venda |
| :--- | :--- | :--- |
| **1. Alinhamento Totti + Decisão em 60s (`#1`)** | Pré-entrevista & revisão no Slack (já existentes) + **3 Clipes de 20s no Slack + Guia de 30 Dias (#1)** | **Adoção imediata pelo Tech Lead:** fecha a ponta final da jornada no Slack com prova real de áudio + código/quadro em 1 minuto, sem obrigar o líder a ler relatório longo ou confiar cegamente em nota numérica. |
| **2. Ímã de Seniores (`#2 + #3 + #4`)** | **Escolha de Arena (#2)** + **Totti Colega de Squad (#3)** + **Abre o Capô & Vende a Vaga (#4)** | **Conversão máxima de candidatos disputados:** zera a cara de prova escolar, transforma a entrevista em 30 minutos de trabalho real em dupla e faz o dev sair querendo aceitar a proposta da empresa. |
| **3. Ciclo Completo Totti (`Fluxo Atual + #1 a #4`)** | Pré-entrevista do Totti ➔ **[#2 + #3 + #4]** na sala ➔ **#1** no Slack do Tech Lead | **Diferencial ponta a ponta contra qualquer gringa:** o Totti já nasce calibrado com a vaga, conduz uma sessão colaborativa que encanta seniores e entrega a decisão mastigada em 60s com clipes reais no Slack. |
