import {
  descreverConexao, entreAspas, nomeDoElemento, textoCurto, tiposEmPortugues,
  type Instantaneo, type Secao,
} from "./instantaneo";

export type { Instantaneo } from "./instantaneo";

const vazio: Instantaneo = { componentes: [], conexoes: [], anotacoes: [], secoes: [], desenhos: [] };

function indice<T extends { id: string }>(itens: readonly T[]): Map<string, T> {
  return new Map(itens.map((item) => [item.id, item]));
}

function secao(s: Secao): string {
  return `${s.tipo === "grupo" ? "grupo" : `[${s.id}] ${textoCurto(s.nome) || "moldura sem nome"}`}: ${s.membros.map((id) => `[${id}]`).join(", ")}`;
}

function mesmosMembros(a: Secao, b: Secao): boolean {
  return a.membros.length === b.membros.length && a.membros.every((id) => b.membros.includes(id));
}

export function descreverMudancas(anterior: Instantaneo | null, atual: Instantaneo): string {
  const antes = anterior ?? vazio;
  const linhas: string[] = [];
  const componentesAntes = indice(antes.componentes);
  const componentesAgora = indice(atual.componentes);
  for (const c of antes.componentes) {
    if (!componentesAgora.has(c.id)) linhas.push(`- removeu [${c.id}] ${textoCurto(c.nome) || tiposEmPortugues[c.tipo]}`);
  }
  for (const c of atual.componentes) {
    const antigo = componentesAntes.get(c.id);
    if (!antigo) {
      const dentro = c.dentroDe ? ` dentro de [${c.dentroDe}] ${nomeDoElemento(atual, c.dentroDe)}` : "";
      linhas.push(`+ adicionou [${c.id}] ${textoCurto(c.nome) || tiposEmPortugues[c.tipo]}${dentro}`);
    } else {
      if (antigo.nome !== c.nome) linhas.push(`~ renomeou [${c.id}] ${textoCurto(antigo.nome) || "(sem texto)"} → ${textoCurto(c.nome) || "(sem texto)"}`);
      if (antigo.tipo !== c.tipo) linhas.push(`~ mudou o tipo de [${c.id}]: ${tiposEmPortugues[antigo.tipo]} → ${tiposEmPortugues[c.tipo]}`);
    }
    if (antigo && antigo.dentroDe !== c.dentroDe) {
      const destino = c.dentroDe ? `para dentro de [${c.dentroDe}] ${nomeDoElemento(atual, c.dentroDe)}` : `para fora de [${antigo.dentroDe}] ${nomeDoElemento(antes, antigo.dentroDe)}`;
      linhas.push(`~ moveu [${c.id}] ${nomeDoElemento(atual, c.id)} ${destino}`);
    }
  }
  const conexoesAntes = indice(antes.conexoes);
  const conexoesAgora = indice(atual.conexoes);
  const mesmaLigacao = (a: Instantaneo["conexoes"][number], b: Instantaneo["conexoes"][number]) => a.de === b.de && a.para === b.para && a.tipo === b.tipo;
  const rotulo = (texto: string) => texto ? ` (${entreAspas(texto)})` : "";
  for (const c of antes.conexoes) {
    const novo = conexoesAgora.get(c.id);
    if (!novo || !mesmaLigacao(c, novo)) linhas.push(`- desconectou ${descreverConexao(antes, c)}${rotulo(c.rotulo)}`);
  }
  for (const c of atual.conexoes) {
    const antigo = conexoesAntes.get(c.id);
    if (!antigo || !mesmaLigacao(antigo, c)) linhas.push(`+ conectou ${descreverConexao(atual, c)}${rotulo(c.rotulo)}`);
    else if (antigo.rotulo !== c.rotulo) linhas.push(`~ mudou o rótulo de ${descreverConexao(atual, c)}: ${entreAspas(antigo.rotulo)} → ${entreAspas(c.rotulo)}`);
  }
  const notasAntes = indice(antes.anotacoes);
  const notasAgora = indice(atual.anotacoes);
  for (const a of antes.anotacoes) {
    if (!notasAgora.has(a.id)) linhas.push(`- apagou a anotação [${a.id}]`);
  }
  for (const a of atual.anotacoes) {
    const antiga = notasAntes.get(a.id);
    if (!antiga) linhas.push(`+ anotou [${a.id}] ${entreAspas(a.texto)}`);
    else if (antiga.texto !== a.texto) linhas.push(`~ alterou a anotação [${a.id}]: ${entreAspas(antiga.texto)} → ${entreAspas(a.texto)}`);
  }
  const secoesAntes = indice(antes.secoes);
  const secoesAgora = indice(atual.secoes);
  for (const s of antes.secoes) {
    if (!secoesAgora.has(s.id)) linhas.push(`- removeu a seção ${secao(s)}`);
  }
  for (const s of atual.secoes) {
    const antiga = secoesAntes.get(s.id);
    if (!antiga) linhas.push(`+ adicionou a seção ${secao(s)}`);
    else if (antiga.nome !== s.nome || antiga.tipo !== s.tipo || !mesmosMembros(antiga, s)) linhas.push(`~ alterou a seção ${secao(s)}`);
  }
  const desenhosAntes = indice(antes.desenhos);
  const desenhosAgora = indice(atual.desenhos);
  const tipoDesenho = (tipo: string) => tipo === "image" ? "imagem" : "desenho à mão livre";
  for (const d of antes.desenhos) {
    if (!desenhosAgora.has(d.id)) linhas.push(`- removeu [${d.id}] ${tipoDesenho(d.tipo)}`);
  }
  for (const d of atual.desenhos) {
    const antigo = desenhosAntes.get(d.id);
    if (!antigo) linhas.push(`+ adicionou [${d.id}] ${tipoDesenho(d.tipo)}`);
    else if (antigo.tipo !== d.tipo) linhas.push(`~ mudou o tipo de [${d.id}]: ${tipoDesenho(antigo.tipo)} → ${tipoDesenho(d.tipo)}`);
  }
  return linhas.join("\n");
}

export function houveMudancaRelevante(anterior: Instantaneo | null, atual: Instantaneo): boolean {
  return descreverMudancas(anterior, atual) !== "";
}
