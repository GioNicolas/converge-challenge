# Cérebro como rotas HTTP

> **Atualização (junção com a `main`):** o cérebro do quadro passou a usar o `lib/llm` (o mesmo cliente do agente de live coding: Featherless primária, OpenRouter de reserva, por papel). O modelo de cada chamada agora vem das variáveis `ANALYST_MODEL`, `INTERVIEWER_MODEL` e `EVALUATOR_MODEL` (e as `*_FALLBACK_MODEL`), e as chaves são `FEATHERLESS_API_KEY` e `OPENROUTER_API_KEY`. As variáveis `AGENTE_MODELO_AO_VIVO`, `AGENTE_MODELO_FINAL` e `AGENTE_MODELO_PLANEJAMENTO` **não têm mais efeito**, e os modelos e custos citados abaixo (Haiku e Opus) são do cliente anterior. Ver `lib/agente/llm/principal.ts`.

As rotas abaixo expõem o cérebro de texto (`lib/agente`) no formato de `docs/contrato-quadro-cerebro.md`. O quadro valida as respostas e rejeita outro formato, então não mude os campos sem combinar com o Giorgio.

## Como rodar

1. No `.env.local`:
   - `NEXT_PUBLIC_USAR_SERVIDOR=1` (liga o quadro às rotas reais).
   - **Sem chave:** `AGENTE_FAKE=1`. Usa um LLM de mentira determinístico (`lib/agente/rotas/llm-falso.ts`): a análise devolve `ok`, e uma `duvida` sobre o primeiro componente chamado "Postgres" quando o grafo tem um (a política ainda rebaixa para `ok` fora de APROFUNDAMENTO ou a menos de 60s da pergunta anterior). `/perguntar` responde com texto genérico quando a fala tem `?`.
   - **Com LLM real:** `OPENROUTER_API_KEY=...` e, se quiser, `AGENTE_MODELO_AO_VIVO` (confira o id no catálogo da OpenRouter). Sem chave e sem `AGENTE_FAKE`, a análise responde `ok` (aviso uma vez no console) e `/perguntar` responde `responder: false`; nunca 500.
2. `npm run dev` e abra `/entrevista/system-design`.

Avaliações conhecidas (`lib/agente/kits`): `demo`, `demo-chat`, `demo-pagamentos`, `demo-produto`. Outras dão 404.

## Rotas

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `POST /api/sessoes` | `{avaliacao_id, candidato_id}` | `{sessao_id, area, problema:{titulo,enunciado}, tempos}` | 400, 404 (avaliação), 413, 429 (10/min por IP) |
| `POST /api/sessoes/[id]/analisar` | `PedidoAnalise` | `{status, pergunta, nota, elementos, degrau, observacoes}` | 400, 404, 413, 429 (200 análises/sessão) |
| `POST /api/sessoes/[id]/perguntar` | `{sessao_id, fase, texto}` | `{responder, texto, requisito}` | 400, 404 |
| `POST /api/sessoes/[id]/eventos` | `{eventos:[{horario,tipo,dados}]}` | `{ok, recebidos, novos}` | 400, 404, 413 |
| `POST /api/sessoes/[id]/imagens` | multipart `imagem` (PNG) + `horario` | `{url}` | 400, 404, 413, 429 |
| `GET /api/sessoes/[id]/imagens/[n]` | | `image/png` | 404 |
| `POST /api/falar` | | stub | 501 `{erro:"voz ainda não implementada"}` |
| `GET /api/stt-token` | | stub | 501 `{erro:"voz ainda não implementada"}` |

Erros sempre têm `{erro}`; os de validação trazem também `detalhes` (`[{caminho, mensagem}]`, sem o valor recebido). Respostas nunca levam ficha, sinais, armadilhas, rubrica nem diagnóstico (o problema sai por `dadosPublicosDoProblema`).

### Comportamento

- **Fase:** o quadro é dono da fase. Em `/analisar`, `/perguntar` e nos eventos `fase`, o servidor avança até a fase informada pelo evento `SINCRONIZAR_FASE` da máquina (só avança; fase atrasada é ignorada).
- **Eventos -> máquina:** `fase` -> `SINCRONIZAR_FASE`; `pergunta` -> `PLIN_CLICADO`; `resposta` -> `CANDIDATO_FALOU` com `fimDeResposta`; `desenho` -> `CANDIDATO_DESENHOU` e, se houver ids (`dados.ids` ou `[x1]` em `dados.mudancas`), `ELEMENTOS_ALTERADOS`. Outros tipos só são guardados.
- **Idempotência:** chave = `horario + tipo + sha1(dados)`. Lote reenviado não duplica nem reaplica transições.
- **Prazo:** 8s por análise/pergunta (`AbortSignal` + corte); estourou, responde `ok`.
- **Concorrência:** depois do LLM o estado é relido e só a resposta já filtrada é reaplicada, para não pisar em eventos que chegaram no meio.

## O que é persistido

Em memória (`lib/agente/armazenamento/memoria.ts`, singleton em `globalThis`, sobrevive ao HMR; **perde tudo ao reiniciar**): estado da máquina (fase, plin, perguntas, observações, cobertura, conversa), contador de análises, eventos brutos (linha do tempo do scorecard) e imagens. Limites: 200 sessões (LRU), 2000 eventos/sessão, 20 imagens/sessão (4 MB cada), 256 MB de imagens no total. Para ir ao banco, implemente `RepositorioSessoes` (8 métodos) e troque em `repositorioPadrao()`.

## Limites e abuso

Sem segredo (chamado do navegador). Limite por IP na criação de sessão (best-effort: em memória, por instância, IP de `x-real-ip`/`x-forwarded-for`), 200 análises por sessão, tamanho de corpo (JSON 64 KB; análise 160 KB com `grafo` <= 60 KB e `conversa_recente` <= 40 itens; eventos 256 KB; imagem 4 MB, só PNG por assinatura). O id da sessão é um UUID aleatório. O log tem só ids e metadados, nunca grafo, falas ou chave.

## O que ainda é stub

Voz (`/api/falar`, `/api/stt-token`, 501; o quadro cai na voz do navegador e no texto escrito), scorecard, persistência em banco, quadro de requisitos guardado no servidor (`requisitosAtuais` ainda não é passado ao `perguntar`), autenticação.

## Testes

`npm run test:rotas` (handlers chamados direto, LLM falso, sem rede) e `npm run test:agente`.

## Campos acrescentados ao contrato (opcionais; o quadro aceita a ausência de todos)

| Rota | Campo | O que é |
|---|---|---|
| `POST /api/sessoes` | `problema.fala_do_desafio` | O que o agente FALA ao apresentar o desafio (natural, não a leitura do enunciado). O enunciado continua sendo o que se escreve no quadro. Sem ele, o quadro monta uma fala do título e do enunciado. |
| `POST /api/sessoes` | `apresentacao`, `despedida` | Saudação inicial e despedida escritas pelo modelo (uma chamada por kit+problema, guardada em memória). `null` sem LLM ou em erro. |
| `POST /analisar` (pedido) | `parado_ha_s`, `requisitos` | Segundos de silêncio do candidato (desenho, digitação ou fala) e requisitos já combinados. |
| `POST /analisar` (resposta) | `avancar_fase` | O cérebro acha que o alto nível está feito. Só vale em `ALTO_NIVEL`; o quadro avança para `APROFUNDAMENTO` (com mínimo de 30 s na fase). |
| `POST /perguntar` | `concluiu` | O candidato disse que terminou (no alto nível leva ao aprofundamento). |

Regras de plin relacionadas: em `REQUISITOS` só cabe **um** convite (silêncio inicial); ele não gasta a cota de 5, mas ocupa um número, então a primeira pergunta da cota é a 2. Os tempos de silêncio (`SILENCIO_S`, `SILENCIO_INICIAL_S`, `SILENCIO_REPETIR_S`) vivem em `lib/contracts.ts`, usados pelo quadro e pelo cérebro.
