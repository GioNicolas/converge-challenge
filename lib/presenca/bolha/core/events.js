// Mapeia eventos do contrato (shared/types.ts ServerEvent + sinais locais) para os três estados da bolha:
//   listening (ouvindo) → thinking (pesquisando) → brought (card: skeleton, depois o resultado) → listening
// `thinking` só aparece quando uma pesquisa começou (focus com status 'loading') e nunca volta a ouvir sem resultado.
// Quando o servidor conta a busca planejada (item.query), a orbe vira o card em skeleton com essa busca de título;
// o resultado (ready ou error) entra no mesmo card. Conteúdo parcial da pesquisa nunca aparece.
const MIN_THINK_MS = 700; // pensando fica pelo menos isso na tela: resposta instantânea não vira um piscar
const SEARCH_TIMEOUT_MS = 45000; // a pesquisa não voltou (servidor caiu?): vira card de erro, nunca volta a ouvir calada

export function createEventRouter(machine) {
  const items = new Map(); // itens já trazidos (id → FocusItem), para o "mostra de novo"
  const pending = new Map(); // pesquisas em andamento: id → { item, timer, card } (card: já está na tela em skeleton)
  const later = new Set(); // resultados segurados até o pensando completar MIN_THINK_MS
  let thinkingSince = 0;
  const log = (...a) => console.debug('[nadia]', ...a);

  // Sem cards na tela e com pesquisa em andamento, a bolha volta a pensar; senão, ouve.
  const orbs = () => [...pending.values()].filter((p) => !p.card).length; // pesquisas que ainda são só a orbe
  machine.next = () => {
    if (!pending.size) return null;
    thinkingSince = Date.now();
    return ['thinking', {}];
  };


  function show(item) {
    if (machine.current === 'thinking') {
      const wait = thinkingSince + MIN_THINK_MS - Date.now();
      if (wait > 0) {
        const t = setTimeout(() => { later.delete(t); show(item); }, wait);
        later.add(t);
        return;
      }
    }
    machine.request('brought', { item, pending: orbs() });
  }

  function startSearch(item) {
    let p = pending.get(item.id);
    if (!p) {
      p = { item, card: false, timer: setTimeout(() => settle({ ...item, status: 'error' }), SEARCH_TIMEOUT_MS) };
      pending.set(item.id, p);
    }
    p.item = item;
    if (item.query) { // a busca planejada chegou: a orbe vira o card em skeleton
      p.card = true;
      return show(item);
    }
    if (machine.current === 'brought') machine.request('brought', { pending: orbs() }); // orbe ao lado do card
    else if (machine.current !== 'thinking') { thinkingSince = Date.now(); machine.request('thinking', {}); }
  }

  function settle(item) {
    const p = pending.get(item.id);
    if (p) { clearTimeout(p.timer); pending.delete(item.id); }
    if (item.status === 'ready') items.set(item.id, item);
    show(item);
  }

  function onFocus(item) {
    if (item.status === 'loading') return startSearch(item);
    settle(item);
  }

  function clear() {
    for (const p of pending.values()) clearTimeout(p.timer);
    for (const t of later) clearTimeout(t);
    pending.clear(); later.clear(); items.clear();
  }

  function handle(ev) {
    if (!ev || !ev.kind) return;
    switch (ev.kind) {
      case 'transcript': if (machine.current === 'listening') machine.update({ pulse: true }); break; // a frase ouvida não aparece na bolha
      case 'focus': onFocus(ev.item); break;
      case 'state': // replay ao conectar: pesquisa que terminou enquanto estávamos desconectados
        for (const it of ev.history || []) {
          if (pending.has(it.id) && it.status !== 'loading') settle(it);
          else if (it.status === 'loading' && Date.now() - it.ts < SEARCH_TIMEOUT_MS) startSearch(it); // montou no meio da pesquisa
          else if (it.status === 'ready') items.set(it.id, it);
        }
        break;
      case 'ui': {
        // "mostra de novo" (recall): o servidor só manda o id, quem guarda os itens somos nós
        const a = ev.action || {};
        const it = a.type === 'recall' ? items.get(a.itemId) : null;
        if (it) show(it);
        break;
      }
      case 'reset': case 'ended': clear(); machine.reset(); break;
      // sinais locais (não vêm do servidor)
      // só "ouvindo" e "pensando" usam o volume; no card o update redesenharia tudo ~20x por segundo
      case 'volume': if (machine.current === 'listening' || machine.current === 'thinking') machine.update({ volume: ev.level }); break;
      case 'audio-status': machine.stats.audio = ev.status; machine.update({ audioStatus: ev.status }); break;
      case 'decision': case 'action': case 'summary': case 'speak': case 'speaking_end': break; // sem efeito na bolha
      default: log('evento ignorado', ev.kind);
    }
  }
  return { handle, destroy: clear };
}
