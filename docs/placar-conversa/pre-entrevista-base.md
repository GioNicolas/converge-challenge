# Placar de conversa da pré-entrevista: linha de base

Parte da série da issue #22 (o modelo conduz a conversa na pré-entrevista). Este arquivo guarda como o Totti se
comporta **antes** de qualquer mudança de prompt, trava ou planejador, para a última issue da série comparar.

## Estado: PENDENTE

A linha de base ainda não foi medida. Os casos e a persona foram escritos sem `.env.local`, e os dois comandos
precisam do LLM e do Jev reais (`FEATHERLESS_API_KEY`, `TYPESAFE_API_KEY`; com `--pago`, também
`OPENROUTER_API_KEY`). Sem `--pago` os dois rodam só na Featherless e os tempos não são os de produção: a linha de
base e a medição final precisam ser feitas do mesmo jeito para a comparação valer.

Para medir, na branch `conversa/23-placar-casos` (ou em qualquer commit anterior à issue #24):

```bash
npm run pre:conversa
npm run pre:simular -- distraida
```

e preencher as duas tabelas abaixo com o que sair.

## Casos fixos (`npm run pre:conversa`)

| caso | situação | fala dela | resultado | fala que saiu |
|---|---|---|---|---|
| `repetir-aprofundamento` | último passo: `aprofundar` | "desculpa, pode repetir a pergunta" | pendente | |
| `nao-entendeu` | último passo: `aprofundar` | "como assim, não entendi o que você quer saber" | pendente | |
| `pede-tempo` | último passo: `aprofundar` | "pera, deixa eu abrir a descrição da vaga aqui" | pendente | |
| `checagem-audio` | logo depois da abertura | "tá me ouvindo?" | pendente | |
| `repetir-nivel` | a abertura perguntou o nível | "oi? não ouvi" | pendente | |
| `repetir-oferta-troca` | a abertura ofereceu a troca | "não entendi, quais eram as opções mesmo" | pendente | |
| `repetir-resumo` | último passo: `resumo_final` | "pode repetir o resumo" | pendente | |
| `duvida-fora-da-entrevista` | último passo: `aprofundar` | "antes disso, o candidato vai ver essa conversa" | pendente | |

Resultado é `passou`, `falhou` (com as checagens que falharam) ou `não montado` (a conversa não chegou ao ponto).

## Persona `distraida` (`npm run pre:simular -- distraida`)

| medida | valor |
|---|---|
| fidelidade do plano | pendente |
| checagens de estilo e repetição | pendente |
| tempo por fala do Totti (p50 / p95) | pendente |

## O que a leitura do código prevê

Isto não é medição: é o que o código de hoje faz, pela leitura. Serve para conferir a linha de base quando ela sair.

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
