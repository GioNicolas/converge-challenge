# Cérebro do agente (servidor)

Lado servidor da entrevista no quadro. **Só texto por enquanto** (a voz vem depois, em cima do mesmo cérebro). A máquina de estados é TypeScript puro; o LLM entra por uma interface (`llm/cliente.ts`) que se troca por um falso nos testes. O estado é JSON puro (sem `Set`, `Map` ou `Date`), então dá para guardar no banco e retomar depois.

O contrato com o quadro está em `docs/contrato-quadro-cerebro.md`. Os formatos em `sessao/tipos.ts` são cópia dos de `lib/sessao/cliente.ts` (branch do Giorgio); não mude sem combinar.

## Arquivos

- `sessao/tipos.ts`: esquemas Zod e tipos (`Fase`, `PedidoAnalise`, `RespostaAnalise`, `Observacao`).
- `sessao/estado.ts`: `estadoInicial`, `transicionar`, tipos de estado, evento e efeito.
- `sessao/politica.ts`: o "portão de entrada" (`podeAnalisar`, `statusPermitido`, `filtrarResposta`).
- `sessao/__tests__/`: testes (`npm run test:agente`).

## Fases

`AGUARDANDO → APRESENTACAO → REQUISITOS → ALTO_NIVEL → APROFUNDAMENTO → FECHAMENTO → ENCERRADA`

Avançam por evento explícito ou pelo tempo (`TICK` compara `agora - faseIniciadaEm` com `tempos[fase]`, em segundos; fase sem tempo não acaba sozinha).

## Ciclo do plin

`LIVRE → PLIN_PENDENTE → PERGUNTA_ATIVA → LIVRE`

- Só há uma dúvida pendente: uma nova substitui a anterior.
- Um `ok` da análise cancela a pendente.
- Se o candidato mexe num elemento citado pela pendente (`ELEMENTOS_ALTERADOS`), ela expira e a máquina pede nova análise.
- A resposta termina quando o candidato fala com `fimDeResposta: true`.
- A 5ª resposta no aprofundamento leva ao fechamento (igual ao quadro).

## Eventos (`EventoSessao`)

`COMECAR`, `APRESENTACAO_TERMINOU`, `CANDIDATO_DESENHOU`, `APROFUNDAR`, `TICK`, `ENCERRAR`, `ANALISE_RECEBIDA`, `ELEMENTOS_ALTERADOS`, `PLIN_CLICADO`, `CANDIDATO_FALOU`, `AGENTE_FALOU`.

## Efeitos (`Efeito`)

`transicionar(estado, evento, agora)` devolve `{ estado, efeitos }`. Quem chama executa os efeitos:

- `FASE_MUDOU`: registrar na linha do tempo (`tipo: "fase"`).
- `PLIN_PENDENTE`: uma dúvida ficou à espera do clique (`substituiuAnterior` indica troca).
- `PLIN_CANCELADO`: motivo `ok`, `elementos_alterados` ou `fase`.
- `ANALISAR`: rodar o `/analisar` de novo (`resposta_terminou` ou `plin_expirou`).
- `PERGUNTA_INICIADA`: o candidato clicou; a pergunta já está no registro.
- `RESPOSTA_ENCERRADA`: o candidato terminou de responder.
- `SESSAO_ENCERRADA`: gerar o scorecard.

## O que o estado registra

`perguntasFeitas`, `ultimaPerguntaEm`, `ultimaRespostaEm`, `perguntas` (com os ids dos elementos citados), `observacoes` (livro para o scorecard), `cobertura` (critério da rubrica → contagem de evidências positivas/negativas/neutras; `criteriosSemEvidencia(estado)` lista os que faltam) e `conversa`.

## Política (portão de entrada)

Duas perguntas separadas:

- **Analisar?** (`podeAnalisar`): roda em REQUISITOS, ALTO_NIVEL, APROFUNDAMENTO e FECHAMENTO (é em REQUISITOS que nasce a evidência de "requisitos"). Só o candidato no meio de uma resposta (`PERGUNTA_ATIVA`) bloqueia. Intervalo e limite NÃO bloqueiam: o agente segue colhendo observações para o scorecard.
- **Levantar plin?** (`podeLevantarPlin`): status permitido na fase (REQUISITOS nenhum; ALTO_NIVEL só `redirecionar`; APROFUNDAMENTO `duvida`/`redirecionar`/`dica`; FECHAMENTO só `duvida`, uma vez) **e** no máximo 5 perguntas **e** 60s desde a última (`motivoBloqueioPlin`).
- Uma dúvida pendente não bloqueia a análise (é preciso poder substituí-la ou cancelá-la).
- `filtrarResposta` rebaixa para `ok` o que não é permitido (mantendo as observações), descarta ids que não estão no grafo recebido (`extrairIdsDoGrafo`) e corta a nota em 40 caracteres.

## Arquitetura do cérebro (texto)

```
pedido do quadro --> analisar() --> podeAnalisar? --(não)--> ok
                        |
                 prompts/avaliador  (bloco ESTÁTICO: kit+problema, com cache | bloco DINÂMICO: fase, tempo, grafo, conversa, estado)
                        |
                 llm.completarJson  (OpenRouter, JSON schema estrito; erro/timeout --> ok)
                        |
        guardas: linguagem avaliativa, pergunta repetida --> ok
                        |
        filtrarResposta (política) --> transicionar(ANALISE_RECEBIDA) --> { resposta, estado, efeitos }

fala do candidato --> perguntar() --> só pela ficha --> { responder, texto, requisito, estado }
```

- `llm/cliente.ts`: `LlmCliente.completarJson`, `criarClienteOpenRouter()` (fetch puro, timeout de 8s = prazo do quadro, 1 retry em 5xx/429 só se sobrar tempo, saída validada pelo Zod, erro tipado `ErroLlm`), `criarClienteFalso()` para testes. `llm/jsonschema.ts` converte Zod 3 em JSON Schema (sem dependência nova).
- `prompts/avaliador.ts`: o prompt da análise (10 princípios, tabela de ações, notação do grafo, rubrica, regras de saída). `prompts/entrevistador.ts`: o do `perguntar`.
- `guardas.ts`: linguagem avaliativa ("correto", "errado", "ótimo", "excelente", "perfeito", "parabéns"), pergunta quase repetida (sobreposição de tokens >= 0.7), fala de enchimento.
- `analisar.ts`, `perguntar.ts`: as duas funções públicas. Não lançam por causa do LLM; log só com metadados.
- `kits/demo.ts`: kit de demonstração (system design, encurtador de URL). `kits/index.ts`: `carregarKit(id)`.

A ficha, a rubrica e os motivos ficam só no servidor: o que sai de `analisar` tem exatamente os campos de `RespostaAnalise`.

## Rodar o harness de texto

Você faz o papel do candidato no terminal.

```
npm run agente:chat -- --fake      # sem chave: LLM de mentira com regras simples
npm run agente:chat                # LLM real (precisa de OPENROUTER_API_KEY)
```

Comandos: `/grafo scripts/exemplos/encurtador-ruim.txt` (carrega o desenho e roda a análise), `/fase APROFUNDAMENTO` (força a fase), `/tick`, `/tempo 90` (avança o relógio simulado, útil para o intervalo de 60s), `/plin` (clica no plin pendente), `/estado`, `/sair`. Texto livre é a fala do candidato: vai para o `perguntar`, ou é a resposta do plin ativo (e dispara nova análise). O harness imprime status, pergunta, nota, elementos, observações e os efeitos da máquina de estados, mais uma linha com fase, plin, perguntas feitas e critérios sem evidência.

## Variáveis de ambiente (só servidor, nunca `NEXT_PUBLIC_*`)

- `OPENROUTER_API_KEY`: obrigatória no modo real. O harness carrega `.env.local` se existir.
- `AGENTE_MODELO_AO_VIVO`: modelo da análise ao vivo. Padrão `anthropic/claude-haiku-5.5`. **Confira o id no catálogo da OpenRouter** (https://openrouter.ai/models) antes de usar; se estiver errado a chamada falha e a análise cai em `ok`.
- `AGENTE_MODELO_FINAL`: reservada para o scorecard (ainda não usada).

## Testes

`npm run test:agente` (node:test, só LLM falso, sem rede).

## Ainda NÃO está aqui

- Rotas `/api/sessoes/...` (o contrato está em `docs/contrato-quadro-cerebro.md`). As funções `analisar` e `perguntar` já têm o formato certo para elas.
- Persistência no banco (o estado já é JSON puro) e carregar kit/problema por avaliação.
- Scorecard final (modelo `AGENTE_MODELO_FINAL`).
- Voz (ElevenLabs, STT) e `/falar`.
- Quadro de requisitos persistido no estado (hoje `perguntar` recebe `requisitosAtuais` de quem chama).
