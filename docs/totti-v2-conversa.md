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
