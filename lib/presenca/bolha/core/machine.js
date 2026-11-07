import { getState } from './registry.js';

export const BASE_STATE = 'listening';

// Máquina de estados da bolha. Sem fila nem prioridade: quem decide qual estado vem depois é o roteador
// (core/events.js). Pedir o estado atual de novo só atualiza; terminar um estado vai para `next()` ou para o base.
// host = { setSize(w,h), setCardsMode(on), deform?(sx,sy,ty), mountContent() -> HTMLElement, unmountContent(el), reduced }
export function createMachine(host) {
  let cur = null; // { name, def, el, data, timer }
  let destroyed = false;
  let next = () => null; // o roteador troca: () => [nome, dados] | null
  const stats = {};
  const ctx = {
    get reduced() { return host.reduced(); },
    resize: (w, h) => host.setSize(w, h),
    setCardsMode: (on) => host.setCardsMode?.(on),
    deform: (sx, sy, ty) => host.deform?.(sx, sy, ty), // deforma o vidro da bolha (ripple.js)
    end: (name) => { if (cur && (!name || cur.name === name)) finish(); },
    get stats() { return stats; },
  };

  function sizeOf(def, data, el) {
    const s = typeof def.size === 'function' ? def.size(data) : def.size;
    if (s) return s;
    return [Math.ceil(el.scrollWidth), Math.ceil(el.scrollHeight)]; // mede o conteúdo
  }

  function leave() {
    if (!cur) return;
    clearTimeout(cur.timer);
    try { cur.def.exit?.(ctx); } catch (e) { console.error(e); }
    host.unmountContent(cur.el);
    cur = null;
  }

  function switchTo(name, data) {
    const def = getState(name);
    leave();
    const el = host.mountContent();
    cur = { name, def, el, data, timer: 0 };
    try { def.enter(el, data, ctx); } catch (e) { console.error(e); }
    const [w, h] = sizeOf(def, data, el);
    host.setSize(w, h);
    armExit();
  }

  function armExit() {
    clearTimeout(cur.timer);
    const ms = cur.data?.autoExit ?? cur.def.autoExit;
    if (ms) cur.timer = setTimeout(finish, ms);
  }

  function finish() {
    if (destroyed || !cur) return;
    const [name, data] = next() ?? [BASE_STATE, {}];
    if (name === cur.name) return;
    switchTo(name, data);
  }

  function request(name, data = {}) {
    if (destroyed) return false;
    const def = getState(name);
    if (!def) { console.warn(`[nadia] estado "${name}" não registrado`); return false; }
    if (cur && cur.name === name) { // mesmo estado: só atualiza
      cur.data = { ...cur.data, ...data };
      try { cur.def.update?.(data, ctx); } catch (e) { console.error(e); }
      armExit();
      return true;
    }
    switchTo(name, data);
    return true;
  }

  return {
    request,
    stats,
    get current() { return cur?.name ?? null; },
    set next(fn) { next = fn; },
    update(data) { if (cur) { try { cur.def.update?.({ ...cur.data, ...data }, ctx); } catch (e) { console.error(e); } } },
    /** Termina o estado atual agora (vai para `next()` ou para o base). */
    end(name) { ctx.end(name); },
    /** Volta ao estado base. */
    reset() { switchTo(BASE_STATE, {}); },
    destroy() { destroyed = true; leave(); },
  };
}
