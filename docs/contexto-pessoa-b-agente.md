# Contexto: Pessoa B — o agente

> Documento para colar em outro chat/agente. Ele explica o projeto, o papel da Pessoa B, como construir e o que ainda precisa ser decidido. O documento par é `contexto-pessoa-a-ide.md`.

## 1. O projeto em uma frase

Um **entrevistador técnico com IA**: o candidato resolve um problema estilo LeetCode numa IDE no navegador, e um agente acompanha o que ele escreve em tempo real, faz perguntas por voz ("por que você foi por esse caminho?", "dá pra otimizar?"), **grifa trechos do código enquanto fala** e, no final, dá uma nota sobre a qualidade do raciocínio — não só se ele acertou.

Contexto: hackathon Converge Challenge (2 dias, time de 2 pessoas). O desafio da Tako é sobre *Digital Workers para RH* — esse projeto é um "recrutador técnico digital".

## 2. A divisão do time

| Pessoa A — **a IDE** | Pessoa B — **o agente** (este documento) |
|---|---|
| Editor de código no navegador | Entende o código que a IDE manda |
| Mostra o problema e roda os testes | Decide o que perguntar e quando, sem entregar a resposta |
| Captura o que o candidato escreve e entrega pro agente | Pede pra IDE grifar o trecho certo |
| Executa os comandos de grifo que o agente manda | Gera a nota final e o relatório |
| Liga a voz no navegador (microfone/alto-falante) | Configura o agente de voz (prompt, modelo) |
| Tela do relatório final (só desenha o JSON) | Escreve a parte "secreta" dos problemas: solução boa, erros comuns, dicas |

**Regra de ouro:** a IDE não tem inteligência nenhuma. Toda decisão — o que perguntar, quando falar, o que grifar, que nota dar — é da Pessoa B.

## 3. Stack decidida

- **Next.js API routes** (TypeScript), no mesmo repositório da IDE. Pastas da Pessoa B: `app/api/*`, `lib/agents/*`, `problems/*`.
- **LLMs via Featherless** — API compatível com OpenAI, então usar o SDK da OpenAI (ou AI SDK) só trocando a base URL.
  - Base URL: `https://api.featherless.ai/v1`
  - Chave em variável de ambiente `FEATHERLESS_API_KEY` (nunca commitar).
  - Crédito: US$ 25 por pessoa do time.
- **Voz:** **ElevenLabs Agents** (cuida de STT, detecção de turno, interrupção e TTS). Ele aceita **LLM customizado** via endpoint compatível com OpenAI e **client tools** (ferramentas que rodam no navegador — a Pessoa A implementa o lado do front).

### Modelos e onde cada um entra

| Peça | Modelo | Observação |
|---|---|---|
| **Analyst** (lê o código, prepara perguntas) | `zai-org/GLM-5.2` | Modelo de **raciocínio**: pensa antes de responder. Já testado: HTTP 200 em ~1,4 s. ⚠️ Com `max_tokens` baixo ele gasta tudo raciocinando e devolve `content` vazio — usar `max_tokens` folgado (1000+). |
| **Evaluator** (nota final) | `zai-org/GLM-5.2` | Contexto de até 256K: a sessão inteira cabe numa chamada. |
| **Interviewer** (fala, loop rápido) | Gemma 4 31B (conferir o id exato em featherless.ai/models) | Precisa de resposta rápida e sem raciocínio. **Testar latência e tool calling antes de confiar** (ver dúvidas). |
| Filtro "não entregou a resposta?" | Gemma 4 31B | Tarefa simples e barata. |

Erros conhecidos da Featherless: `503` = modelo frio ou cheio (tentar de novo — perigoso no loop de voz); `403` = modelo com licença, precisa dar "Unlock Model" no site.

## 4. Arquitetura: dois loops

Um modelo só não consegue conversar rápido **e** analisar fundo ao mesmo tempo. Por isso:

```
IDE ──eventos/snapshots──► Analyst (lento, GLM) ──► estado da sessão
                                                     (insights + fila de perguntas)
                                                          │
candidato ◄──voz──► ElevenLabs ◄──► Interviewer (rápido) ─┘
                                        │
                                        └──► client tools ──► IDE grifa
Fim da sessão ──► Evaluator (GLM) ──► Report JSON ──► IDE mostra
```

### 4.1 Analyst (loop lento)
- **Não roda a cada tecla.** Roda só em gatilhos: pausa (a IDE manda `pause`), execução (`run`), colagem (`paste`), candidato falou algo.
- Recebe: enunciado + parte privada do problema + snapshot do código **com números de linha** + últimos eventos + estado anterior.
- Devolve (JSON estruturado):
  - abordagem detectada (ex.: "força bruta com dois loops")
  - complexidade estimada de tempo/espaço
  - linhas suspeitas (bug, caso de borda esquecido) com o motivo
  - **fila de perguntas candidatas**, cada uma com prioridade e as linhas que devem ser grifadas
  - evidências para a rubrica (ex.: "considerou array vazio aos 05:12")
- Escreve tudo no **estado da sessão** (em memória no servidor basta para o hackathon).

### 4.2 Interviewer (loop rápido)
- **Não analisa código.** Lê a fila de perguntas que o Analyst já preparou e decide **quando** falar.
- Responde na hora quando o candidato fala com ele.
- Ferramentas que ele chama (executadas pela IDE): `highlight_range(startLine, endLine, nota?)`, `add_inline_note(line, texto)`, `clear_highlights()`. Chamar o grifo **no começo da frase** ("essa parte aqui…").

### 4.3 Política de quando falar
É o que faz parecer entrevista de verdade e não um chatbot chato:
- Não interromper enquanto o candidato digita rápido.
- Falar quando: pausa longa, assumiu uma abordagem, rodou e falhou, pediu ajuda.
- Limite de intervenções (ex.: no máximo 1 a cada 60–90 s, salvo se o candidato perguntar).
- Abrir a sessão pedindo pro candidato explicar como pretende resolver (isso já vale ponto na rubrica).

### 4.4 Não entregar a resposta
- Cada problema tem uma **escada de dicas**: nível 1 socrático ("o que acontece com o tempo se o array tiver 1 milhão de itens?") → nível 2 direcional ("tem alguma estrutura que busca em O(1)?") → nível 3 concreto.
- Só sobe de nível se o candidato continuar travado. **Cada dica usada vira dado pra nota.**
- Prompt proíbe revelar o algoritmo; filtro barato (Gemma) confere a fala antes de sair, se der tempo de implementar.

### 4.5 Evaluator (fim da sessão)
Recebe a linha do tempo inteira, a transcrição, o código final, resultado dos testes (incluindo escondidos) e as dicas usadas. Devolve o `Report`.

**Rubrica (nota 1–4 cada, sempre com evidência + timestamp):**
1. Entendimento do problema (fez perguntas de esclarecimento?)
2. Escolha e justificativa da abordagem
3. Análise de complexidade (soube explicar?)
4. Corretude (testes escondidos)
5. Qualidade do código (nomes, estrutura)
6. Testes e casos de borda (pensou sozinho?)
7. Comunicação (explicou o raciocínio em voz alta?)
8. Resposta a dicas e adaptação

**Para a nota ser confiável:**
- Sinais objetivos (testes passados, tempo, dicas usadas, colagem) entram direto; o LLM só julga o subjetivo.
- Rodar o Evaluator 2–3 vezes e usar a mediana.
- Dar no prompt exemplos do que é nota 1, 2, 3 e 4 em cada critério.

## 5. Pacote do problema (escrito pela Pessoa B)

Para cada problema (1–2 bastam; sugestão: **Two Sum**, que tem força bruta O(n²) e solução O(n) com hashmap — ótimo pra demo):

- **Parte pública** (a IDE mostra): título, enunciado, exemplos, código inicial, testes visíveis.
- **Parte privada** (nunca vai pro navegador): testes escondidos (bordas + caso grande), abordagens possíveis com complexidade, erros comuns, escada de dicas, o que conta como "bom" em cada critério da rubrica.

## 6. Contrato com a Pessoa A (combinar juntos ANTES de separar)

Ficar num único arquivo compartilhado (ex.: `lib/contracts.ts`). Mudou? Avisa o outro.

| Tipo | Direção | Campos principais |
|---|---|---|
| `SessionEvent` | IDE → agente | `t` (timestamp), `type` (`edit` \| `snapshot` \| `pause` \| `run` \| `paste` \| `speech`), `payload` |
| `RunResult` | IDE → agente | casos passados/falhados, saída, erro, tempo |
| `EditorCommand` | agente → IDE | `highlight_range` \| `add_inline_note` \| `clear_highlights` + parâmetros |
| `Report` | agente → IDE | nota geral, critérios `[{nome, nota 1–4, evidência, t}]`, resumo |

Junto com os tipos, 2 fixtures:
- `fixtures/session.json` — sessão gravada (a Pessoa A exporta). **Até ela chegar, a Pessoa B escreve uma sessão falsa à mão** pra começar a testar o Analyst e o Evaluator pelo terminal.
- `fixtures/report.json` — relatório de exemplo (a Pessoa B escreve; a Pessoa A usa pra montar a tela).

### Endpoints que a Pessoa B expõe (sugestão)
- `POST /api/events` — recebe eventos da IDE; dispara o Analyst nos gatilhos.
- `GET /api/state` — estado atual da sessão (insights + fila de perguntas), útil pra debug.
- `POST /api/llm` — endpoint compatível com OpenAI que o ElevenLabs usa como "LLM customizado"; injeta o estado da sessão no prompt e repassa pra Featherless.
- `POST /api/evaluate` — gera o `Report` ao finalizar.

## 7. Ordem de construção

1. Chamada à Featherless funcionando com `max_tokens` certo + escrever o pacote do problema.
2. **Analyst rodando sobre a fixture pelo terminal** — iterar o prompt até as perguntas ficarem boas.
3. **Evaluator rodando sobre a fixture** — gerar `report.json` real.
4. Interviewer **por texto** (chat lateral da IDE) chamando o grifo → **Integração 1: ponta a ponta por texto, até o almoço do dia 1**.
5. Configurar o agente no ElevenLabs (prompt + LLM customizado + client tools) → **Integração 2: voz, fim do dia 1**.
6. Dia 2: calibrar a rubrica com sessões reais, ajustar a política de interrupção, roteiro da demo.

**Prioridade:** Analyst + Evaluator são o coração. Voz é a última camada; se falhar, a demo por texto com grifo já mostra o valor.

## 8. Fora do escopo
Treinar/ajustar modelo, banco de dados, múltiplos usuários, várias linguagens, computer use.

## 9. Dúvidas para fechar o plano

**Modelos**
1. O Gemma 4 31B responde rápido o bastante pra voz (meta: < 1 s até o primeiro token)? E quando está "frio"?
2. O modelo do Interviewer suporta **tool calling** pela API da Featherless? (Sem isso, não tem grifo pela voz.)
3. Se a Featherless não servir pro loop de voz, usamos o LLM padrão do próprio ElevenLabs no Interviewer e deixamos a Featherless só no Analyst/Evaluator?
4. Qual o orçamento por sessão? Medir quantos tokens uma sessão de 20 min gasta antes da demo.

**Agente de voz**
5. Como o Interviewer recebe o código atualizado: o endpoint `/api/llm` injeta o estado a cada turno, ou um client tool `get_current_code`? *(Sugestão: injetar via `/api/llm` — a Pessoa B controla tudo do servidor.)*
6. O agente pode **iniciar** a fala sozinho (ex.: depois de uma pausa) ou só responde quando o candidato fala? Como disparar isso no ElevenLabs?
7. Voz e idioma: português? Qual voz do ElevenLabs?

**Comportamento**
8. Quantas intervenções por minuto no máximo?
9. O agente começa pedindo pro candidato explicar a ideia antes de codar?
10. Quantos níveis na escada de dicas, e quanto cada dica desconta na nota?
11. O agente avisa quando o tempo está acabando?

**Avaliação**
12. Os 8 critérios da rubrica estão bons, ou cortamos pra 4–5 pra caber no tempo?
13. Nota final: média simples, ou pesos diferentes (ex.: comunicação e abordagem pesam mais que corretude)?
14. Colagem de código conta contra? Quanto?
15. Mostramos ao candidato só a nota ou também o relatório com evidências?

**Demo**
16. Qual roteiro da demo? (Sugestão: candidato começa com força bruta de propósito → agente grifa os dois loops e pergunta sobre complexidade → candidato otimiza → relatório.)
17. Temos uma sessão gravada de backup pra mostrar o relatório caso a demo ao vivo dê errado?
