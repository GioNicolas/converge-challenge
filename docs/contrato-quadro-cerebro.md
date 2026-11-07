# Contrato: quadro ↔ cérebro (entrevista no Excalidraw)

> Para o Henrique: é exatamente o que o quadro já manda e espera de cada rota.
> O lado do quadro está pronto e testado contra isto (`lib/sessao/servidor.ts`, com testes).
> Mudou algo aqui? Avise o Giorgio antes, porque o quadro valida as respostas e rejeita formato diferente.

## Como ligar

- Por padrão, o quadro usa **dados de mentira** (`lib/sessao/cliente.ts`).
- Com `NEXT_PUBLIC_USAR_SERVIDOR=1` no `.env.local`, ele chama as rotas reais abaixo. `NEXT_PUBLIC_AVALIACAO_ID` e `NEXT_PUBLIC_CANDIDATO_ID` são opcionais (padrão `"demo"`).
- Página: `/entrevista/system-design`. O console mostra `[análise] pedido` e `[análise] resposta`. Dá para copiar um pedido real dali para testar o `/analisar` isolado.
- **Regras:** as chaves (Anthropic, ElevenLabs) ficam só no servidor. A ficha de requisitos e a rubrica **nunca** vão para o navegador.

## 1. `POST /api/sessoes` (cria a sessão)

Pedido:
```json
{ "avaliacao_id": "demo", "candidato_id": "demo" }
```
Resposta:
```json
{
  "sessao_id": "abc123",
  "area": "system design",
  "problema": { "titulo": "Encurtador de URL", "enunciado": "Projete um serviço como o bit.ly: ..." },
  "tempos": { "REQUISITOS": 300, "ALTO_NIVEL": 600, "APROFUNDAMENTO": 900, "FECHAMENTO": 300 }
}
```
- `area` aparece no cartão de início ("Entrevista de system design"). É multiárea: "marketing", "design de produto"...
- `tempos` em **segundos** por fase. As chaves possíveis são `AGUARDANDO`, `APRESENTACAO`, `REQUISITOS`, `ALTO_NIVEL`, `APROFUNDAMENTO`, `FECHAMENTO` e `ENCERRADA`. Fase sem tempo não acaba sozinha.
- O agente escreve `titulo` e `enunciado` no quadro e lê em voz alta.

## 2. `POST /api/sessoes/:id/analisar` (o coração)

Chamado quando o candidato para de mexer por ~3,5s com mudança relevante, quando ele termina de responder e quando fica ~2 min travado. É uma análise por vez; **se passar de 8s, o quadro descarta** a resposta.

Pedido:
```json
{
  "sessao_id": "abc123",
  "fase": "APROFUNDAMENTO",
  "grafo": "COMPONENTES\n- [r1] Cliente (retângulo)\n- [r2] API (retângulo)\n- [e1] Postgres (elipse)\nCONEXÕES\n- [s1] Cliente → API\n- [s2] API → Postgres (\"lê e grava\")\nANOTAÇÕES SOLTAS\n- [t1] \"gera código aleatório\"\nORDEM NA TELA (esquerda → direita)\n- Cliente, API, Postgres",
  "mudancas": "+ adicionou [e1] Postgres\n+ conectou API → Postgres (\"lê e grava\")",
  "conversa_recente": [
    { "quem": "agente", "texto": "Projete um serviço como o bit.ly..." },
    { "quem": "candidato", "texto": "Qual a escala de leitura?" }
  ],
  "perguntas_feitas": 1,
  "imagem_url": null
}
```

**Formato do `grafo`** (neutro, serve para qualquer área):
- Seções: `COMPONENTES`, `CONEXÕES`, `ANOTAÇÕES SOLTAS`, `SEÇÕES` (molduras e grupos), `DESENHOS SEM TEXTO` e `ORDEM NA TELA`. As vazias não aparecem, exceto as duas primeiras.
- IDs curtos e estáveis: `r` retângulo, `e` elipse, `l` losango, `s` seta/linha, `t` texto, `m` moldura, `f` desenho à mão, `i` imagem. O mesmo elemento mantém o ID a entrevista toda.
- `— dentro de [x]` indica que um elemento está dentro de outro, pela posição.
- `(seta solta)` indica uma ponta que não liga em nada.
- Texto escrito por cima de uma forma já vira o nome dela.
- O que o agente escreveu (enunciado, requisitos, anotações) **nunca** aparece no grafo.
- `imagem_url`: PNG do desenho (quando der tempo de subir), útil quando há `DESENHOS SEM TEXTO`.

Resposta:
```json
{
  "status": "duvida",
  "pergunta": "Com leitura cem vezes maior que escrita, onde fica o gargalo desse desenho?",
  "nota": "Leitura 100x: gargalo?",
  "elementos": ["e1"],
  "degrau": null,
  "observacoes": [
    { "criterio": "escalabilidade", "sinal": "negativo", "espontaneo": false, "evidencia": "banco único sem cache" }
  ]
}
```

| Campo | O que o quadro faz com ele |
|---|---|
| `status` | `ok` (silêncio), `duvida`, `redirecionar` ou `dica`. Na fase `ALTO_NIVEL`, só `redirecionar` vira plin; em `APROFUNDAMENTO`, os três. Fora isso, o quadro ignora. |
| `pergunta` | O que a voz fala e a legenda mostra. Status diferente de `ok` sem `pergunta` vira `ok`. |
| `nota` | O que o cursor escreve à mão no quadro, ao lado do elemento. **Curta: até ~40 caracteres.** Sem `nota`, usa a pergunta cortada. |
| `elementos` | **IDs curtos do `grafo`** (ex.: `"e1"`) que o agente circula. IDs que não existem são ignorados; sem nenhum, a nota vai ao lado do desenho, sem círculo. |
| `degrau` | Degrau da escada de ajuda (1, 2, 3) ou `null`. Só vai para a linha do tempo. |
| `observacoes` | Vão para a linha do tempo (`tipo: "analise"`), para o scorecard. `sinal`: `positivo`, `negativo` ou `neutro`. |

O quadro cuida sozinho de: 60s entre perguntas, máximo de 5, uma dúvida nova substituir a pendente e um `ok` cancelar a pendente. O cérebro **não precisa** controlar isso, mas recebe `perguntas_feitas` para calibrar.

## 3. `POST /api/sessoes/:id/perguntar` (o candidato fala com o agente)

Pedido: `{ "sessao_id": "abc123", "fase": "REQUISITOS", "texto": "Quantos acessos por segundo?" }`

Resposta:
```json
{ "responder": true, "texto": "Uns 4 mil acessos por segundo, com picos de 40 mil.", "requisito": "Leitura: ~4 mil/s (picos de 40 mil)" }
```
- `responder: false` para falas que não pedem resposta ("ok", "hmm", "deixa eu ver").
- `requisito` (ou `null`): o item que o agente **escreve no quadro** abaixo do enunciado, com um check. Só o que foi combinado, nunca a ficha inteira.
- *O quadro ainda não chama esta rota: depende da transcrição da fala do candidato (`/api/stt-token`).*

## 4. `POST /api/falar` (voz do agente)

Pedido: `{ "texto": "..." }`

Resposta:
```json
{
  "audio_base64": "<mp3 em base64>",
  "alinhamento": {
    "characters": ["O", "l", "á"],
    "character_start_times_seconds": [0, 0.08, 0.15],
    "character_end_times_seconds": [0.08, 0.15, 0.3]
  }
}
```
- É o formato do endpoint "with timestamps" da ElevenLabs. O quadro usa o alinhamento para a legenda andar palavra por palavra.
- Se falhar, o quadro usa a voz do navegador e a pergunta continua escrita.

## 5. `POST /api/sessoes/:id/eventos` (linha do tempo)

Pedido: `{ "eventos": [ { "horario": "2026-11-07T15:02:11.120Z", "tipo": "analise", "dados": { } } ] }`. Responder qualquer 2xx.
- `tipo`: `desenho` (grafo + mudanças), `fala`, `analise` (a resposta inteira do `/analisar`), `pergunta`, `resposta` ou `fase`.
- Vem em lotes a cada ~5s e no fim. Se falhar, o quadro reenvia sem perder nem duplicar.

## 6. `POST /api/sessoes/:id/imagens` (prova do desenho)

Multipart: `imagem` (PNG, só o desenho do candidato, fundo branco) e `horario` (ISO). Resposta: `{ "url": "https://..." }`.

## 7. `GET /api/stt-token?sessao_id=abc123`

Resposta: `{ "token": "..." }` (token temporário da ElevenLabs para a transcrição no navegador).

## Ordem sugerida para ligar

1. `/api/sessoes` e `/analisar`: só com isso, o plin real já acontece no quadro.
2. `/eventos`: o histórico para o scorecard.
3. `/falar`: a voz da ElevenLabs, sincronizada com a legenda.
4. `/stt-token` e `/perguntar`: a conversa por voz e os requisitos no quadro.
5. `/imagens`: a prova visual no scorecard.
