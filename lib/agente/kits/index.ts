import { kitDemo } from "./demo";
import type { Kit } from "./tipos";

const KITS: Record<string, Kit> = { demo: kitDemo, system_design: kitDemo };

export function carregarKit(id: string): Kit | undefined {
  return KITS[id];
}
export { kitDemo };
