// Bolha do Nolan: vidro líquido + máquina de estados (ouvindo → pensando → card). JS puro, roda em Shadow DOM.
// Uso: const b = mountBubble(shadowRoot); b.handleEvent({kind:'transcript', chunk}); b.destroy();
import { createMachine, createEventRouter, BASE_STATE } from './core/index.js';
import { LISTENING_CSS } from './states/listening/index.js';
import { AGENTE_CSS } from './states/agente/index.js';
import { makeDraggable } from './drag.js';
import { createBody } from './physics.js';

const CSS = `
:host{all:initial}
.nadia-root{position:fixed;top:40px;left:50%;width:0;height:0;z-index:2147483647;pointer-events:none;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  --dur:.55s;--ease:linear(0, 0.0596, 0.186, 0.3294, 0.4656, 0.584, 0.6819, 0.7601, 0.821, 0.8677, 0.9029, 0.9292, 0.9487, 0.963, 0.9734, 0.9809, 0.9864, 0.9903, 0.9931, 0.9951, 0.9966, 0.9976, 1);
  --spring:linear(0, 0.0942, 0.2739, 0.4553, 0.608, 0.7259, 0.8123, 0.8735, 0.9158, 0.9445, 0.9638, 0.9765, 0.9848, 0.9903, 0.9938, 0.996, 0.9975, 0.9984, 1); /* .44s: mola sem overshoot, resposta .3 s */
  transition:left var(--dur) var(--ease),top var(--dur) var(--ease)}
.nadia-root.still,.nadia-root.dragging{transition:none}
.bubble{position:absolute;left:0;top:0;width:108px;height:40px;transform:translateX(-50%);border-radius:20px;
  border:1px solid rgba(255,255,255,.18);
  box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.22);
  transition:transform .44s var(--spring),box-shadow .2s ease-out,border-color .2s ease-out; /* tamanho e forma: physics.js */
  pointer-events:auto;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
/* o vidro fica num ::before e não na própria bolha: backdrop-filter num ancestral isola o fundo dos filhos, e os botões
   embaixo do card (que saem da bolha) perderiam o blur deles */
.bubble::before{content:"";position:absolute;inset:0;border-radius:inherit;corner-shape:inherit;pointer-events:none;
  background:rgba(26,28,38,.52);backdrop-filter:blur(24px) saturate(1.8);-webkit-backdrop-filter:blur(24px) saturate(1.8);
  transition:background-color .2s ease-out}
.bubble.enter{animation:descend .9s linear backwards} /* entra uma vez só: a classe sai no animationend */
.bubble.pressed{transform:translateX(-50%) scale(.97);transition-duration:.1s,.2s,.2s,.2s;transition-timing-function:ease-out} /* drag.js: só quando a pessoa aperta a bolha, não um botão dentro dela */
.dragging .bubble{cursor:grabbing;animation:none;transform:translateX(-50%) scale(1.04);box-shadow:0 18px 44px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.22)}
.bubble.cards-active{border-color:transparent!important;box-shadow:none!important}
.bubble.cards-active::before{display:none}
/* troca de estado: o conteúdo velho sai num blur rápido e só depois o novo entra, também saindo do blur */
.content{position:absolute;inset:0;overflow:visible;border-radius:inherit;color:#fff;animation:in .32s cubic-bezier(.2,.9,.25,1) .09s backwards}
@keyframes in{from{opacity:0;filter:blur(10px);transform:scale(.94)}}
.content.out{animation:out .11s ease-in both;pointer-events:none}
@keyframes out{to{opacity:0;filter:blur(8px);transform:scale(1.04)}}
.content.out.plain{animation-name:out-plain} /* com cards abertos: filter num ancestral apagaria o vidro deles */
@keyframes out-plain{to{opacity:0}}
/* entra como uma gota: desce da borda da tela, passa do ponto achatando e assenta (como a orbe da Siri saindo da Dynamic Island) */
@keyframes descend{
  0%{transform:translateX(-50%) translateY(-60px) scale(.5,.62);opacity:0;filter:blur(10px);animation-timing-function:cubic-bezier(.4,0,.9,.6)}
  42%{transform:translateX(-50%) translateY(5px) scale(1.12,.86);opacity:1;filter:blur(0);animation-timing-function:cubic-bezier(.2,.6,.35,1)}
  64%{transform:translateX(-50%) translateY(-3px) scale(.95,1.07);animation-timing-function:cubic-bezier(.4,0,.5,1)}
  82%{transform:translateX(-50%) translateY(1px) scale(1.02,.98)}
  100%{transform:translateX(-50%)}}
@keyframes fadein{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.nadia-root{--dur:0s}.bubble.enter{animation:fadein .2s ease-out backwards}.content{animation:fadein .15s ease-out backwards}.content.out{animation:out-plain .1s ease-in both}.bubble.pressed,.dragging .bubble{transform:translateX(-50%)}}
@media (prefers-reduced-transparency:reduce){.bubble::before{background:rgb(26,28,38);backdrop-filter:none;-webkit-backdrop-filter:none}}
@media (prefers-contrast:more){.bubble{border-color:rgba(255,255,255,.7)}.bubble::before{background:rgb(14,15,22)}}
/* embutida: centralizada no contêiner (o host), em vez de fixa no topo da tela */
.nadia-root.embutida{position:absolute;left:50%;top:50%;z-index:auto;transition:margin-top var(--dur) var(--ease)}
${LISTENING_CSS}
${AGENTE_CSS}
`;

/**
 * @param {ShadowRoot} shadowRoot
 * @param {{ embutida?: boolean }} [opcoes] embutida: fica no centro do host (que precisa ter tamanho), sem arrastar.
 */
export function mountBubble(shadowRoot, opcoes = {}) {
  const embutida = !!opcoes.embutida;
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => !!mq?.matches;

  // Sanitiza o host se vier com estilos antigos (ex: transform ou left: 50% de versões anteriores)
  if (shadowRoot?.host instanceof HTMLElement) {
    const h = shadowRoot.host;
    if (h.style.transform || h.style.left === '50%') {
      h.style.transform = 'none';
      h.style.left = '0';
      h.style.top = '0';
      h.style.width = '0';
      h.style.height = '0';
    }
  }

  const style = document.createElement('style');
  style.textContent = CSS;
  const root = document.createElement('div');
  root.className = embutida ? 'nadia-root embutida' : 'nadia-root';
  const bubble = document.createElement('div');
  bubble.className = 'bubble enter';
  bubble.addEventListener('animationend', (e) => { if (e.target === bubble) bubble.classList.remove('enter'); });
  const body = document.createElement('div'); body.style.cssText = 'position:absolute;inset:0';
  bubble.append(body);
  root.append(bubble);
  shadowRoot.append(style, root);
  // Embutida não arrasta: só centraliza na vertical conforme a altura muda.
  const drag = embutida
    ? { size: (w, h) => { root.style.marginTop = `${-h / 2}px`; }, destroy() {} }
    : makeDraggable(root, bubble); // antes da máquina: o primeiro setSize já reposiciona
  const shape = createBody(bubble, { reduced });

  const host = {
    reduced,
    setSize(w, h) {
      drag.size(w, h);
      shape.setSize(w, h);
    },
    deform(sx, sy, ty) { shape.deform(sx, sy, ty); },
    setCardsMode(on) {
      bubble.classList.toggle('cards-active', !!on);
    },
    mountContent() { const d = document.createElement('div'); d.className = 'content'; body.append(d); return d; },
    unmountContent(el) {
      if (reduced()) return el.remove();
      el.classList.add('out'); // o novo só aparece depois (delay do .content): nada de duas animações ao mesmo tempo
      if (bubble.classList.contains('cards-active')) el.classList.add('plain');
      setTimeout(() => el.remove(), 120);
    },
  };

  const machine = createMachine(host);
  const router = createEventRouter(machine);
  let alive = true;

  machine.request(BASE_STATE, {});

  return {
    handleEvent(ev) { if (alive) router.handle(ev); },
    setVolume(level) {
      if (machine.current === 'falando') machine.update({ volume: level });
      else router.handle({ kind: 'volume', level });
    },
    /** Vai direto para um estado (listening, thinking, falando, duvida), sem passar pelo roteador. */
    mostrar(nome, dados = {}) { if (alive) machine.request(nome, dados); },
    get state() { return machine.current; },
    destroy() {
      alive = false;
      shape.destroy(); drag.destroy(); router.destroy(); machine.destroy(); style.remove(); root.remove();
    },
  };
}
