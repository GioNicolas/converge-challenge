# Totti 2: conversar como gente, pensar como sênior, responder em ~1,5 s

Pesquisa e proposta de arquitetura para a conversa do Totti com a recrutadora (pré-entrevista).
Os mesmos princípios valem depois para o entrevistador do quadro e do live coding. Medições feitas em 08/11/2026,
nesta máquina, com as chaves do `.env.local`.

---

## 1. Diagnóstico: por que o Totti parece burro

### 1.1 Quem decide a conversa não é o modelo

Hoje cada turno funciona assim (`lib/pre-entrevista/turno.ts`):

1. O Jev responde ~30 perguntas de sim/não sobre a transcrição (cobertura e sinais) e uma segunda chamada mede a ênfase.
2. O **planejador** (`planejador.ts`, máquina de estados escrita à mão) escolhe o passo: `aprofundar`, `perguntar_contexto`, `resumo_final`…
3. O LLM (Gemma 4 26B, com **4B parâmetros ativos**) só **redige** a fala desse passo. Ele recebe a primeira linha da vaga,
   as últimas 6 falas e uma instrução do passo.
4. O código corta a fala no primeiro "?", troca perguntas "óbvias" por perguntas do banco, apaga "Entendi/Perfeito" do começo
   e emenda frases fixas no resumo.

Na prática, o modelo não sabe **por que** está perguntando, não pode reagir ao que ela disse se isso não virou "sinal"
e é proibido de soar humano (não pode dizer "entendi"). Quando o Jev erra um sinal, o planejador escolhe o passo errado
e o modelo obedece. A inteligência foi trocada por regras, e cada regra nova tapa um buraco e abre outro.

### 1.2 Evidência: uma conversa real, medida

Vaga: Backend Sênior de Pagamentos. O Totti abriu propondo system design.

| Ela disse | O Totti respondeu | O erro |
|---|---|---|
| "Pode ser **live coding** sim, mas o que mais me preocupa é a pessoa **travar quando dá problema em produção**…" | "Você falou sobre o candidato travar… A gente quer que ele questione as decisões dele com firmeza, ou só peça pra ele justificar as escolhas?" | Ignorou a troca para live coding. A pergunta não decide nada do que ela disse, e ele fala como se fosse do time dela ("a gente quer"). **7,2 s** (Featherless estourou 6 s e caiu na OpenRouter). |
| "Ah, e eu queria entender, como vocês avaliam se a pessoa usa bem IA?" | 3 frases com "LLM", "alucinação", "caixa-preta"… e repete a pergunta anterior. | Jargão para uma recrutadora não técnica. E a **dúvida** virou **foco**: o resumo passou a dizer "vamos observar como ele usa IA". |
| "Prefiro quem explica bem o raciocínio, mesmo sem terminar." | "Tem algum comportamento que reprova o candidato de cara…?" | Não reconheceu a preferência; pulou para a pergunta do banco. |
| "Pode ser uns 45 minutos, sem dicas." | "A entrevista será de **system design**…" | O resumo saiu no formato errado, sem o "explica o raciocínio" e com "clima tranquilo", que ninguém pediu. |

**O mesmo turno 1 com o contexto inteiro e uma agenda no prompt (sem planejador)** foi testado em 9 modelos.
**Todos** entenderam a troca para live coding e a preocupação com produção, **inclusive o Gemma que usamos hoje**:

> "Entendi: você topa live coding, e a grande preocupação é a pessoa travar quando dá problema em produção, como aconteceu
> com vocês. E nesse caso, você prefere que a pessoa depure um bug de produção na IDE, ou que escreva algo do zero com um
> imprevisto no meio?" (Claude Sonnet 5.5)

**Conclusão: o problema é a arquitetura, não o modelo.**

### 1.3 Por que é lento

Tudo roda em série e nada usa streaming:

| Etapa | Hoje | Fonte |
|---|---|---|
| Fim da fala dela | 1,0 s de silêncio (VAD do Scribe) + 0,8 s de espera + fechar o socket do STT | `scribe.ts`, `ConversaTotti.tsx` |
| Jev (cobertura + ênfase) | ~0,45 s | medido |
| LLM, resposta inteira (sem streaming) | 1,7 a 6,7 s (p95 maior: timeout de 6 s e fallback) | medido |
| Voz: MP3 inteiro + base64 (sem streaming) | ~0,5 a 1 s | `api/falar` |
| **Total percebido** | **~4,5 a 9,5 s** | |
| Mic reabre | novo token + novo WebSocket + captura a cada turno (corta o começo da fala dela) | `useTranscricao.ts` |

A referência do mercado para conversa natural é **menos de 1 s até o primeiro áudio**. Um pipeline em série não chega
nisso, por mais rápida que seja cada etapa ([LiveKit](https://livekit.com/blog/voice-agent-architecture-stt-llm-tts-pipelines-explained),
[ElevenLabs](https://elevenlabs.io/blog/voice-agent-latency-optimization)).

---

## 2. A referência: o que a Nara faz

A [página do Tako Recruiter](https://tako.ai/en/products/recruiting/) descreve a Nara como uma agente que "escuta, reformula,
aprofunda e responde às dúvidas", faz follow-up com base no que a pessoa disse e cava respostas vagas. Antes da primeira
entrevista, ela **rascunha o plano e os critérios**, e o time ajusta **conversando**. Pesos por competência, perguntas-base e
eliminatórios são "o ponto de partida" de uma conversa que se adapta. Depoimento de candidato: *"Em vários momentos esqueci
que falava com uma IA."*

Ou seja, a Nara tem **um roteiro com objetivos** e **liberdade para conversar** dentro dele. O Totti hoje tem o roteiro e
não tem a liberdade.

---

## 3. O que o estado da arte faz (2024–2026)

1. **Talker–Reasoner** ([Google DeepMind, NeurIPS 2024](https://arxiv.org/abs/2410.08328)): um modelo rápido **conversa**
   (Sistema 1) e outro, mais lento, **planeja e atualiza o estado** em segundo plano (Sistema 2). O conversador lê as crenças
   mais recentes do pensador na memória e só espera por ele quando a decisão exige.
2. **Agentes de entrevista em produção** ([AI Engineer, "Voice agents: the good, the bad and the ugly"](https://ai.engineer/talks/voice-agents-the-good-the-bad-and-the-ugly)):
   o modelo de voz recebe a pergunta **com o propósito por trás dela** e objetivos com prioridade. Agentes de texto em segundo
   plano decidem quando mudar de assunto. A lição deles: apertar o prompt com "siga em frente" matou a improvisação; um
   detector separado funcionou melhor.
3. **Estado fora do LLM, linguagem dentro** ([Google CX Agent Studio](https://cdn.jsdelivr.net/gh/GoogleCloudPlatform/cxas-scrapi@main/docs/patterns/slot-filling.md),
   [ReacTOD](https://arxiv.org/html/2605.19077v1)): o código guarda e **valida** o estado (slots), e o LLM é a interface de
   conversa. O código vira **guarda**, não roteirista.
4. **Pipeline em streaming de ponta a ponta**: começar o LLM nos parciais estáveis do STT, mandar cada frase para o TTS assim
   que ela fecha, tocar o primeiro pedaço de áudio enquanto o resto é gerado. Orçamento típico: fim da fala 120–280 ms,
   primeiro token 250–600 ms, primeiro áudio 110–220 ms ([ElevenLabs](https://elevenlabs.io/blog/voice-agent-latency-optimization)).
5. **Detecção de turno semântica**: silêncio puro não distingue "pausa para pensar" de "terminei". O certo é combinar VAD com
   o texto parcial ([LiveKit](https://livekit.com/blog/voice-agent-architecture-stt-llm-tts-pipelines-explained)).
6. **Barge-in**: se ela começa a falar, o Totti para na hora.
7. **Speech-to-speech** (gpt-realtime, Gemini Live): latência menor, mas menos controle, transcrição e estado mais difíceis,
   e há relatos de qualidade ruim em português ([fórum da OpenAI, jun/2026](https://community.openai.com/tag/realtime/732)).
   **Para nós, o cascateado (Scribe → LLM → ElevenLabs) em streaming é a escolha certa**: já temos as peças e o texto
   alimenta o plano na tela.

---

## 4. O método: Totti 2 = Conversador + Pensador

```
 fala dela ──► Scribe (socket sempre aberto, parciais)
                 │
                 ├─► fim de turno (VAD 0,5 s + checagem do texto) ──► CONVERSADOR (LLM rápido, streaming)
                 │                                                     contexto inteiro + plano atual + agenda
                 │                                                     │ frase 1 ──► ElevenLabs (stream) ──► toca
                 │                                                     │ frase 2 ──► ElevenLabs (stream) ──► fila
                 │
                 └─► depois do turno, em segundo plano ──► PENSADOR (extrator) ──► plano validado (zod + catálogo)
                                                                                      │
                                                          tela do plano ◄─────────────┘  e o próximo turno do Conversador
```

### 4.1 Conversador: uma chamada, contexto inteiro, objetivos em vez de passos

- **Uma** chamada por turno, em streaming, sem Jev nem planejador no caminho.
- O prompt deixa de mandar "faça o passo X" e passa a dizer **o que precisa ficar fechado e por quê**:

  ```
  AGENDA (o que você precisa fechar; o porquê guia a conversa):
  - formato: live coding ou system design. Por quê: cada um mede coisas diferentes (ver CATÁLOGO).
  - nível. Por quê: calibra a questão.
  - o que mais pesa (até 3), com as palavras dela. Por quê: vira o peso do scorecard.
  - eliminatório, se houver. Por quê: reprova direto.
  - duração, tom e dicas: só se ela falar; senão, o padrão.
  PLANO AGORA: (o rascunho do Pensador, em linguagem natural; o que ainda está em aberto)
  CATÁLOGO: o que cada formato mede e não mede (fatos que o modelo não pode inventar)
  MEMÓRIA DO TIME: o que a squad já ensinou
  VAGA: a descrição inteira (hoje vai só a primeira linha)
  TRANSCRIÇÃO: inteira (são ~10 turnos; cabe com folga)
  ```

- As regras de estilo encolhem para o essencial: até 2 frases, uma pergunta, sem jargão, nada de elogio avaliativo
  ("ótima pergunta!"). **Reconhecimento curto e variado volta a ser permitido** ("Entendi, então…"): é o que faz soar gente.
  Banir "entendi" foi o que deixou o Totti robótico.
- Poucos exemplos bons de turno (few-shot), tirados das melhores respostas medidas.
- O prefixo fixo (persona, catálogo, vaga) vai primeiro e fica em **cache de prompt**, o que corta o tempo até o primeiro token.

### 4.2 Pensador: o extrator que já existe, sem bloquear a fala

- `agendarExtracao` já roda depois de cada turno. Ele passa a ser **a única fonte do plano**: lê a transcrição e devolve o
  rascunho (formato, nível, foco e pesos, eliminatório, preferências) e a lista do que falta na agenda.
- O código valida o que o Pensador devolveu com zod e o catálogo: formato disponível, área que o formato não mede vira
  "fica para a próxima etapa" etc. As regras do `catalogo.ts` e das `regrasSquad` continuam valendo aqui, como
  **validação**, e não como roteiro.
- O Conversador nunca espera o Pensador, **com uma exceção**: o resumo final. Quando a agenda está fechada, o próximo turno
  espera o plano validado (o flag de espera do Talker–Reasoner) e o resumo sai do plano, que é o mesmo da tela.
  Assim o que ele fala e o que aparece na tela não se contradizem.
- Ele também entende a fala atual direto da transcrição, mesmo antes de o Pensador terminar: foi isso que fez os 9 modelos
  acertarem a troca para live coding no teste.

### 4.3 Latência: tudo em streaming e sobreposto

| Etapa | Totti 2 | Como |
|---|---|---|
| Fim da fala dela | ~0,5–0,7 s | VAD do Scribe em 0,5 s; sem a espera fixa de 0,8 s; checagem do parcial ("…e", "…mas", "…tipo" = ainda falando, espera mais) |
| Início especulativo | esconde ~0,5 s | o Conversador começa no `commit` do Scribe; se ela voltar a falar, aborta e recomeça (o TTS só toca com o turno confirmado) |
| 1ª frase do LLM | ~1,0–1,3 s | streaming (SSE da rota até a tela) + cache de prompt + hedge: sem token em 1,5 s, dispara o reserva em paralelo |
| 1º áudio | ~0,25 s | cada frase vai para o ElevenLabs Flash v2.5 assim que fecha (`/stream/with-timestamps`, ou o WebSocket multi-context); a frase 2 é gerada enquanto a 1 toca |
| **Total percebido** | **~1,5–2 s** (hoje 4,5–9,5 s) | |
| Mic | sempre aberto | o socket do Scribe fica vivo na conversa inteira; nada de token e conexão novos a cada turno |
| Barge-in | ela fala, ele para | com o mic aberto e cancelamento de eco, a fala dela corta a voz e o resto da resposta é descartado |

O texto aparece na tela conforme chega (o "digitando" passa a ser real) e a legenda segue o alinhamento do ElevenLabs, como já faz.

### 4.4 Modelo: medido, não chutado

Turno 1 do caso acima, streaming, 3 rodadas por modelo (medianas), OpenRouter com `provider.sort=latency` e raciocínio mínimo:

| Modelo | 1º token | 1ª frase | Total | Qualidade da fala |
|---|---|---|---|---|
| Gemma 4 26B A4B (Featherless, atual) | 869 ms | 929 ms | 1,8 s | entendeu; pergunta de logística (duração, dicas); **uma rodada levou 12,8 s** |
| Gemini 3.5 Flash-Lite | 1156 ms | 1325 ms | 1,6 s | entendeu; gíria demais ("bucha", "bicho pegando") |
| GPT-5.4 mini | 1239 ms | 1485 ms | 1,6 s | entendeu; boa pergunta de peso ("acima de escalabilidade?") |
| GPT-5.4 nano | 1387 ms | 1703 ms | 2,2 s | prolixo, inventa "60 ou 90 min" |
| DeepSeek V4.1 Flash | 1587 ms | 1790 ms | 2,0 s | bom; às vezes corta no meio |
| Gemini 3.8 Flash | 1798 ms | 2124 ms | 2,2 s | bom, um pouco longo |
| Qwen 3.8 Flash | ~2,6 s | 2782 ms | 2,9 s | ok; uma rodada vazia |
| **Claude Sonnet 5.5** | **1053 ms** | 1563 ms | 2,1 s | **a melhor**: confirma a troca e faz a pergunta que decide a entrevista ("depurar um bug de produção ou escrever do zero com um imprevisto?") |
| Claude Haiku 5.5 | — | — | — | 2 de 3 rodadas vazias com `reasoning: minimal`; refazer sem o parâmetro antes de descartar |

**Recomendação:** Claude Sonnet 5.5 como Conversador, com GPT-5.4 mini de reserva em hedge. Ele foi o mais inteligente
e ficou entre os mais rápidos no primeiro token. Antes de fechar, refazer com 20+ rodadas e as personas do simulador
(seção 5), porque 3 rodadas de uma máquina só não bastam.

---

## 5. Como provar que ficou melhor (o trabalho de joalheiro)

Nada muda sem placar. Já temos metade disso:

1. **Personas** (`npm run pre:simular`): a recrutadora é um LLM com roteiro e gabarito (foco, dispensa, eliminatório, tom,
   dicas, duração). Medir a **fidelidade do plano** final contra o gabarito, no Totti atual e no Totti 2.
2. **Juiz de conversa** (novo, LLM): nota cada turno em *ouviu o que ela disse*, *pergunta que decide algo*,
   *sem jargão*, *sem repetir*, *soa humano*. Calibrar o juiz com 20 turnos marcados à mão por nós.
3. **Latência por etapa** em cada turno (fim da fala, 1º token, 1ª frase, 1º áudio), p50 e p95.
4. **Casos de ouro** fixos, como regressão: a troca para live coding ignorada, a dúvida que virou foco e o resumo no formato errado.

Meta para trocar: fidelidade ≥ a atual, juiz claramente acima, p95 até o 1º áudio < 2,5 s.

---

## 6. Plano em fases

Cada fase entrega algo que dá para testar sozinho. A ordem é sugestão; o Nícolas decide.

| Fase | O que | Onde | Ganho |
|---|---|---|---|
| **0. Placar** | juiz + latência por etapa no simulador; casos de ouro | `scripts/pre-entrevista/simular.ts`, novo `scripts/pre-entrevista/juiz.ts` | saber se melhorou |
| **1. Cérebro** | Conversador com contexto inteiro e agenda; Jev e planejador fora do caminho da fala; Pensador como fonte do plano; resumo espera o plano validado | `lib/pre-entrevista/conversa.ts`, `turno.ts`, `sessoes.ts` | **inteligência** (o maior salto) |
| **2. Streaming** | `chat` com `stream: true`; rota em SSE; tela mostra o texto chegando | `lib/pre-entrevista/llm.ts`, `api/pre-entrevista/sessoes/[id]/mensagem`, `ConversaTotti.tsx` | −2 a −5 s |
| **3. Voz por frase** | cada frase vai para o TTS assim que fecha; fila de reprodução; MP3/PCM em stream | `api/falar`, `lib/voz/cliente.ts`, `useVozAgente.ts` | −0,5 a −1 s |
| **4. Turno** | Scribe sempre aberto; VAD 0,5 s + checagem do parcial; início especulativo; barge-in | `lib/transcricao/*`, `lib/audio/foco.ts`, `ConversaTotti.tsx` | −1 s e conversa de verdade |
| **5. Entrevistador** | os mesmos princípios no quadro e no live coding (hoje: JSON sem streaming e um filtro em série) | `lib/agente/perguntar.ts`, `lib/agents/interviewer.ts` | candidato sente a mesma Nara |

### O que sai e o que fica

- **Sai do caminho da fala**: o planejador como roteirista, o Jev por turno, `cortarNaPrimeiraPergunta`, `trocarPergunta`,
  a regex que apaga "Entendi", as frases emendadas no resumo.
- **Fica**: o catálogo (agora como conhecimento no prompt e validação do plano), a memória da squad, o extrator (agora o Pensador),
  a abertura sem LLM (sai na hora), o log de eventos, o simulador.
- **Pode voltar como guarda leve, se o placar pedir**: uma checagem barata sobre a fala pronta (vazou rótulo interno? mais de
  uma pergunta?) que regenera só em caso grave.

---

## 7. Riscos

- **Plano e fala divergirem**: mitigado porque o resumo espera o Pensador e sai do plano validado.
- **Custo do Sonnet**: ~10 turnos por pré-entrevista, com cache de prompt; dá para baratear com o GPT-5.4 mini se o juiz empatar.
- **Eco no barge-in**: o mic aberto com a voz tocando precisa de `echoCancellation` e de um limiar; se não ficar limpo, a fase 4
  entra sem barge-in.
- **Streaming quebra o pós-processamento**: qualquer limpeza passa a ser por frase, no buffer, antes do TTS.

---

## 8. Primeiro alvo: a entrevista no quadro

O quadro já tem a forma Conversador + Pensador (`perguntar` responde à fala; `analisar` observa o desenho e decide as
perguntas por iniciativa). Por isso o teste começa por ele: mudar só o Conversador e medir.

> Os scripts de medição só chamam a OpenRouter com `--pago` (ver `scripts/_gasto.ts`). Sem a flag, rodam só na Featherless e os tempos não são os de produção.

**Placar** (`npm run placar:quadro -- --rotulo <nome>`, em `scripts/placar-quadro/`):
- 18 casos fixos com checagem objetiva;
- 3 entrevistas simuladas (um LLM faz o candidato: sênior claro, júnior nervoso, vago que testa atalhos);
- um juiz (Sonnet 5.5) que dá nota a cada fala e marca violações;
- latência p50/p95.
`--comparar a.json b.json` mostra a diferença. Ainda não calibrado com notas humanas: serve para comparar versões.

**Linha de base, v1** (`docs/placar-quadro/v1-base.md`):

| Medida | v1 |
|---|---|
| Casos fixos ok | 17/18 |
| Escuta / Pertinência / Naturalidade / Concisão | 3,95 / 3,67 / 3,29 / 4,65 |
| Pareceu pessoa / Conduziu bem / Inteligência | 2,67 / 2,33 / 3,00 |
| Violações (55 falas) | validou 13, enlatado 6, ensinou/dica 5, ignorou 3, vazou critério 2, repetiu 2, inventou fato 1 |
| /perguntar p50 / p95 | 1055 / 1224 ms |

O que o juiz viu: a fórmula "Saquei, ..." / "Ficou clara ...", que valida em vez de ouvir. Depois de uma resposta boa, abre
outro assunto (interrogatório). Entrega os próximos tópicos ("como a geração do código ou a contagem de cliques") e
inventou um prazo de retorno.

**v2** (`TOTTI_QUADRO=v2`, `lib/agente/prompts/entrevistador-v2.ts`):
- prompt de objetivos com o porquê, sem frases-modelo;
- vê os critérios ainda sem sinal e as próprias últimas falas;
- papel `conversa_quadro` (`CONVERSA_QUADRO_MODEL`);
- convite enlatado só quando não sobra fala.

A primeira rodada (flash-lite) saiu contaminada pelo limite de créditos da OpenRouter: um juiz e os casos sem nota.
Sinal preliminar: validou caiu de 13 para 2, sem dica, sem vazamento e sem enlatado; repetiu pergunta subiu para 3. Falta
refazer com crédito, e com Sonnet 5.5 no Conversador.

---

## 9. Passo intermediário na pré-entrevista: o planejador obedece ao modelo (série da issue #22)

Antes da troca de arquitetura das seções 4 a 6, a pré-entrevista ganhou um passo menor na mesma direção. O planejador
e as travas **ficam**, mas quem decide a conversa passa a ser o modelo: ele escreve a fala e declara o que fez, e o
código confere só o inegociável. O motivo era um caso concreto: a recrutadora dizia "pode repetir a pergunta?" e o
Totti passava para a pergunta seguinte ou para o resumo.

### 9.1 O contrato

O modelo responde em JSON: `{ "fala": "...", "movimento": "...", "decisao": "..." }`. Texto puro continua válido, e os
dois campos são opcionais.

**`movimento`** diz que movimento de conversa a fala é (ausente vale `seguir`):

| valor | quando | o que o código faz |
|---|---|---|
| `repetir` | ela pediu para repetir e a fala traz a mesma pergunta (ou o mesmo resumo) que estava em aberto | desfaz o que foi lido da fala dela; o passo em curso continua em curso; depois do resumo, sai o último resumo como foi falado |
| `esclarecer` | ela não entendeu a pergunta e a fala a reformula ou explica o que se quer saber, em palavras de RH | o mesmo de `repetir` |
| `nao_entendi` | a fala dela não faz sentido como resposta (transcrição quebrada, truncada ou sem relação com a pergunta) e o Totti diz que não entendeu e refaz a pergunta em aberto, mais curta | o mesmo de `repetir`; a fala dela fica marcada (`naoEntendida`) e sai da extração e da cobertura dos turnos seguintes; sem "?", a pergunta em aberto volta no fim; na terceira vez seguida (e de novo a cada três), a fala vira a oferta de digitar (`falaParaDigitar`); com um turno em curso, a extração não lê a última fala dela, ainda sem resposta |
| `responder` | a fala responde a algo que ELA perguntou ou comentou (dúvida, "tá me ouvindo?", pedido de tempo) | mantém o que foi lido da fala dela; o passo escolhido não conta como feito |
| `seguir` | todo o resto: executar o passo do planejador | o de sempre: o passo conta como feito |

Duas regras valem para tudo:

- **nenhuma trava reescreve uma fala cujo `movimento` é `repetir`, `esclarecer`, `nao_entendi` ou `responder`**. As
  exceções são formato de voz, não conteúdo: a limpeza de markdown, aspas e prefixo vale sempre, "uma pergunta só" vale
  para `repetir`, `esclarecer` e `nao_entendi`, e a fala dela repetida inteira no começo da fala do Totti sai
  (`repeticao_da_fala_dela`, fala dela com 3 palavras ou mais). Uma fala `esclarecer` sem "?" também é formato de voz
  (sem o "?" ela não sabe que a vez é dela): a pergunta indireta ("Eu quero saber se X ou Y.") vira direta ("X ou Y?"),
  ou, sem ela, a pergunta em aberto volta no fim (`pergunta_no_esclarecer`, issue #113);
- **uma fala com `repetir`, `esclarecer` ou `nao_entendi` não fecha o passo em curso nem muda o plano**
  (`falaDelaNaoEraResposta`): a pergunta continua em aberto, nenhuma contagem anda, e a rota não agenda a extração.

Reserva para o modelo rápido, que às vezes não declara o campo: fala que traz quase a mesma pergunta em aberto, quando
o planejador tinha escolhido outra pergunta, conta como `repetir` (`movimentoDaFala` em `conversa.ts`).

**`decisao`** só existe quando o Totti pediu uma decisão e a resposta dela não é escolha nem recusa. Nesses casos o
código deixou de escolher por ela: a entrada traz `DECISÃO PENDENTE` no lugar do passo, e o modelo lê a fala.

| decisão pendente | quando | valores de `decisao` |
|---|---|---|
| troca de formato | a oferta está em curso e nenhum sinal de escolha passa do limiar | `trocar`, `proxima_etapa`, `seguir_sem`, `adiar` |
| nível | o Totti perguntou o nível e ela não disse | `junior`, `pleno`, `senior`, `estimativa`, `adiar` |
| aprovação do resumo | depois do resumo, ela não aprovou nem pediu mudança | `finalizar`, `mudar`, `adiar` |

A escolha é aplicada pelas mesmas funções que aplicam a escolha lida pelos sinais, e o planejador escolhe o passo
seguinte. Com `adiar`, sem o campo ou com valor que não existe, nada é decidido e as contagens não andam. Se o modelo
falhar, nada é decidido e sai uma fala de reserva curta que refaz a pergunta. Respostas claras ("vamos de system
design", "pode finalizar", "é pleno") continuam resolvidas pelos sinais do Jev, sem o campo.

O que o modelo recebe a mais: a linha `PERGUNTA SUA EM ABERTO` (a parte terminada em "?" da última fala dele que tem
pergunta) e, no prompt de sistema, as seções "Quando a conversa sai do roteiro" e "Quando você pediu uma decisão e a
resposta não decidiu", escritas como objetivos com o porquê.

### 9.2 Antes e depois

**Antes: medido. Depois: pendente.** A linha de base foi medida em 2026-11-10 na branch `conversa/23-placar-casos`, com o
LLM e o Jev reais e **sem `--pago`** (detalhes e leitura em `docs/placar-conversa/pre-entrevista-base.md`). O "depois"
ainda não foi rodado.

Para a comparação valer, o "depois" tem de rodar do mesmo jeito que o "antes". Os dois comandos têm limites sem `--pago`:

- `pre:conversa` roda, mas os tempos não são os de produção: a fala que passa de 6 s na Featherless vira erro, sem
  OpenRouter para onde cair. Compare só o resultado dos casos e trate o p50/p95 como indicativo.
- `pre:simular` **não serve** sem `--pago`: depois de um timeout a Featherless fica 2 min fora e as personas param
  depois de 0 a 3 falas. O número da linha de base (7/8 na `distraida`) é da configuração padrão, não da conversa. Para
  comparar fidelidade, estilo e tempo, rode antes e depois **com `--pago`**, e só então preencha as células marcadas.

```bash
git checkout conversa/23-placar-casos && npm run pre:conversa                       # antes (feito)
git checkout conversa/28-fechamento && npm run pre:conversa                         # depois
git checkout conversa/23-placar-casos && npm run pre:simular -- --pago              # antes, com modelos de produção
git checkout conversa/28-fechamento && npm run pre:simular -- --pago                # depois, com modelos de produção
```

| medida | antes | depois |
|---|---|---|
| casos de conversa (`npm run pre:conversa`), 8 casos da linha de base | 1 de 8 passou, 6 falharam, 1 com erro | pendente |
| casos de resposta que não decide (5 casos novos, só existem a partir da #27) | não se aplica | pendente |
| fidelidade do plano por persona (`npm run pre:simular`) | sem medida válida (sem `--pago` a conversa parou) | pendente |
| fidelidade da persona `distraida` | 7/8, só da configuração padrão (a conversa não aconteceu) | pendente |
| checagens de estilo e repetição | sem medida válida | pendente |
| tempo por fala do Totti (p50 / p95) | só da fala testada nos casos: 2518 / 4586 ms, sem `--pago` | pendente |

O que os testes sem modelo já garantem (`npm run test:pre-entrevista`, com LLM e Jev falsos): depois de um
aprofundamento, `repetir` deixa plano, foco, ênfase e preferências iguais e a resposta de verdade segue do mesmo
ponto; "quarenta e cinco minutos" dentro de um pedido de repetição não vira duração; `esclarecer` depois de uma oferta
de troca não registra decisão; três repetições do resumo não encerram e `resumos` continua 1; os cinco exemplos da
issue #27 se comportam como esperado. Falta ver se o modelo real declara o movimento certo.

### 9.3 Travas: o que saiu e o que ficou

**Nenhuma trava saiu.** A regra da série era remover só o que a medição mostrasse morto, e a medição não foi feita.
Todas ficam, obedecendo ao movimento, e cada reescrita vira um evento `trava` no log da sessão, com a fala antes e
depois. O simulador soma esses eventos por persona e no total (bloco "condução da conversa"), junto com os movimentos,
as decisões pendentes e o p50/p95 por fala. É com essa saída que a decisão deve ser tomada.

| trava (nome no log) | o que segura | critério para sair |
|---|---|---|
| `reconhecimento_inicial` | "Certo.", "Entendi," no começo da fala | nunca disparou, ou o prompt novo já evita |
| `cortar_na_primeira_pergunta` | duas perguntas na mesma fala | nunca disparou nas simulações |
| `pergunta_do_banco` | pergunta no molde óbvio ("o que separa um ótimo de um fraco?") | nunca disparou, ou a troca piorou a fala |
| `pergunta_de_contexto` | pergunta de contexto sem "?" ou no molde óbvio | idem |
| `pergunta_no_fim` | confirmação do início ou resposta a dúvida sem devolver a decisão | nunca disparou |
| `reescrita_do_resumo` | resumo do modelo com mais de 2 frases (custa uma chamada a mais) | nunca disparou |
| `logistica_da_revisao` | tom, dicas e duração ditos pelo modelo na revisão, em vez de vir do estado | nunca disparou |
| `resumo_repetido` | não é trava de conteúdo: troca a repetição do modelo pelo último resumo falado | fica |

No planejador, também para decidir com a medição: `MAX_DUVIDAS_SEGUIDAS` e o passo `responder_duvida`, se o movimento
`responder` cobrir o mesmo caso. O padrão "próxima etapa" de `decidirTradeoff` já saiu na #27 (virou `incerto`).

### 9.4 O que isto adianta das fases 0 e 1

- **Fase 0 (placar)**: os casos de ouro da conversa existem (`scripts/pre-entrevista/validar-conversa.ts`, 13 casos) e o
  simulador mede tempo por fala (p50/p95), movimentos e travas. Faltam o juiz de conversa e a latência por etapa.
- **Fase 1 (cérebro)**: o modelo já pode sair do roteiro e já decide o que o código decidia sozinho (repetir, esclarecer,
  responder, e as três decisões pendentes). O prompt ganhou seções de objetivos com o porquê. O planejador e o Jev
  continuam no caminho da fala; tirá-los de lá é o que falta da fase 1.

### 9.5 O que fica para a série seguinte

Levar o mesmo contrato (`movimento` e pergunta em aberto) para as entrevistas com o candidato: live coding
(`lib/agents`, `components/ide`) e quadro (`lib/agente`, `lib/sessao`), incluindo o pedido de licença
(`lib/conversa/licenca.ts`). Elas ficaram fora desta série de propósito.
