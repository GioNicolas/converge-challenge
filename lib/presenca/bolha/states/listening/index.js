import { registerState } from '../../core/registry.js';
import { AGENT_NAME } from '../../config.js';
import { mountOrbit } from '../../orbit.js';

const css = `
.tbars{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:7px}
.tbars i{display:block;width:7px;height:10px;border-radius:4px;background:rgba(255,255,255,.94);will-change:height}
.orbit{position:absolute;inset:0}
.orbit i{position:absolute;left:50%;top:50%;display:block;border-radius:5px;background:rgba(255,255,255,.95);will-change:transform,width,height}
.notice{position:absolute;inset:0;display:flex;align-items:center;gap:10px;padding:0 18px 0 12px;white-space:nowrap;
  font:inherit;font-size:13px;font-weight:500;color:rgba(255,255,255,.88);background:none;border:0;text-align:left}
.notice.err{color:#ffd0cc}
button.notice{cursor:pointer;pointer-events:auto}
button.notice:hover{color:#fff;text-decoration:underline}
.pulse{flex:none;width:8px;height:8px;border-radius:50%;background:#ffcf6b;box-shadow:0 0 8px rgba(255,207,107,.8);animation:np 1.6s ease-in-out infinite}
.pulse.err{background:#ff8a80;box-shadow:0 0 8px rgba(255,138,128,.8);animation:none}
@keyframes np{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.pulse{animation:none}}
`;
export const LISTENING_CSS = css; // injetado uma vez pelo bubble.js

const el = (tag, cls, parent, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
};

// ---------- 1 · Ouvindo (108×40): três pílulas verticais que vibram com a voz de quem fala, segue setVolume(0..1)
// Em silêncio ficam paradas e baixinhas; o "pensando" parte delas e vira três bolinhas (orbit.js).
const BAR_W = [0.8, 1, 0.8];
let raf = 0, lbars = [], vol = 0, target = 0, t0 = 0;
function loop(ts, ctx) {
  const t = (ts - t0) / 1000;
  vol += (target - vol) * 0.3;
  target *= 0.9; // decai sozinho quando o volume para de chegar (silêncio)
  lbars.forEach((b, i) => {
    const jitter = ctx.reduced ? 0.7 : 0.62 + 0.38 * Math.sin(t * 15 + i * 2.1); // a vibração
    b.style.height = (8 + vol * jitter * 24 * BAR_W[i]).toFixed(1) + 'px';
  });
  raf = requestAnimationFrame((x) => loop(x, ctx));
}
function setVolume(v) { target = Math.max(0, Math.min(1, v)); }
// API pública do estado (também acessível por ctx via update({volume}))
export { setVolume };

// Aviso de áudio (status vindo do background): só aparece quando NÃO está 'listening' nem 'off'.
const NOTICE = {
  'needs-gesture': { text: `Clique no ícone do ${AGENT_NAME} e ligue para eu ouvir`, size: [400, 44] },
  'mic-denied': { text: 'Libere o microfone', size: [200, 44], click: true },
  error: { text: 'Não consegui ouvir', size: [190, 44], err: true },
};
let stage = null, lastStatus = null;
function applyStatus(status, ctx) {
  lastStatus = status;
  if (!stage) return;
  const n = NOTICE[status];
  stage.wave.style.display = n ? 'none' : '';
  stage.note.textContent = '';
  stage.note.style.display = n ? '' : 'none';
  if (n) {
    const box = el(n.click ? 'button' : 'div', 'notice' + (n.err ? ' err' : ''), stage.note);
    if (n.click) {
      box.type = 'button';
      box.onclick = () => ctx.onPermissaoMicrofone?.();
    }
    el('i', 'pulse' + (n.err || n.click ? ' err' : ''), box);
    el('span', '', box, n.text);
    ctx.resize(...n.size);
  } else ctx.resize(108, 40);
}

registerState('listening', {
  size: () => NOTICE[lastStatus]?.size ?? [108, 40],
  enter(c, data, ctx) {
    const wrap = el('div', 'tbars', c);
    lbars = BAR_W.map(() => el('i', '', wrap));
    const note = el('div', '', c); note.style.cssText = 'position:absolute;inset:0;display:none';
    stage = { wave: wrap, note };
    vol = target = 0; t0 = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame((x) => loop(x, ctx));
    if (data?.volume != null) setVolume(data.volume);
    applyStatus(ctx.stats.audio, ctx);
  },
  update(data, ctx) {
    if (data.audioStatus !== undefined && data.audioStatus !== lastStatus) { applyStatus(data.audioStatus, ctx); }
    if (data.volume != null) setVolume(data.volume);
    if (data.pulse) setVolume(Math.max(target, 0.55)); // fala em andamento sem volume real
  },
  exit() { cancelAnimationFrame(raf); lbars = []; stage = null; },
});

// ---------- 2 · Pensando (44×44): as três barras viram três bolinhas que orbitam. Só aparece com uma pesquisa em
// andamento e só sai com o resultado dela (o roteador cuida disso). Não mostra a transcrição nem o conteúdo parcial.
registerState('thinking', {
  size: [44, 44],
  enter(c, data, ctx) { this._orbit = mountOrbit(c, { reduced: ctx.reduced, morph: true }); },
  update(data) { if (data.volume != null) this._orbit?.setVolume(data.volume); },
  exit() { this._orbit?.destroy(); this._orbit = null; },
});
