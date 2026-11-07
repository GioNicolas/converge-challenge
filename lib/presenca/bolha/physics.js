// Física da bolha: o corpo de vidro muda de tamanho como uma gota d'água, não como uma caixa.
// - largura e altura são molas independentes com overshoot; a altura vem um pouco atrás, então a gota estica e assenta
// - cada mudança de tamanho dá um "chute" em duas oscilações amortecidas: squash & stretch (scale) e quinas
//   assimétricas (border-radius de 8 valores) que voltam ao normal quando a bolha para
// - interrompível: um tamanho novo no meio do caminho parte da posição e da velocidade atuais
// - o rAF só roda enquanto há movimento; com prefers-reduced-motion o tamanho muda direto, sem bounce
const spring = (response, damping) => ({ k: (2 * Math.PI / response) ** 2, c: (4 * Math.PI * damping) / response });
const SIZE_W = spring(0.5, 0.62);
const SIZE_H = spring(0.58, 0.66);
const JELLY = spring(0.36, 0.32); // squash & stretch
const WOBBLE = spring(0.48, 0.28); // quinas
const MAX_JELLY = 0.07;
const STEP = 1 / 240;

const clamp = (v, a) => Math.max(-a, Math.min(a, v));

export function createBody(el, { reduced }) {
  const w = { x: 0, v: 0, to: 0 }, h = { x: 0, v: 0, to: 0 };
  const jelly = { x: 0, v: 0 }, wobble = { x: 0, v: 0 };
  let raf = 0, last = 0, first = true;
  let ext = { sx: 1, sy: 1, ty: 0 };

  const radiusFor = (hh) => Math.min(hh / 2, 44);

  function paint() {
    el.style.width = w.x.toFixed(2) + 'px';
    el.style.height = h.x.toFixed(2) + 'px';
    const r = radiusFor(h.x);
    const q = clamp(wobble.x, 0.35);
    if (Math.abs(q) < 0.002) el.style.borderRadius = r.toFixed(2) + 'px';
    else { // gota: cada quina puxa para um lado, em oposição à vizinha
      const hr = [1 + q, 1 - q, 1 + q * 0.6, 1 - q * 0.6].map((f) => (r * f).toFixed(2) + 'px').join(' ');
      const vr = [1 - q * 0.8, 1 + q, 1 - q, 1 + q * 0.5].map((f) => (r * f).toFixed(2) + 'px').join(' ');
      el.style.borderRadius = `${hr} / ${vr}`;
    }
    // quina levemente contínua nos cards: entre o redondo comum e o squircle (que suavizava demais e encolhia o raio)
    el.style.cornerShape = h.x > 64 ? 'superellipse(1.4)' : '';
    paintScale();
  }

  // squash & stretch da gota multiplicado pela deformação de fora (ripple.js)
  function paintScale() {
    const j = clamp(jelly.x, MAX_JELLY);
    const sx = (1 + j) * ext.sx, sy = (1 - j) * ext.sy;
    if (Math.abs(sx - 1) < 0.0005 && Math.abs(sy - 1) < 0.0005) { el.style.scale = ''; el.style.translate = ''; return; }
    el.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
    // o translateX(-50%) do transform vem antes do scale: sem compensar, a bolha escalaria a partir da borda direita
    el.style.translate = `${((sx - 1) * w.x / 2).toFixed(2)}px ${ext.ty.toFixed(2)}px`;
  }

  const stepSpring = (s, p, to, dt) => { s.v += (-p.k * (s.x - to) - p.c * s.v) * dt; s.x += s.v * dt; };
  const settled = () =>
    Math.abs(w.x - w.to) < 0.25 && Math.abs(w.v) < 2 && Math.abs(h.x - h.to) < 0.25 && Math.abs(h.v) < 2 &&
    Math.abs(jelly.x) < 0.0008 && Math.abs(jelly.v) < 0.01 && Math.abs(wobble.x) < 0.002 && Math.abs(wobble.v) < 0.02;

  function frame(ts) {
    let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    for (; dt > 0; dt -= STEP) {
      const d = Math.min(STEP, dt);
      stepSpring(w, SIZE_W, w.to, d);
      stepSpring(h, SIZE_H, h.to, d);
      stepSpring(jelly, JELLY, 0, d);
      stepSpring(wobble, WOBBLE, 0, d);
    }
    if (settled()) {
      w.x = w.to; h.x = h.to; w.v = h.v = jelly.x = jelly.v = wobble.x = wobble.v = 0;
      paint(); raf = 0; return;
    }
    paint();
    raf = requestAnimationFrame(frame);
  }

  return {
    setSize(nw, nh) {
      if (first || reduced()) { // primeira vez (a entrada tem a própria animação) ou movimento reduzido: direto
        first = false;
        cancelAnimationFrame(raf); raf = 0;
        w.x = w.to = nw; h.x = h.to = nh; w.v = h.v = jelly.x = jelly.v = wobble.x = wobble.v = 0;
        return paint();
      }
      const dw = nw - w.to, dh = nh - h.to;
      w.to = nw; h.to = nh;
      const m = Math.min(1, (Math.abs(dw) + Math.abs(dh)) / 320); // quanto a forma muda = força do chute
      // crescendo, a gota primeiro alarga e achata; encolhendo, afina e estica
      jelly.v += (dw + dh >= 0 ? 1 : -1) * 0.95 * m;
      wobble.v += 3.2 * m;
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    /** Deformação de fora (o ripple do card solo, que é a própria bolha); com o rAF parado, pinta na hora. */
    deform(sx, sy, ty) {
      ext = reduced() ? { sx: 1, sy: 1, ty: 0 } : { sx, sy, ty };
      if (!raf) paintScale();
    },
    destroy() { cancelAnimationFrame(raf); raf = 0; },
  };
}
