# Posicionamento e plano do diferencial

> Decidido em 07/11/2026, depois do feedback dos jurados ("já existe parecido lá fora": HackerRank Chakra, CodeSignal AI Interviewer, micro1 Zara).
> O produto e o pitch inteiros devem reforçar esta tese.

## 1. A tese

**A dor:** a contratação errada. É a mais cara do processo, porque inclui as outras: meses de salário de quem não entrega, onboarding perdido, a vaga reaberta e o processo refeito do zero. E ela continua acontecendo mesmo com as IAs gringas, que tornam a entrevista barata e em massa.

**A frase:**
> "A gente otimiza o custo da entrevista e, principalmente, o resultado da contratação."

**Sempre do lado da empresa:** cada funcionalidade e cada fala do pitch respondem "quanto isso economiza ou evita de prejuízo para a empresa?".

**O que nos diferencia:**
1. **Se adapta à empresa já na configuração.** A recrutadora conta o que quer, do jeito dela, e o Totti transforma isso em entrevista. A cada vaga ele aprende o jeito da empresa.
2. **Não olha só se acertou: olha como a pessoa pensa, aprende e se vira.** Dicas em níveis mostram se ela destrava com ajuda; empecilhos no meio mostram como reage quando algo muda.
3. **Prova no relatório.** Cada ponto da nota abre o momento exato do código e da conversa.
4. **Melhora com o resultado (o fosso).** Aos 90 dias (fim da experiência CLT) o gestor diz se a contratação deu certo, e o agente recalibra os critérios daquela empresa. Abre a porta para uma "garantia dos 90 dias".

**Dores de apoio** (consequências da mesma solução):
- **Vaga aberta:** entrevista no mesmo dia, sem agendar, relatório em minutos, e o tech lead só vê os finalistas.
- **Candidato bom desistindo:** processo rápido, retorno para todos e uma conversa que não atropela quem está pensando.

**Cuidados no pitch:**
- Não dizer que os gringos "só olham se acertou": eles dizem avaliar raciocínio. O contraste é que eles otimizam o custo, e a gente o custo e o resultado.
- Não focar em "não existe no Brasil".
- Números de custo são estimativas: mostrar a conta (ex.: 3 meses de salário + processo refeito + onboarding ≈ R$ 50 mil por erro numa vaga pleno) e validar com alguém de RH se der.

## 2. Roteiro do pitch (4 momentos)

1. **Dor:** a contratação errada custa R$ X, e a IA barata não resolve isso.
2. **Virada:** a gente não mede só se acertou, mede como a pessoa pensa, aprende e se vira.
3. **Demo:** o Totti adapta a entrevista à empresa → o empecilho entra no meio → o candidato reage → o relatório mostra a prova.
4. **Fosso:** aos 90 dias o gestor diz se deu certo, o agente aprende, e entra a garantia.

## 3. Frentes de trabalho

O Nícolas decide a ordem. Abaixo, uma sugestão de prioridade pelo impacto na demo.

| # | Frente | O que já existe | O que falta |
|---|---|---|---|
| F1 | **Empecilhos no meio** ✅ | Pergunta `kind: "desafio"` com retorno (`lib/agents/analystSchema.ts`, `policy.ts`, prompts do Analyst e do Interviewer). Hoje é só "dá pra otimizar?" e só depois de o código funcionar. | Um tipo novo de empecilho: o requisito muda, entra um caso novo, o tempo é cortado. Que possa acontecer antes do código funcionar, apareça na tela da IDE de forma clara e o Evaluator avalie a adaptação. |
| F2 | **Como pensa e aprende** ✅ | Dicas em níveis (`hint` em `lib/contracts.ts`, política de dicas em `policy.ts`) e `hintsUsed` no Evaluator. | Uma seção no relatório tipo "Aprendizado": precisou de qual dica, quanto tempo levou para destravar e se usou bem. Hoje isso só entra no texto do prompt. |
| F3 | **Prova clicável no relatório** ✅ | `Evidence { t, text }` no `Report`; snapshots do código com tempo na sessão. | Clicar numa evidência e ver o código naquele minuto e o que foi falado. |
| F4 | **IA que aprende com a empresa na configuração** ✅ | Totti: preferências de tom e dicas (`lib/pre-entrevista/preferencias.ts`), pesos, competências e planejador. | Memória por empresa entre vagas ("da última vez vocês pediram X, mantenho?") e mostrar isso na conversa. |
| F5 | **Ciclo dos 90 dias** | Painel da vaga com entrevistas e relatórios (`components/vagas/PaginaVaga.tsx`). | Tela "Como foi essa contratação?" e "o que o Totti ajustou com isso". Pode ser simulada na demo. |
| F6 | **Pitch** | Nada ainda. | Slides seguindo a seção 2 e a conta da contratação errada. |

**F1 concluída** (07/11/2026): requisito muda e caso novo, um empecilho por questão com testes reais, evento `empecilho` na linha do tempo com o conceito que exige (base para a F2) e nota de adaptação no relatório. Ficou para depois: o tempo cortado.

**F2 concluída** (07/11/2026): seção "Aprendizado" no relatório (`Report.learning`, fora da nota geral). Mede pelos eventos quando ele travou (execuções seguidas falhando sem avanço ou 2 min parado com o código falhando), que dica recebeu, quanto levou para destravar e a reação à mudança (tempo até adaptar, tentativas, dicas e o conceito). O LLM só julga como ele usou a ajuda.

**F3 concluída** (07/11/2026): o relatório (`/report`) abre com o gráfico "Como foi a entrevista": quanto dos testes passava a cada execução, com os acontecimentos escritos em cima (travou, dica, mudança, adaptou). Embaixo, as notas em barras. Clicar num acontecimento, numa nota ou numa prova abre o código naquele minuto (com as linhas que ele tinha acabado de escrever marcadas) e a conversa em volta, com uma régua para andar pela entrevista. A gravação da sessão (`Gravacao` em `lib/contracts.ts`) fica salva junto com o relatório.

**F4 concluída** (07/11/2026): Memória Viva da Squad (`lib/squad-memory/`). Cada Aprovar, Reprovar e Pedir ajuste no Slack ensina o Totti: o motivo (opcional) vira no máximo 2 regras técnicas ("Penaliza over-engineering: reprovou quem propôs Kafka para esse volume"), cada uma presa à decisão de onde veio. Um guarda-corpo determinístico descarta motivo não técnico (idade, gênero, sotaque, formação, aparência…), nunca vira regra, e o Totti avisa na thread o que ignorou. As regras ligadas entram no plano e na avaliação da próxima entrevista (live coding e system design) e aparecem no relatório como "Critério aprendido com o time". Tela `/vagas/aprendizado` ("O que o Totti aprendeu"): concordância Totti × Tech Lead por vaga, regras com editar, desligar e apagar, e o que foi ignorado. Na pré-entrevista, o Totti abre com "da última vez vocês pediram X: mantenho?". Contrato: `SquadRule` em `lib/contracts.ts` (`InterviewConfig.squadRules` e `CriterionScore.squadRules`, ambos opcionais).

Próximas: **F5 → F6**. A F4 e a F5 se encontram com a "Memória Viva da Squad" (`docs/propostas-diferenciais.md`, item 5, já decidida): o Totti aprende com as decisões do Tech Lead (F4) e, depois, com o resultado da contratação aos 90 dias (F5). Os dois briefings partem desse plano.

## 4. Regras que continuam valendo

- Só tecnologia (live coding e system design).
- O Totti é masculino em tudo.
- As telas da recrutadora seguem o "papel e tinta" (`app/tema-recrutador.css`, igual a `/vagas`).
- O que o Lucas Todaro sobe na `main` prevalece sobre planejamento pessoal.

## 5. Material para o pitch (o que já está pronto)

Atualizar a cada frente concluída. Cada item diz o que mostrar, a frase de palco e a defesa de Q&A.

### Momento 2 e 3: "mede como a pessoa pensa, aprende e se vira"

**O que mostrar na demo (live coding, ~60 s):**
1. O candidato está resolvendo; o código ainda não passa em tudo.
2. O Totti traz uma mudança no problema (ex.: "pode ter mais de um par: devolva o que termina antes"). Aparece na IDE como um aviso fixo com os testes novos marcados como "Mudança". Para a demo, o botão "Forçar empecilho" (só fora de produção) solta a mudança na hora.
3. O candidato pergunta, ajusta o código e roda: os testes da mudança passam.
4. Corta para o relatório.

**No relatório (`/report?sessionId=...`), em 10 segundos de tela:**
- O gráfico conta a entrevista sem legenda: "Travou por 2 min" → "Dica 1 → destravou em 50 s" → "Mudança" → "Adaptou em 1 min 50 s".
- Clicar em "Travou" ou numa nota abre o código daquele minuto e o que foi falado. É a prova.
- Adaptação e Aprendizado têm nota própria, fora da nota geral: não punem quem pediu ajuda, mostram como usou.

**Frases de palco:**
- "A gente não para no 'acertou ou errou'. Mudamos o problema no meio, como acontece no trabalho, e medimos quanto tempo ele leva para se adaptar."
- "Travar não é ruim. Ruim é travar e não sair do lugar. O relatório mostra quanto tempo ele levou para destravar e com que ajuda."
- "Nenhuma nota é de confiança cega: cada uma abre o minuto exato do código e da conversa."

**Números da sessão de exemplo** (`teste-aprendizado`, 10 min, two-sum): travou por 2 min com 2 execuções falhando, destravou 50 s depois da dica 1 de 2, adaptou à mudança em 1 min 50 s sem dica, 5/5 testes escondidos.

**Defesas de Q&A:**
- *"Quem decide que ele travou é a IA?"* → Não. Travar, destravar e adaptar são medidos pelos eventos da sessão (execuções, testes, tempo, dicas). A IA só julga como ele usou a ajuda e cita o minuto de cada prova; o minuto é conferido contra a gravação.
- *"Os gringos também avaliam raciocínio."* → Avaliam a resposta final e a conversa. A gente cria o momento de adaptação (a mudança no meio) e mede a reação, com prova clicável.
- *"E a mudança não é injusta com quem já terminou?"* → Ela pode vir antes ou depois de o código funcionar, vale para todos da vaga e tem nota à parte, fora da geral.

**Prints sugeridos para os slides:** o aviso de mudança na IDE; o gráfico "Como foi a entrevista"; o painel de um momento aberto (código com as linhas novas marcadas + conversa).

### Momento 4: o fosso ("o Totti aprende com o time")

**O que mostrar na demo (~40 s):**
1. **Slack, card do candidato** (Rafael Moura, Backend Pleno). O Totti recomendou avançar. O Tech Lead clica em **Reprovar** e escreve o motivo: "propôs Kafka sem necessidade para esse volume e é muito novo para o cargo".
2. **Resposta na thread, em segundos:** ":brain: Aprendi: Penaliza over-engineering: reprovou quem propôs Kafka sem necessidade para esse volume" e ":no_entry_sign: Ignorei "muito novo para o cargo": idade não é critério técnico. O Totti só aprende critério técnico." O botão "Ver o que aprendi" abre a tela.
3. **Tela "O que o Totti aprendeu"** (`/vagas/aprendizado`, também no menu lateral de Vagas): a regra nova no topo, com a origem ("Da reprovação de Rafael Moura · Backend Pleno"); o motivo de idade em "O que o Totti ignorou"; e o gráfico de concordância por vaga.
4. Desligar uma regra no interruptor (vale já para a próxima entrevista) e mostrar que dá para editar ou apagar: o aprendizado nunca fica escondido.
5. **Fecha no relatório** (`/relatorio/exemplo` em dev): no critério Escalabilidade, o bloco "Critério aprendido com o time" mostra a regra que pesou ali.

**Como abrir cada tela:**
- Slack: com `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` e `SLACK_CHANNEL_ID` no `.env.local`, `curl -X POST localhost:3000/api/slack/demo` posta o card no canal.
- Sem Slack (plano B): em `/vagas/aprendizado`, o quadro "Simular o Tech Lead no Slack" (só fora de produção) faz o mesmo caminho do clique. As sugestões prontas já trazem o motivo do Kafka e o de idade.
- Pré-entrevista: ao criar uma vaga nova, a primeira fala do Totti termina com "Da última vez vocês pediram para penalizar …. Mantenho isso e sigo assim, ou quer mudar alguma coisa?".

**Frases de palco:**
- "Toda vez que o Tech Lead decide, o Totti aprende o critério do time. Na próxima vaga ele já entrevista do jeito dessa squad."
- "Ele aprende só critério técnico. Se o motivo for idade, sotaque ou faculdade, ele ignora e avisa. O viés do entrevistador não entra no modelo."
- "Nada é caixa-preta: cada regra diz de qual decisão veio, e o time edita, desliga ou apaga."
- "Na primeira vaga o Totti concordava com o Tech Lead em 60% das vezes. Três vagas depois, em 85%. É isso que um concorrente não copia: a memória do seu time."

**Números da demo** (semente em `lib/squad-memory/semente.ts`, empresa da demo): concordância por vaga 60% (3 de 5, Backend Pleno · Pagamentos) → 75% (6 de 8, Engenharia de Dados Pleno, um "talvez" fora da conta) → 92% (11 de 12, Backend Pleno, a atual). A reprovação ao vivo (o Totti tinha dito avançar) leva a atual para 85% (11 de 13): "+25 pontos desde a primeira vaga". Se o roteiro preferir não mexer no número, aprovar um candidato que o Totti recomendou leva a 92% (12 de 13). 4 regras na memória (1 desligada) e 1 motivo ignorado antes da demo. Tudo fica em memória: reiniciar o servidor volta para a semente.

**Defesas de Q&A:**
- *"E se o Tech Lead for enviesado?"* → O motivo passa por um guarda-corpo determinístico antes de qualquer IA: idade, gênero, vida pessoal, origem e sotaque, aparência, raça, religião, deficiência e saúde, formação e impressão pessoal nunca viram regra, e o Tech Lead vê o que foi ignorado. A regra que sobra é sempre presa a um critério técnico do scorecard.
- *"A IA vai inventar regra?"* → No máximo 2 por decisão, sempre com a decisão de origem, e passam de novo pelo guarda-corpo. Sem motivo escrito, nada é aprendido: a decisão só entra na concordância. Sem chave de modelo, um extrator por palavras-chave faz o mesmo papel.
- *"Uma reprovação muda tudo?"* → Não. A regra vira contexto do entrevistador e do avaliador ("pergunte o porquê antes de penalizar"), não muda o peso sozinha, e o time desliga com um clique.
- *"Concordância alta não é só o Totti copiando o Tech Lead?"* → A concordância mostra que o Totti entende o time. O que diz se o time acertou é o resultado aos 90 dias (F5): por isso a memória também aprende com a contratação que não deu certo.
- *"Os gringos têm isso?"* → Calibram rubricas por empresa na mão. Aqui o ajuste vem de cada decisão no Slack, com a origem visível e o filtro de viés.

**Prints sugeridos para os slides:** a thread do Slack com "Aprendi" e "Ignorei"; o gráfico de concordância subindo; a lista de regras com origem; o bloco "Critério aprendido com o time" no relatório.
