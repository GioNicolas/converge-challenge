// Três bolinhas brancas orbitando: o "pesquisando" do Nolan. Usado pelo estado `thinking` e pela orbe que aparece
// ao lado de um card aberto quando outra pesquisa começa. Precisa do CSS `.orbit` (states/listening/index.js).
// morph: começa nas três barras do "ouvindo" e vira as bolinhas (a passagem ouvindo → pensando).
const ease = (x) => 1 - Math.pow(1 - x, 3);

export function mountOrbit(parent, { reduced = false, morph = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'orbit';
  const dots = [0, 1, 2].map(() => wrap.appendChild(document.createElement('i')));
  parent.appendChild(wrap);
  let vol = 0, target = 0, raf = 0;
  const t0 = performance.now();
  const frame = (ts) => {
    const t = (ts - t0) / 1000;
    vol += (target - vol) * 0.3;
    target *= 0.9;
    const m = reduced || !morph ? 1 : ease(Math.min(1, t / 0.45)); // 0: três barras em pé -> 1: três bolas
    const spin = reduced ? 0 : t * 4.2 * (morph ? Math.min(1, t / 0.45) : 1);
    const R = 9 + vol * 4; // a voz abre a órbita
    dots.forEach((b, i) => {
      const a = spin + (i * 2 * Math.PI) / 3 - Math.PI / 2;
      const x = (1 - m) * (i - 1) * 14 + m * R * Math.cos(a);
      const y = m * R * Math.sin(a);
      const w = 7 + 2 * m, h = (10 + 22 * vol * (i === 1 ? 1 : 0.8)) * (1 - m) + 9 * m;
      b.style.width = w.toFixed(1) + 'px'; b.style.height = h.toFixed(1) + 'px';
      b.style.transform = `translate(${(x - w / 2).toFixed(2)}px,${(y - h / 2).toFixed(2)}px)`;
    });
    if (!reduced) raf = requestAnimationFrame(frame);
  };
  frame(t0);
  return {
    setVolume(v) { target = Math.max(0, Math.min(1, v)); },
    destroy() { cancelAnimationFrame(raf); wrap.remove(); },
  };
}
