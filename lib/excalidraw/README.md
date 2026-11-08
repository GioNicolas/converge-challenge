# Conversão do quadro

Crie uma instância por quadro e reutilize-a nas análises. Os mapas de IDs são
históricos: remoções não liberam números, desfazer recupera o ID anterior, e
`idReal` ainda resolve elementos removidos. Uma nova instância reinicia os IDs.

```ts
import { criarConversor, type Instantaneo } from "./conversor";
import { descreverMudancas, houveMudancaRelevante } from "./diff";

const conversor = criarConversor();
let anterior: Instantaneo | null = null;

function analisar(elementos: Parameters<typeof conversor.converter>[0]) {
  const resultado = conversor.converter(elementos);
  const mudancas = descreverMudancas(anterior, resultado.instantaneo);
  const relevante = houveMudancaRelevante(anterior, resultado.instantaneo);
  anterior = resultado.instantaneo;
  return { ...resultado, mudancas, relevante };
}
```

`Instantaneo` também pode ser importado de `instantaneo.ts` ou `diff.ts`. É uma
estrutura somente de dados, serializável, sem coordenadas nem dependência de
React ou do navegador. As funções não alteram a entrada nem resultados anteriores.

Decisões de representação:

- A direção vem das pontas desenhadas: `A → B` (ponta só no fim), `B → A` (ponta só
  no começo: a leitura é invertida), `A ↔ B` (pontas nos dois lados) e `A — B` (nenhuma
  ponta, como numa linha). Os IDs de setas e linhas compartilham o prefixo `s`.
- No diff, mudar a ponta com as mesmas duas pontas ligadas vira
  `~ inverteu a seta: A → B passou a B → A` ou `~ mudou a seta: A → B passou a A ↔ B`.
- O limiar inclusivo das pontas sem binding é 40 px até o retângulo da caixa.
  Empates preservam a ordem do array. Um binding explícito a um elemento
  ignorado produz `?`, sem tentativa de inferir outro destino.
- Caixas aninhadas indicam somente o menor recipiente maior que contém o centro.
  Molduras usam exclusivamente `frameId`; grupos usam seus identificadores
  originais internamente, sem expô-los no texto.
- Textos de container compõem seu nome/rótulo e não recebem IDs próprios.
  Textos órfãos de containers ausentes, apagados ou ignorados são omitidos.
- `freedraw` e imagens aparecem em DESENHOS SEM TEXTO. A proximidade textual
  indica a caixa mais próxima, se existir, e não participa do diff.
- `magicframe` segue a representação de molduras; `iframe` e `embeddable`
  aparecem como componentes de prefixo `v`; `selection` é transitório e omitido.
- Textos são normalizados em uma linha e cortados em 80 caracteres no texto
  final, com `…`. O instantâneo preserva o conteúdo completo normalizado para
  detectar edições além desse corte.
- Movimentos que preservam conexões, contenção e seções não geram diff, mesmo
  mudando a ordem na tela. Alterar relações por movimento é uma mudança semântica.
- A ordem dos membros de uma seção não é mudança. Adições e remoções de
  desenhos/imagens são relevantes; alterações puramente visuais são ignoradas.

Validação:

```sh
npx tsx --test lib/excalidraw/**/*.test.ts
npx tsc --noEmit
npx eslint lib/excalidraw
```
