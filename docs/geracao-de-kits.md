# Geração de kits de avaliação a partir da vaga

O entrevistador deixa de depender de kits escritos à mão (`system-design`, `design-produto`): dado uma vaga
(`JobPosting`) e, opcionalmente, o plano aprovado (`InterviewPlan`), um LLM gera o **kit** completo para
qualquer área (obra, produto, dados, marketing, operações, saúde...), o código valida, uma pessoa revisa e
aprova, e só então candidatos entram em sessão.

```
POST /api/avaliacoes {vaga, plano?}  ->  kit gerado + validado (aprovado: false)
GET  /api/avaliacoes/{id}            ->  o gestor/tech lead lê o kit inteiro
PUT  /api/avaliacoes/{id}            ->  edita (mesma validação; remove a aprovação)
POST /api/avaliacoes/{id}/aprovar    ->  libera sessões
POST /api/sessoes {avaliacao_id}     ->  403 até aprovar (ou AGENTE_PERMITIR_NAO_APROVADA=1)
```

Rotas server-to-server: header `x-api-key` = `AVALIACOES_API_SECRET` (comparação em tempo constante;
sem a variável, tudo responde 401). `POST /api/avaliacoes` tem rate limit (5/min por IP) e `maxDuration = 120`.

## Peças

| Arquivo | Papel |
|---|---|
| `lib/agente/prompts/gerador-kit.ts` | Prompt (pt-BR): "não assuma tecnologia", problema de quadro branco, enunciado vago (<= 500 chars), ficha >= 8 linhas com números consistentes, rubrica = 4 universais + 2 a 3 da área, `modoLeitura`, termos de transcrição. Vaga/plano entram como **dados**. |
| `lib/agente/kits/gerar.ts` | `gerarKit({llm, vaga, plano?, modelo?, sinal?})`: 1 chamada (raciocínio ligado, `maxTokens` 12000, timeout 150 s), validação, 1 retry com os erros, depois `ErroGeracaoKit` tipado. O servidor impõe `kit.id` e `problema.id` a partir do id da vaga. |
| `lib/agente/kits/validar.ts` | Zod + regras: >= 6 critérios, ids slug e únicos, 4 níveis não vazios e distintos, ficha >= 8, sinais >= 4, armadilhas >= 3, perguntas >= 3, tipos de pergunta >= 4, enunciado <= 500 e sem números da ficha, ids seguros. |
| `lib/agente/kits/repositorio.ts` | `RepositorioAvaliacoes` + singleton em memória (`globalThis`). |
| `lib/agente/kits/index.ts` | `resolverAvaliacao` (async): dinâmicas primeiro, depois demos. `resolverAvaliacaoEstatica` é a versão síncrona só das demos. |
| `lib/agente/rotas/avaliacoes.ts` + `app/api/avaliacoes/**` | Rotas e guarda do segredo. |
| `scripts/gerar-kit.ts` | Gera os kits das vagas mock, imprime relatório, opcionalmente roda 1 `analisar` ao vivo. |

### Variáveis de ambiente

- `AVALIACOES_API_SECRET`: obrigatório para as rotas `/api/avaliacoes/*`.
- `AGENTE_MODELO_FINAL`: modelo da geração. Padrão `anthropic/claude-opus-5.5`. Se o id não existir na
  OpenRouter (HTTP 400/404) e a variável **não** estiver definida, o gerador tenta uma vez
  `anthropic/claude-sonnet-5.5` (fallback documentado).
- `AGENTE_TIMEOUT_KIT_MS`: sobrescreve o timeout da geração (padrão 150000).
- `AGENTE_PERMITIR_NAO_APROVADA=1`: permite abrir sessão de avaliação gerada ainda não aprovada (demos/testes).

### Decisões

- Editar um kit (PUT) **remove a aprovação**: o kit novo precisa ser aprovado de novo.
- O `avaliacao_id` é `av_<uuid>`, gerado no servidor; o id do kit (`coordenador_obras`) e do problema
  (`coordenador_obras_p1`) saem do id da vaga. Nada que o modelo escreva vira chave, URL ou caminho.
- O repositório é em memória: reiniciar o servidor perde as avaliações geradas. Trocar por banco é
  implementar a mesma interface.
- `timeoutMs` por chamada em `LlmArgs` (padrão do cliente continua 8000 ms para o loop ao vivo).
  `usage.cost` da OpenRouter vira `uso.custo`.

### Auditoria de prompts

Termos de software saíram dos prompts do avaliador: "Excalidraw" virou "quadro branco digital"; "noção de
escala/gargalos" virou consequências práticas (volume, prazo, custo, risco); "qualquer tecnologia" virou
"qualquer abordagem, método ou ferramenta"; "componente que poderia evitar" virou "etapa ou elemento"; o
exemplo de nota "Leitura 100x" virou "Prazo: e se atrasar?"; a notação do grafo avisa que "componentes"
podem ser etapas, ambientes, equipes, telas. Testes (`vagas-repositorio-prompt.test.ts`) garantem que o
prompt estático montado de um kit de obra não contém Postgres, banco de dados, Excalidraw, API, servidor,
cache etc. fora dos campos do próprio kit.

## Como reproduzir

```bash
# sem rede
npx tsx scripts/gerar-kit.ts --todas --fake --analisar

# real (a chave fica em OPENROUTER_API_KEY, no ambiente ou em .env.local; nunca é impressa)
npx tsx scripts/gerar-kit.ts coordenador-obras --analisar
npx tsx scripts/gerar-kit.ts backend-pleno --analisar
npx tsx scripts/gerar-kit.ts pm-senior --analisar
npx tsx scripts/gerar-kit.ts arquiteto-comercial --analisar
# saída: ./kits-gerados/ (gitignored): kit-<vaga>.json e analise-<vaga>.json

# testes
npm run test:agente && npm run test:rotas && npm run test:kits && npm run test:vagas
```

Os grafos falhos usados no `analisar` estão em `scripts/exemplos/grafos-vagas.ts`.

## Execução real (2026-11-07, `anthropic/claude-opus-5.5` via OpenRouter, raciocínio ligado)

| Vaga | Latência | Tokens (entrada / saída) | Custo | Tentativas | Área gerada | Problema | Leitura |
|---|---|---|---|---|---|---|---|
| backend-pleno | 68,5 s | 4046 / 5377 | US$ 0,110 | 1 | engenharia de software backend (pagamentos) | API de cobrança sem cobrança duplicada | grafo |
| coordenador-obras | 101,9 s | 4110 / 7904 | US$ 0,161 | 1 | planejamento e coordenação de obras | Recuperar o prazo de uma torre residencial atrasada | misto |
| pm-senior | 76,0 s | 4084 / 5844 | US$ 0,120 | 1 | gestão de produto | Queda de conversão no funil de contratação | grafo |
| arquiteto-comercial | 90,6 s | 4140 / 7061 | US$ 0,144 | 1 | arquitetura de projetos comerciais e varejo | Setorização de uma cafeteria de franquia | misto |

Total dos 4 kits: US$ 0,535. Todos passaram no validador de primeira (sem retry). Cada kit saiu com 7
critérios (4 universais + 3 da área), 12 a 14 linhas de ficha, 8 sinais, 6 armadilhas, 6 perguntas, 6
tipos de pergunta e 38 a 40 termos de transcrição.

Incidente: a primeira tentativa com o timeout de 90 s (valor inicial pedido) estourou com `timeout`
para coordenador-obras (a geração levou 102 s). Mudança: timeout padrão da geração passou para 150 s e
ganhou o override `AGENTE_TIMEOUT_KIT_MS`. Essa tentativa abortada pode ter sido cobrada pelo provedor
(custo não medido).

### `analisar` ao vivo (modelo padrão do loop, `anthropic/claude-haiku-5.5`), um por kit

Cada kit gerado foi usado como está, com um grafo deliberadamente falho da área:

| Kit | Falha plantada | Resposta do agente | Observações registradas | Latência / custo |
|---|---|---|---|---|
| backend-pleno | retry de pagamento sem chave de idempotência | `duvida` sobre cobrar duas vezes se o gateway aprovar e a resposta se perder | idempotencia_consistencia (-), entendimento_problema (-) | 2,9 s / US$ 0,0012 |
| coordenador-obras | uma grua só ligada à estrutura; todos os empreiteiros juntos na alvenaria | `duvida`: "Como ela atende a alvenaria e as instalações depois que a estrutura avança?" | logistica_canteiro (-), sequenciamento_caminho_critico (neutro), entendimento_problema (-) | 3,0 s / US$ 0,0014 |
| pm-senior | "lançar tudo de uma vez em todas as cidades", sem localizar a etapa da queda | `duvida`: como saberia qual etapa causa a queda antes de mexer | entendimento_problema (-), estrutura_raciocinio (-), experimentacao_validacao (-) | 3,7 s / US$ 0,0013 |
| arquiteto-comercial | doca de carga ligada à circulação dos clientes | `duvida`: como o caminhão não cruza o fluxo de clientes | setorizacao_fluxos (-), entendimento_problema (-) | 2,6 s / US$ 0,0012 |

Em todos os casos o prompt sem nenhuma edição produziu uma pergunta do domínio certo, sem elogio, citando
elementos reais do grafo, e observações com ids de critério do kit gerado. Os 8 a 9 mil tokens de entrada
por análise são o prompt estático (que carrega o kit); em produção ele é cacheável.

### Avaliação qualitativa

- **coordenador-obras** (o melhor; exemplo em `docs/exemplos/kit-coordenador-obras.json`): ficha
  consistente nas contas que conferi (64 unidades x R$ 7.500 = R$ 480 mil/mês; 8 lajes x 3 dias = 24 dias
  recuperados; R$ 180 mil + R$ 100 mil = R$ 280 mil; alvenaria liberada com 3 lajes acima). Inclui o
  conflito entre diretoria e viabilidade (hora extra de sábado) e as restrições de NR-18. Problema cabe no
  quadro (linha de balanço, layout do canteiro, grua). Níveis discriminam de verdade ("reconhece a
  estrutura como crítica, mas só avança quando provocado" vs "verifica se o caminho crítico muda depois da
  aceleração e aponta o novo gargalo"). Enunciado vago (192 caracteres, sem números). Critérios de área:
  sequenciamento do caminho crítico, logística de canteiro, segurança NR-18.
- **pm-senior**: o funil fecha (400 mil buscas, 50%, 25%, 80% para 64% de respostas, 50% de contratação:
  20 mil para 16 mil pagamentos; 20 mil x R$ 250 x 15% = R$ 750 mil). A causa escondida (novo app mudou as
  notificações) só aparece em discovery: bom teste de investigação. Prioridades concorrentes (parcelamento,
  suspensão de prestadores) forçam trade-off.
- **arquiteto-comercial**: setorização e fluxos de uma cafeteria de franquia com retirada por aplicativo;
  `modoLeitura: misto` é coerente (posição e espaço importam). Critérios de área: setorização/fluxos,
  hierarquia de espaços e conversão, acessibilidade e rotas de saída.
- **backend-pleno**: bom, mas é o único cujos critérios de área nomeiam a tecnologia da vaga
  (`modelagem_dados_postgresql`, `resiliencia_mensageria`); aceitável porque a vaga pede PostgreSQL e
  Kafka, e problema continua de quadro branco (arquitetura de fluxo).

### O que ainda é limite

- Só conferi por amostragem a aritmética das fichas (obras e PM por completo, os outros dois por leitura).
  O validador não checa consistência numérica; quem garante é o prompt e a revisão humana (por isso a
  aprovação existe).
- A fidelidade ao `InterviewPlan` (desafio, pesos, fora de escopo) está coberta por teste de prompt, mas
  não foi executada ao vivo (não havia plano mock).
- O kit gerado leva 70 a 100 s: a rota é síncrona. Se o front chamar de um ambiente com timeout curto,
  convém um modelo de job assíncrono.
- As outras 6 vagas mock só foram geradas no modo `--fake`.
