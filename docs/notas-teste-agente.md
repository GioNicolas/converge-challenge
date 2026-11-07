# Notas do teste do agente (entrevista por texto)

Lista corrida do que apareceu nos testes manuais. Marque como feito quando resolver.

## Abertas

- [x] **O agente não se apresenta no começo.** Na Apresentação ele só fala o título e o enunciado ("Encurtador de URL. Projete um serviço...") e já entra no caso. Deveria se apresentar antes (quem é, como vai conduzir) e só então passar o problema.
  - Onde olhar: `lib/sessao/useEntrevista.ts`, efeito da fase `APRESENTACAO` (hoje fala `${titulo}. ${enunciado}`). A persona vem do kit (`kit.persona`, em `lib/agente/kits`).
- [x] **O agente não se despede no final.** Ao encerrar (`ENCERRADA`) não há fala de despedida; só aparece o texto fixo "O relatório está sendo gerado" (`components/SalaEntrevista.tsx`, perto da linha 309).
  - Onde olhar: transição para `ENCERRADA` em `lib/sessao/estados.ts` e o efeito correspondente em `useEntrevista.ts`.

- [~] **`redirecionar` usado como cutucada sem motivo.** Em Alto nível, com o candidato só com cliente → API → banco (sem entrar em detalhe), o modelo devolveu `redirecionar`: "Vamos manter no alto nível por enquanto, voltamos aos detalhes depois...". A regra do prompt é só para detalhe cedo demais ou fase que precisa avançar por tempo.
  - Onde olhar: `TABELA_ACOES` em `lib/agente/prompts/avaliador.ts`.
- [~] **Pergunta da análise longa e dupla.** Três frases e duas perguntas ("Quer seguir por aí ou quer colocar algo no quadro primeiro?"); o prompt pede no máximo duas frases curtas e uma pergunta. O corte em 2 frases (`limitarFrases`) só existe no `/perguntar`; a análise depende só do prompt.
- [~] **Citou fala que talvez o candidato não tenha dito** ("Você comentou que queria pensar sobre o tempo de guarda"). Conferir com o que foi digitado; se não foi dito, é interpretação inventada.
- [~] **`elementos` sem relação com a nota.** `['r3', 's2']` circulados com a nota "Tempo de guarda: 5 anos".

## Feitas (aguardando teste com o modelo real)

Os itens marcados `[~]` acima foram atacados no prompt (princípios 11 a 13, regras de saída de `pergunta`, `elementos` e `nota`, tabela de ações) e a análise passou a receber `parado_ha_s` e `requisitos`. Falta confirmar com o modelo real.

- Em Alto nível o agente pode quebrar o silêncio (`duvida`, `redirecionar` e `dica` liberados). Silêncio total de **8 s** (sem desenhar nem falar) dispara uma análise; se o silêncio continua, repete a cada 30 s. Valor provisório: `SILENCIO_MS` em `lib/sessao/useEntrevista.ts` e `LIMITE_SILENCIO_S` em `lib/agente/sessao/politica.ts`.

- Apresentação e despedida: o modelo escreve as duas ao criar a sessão (`lib/agente/abertura.ts`, prompt em `lib/agente/prompts/abertura.ts`). O quadro fala a apresentação antes do enunciado e a despedida ao encerrar. Falta ouvir/ver com o modelo real.

- Silêncio inicial: em REQUISITOS, 15 s sem falar, sem escrever e sem desenhar fazem a análise rodar e o modelo pode convidar o candidato a contar como pensa abordar o problema (`duvida`, texto do modelo, fora da cota de 5). Constantes: `SILENCIO_INICIAL_MS` (quadro) e `LIMITE_SILENCIO_INICIAL_S` (servidor). Falta ver com o modelo real.

## Histórico

(nada ainda)
