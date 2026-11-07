# Teste local: entrevista completa por texto

Página `/dev/entrevista-texto` para rodar uma entrevista inteira, só com texto, contra o cérebro real (as mesmas rotas HTTP que o quadro do Excalidraw usa). Você faz o papel do candidato: o "quadro" é uma caixa de texto com o grafo, a conversa é um chat e, no fim, aparece o **scorecard**.

> Status de verificação: com `AGENTE_FAKE=1` tudo foi testado (testes automáticos e rotas via `next start`). **O caminho com modelo real (Haiku na análise, Opus no scorecard) NÃO foi verificado**: nenhuma chamada real foi feita. Quem for usar a chave deve rodar o roteiro abaixo uma vez e conferir a qualidade. A renderização no navegador também não foi conferida visualmente (só `next build` e os testes dos handlers).

## Como rodar

```
npm ci --ignore-scripts
# sem chave (LLM falso determinístico):
AGENTE_FAKE=1 npm run dev
# com chave real:
OPENROUTER_API_KEY=... npm run dev        # ou coloque em .env.local
```

Abra `http://localhost:3000/dev/entrevista-texto?avaliacao=demo`.

- Use `npm run dev`. Com `next start` (produção) a rota `/api/dev/sessoes/[id]/estado` responde 404 e o scorecard não é devolvido ao navegador, a menos que `AGENTE_DEV=1` esteja definido.
- `AGENTE_FAKE=1`: análise e perguntas usam o LLM falso (só dá dúvida quando o grafo tem um componente chamado "Postgres") e o scorecard é montado do livro de observações, sem rede.
- Sem chave e sem `AGENTE_FAKE`: as análises respondem sempre "ok" e o botão de encerrar mostra o aviso "sem OPENROUTER_API_KEY" (HTTP 503), nunca erro 500.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `OPENROUTER_API_KEY` | Modo real (só servidor). |
| `AGENTE_FAKE=1` | Tudo falso, sem chave. |
| `AGENTE_MODELO_AO_VIVO` | Análise e perguntas. Padrão `anthropic/claude-haiku-5.5`. |
| `AGENTE_MODELO_FINAL` | Scorecard. Padrão `anthropic/claude-opus-5.5` (raciocínio ligado, até 6000 tokens, 120 s). |
| `AGENTE_DEV=1` | Libera as rotas de dev e o scorecard no navegador mesmo em produção. Nunca use em produção real. |
| `AVALIACOES_API_SECRET` | Em produção, o `GET /scorecard` e o `POST /finalizar` só devolvem o scorecard com o header `x-api-key` igual a este valor (visão do recrutador). |

## Roteiro sugerido (avaliação `demo`, encurtador de URL)

1. **Iniciar.** Aparecem título e enunciado. A barra mostra fase `REQUISITOS`, 0 perguntas, plin pendente "não" e os 6 critérios sem evidência.
2. **Requisito.** Na conversa, escreva "Qual a escala de acessos?" e Enviar. O entrevistador responde pela ficha e o item aparece em "Requisitos combinados". (Pergunte também "por quanto tempo guardamos os links?".)
3. **Desenho ruim.** Clique "Exemplo ruim (encurtador)" e "Enviar desenho". O primeiro desenho tira você de `REQUISITOS` para `ALTO_NIVEL`. Nesta fase só `redirecionar` vira plin, então normalmente nada aparece; observações são colhidas (veja "observações" na barra).
4. **Aprofundar.** Clique "Próxima fase" (vira `APROFUNDAMENTO`) e "Enviar desenho" de novo; como o grafo não mudou, edite algo (ex.: troque o nome de um componente) para gerar uma mudança. Aparece "🔔 O entrevistador tem uma dúvida" e a barra mostra plin pendente "sim".
5. **Plin.** Clique no sino: a pergunta aparece como bolha do entrevistador, a nota curta (até 40 caracteres) e os elementos citados ficam destacados no grafo.
6. **Resposta.** Escreva a resposta (pode mandar mais de uma frase) e clique "Terminei de responder". A página manda o evento `resposta` e faz a reanálise forçada, como o quadro. Dentro de 60 s do clique nenhum novo plin é liberado (a política segura isso).
7. **Melhorar o desenho.** Clique "Exemplo bom", Enviar desenho: a dúvida pendente (se houver) expira ou é cancelada por um "ok".
8. Repita 4 a 6 até a 5ª resposta: o servidor leva a entrevista para `FECHAMENTO` (uma única pergunta final).
9. **Encerrar entrevista.** Gera o scorecard: nota geral, sugestão de recomendação, nota por critério com evidências (fala citada, ids do desenho), pontos fortes, pontos a aprofundar e briefing. A recomendação é só uma sugestão, quem decide é uma pessoa.

Para ver o log de cada chamada (pedido e resposta JSON, latência), abra "Log bruto" no fim da página.

## Rotas novas

- `POST /api/sessoes/[id]/finalizar`: encerra a sessão e gera o scorecard uma única vez (idempotente; chamadas em paralelo não geram duas vezes). Erros: 503 sem chave, 502 se o modelo falhar (pode tentar de novo).
- `GET /api/sessoes/[id]/scorecard`: devolve o que foi gerado (404 se ainda não).
- `GET /api/dev/sessoes/[id]/estado`: visão segura do estado (fase, plin, perguntas feitas, critérios sem evidência, contagens). Nunca devolve ficha, rubrica, conversa ou o texto da dúvida pendente.

## Guardas do scorecard (determinísticas, depois da chamada ao modelo)

1. Todo critério da rubrica aparece exatamente uma vez (faltante vira "sem evidência suficiente").
2. Nota sem evidência vira `null`.
3. Evidência de fala precisa ser trecho real da conversa (comparação sem acento, caixa e pontuação; `...` separa trechos).
4. Evidência de desenho precisa citar ids/horários/imagens que existem; o que não existe é removido.
5. `nota_geral` é recalculada no servidor (média das notas não nulas, 1 casa).
6. Com menos da metade dos critérios com evidência, a recomendação vira `evidencia_insuficiente`.

## Custo estimado por passo (modelo real)

| Passo | Modelo | Custo aproximado |
|---|---|---|
| Cada `/analisar` | Haiku | ~US$ 0,001 |
| Cada `/perguntar` | Haiku | ~US$ 0,001 |
| Scorecard (`/finalizar`) | Opus, raciocínio ligado | ~US$ 0,2 |
| Entrevista inteira de teste (~15 análises, ~5 perguntas, 1 scorecard) | | ~US$ 0,22 |

Valores estimados do pedido original; não foram medidos aqui.

## Testes automáticos

`npm run test:entrevista-texto` (diff do grafo, guardas do scorecard, entrevista completa pelos handlers com LLM falso, finalizar idempotente, visão de estado e gating de produção).
