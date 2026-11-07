// Diff simples entre dois grafos em texto, no estilo do campo `mudancas` do contrato:
//   + adicionou [e1] Postgres (elipse)
//   - removeu [s2] API → Postgres
//   ~ alterou [r2]: API (retângulo) passou a API v2 (retângulo)
// Compara por id (linhas "- [id] resto"); linhas sem id (cabeçalhos, ORDEM NA TELA) são ignoradas.

export type DiffGrafo = { texto: string; ids: string[] };

function itensPorId(grafo: string): Map<string, string> {
  const itens = new Map<string, string>();
  for (const linha of grafo.split(/\r?\n/)) {
    const m = linha.match(/^\s*- \[([^\]]+)\]\s*(.*)$/);
    if (m) itens.set(m[1], m[2].trim());
  }
  return itens;
}

export function diffGrafo(antes: string, depois: string): DiffGrafo {
  const a = itensPorId(antes);
  const b = itensPorId(depois);
  const linhas: string[] = [];
  const ids: string[] = [];
  for (const [id, resto] of b) {
    if (!a.has(id)) {
      linhas.push(`+ adicionou [${id}] ${resto}`);
      ids.push(id);
    } else if (a.get(id) !== resto) {
      linhas.push(`~ alterou [${id}]: ${a.get(id)} passou a ${resto}`);
      ids.push(id);
    }
  }
  for (const [id, resto] of a) {
    if (!b.has(id)) {
      linhas.push(`- removeu [${id}] ${resto}`);
      ids.push(id);
    }
  }
  return { texto: linhas.join("\n"), ids };
}
