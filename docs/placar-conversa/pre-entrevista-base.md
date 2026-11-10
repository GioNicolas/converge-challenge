# Placar de conversa da pré-entrevista: linha de base

Parte da série da issue #22 (o modelo conduz a conversa na pré-entrevista). Este arquivo guarda como o Totti se
comporta **antes** de qualquer mudança de prompt, trava ou planejador, para a última issue da série comparar.

## Estado: medida em 2026-11-10, só na Featherless

Medida na branch `conversa/23-placar-casos` (commit `85bf936`), com o LLM e o Jev reais e **sem `--pago`**: a
OpenRouter ficou desligada, de propósito, para não gastar crédito. Duas consequências:

- **os tempos não são os de produção.** Em produção a fala do Totti vai à Featherless com 6 s de limite e cai na
  OpenRouter se passar disso; aqui não há para onde cair, e a fala que passa de 6 s vira erro;
- **o simulador quase não conversa.** Depois de um timeout, a Featherless fica 2 min fora (`DESCANSO_MS` em
  `lib/pre-entrevista/llm.ts`), e as falas seguintes também falham. A maioria das personas parou depois de 0 a 3 falas
  do Totti, e o placar de fidelidade mede quase só a configuração padrão. Por isso o número do simulador não entra
  na comparação.

A recrutadora simulada, que só existia na OpenRouter, roda sem `--pago` na Featherless (o mesmo Llama 3.3 70B, cópia
da unsloth, com a Gemma 31B de reserva). A mudança foi aplicada só para medir; ela entra no código pela #28.

```bash
npm run pre:conversa
npm run pre:simular -- distraida
```

## Casos fixos (`npm run pre:conversa`)

**1 de 8 passou, 6 falharam, 1 com erro.** Espera pela fala testada: p50 2518 ms, p95 4586 ms (7 falas, sem `--pago`).

| caso | fala dela | resultado | espera (ms) | o que o Totti fez |
|---|---|---|---|---|
| `repetir-aprofundamento` | "desculpa, pode repetir a pergunta" | falhou | 4586 | repetiu a pergunta, mas o plano andou para `perguntar_contexto` e contou `contexto` |
| `nao-entendeu` | "como assim, não entendi o que você quer saber" | passou | 2442 | `responder_duvida` explicou a pergunta e retomou o aprofundamento |
| `pede-tempo` | "pera, deixa eu abrir a descrição da vaga aqui" | falhou | 2373 | "fique à vontade" e, na mesma fala, a pergunta de contexto: cobrou e avançou |
| `checagem-audio` | "tá me ouvindo?" | falhou | 3000 | respondeu e devolveu a pergunta, mas contou `confirmou_inicio` de novo (1 → 2) |
| `repetir-nivel` | "oi? não ouvi" | falhou | 2074 | repetiu, mas gastou uma das duas tentativas da pergunta de nível (0 → 1) |
| `repetir-oferta-troca` | "não entendi, quais eram as opções mesmo" | falhou | 2518 | não disse os três caminhos de novo, e o modo mudou |
| `repetir-resumo` | "pode repetir o resumo" | falhou | 4365 | caiu no resumo de revisão: contou outro resumo (1 → 2) e deixou a duração de fora |
| `duvida-fora-da-entrevista` | "antes disso, o candidato vai ver essa conversa" | erro | | a Featherless passou de 6 s; numa segunda rodada, "vou considerar que o candidato terá acesso" e passou para a pergunta de contexto (falhou) |

A leitura do código previa quase tudo isso (seção abaixo). O único caso que passou, `nao-entendeu`, passou porque
o Jev marcou `fez_pergunta` e o planejador escolheu `responder_duvida`.

## Persona `distraida` (`npm run pre:simular -- distraida`)

| medida | valor |
|---|---|
| fidelidade do plano | 7/8 (falha: o eliminatório "rede" não aparece nas notas) |
| checagens de estilo e repetição | nada a apontar |
| tempo por fala do Totti (p50 / p95) | sem medida: a conversa parou com erro antes da primeira fala do Totti |
| espera por fala, cobertura + Totti (p50 / p95) | sem medida, pelo mesmo motivo |

Como a conversa não aconteceu, o 7/8 é o placar da configuração padrão, não da conversa com a persona.

## O que a leitura do código prevê

Isto não é medição: é o que o código de hoje faz, pela leitura. A linha de base acima confirma estes pontos.

- **Repetir no aprofundamento e "não entendi"**: o prompt proíbe repetir pergunta, e `aprofundarPasso` só escolhe área
  com zero perguntas. O passo seguinte deve ser outra área, a pergunta de contexto ou o resumo, e a contagem anda.
- **Pede um tempo e checagem de áudio**: a fala é lida como resposta e o planejador avança. Nos passos
  `confirmar_inicio` e `responder_duvida`, uma fala sem "?" ganha uma pergunta no fim.
- **Repetir no nível**: `perguntar_nivel` é escolhido de novo e gasta uma das duas tentativas.
- **Repetir na oferta de troca**: se o Jev não marcar `fez_pergunta`, `decidirTradeoff` devolve "próxima etapa" e a
  decisão é registrada.
- **Repetir o resumo**: sem aprovação nem pedido de mudança, cai no resumo de revisão ("Ela pediu uma mudança depois
  do resumo") e conta mais um resumo.
- **Dúvida fora da entrevista**: `fez_pergunta` não cobre pergunta que não é sobre a entrevista; a fala é lida como
  resposta.
