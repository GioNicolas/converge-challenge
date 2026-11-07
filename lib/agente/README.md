# Cérebro do agente (servidor)

Lado servidor da entrevista no quadro. Por enquanto só a **máquina de estados em texto**: TypeScript puro, sem I/O, sem áudio e sem LLM. O estado é JSON puro (sem `Set`, `Map` ou `Date`), então dá para guardar no banco e retomar depois.

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

- Status por fase: REQUISITOS nenhum; ALTO_NIVEL só `redirecionar`; APROFUNDAMENTO `duvida`/`redirecionar`/`dica`; FECHAMENTO só `duvida`, uma vez.
- Máximo de 5 perguntas, 60s desde a última pergunta, candidato fora de uma resposta em andamento.
- Uma dúvida pendente **não** bloqueia a análise (é preciso poder substituí-la ou cancelá-la).
- `filtrarResposta` rebaixa para `ok` o que não é permitido, descarta ids que não estão no grafo recebido (`extrairIdsDoGrafo`) e corta a nota em 40 caracteres.

## Fluxo esperado na rota (ainda não existe)

1. `podeAnalisar(estado, agora)`; se não, devolver `ok` sem chamar o LLM.
2. Chamar o LLM, validar com `EsquemaRespostaAnalise`.
3. `filtrarResposta(estado, resposta, extrairIdsDoGrafo(pedido.grafo), agora)` e devolver ao quadro.
4. `transicionar(estado, { tipo: "ANALISE_RECEBIDA", resposta }, agora)` e persistir o novo estado.

## Ainda NÃO está aqui

- Prompt do LLM e chamada à Anthropic.
- Rota `/api/sessoes/:id/analisar` (e as outras rotas do contrato).
- Dados do kit de avaliação (problema, ficha de requisitos, rubrica); `estadoInicial` recebe só a lista de critérios.
- Voz (ElevenLabs, STT) e o `/perguntar`.
- Persistência no banco e scorecard.
