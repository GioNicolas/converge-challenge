# Bolha do Nolan (extension/bubble)

JS/ESM puro, sem build, dentro de um Shadow DOM. `bubble.js` exporta `mountBubble(shadowRoot)` e devolve `{ handleEvent(ev), setVolume(0..1), state, destroy() }`. Teste local: `cd extension && python3 -m http.server 8765` e abra `http://localhost:8765/bubble/dev.html`.

## Os três estados

| Estado | O que a pessoa vê | Entra quando | Sai quando |
|---|---|---|---|
| `listening` (ouvindo) | 3 barras verticais que vibram com a voz | início, `reset`, fim da reunião, último card some sem pesquisa rodando | uma pesquisa começa |
| `thinking` (pesquisando) | as barras viram 3 bolinhas orbitando | `focus` com `status: 'loading'` sem card aberto, ou último card some com pesquisa rodando | a busca planejada ou o resultado chegam: sempre vai para `brought` |
| `brought` (card) | card em skeleton com a busca planejada de título ("Pesquisando · plano mais caro Netflix Brasil preço 2026"), depois o resultado no mesmo card; com outra pesquisa ainda sem plano, a orbe aparece ao lado | `focus` `loading` com `query`, `ready`/`error`, `ui` recall | cada card pronto some sozinho (20 s; erro 6 s; rolar o card reinicia; skeleton não some) e o estado sai com o último |

Regras:
- `thinking` só aparece com uma pesquisa de verdade em andamento, e **sempre** termina em um card. Ele nunca volta para `listening` sem resultado: se o servidor não responder em 45 s, a pesquisa vira um card de erro.
- O título do skeleton é a busca que o planejador (OpenAI) mandou para o buscador, nunca a fala crua. Sem plano (sem `OPENAI_API_KEY` ou estourou o prazo), fica o `thinking` até o resultado. O conteúdo parcial da pesquisa nunca aparece: só o skeleton e depois o resultado.
- `thinking` fica pelo menos 700 ms na tela, para uma resposta instantânea não virar um piscar.
- Até 2 cards lado a lado; o terceiro tira o mais antigo.
- Ouvir uma frase ou o julgador decidir não agir não muda a bolha.

## Movimento

- **Um corpo só.** Pílula, orbe e card são o mesmo vidro mudando de forma. Com um card, o card é a própria bolha; com dois, cada card ganha o seu vidro (`cards-active`).
- **Física de gota (`physics.js`).** Largura e altura são molas com overshoot (a altura vem um pouco atrás, então a gota estica e assenta). Cada mudança de tamanho chuta duas oscilações amortecidas: squash & stretch (`scale`) e quinas assimétricas (`border-radius` de 8 valores). Interrompível: um tamanho novo parte da posição e velocidade atuais. O rAF só roda enquanto há movimento.
- **Troca de conteúdo.** O conteúdo velho sai num blur rápido (110 ms) e só depois o novo entra saindo do blur. Com dois cards abertos a saída é só fade (filter num ancestral apagaria o vidro deles).
- **Chegada do card.** A única cor do Nolan: uma nuvem de luz fria (tons de azul e cinza-azulado) que pulsa e desce por trás do conteúdo, e cada pedaço aparece (fade + blur → nítido) quando a luz passa pela altura dele. Os pedaços são artificiais (manchete em grupos de 3 palavras, cada tópico, gráfico, imagens, cada fonte): o card já chegou inteiro, só a revelação é em partes. Gráfico e barras começam a desenhar quando a luz chega neles.
- **Ripple (`ripple.js`).** Quando uma pesquisa começa (card em skeleton, ou orbe nova ao lado de cards abertos) e quando fica pronta (junto com a aura), uma onda desce a 500 px/s pelo card e depois pelos botões. Cada linha do conteúdo cede alguns px para baixo quando a frente da onda passa por ela, uma depois da outra, e uma crista de luz desce junto pelo vidro e acende a borda; o vidro do card só cede de leve, e os botões achatam (squash & stretch com a origem na frente da onda). Uma mola por elemento (amortecimento .8; resposta .3 s nas linhas e nos botões, .4 s no card) devolve o formato. Com um card só, quem deforma é o vidro da bolha (`ctx.deform` → `physics.js`).
- **Botões.** Apertar responde na hora (100 ms, ease-out); hover e soltar seguem uma mola criticamente amortecida (resposta .3 s, sem overshoot).
- **Entrada.** A bolha desce como uma gota: passa do ponto achatando e assenta.
- **`prefers-reduced-motion`.** Tamanho muda direto, sem bounce nem deformação; trocas viram fades curtos.

## Eventos (`core/events.js`)

| Evento | Efeito |
|---|---|
| `focus` `loading` | começa uma pesquisa: `thinking` (ou orbe ao lado do card aberto) |
| `focus` `loading` com `query` | o planejador decidiu a busca: a orbe vira o card em skeleton |
| `focus` `ready` / `error` | card do resultado / card "Não consegui terminar essa pesquisa" |
| `ui` recall | traz de novo um card já mostrado |
| `state` | replay ao conectar (resolve pesquisas que terminaram enquanto estava desconectado) |
| `reset` / `ended` | limpa tudo e volta a `listening` |
| locais: `{kind:'volume',level}`, `{kind:'audio-status',status}` | volume das barras/órbita; aviso de microfone no `listening` |

`transcript`, `decision`, `action`, `summary`, `speak` não mudam a bolha.

## API dos estados

```js
import { registerState } from './core/index.js';

registerState('brought', {
  size: [w, h] | (data) => [w, h], // px; sem isso a bolha mede o conteúdo (scrollWidth/Height)
  autoExit: 0,        // ms até sair sozinho; data.autoExit sobrescreve
  enter(container, data, ctx) {},  // monte o DOM dentro de `container`
  update(data, ctx) {},            // opcional: mesmo estado pedido de novo
  exit(ctx) {},                    // limpe timers/rAF/listeners
});
```

`ctx`: `reduced` (prefers-reduced-motion), `resize(w, h)`, `setCardsMode(on)`, `end(name)`, `stats`. A máquina (`core/machine.js`) não tem fila nem prioridade: pedir um estado troca na hora (ou só atualiza, se for o atual), e quando um estado termina o roteador diz qual vem depois (`machine.next`).

O card (`brought`) se registra em `states/content/index.js`, carregado por `import()` relativo a `bubble.js`; no content script a extensão precisa expor `bubble/**` em `web_accessible_resources`. A órbita das bolinhas é `orbit.js`, usada pelo `thinking` e pela orbe ao lado do card.

## Arrastar (`drag.js`)

A pessoa pega a bolha e solta onde quiser; abaixo de 4 px é clique (botões dos cards continuam funcionando, e arrastar a partir de um botão não move a bolha). A posição fica em `chrome.storage.local` (`nadia:bubble-pos`, em fração da tela; no `dev.html`, `localStorage`). A bolha é mantida dentro da tela ao redimensionar a janela e ao crescer para card (perto do pé da tela, o card cresce para cima). Duplo clique volta ao topo, no centro.
