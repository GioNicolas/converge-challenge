# Teste local: da vaga ao plano de entrevista (`/dev/vaga`)

Ferramenta de desenvolvimento, não faz parte do produto. Fluxo: colar uma vaga, conversar com o
agente para definir o plano, aprovar (gera o kit) e abrir a entrevista.

## Como rodar

```bash
npm run dev          # http://localhost:3000/dev/vaga
```

Variáveis (`.env.local`):

| Variável | Para quê |
| --- | --- |
| `OPENROUTER_API_KEY` | modelo real (conversa e kit) |
| `AGENTE_FAKE=1` | LLM falso determinístico, sem chave e sem custo (só prova o encanamento) |
| `AGENTE_MODELO_PLANEJAMENTO` | modelo da conversa (padrão `anthropic/claude-sonnet-5.5`) |
| `AGENTE_MODELO_FINAL` | modelo do kit (padrão `anthropic/claude-opus-5.5`) |
| `AGENTE_DEV=1` | só se quiser as rotas `/api/dev/*` em build de produção (por padrão dão 404) |

O banner no topo da página (`GET /api/dev/estado`) mostra se está em modo fake, se há chave e os modelos.

## O que cada botão faz

- **Gerar vaga de exemplo**: preenche o texto com uma das 10 vagas mock (título, senioridade, descrição, responsabilidades, requisitos, diferenciais e stack); cada clique avança para a próxima.
- **Começar conversa** (`POST /api/dev/plano`): o agente lê o texto, estrutura a vaga e faz no máximo 2 a 3 perguntas, ou já propõe o plano. Uma chamada ao modelo por turno.
- **Enviar**: responde ou pede mudanças; o agente devolve o plano completo revisado. O plano aparece ao lado (etapas, pontos de foco com pesos, fora de escopo, resumo).
- **Aprovar plano e gerar entrevista** (`POST /api/dev/plano/aprovar`): pede confirmação, chama `gerarKit` com o modelo final, guarda a avaliação já aprovada e mostra `avaliacao_id` e o link `/dev/entrevista-texto?avaliacao=<id>` (página de outra pessoa do time).

## Custo e tempo esperados

| Passo | Modelo | Tempo | Custo |
| --- | --- | --- | --- |
| Cada turno da conversa | Sonnet (sem raciocínio, até 2500 tokens) | alguns segundos (timeout 40 s) | centavos de dólar, estimativa |
| Aprovar (gerar kit) | Opus com raciocínio | ~70 a 100 s | ~US$ 0,11 a 0,16 |

Em `AGENTE_FAKE=1` tudo é instantâneo e gratuito.

## Verificado e NÃO verificado

- Verificado: testes automatizados com LLM falso (conversa, revisão, retry, falha amigável, injeção, rotas, 404 em produção, avaliação aprovada + criação de sessão) e o fluxo com `AGENTE_FAKE=1`.
- **NÃO verificado: o caminho com modelo real.** Nenhuma chamada ao OpenRouter foi feita na construção desta ferramenta (decisão do usuário). Latência, custo e qualidade das perguntas e do plano do Sonnet, e o kit do Opus, precisam ser conferidos por quem rodar. Se o id de modelo não existir na OpenRouter, ajuste as variáveis acima.
- A página não foi aberta em navegador real pelo agente que a escreveu.

## Limites conhecidos

- Só quadro branco (`whiteboard`): planos com `code_editor` são rejeitados e o agente propõe equivalente desenhável.
- Estado em memória: reiniciar o servidor perde as avaliações geradas; o histórico da conversa vive na página (recarregar zera).
- Limites: texto da vaga até 20 mil caracteres, 40 turnos, 3 aprovações por minuto por IP.
- Sem autenticação nas rotas `/api/dev/*`: por isso só existem fora de produção (ou com `AGENTE_DEV=1`).
- O texto colado é tratado como dado (delimitado e com aviso no prompt), mas isso reduz, não elimina, o risco de prompt injection.
