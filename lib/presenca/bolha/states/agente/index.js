// Estados do entrevistador: falando e com dúvida (o plin).
import { registerState } from '../../core/registry.js';

const css = `
.fala{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:5px}
.fala i{display:block;width:6px;height:8px;border-radius:3px;background:color-mix(in srgb,var(--agente,#0071e3) 35%,#fff);will-change:height}
.duvida{position:absolute;inset:0;display:flex;align-items:center;gap:10px;padding:0 18px 0 14px;white-space:nowrap;
  font:inherit;font-size:13px;font-weight:500;color:#fff;background:none;border:0;cursor:pointer;pointer-events:auto;text-align:left}
.duvida .ponto{flex:none;position:relative;width:10px;height:10px;border-radius:50%;background:var(--agente,#0071e3)}
.duvida .ponto::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--agente,#0071e3);
  animation:halo 1.6s cubic-bezier(.22,1,.36,1) infinite}
@keyframes halo{from{transform:scale(.6);opacity:.9}to{transform:scale(1.9);opacity:0}}
.bubble:has(.duvida){border-color:color-mix(in srgb,var(--agente,#0071e3) 70%,transparent);
  animation:respira 1.6s ease-in-out infinite}
@keyframes respira{50%{box-shadow:0 10px 30px rgba(0,0,0,.35),0 0 0 6px color-mix(in srgb,var(--agente,#0071e3) 25%,transparent),inset 0 1px 0 rgba(255,255,255,.22)}}
@media (prefers-reduced-motion:reduce){.duvida .ponto::after,.bubble:has(.duvida){animation:none}}
`;
export const AGENTE_CSS = css; // injetado uma vez pelo bubble.js

const el = (tag, cls, parent, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
};

// ---------- Falando (120×40): cinco barras numa onda que anda. Segue o volume da voz quando há;
// sem volume (voz do navegador), a onda se mexe sozinha.
const N = 5;
let raf = 0, barras = [], vol = 0, alvo = 0, ultimoVolume = 0, t0 = 0;
function loop(ts, ctx) {
  const t = (ts - t0) / 1000;
  const semVolume = ts - ultimoVolume > 400;
  if (semVolume) alvo = 0.45 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 1.7);
  vol += (alvo - vol) * 0.25;
  barras.forEach((b, i) => {
    const onda = ctx.reduced ? 0.7 : 0.55 + 0.45 * Math.sin(t * 9 - i * 0.9);
    b.style.height = (8 + vol * onda * 22).toFixed(1) + 'px';
  });
  raf = requestAnimationFrame((x) => loop(x, ctx));
}

registerState('falando', {
  size: [120, 40],
  enter(c, data, ctx) {
    const wrap = el('div', 'fala', c);
    barras = Array.from({ length: N }, () => el('i', '', wrap));
    vol = alvo = 0; t0 = performance.now(); ultimoVolume = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame((x) => loop(x, ctx));
  },
  update(data) {
    if (data.volume != null) { alvo = Math.max(0, Math.min(1, data.volume)); ultimoVolume = performance.now(); }
  },
  exit() { cancelAnimationFrame(raf); barras = []; },
});

// ---------- Com dúvida (o plin): a pílula cresce, mostra o convite e pulsa. O clique chama data.onClick.
registerState('duvida', {
  size: (data) => [Math.max(170, 64 + 7.2 * (data?.texto ?? 'Tenho uma pergunta').length), 40],
  enter(c, data) {
    const b = el('button', 'duvida', c);
    b.type = 'button';
    b.setAttribute('aria-label', data?.texto ?? 'Tenho uma pergunta');
    el('span', 'ponto', b);
    this._texto = el('span', '', b, data?.texto ?? 'Tenho uma pergunta');
    this._onClick = data?.onClick;
    b.onclick = () => this._onClick?.();
  },
  update(data) {
    if (data.onClick) this._onClick = data.onClick;
    if (data.texto && this._texto) this._texto.textContent = data.texto;
  },
  exit() { this._onClick = null; this._texto = null; },
});
