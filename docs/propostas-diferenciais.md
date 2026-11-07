# Propostas de Diferenciais de Produto (Área de Tecnologia)

Comparativo de oportunidades frente às plataformas internacionais (**Mercor, micro1, Apriora, Ribbon, CodeSignal e Karat**) focadas em entrevistas técnicas de tecnologia (Live Coding + System Design), aproveitando a base que já existe no repositório.

---

## As 5 Propostas

### 1. Modo Incidente ao Vivo (Chaos Injection no Quadro / Código)
- **O problema lá fora:** Candidatos decoram gabaritos do LeetCode ou arquiteturas prontas de System Design (Alex Xu). Nas plataformas atuais, o enunciado é estático do começo ao fim.
- **A proposta:** Assim que o candidato estabiliza a solução inicial (desenho base no quadro ou testes visíveis passando na IDE), o agente injeta um **incidente de produção em tempo real em cima do que o próprio candidato construiu**.
  - *No System Design:* O candidato desenhou `API → Redis → Postgres`. A mão do agente vai até o bloco `Redis`, circula/marca em vermelho no quadro e dispara: *"Incidente em produção: seu cluster de Redis caiu durante um pico de 40 mil req/s. O que acontece com o seu Postgres agora e como você contém o efeito cascata?"*
  - *No Live Coding:* Após passar nos casos básicos, entra uma mudança de requisito de produto em tempo real para medir quão adaptável é o código escrito sem precisar reescrever tudo do zero.
- **Por que diferencia:** Impossível de decorar ou responder no automático (depende da arquitetura/código que o candidato acabou de criar), materializa o foco `pressao` da configuração da vaga e gera um momento forte de demonstração ao vivo no palco.

---

### 2. Sabatina de Autoria / Auditoria de Código (Em vez de Proctoring Policialesco)
- **O problema lá fora:** Ferramentas tradicionais tratam assistência externa ou colagem como fraude pura (monitoramento invasivo de tela/câmera que afasta candidatos seniores), sem responder à pergunta real dos times de engenharia hoje: *"Esse dev entende profundamente o código que entrega ou aceita código gerado às cegas?"*
- **A proposta:** Transformar a detecção de `paste` e o foco `uso_ia` numa **Sabatina de Autoria Contextual** (ou revisão de trecho suspeito):
  - Quando o candidato cola um bloco relevante de código (ou recebe um snippet pronto para auditar), o agente não bloqueia nem pune no escuro: ele grifa 2–3 linhas específicas (`highlight_range`) e faz uma **pergunta cirúrgica de mutação/invariante** (*"Vi que você trouxe esse bloco pronto. Se entrarem chaves duplicadas e mudarmos a condição desta linha, qual caso quebra?"*).
  - No relatório final, entra o sinal de **Domínio sobre o Código Entregue**, separando quem usa ferramentas para ganhar velocidade com domínio técnico de quem copia sem compreender os trade-offs.

---

### 3. Métrica de Elasticidade Cognitiva (`Time-to-Pivot`) e Linha de Inflexão no Relatório
- **O problema lá fora:** Relatórios de concorrentes entregam uma nota fria (`80/100`) e um texto genérico sobre o estado final, ignorando como o candidato evoluiu durante a sessão.
- **A proposta:** Usar os eventos com timestamp que a sessão já coleta para exibir no topo do relatório a **Linha de Inflexão do Raciocínio + `Time-to-Pivot`**:
  - Mostra a sequência real: **Abordagem inicial → Provocação socrática do agente → Tempo de recuperação (`Time-to-Pivot`) até ajustar a arquitetura ou o código** (ex.: *"42s após a provocação sobre leitura 100x maior que escrita, desacoplou o banco adicionando cache"*).
- **Por que diferencia:** Para qualquer liderança técnica, a velocidade com que um engenheiro absorve um questionamento de revisão e corrige a rota vale mais do que acertar de primeira por memória. Nenhuma ferramenta tradicional destaca essa métrica de forma visual e auditável.

---

### 4. Reverse Pitch nos Minutos Finais (O Candidato Também Entrevista a Vaga)
- **O problema lá fora:** A maior taxa de abandono em entrevistas automatizadas (Mercor, Apriora, micro1) vem de profissionais seniores, porque a experiência é um interrogatório unilateral: o sistema faz perguntas por 30 minutos e encerra sem responder nada sobre o time, a arquitetura atual ou os desafios reais do cargo.
- **A proposta:** Na fase de `FECHAMENTO`, o entrevistador usa os documentos e notas da vaga alinhados na pré-entrevista (Totti) para inverter a conversa nos minutos finais:
  - *"Faltam 2 minutos. Agora sou eu que respondo: o que você quer saber sobre a stack, a arquitetura atual ou o dia a dia desse time?"*
  - **Bônus para a recrutadora:** As perguntas feitas pelo candidato entram numa seção dedicada do relatório (*"O que o candidato perguntou sobre a vaga"*), que na prática é um dos sinais mais claros de senioridade, senso de produto e interesse genuíno.

---

### 5. Calibração em 1 Clique (Dry-Run Júnior vs. Sênior Antes de Publicar)
- **O problema lá fora:** Em plataformas de triagem por voz, a recrutadora configura a vaga no escuro e dispara para dezenas de candidatos, descobrindo tarde demais que o nível ficou fácil demais, rígido demais ou desalinhado.
- **A proposta:** Logo após fechar a configuração na pré-entrevista (Totti), oferecer um botão **"Simular Calibração (Júnior vs. Sênior)"** que roda uma simulação rápida daquela configuração e mostra como dois perfis contrastantes pontuariam na rubrica escolhida antes de liberar o link oficial para candidatos reais (inclusive podendo mandar o preview na thread de aprovação do Tech Lead no Slack).

---

## Combinações Recomendadas para o Produto e Pitch

| Combinação | Peças unidas | Tese central para os jurados | Esforço de implementação |
| :--- | :--- | :--- | :--- |
| **Combo A — "Anti-Gabarito" (Recomendada)** | **Proposta 1** (Modo Incidente ao Vivo) + **Proposta 3** (`Time-to-Pivot` no Relatório) | *"Ferramentas gringas testam decoreba estática. A nossa injeta um incidente real em cima do que o candidato acabou de construir e mede em quantos segundos ele adapta a arquitetura, com prova visual de cada decisão."* | **Baixo–Médio** (reaproveita a mão do agente no quadro, os gatilhos do analista e os timestamps já salvos no relatório). |
| **Combo B — "Engenheiro da Era Moderna"** | **Proposta 2** (Sabatina de Autoria) + **Proposta 3** (Linha de Inflexão) | *"Em vez de vigiar câmera como polícia, avaliamos o que realmente importa hoje: se o desenvolvedor tem domínio real sobre o código que entrega e como defende suas escolhas sob questionamento."* | **Baixo** (a IDE já detecta `paste`, grifa linhas e passa pelo `Analyst`/`Interviewer`). |
| **Combo C — "Experiência Sênior Ponta a Ponta"** | **Proposta 1** (Modo Incidente) + **Proposta 4** (Reverse Pitch no Fechamento) | *"A única entrevista autônoma que candidatos seniores respeitam: desafia com problemas reais de produção e abre espaço real no fim para o candidato entrevistar a vaga usando o contexto da recrutadora."* | **Baixo–Médio** (liga os documentos/notas da pré-entrevista ao estado de `FECHAMENTO` e adiciona 1 bloco no relatório). |
| **Combo D — "Controle Total do RH + Tech Lead"** | **Proposta 5** (Dry-Run de Calibração) + **Proposta 3** (`Time-to-Pivot`) | *"Zero caixa-preta para o RH: a recrutadora alinha com o Totti, valida a barra simulando perfis antes de abrir a vaga e recebe um dossiê com a trajetória exata de raciocínio no Slack."* | **Médio** (conecta os scripts de simulação já existentes a uma rota/botão na tela de vaga ou no Slack). |
