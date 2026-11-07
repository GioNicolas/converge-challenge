// Arrastar a bolha: a pessoa pega e solta onde quiser (para não tapar um rosto ou um botão do Meet).
// A posição fica salva entre reuniões, em fração da tela, e a bolha nunca sai da tela,
// nem quando a janela muda de tamanho nem quando ela cresce para virar card. Duplo clique volta ao topo.
const KEY = 'nadia:bubble-pos';
const DEFAULT_TOP = 40;
const MARGIN = 12;
const BELOW = 72; // espaço para a pílula que os cards põem embaixo da bolha
const SLOP = 4; // px; abaixo disso é clique, não arraste
const INTERACTIVE = 'button,a,input,textarea,select,[data-nadia-interactive]';

const valid = (v) => v && [v.fx, v.fy].every((n) => Number.isFinite(n) && n >= 0 && n <= 1);

// Posição salva no localStorage do navegador.
const store = {
  async get() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  },
  set(v) {
    try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {}
  },
};

/** root = elemento position:fixed cujo left/top é o centro-x/topo da bolha. */
export function makeDraggable(root, bubble) {
  let saved = null; // { fx, fy } ou null = padrão (topo, centro)
  let w = 108, h = 40; // tamanho alvo da bolha (o que o setSize pediu)
  let cx = 0, top = 0;
  let drag = null; // { id, x0, y0, cx0, top0, moved, lastX, lastY }
  let alive = true;

  // Probe fixo para medir a origem real e escala do containing block.
  // Se algum ancestral tiver transform, filter, contain ou scale, o fixed vira relativo a ele.
  const parent = root.parentNode ?? root;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:100px;height:100px;visibility:hidden;pointer-events:none;contain:none;';
  parent.appendChild(probe);

  function getMetrics() {
    const r = probe.getBoundingClientRect();
    return {
      ox: r.left,
      oy: r.top,
      sx: (r.width / 100) || 1,
      sy: (r.height / 100) || 1,
    };
  }

  function clamp(x, y) {
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    const { sx, sy } = getMetrics();
    const rw = w * sx, rh = h * sy;
    const minX = rw / 2 + MARGIN, maxX = vw - rw / 2 - MARGIN;
    const nx = maxX < minX ? vw / 2 : Math.min(maxX, Math.max(minX, x));
    const ny = Math.max(MARGIN, Math.min(vh - rh - BELOW, y)); // perto do pé da tela, o card cresce para cima
    return [nx, ny];
  }

  // a posição salva é a intenção da pessoa; a mostrada é ela ajustada ao tamanho atual
  function place() {
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    const want = saved ? [saved.fx * vw, saved.fy * vh] : [vw / 2, DEFAULT_TOP];
    [cx, top] = clamp(...want);
    const { ox, oy, sx, sy } = getMetrics();
    root.style.left = ((cx - ox) / sx) + 'px';
    root.style.top = ((top - oy) / sy) + 'px';
  }

  function jump() { // sem animação (carregar, redimensionar a janela)
    root.classList.add('still');
    if (drag) {
      const b = bubble.getBoundingClientRect();
      drag.cx0 = b.width ? b.x + b.width / 2 : cx;
      drag.top0 = b.height ? b.y : top;
      drag.x0 = drag.lastX ?? drag.x0;
      drag.y0 = drag.lastY ?? drag.y0;
    }
    place();
    void root.offsetWidth;
    root.classList.remove('still');
  }

  const fromInteractive = (e) => {
    for (const n of e.composedPath()) {
      if (n === bubble) return false;
      if (n.matches?.(INTERACTIVE)) return true;
    }
    return false;
  };

  const onBlur = (e) => {
    if (e.target === window) onUp(e);
  };

  function cleanupListeners() {
    removeEventListener('pointermove', onMove, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('pointercancel', onUp, true);
    removeEventListener('blur', onBlur);
    bubble.removeEventListener('lostpointercapture', onUp);
  }

  function onDown(e) {
    if (e.button !== 0 || drag || fromInteractive(e)) return;
    try { bubble.setPointerCapture(e.pointerId); } catch {}
    bubble.classList.add('pressed');
    const b = bubble.getBoundingClientRect();
    const visualCx = b.width ? b.x + b.width / 2 : cx;
    const visualTop = b.height ? b.y : top;
    drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      cx0: visualCx,
      top0: visualTop,
      moved: false,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onUp, true);
    addEventListener('blur', onBlur);
    bubble.addEventListener('lostpointercapture', onUp);
  }

  function onMove(e) {
    if (!drag || (e.pointerId != null && e.pointerId !== drag.id)) return;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < SLOP) return;
      drag.moved = true;
      root.classList.add('dragging');
    }
    const [x, y] = clamp(drag.cx0 + dx, drag.top0 + dy);
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    saved = { fx: Math.max(0, Math.min(1, x / vw)), fy: Math.max(0, Math.min(1, y / vh)) };
    place();
  }

  function onUp(e) {
    if (!drag || (e.pointerId != null && e.pointerId !== drag.id)) return;
    const { moved, id } = drag;
    drag = null;
    cleanupListeners();
    bubble.classList.remove('pressed');
    try { bubble.releasePointerCapture(id); } catch {}
    if (!moved) return;
    root.classList.remove('dragging');
    store.set(saved);
    // o clique que vem logo depois do arraste não é clique
    const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', eat, true), 0);
  }

  function onDbl(e) {
    if (fromInteractive(e)) return;
    saved = null;
    store.set(null);
    place();
  }

  bubble.addEventListener('pointerdown', onDown);
  bubble.addEventListener('dblclick', onDbl);
  addEventListener('resize', jump);
  jump();
  store.get().then((v) => { if (alive && !drag && valid(v)) { saved = v; jump(); } });

  return {
    /** A bolha vai mudar de tamanho: reposiciona junto, com a mesma animação. */
    size(nw, nh) { w = nw; h = nh; place(); },
    destroy() {
      alive = false;
      cleanupListeners();
      if (drag) {
        try { bubble.releasePointerCapture(drag.id); } catch {}
        root.classList.remove('dragging');
        drag = null;
      }
      bubble.classList.remove('pressed');
      probe.remove();
      bubble.removeEventListener('pointerdown', onDown);
      bubble.removeEventListener('dblclick', onDbl);
      removeEventListener('resize', jump);
    },
  };
}
