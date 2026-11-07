// Registro global de estados. Qualquer módulo (listening, content, ...) chama registerState().
// Singleton por módulo ESM: todos importam este mesmo arquivo.
const states = new Map();

/**
 * @param {string} name
 * @param {{
 *   size?: [number, number] | ((data:any)=>[number, number]), // [largura, altura] em px; sem isso a bolha mede o conteúdo
 *   autoExit?: number,   // ms até sair sozinho (para o próximo que o roteador indicar, ou o estado base)
 *   enter: (container: HTMLElement, data: any, ctx: object) => void,
 *   update?: (data: any, ctx: object) => void,
 *   exit?: (ctx: object) => void,
 * }} def
 */
export function registerState(name, def) {
  if (!def || typeof def.enter !== 'function') throw new Error(`registerState("${name}"): enter() obrigatório`);
  states.set(name, def);
}
export const getState = (name) => states.get(name);
export const listStates = () => [...states.keys()];
