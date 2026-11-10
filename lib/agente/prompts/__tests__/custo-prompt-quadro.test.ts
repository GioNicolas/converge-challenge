// Tamanho da parte dinâmica do prompt da fala do Totti no quadro, sem chamar o modelo (issue #63).
// Monta o prompt de uma conversa de 40 falas com um grafo grande, como ia antes dos cortes e como vai agora num
// turno em que o desenho não mudou desde a fala anterior (o caso comum: ele fala enquanto olha o desenho).
//   npx tsx --test lib/agente/prompts/__tests__/custo-prompt-quadro.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KIT_SYSTEM_DESIGN as kit } from "../../kits/system-design";
import { estadoInicial, type EstadoSessao } from "../../sessao/estado";
import { MAX_FALAS_NO_PROMPT } from "../contexto";
import { blocosDoSistemaDinamicoPerguntarV2, FALAS_NO_PROMPT_V2, tamanhoDosBlocos } from "../entrevistador-v2";

const AGORA = Date.UTC(2026, 10, 10, 15, 0, 0);
const MIN = 60_000;

/**
 * Tokens de uma foto do quadro (1024 px de largura). O provedor não diz o número exato antes de cobrar; 516 é o
 * piso (dois blocos de 258 tokens no Gemini), então a economia com a foto fica, se tanto, subestimada.
 */
const TOKENS_DA_FOTO = 516;
/** Caracteres por token no português, em média. Só para somar texto e foto na mesma unidade. */
const CARACTERES_POR_TOKEN = 4;

/** Um grafo do tamanho que o quadro manda no máximo (24 mil caracteres). */
function grafoGrande(caracteres = 24_000): string {
  const linhas = ["COMPONENTES"];
  for (let i = 1; linhas.join("\n").length < caracteres * 0.6; i++) linhas.push(`- [r${i}] Serviço ${i} de processamento de pedidos (retângulo) "guarda o estado do pedido ${i}"`);
  linhas.push("CONEXÕES");
  for (let i = 1; linhas.join("\n").length < caracteres; i++) linhas.push(`- [s${i}] Serviço ${i} → Serviço ${i + 1} "manda o evento pela fila"`);
  return linhas.join("\n").slice(0, caracteres);
}

/** 40 falas: o candidato pensa em voz alta, o Totti reage curto ou pergunta. */
function estadoCom40Falas(): EstadoSessao {
  const conversa = Array.from({ length: 40 }, (_, i) => i % 2 === 0
    ? { quem: "candidato" as const, texto: `Aqui eu coloco o serviço ${i} na frente da fila, porque se o banco ficar lento a gente não perde o pedido e consegue reprocessar depois com calma.`, em: AGORA - (40 - i) * 30_000 }
    : { quem: "agente" as const, texto: i % 4 === 1 ? `E o que acontece com o pedido ${i} se a fila cair no meio?` : "Faz sentido, pode seguir.", em: AGORA - (40 - i) * 30_000 });
  return { ...estadoInicial({ criterios: kit.criterios.map((c) => c.id) }), fase: "APROFUNDAMENTO", faseIniciadaEm: AGORA - 12 * MIN, conversa };
}

const MUDANCAS = Array.from({ length: 10 }, (_, i) => `+ [r${i + 1}] Serviço ${i + 1} de processamento de pedidos (retângulo)`).join("\n");

type Turno = { falas: number; foto: boolean; mudancas?: string; grafo: string };

function medir(t: Turno) {
  const blocos = blocosDoSistemaDinamicoPerguntarV2(estadoCom40Falas(), kit, "APROFUNDAMENTO", ["10 mil pedidos por segundo"], t.grafo, undefined, [], AGORA, [], t.mudancas, t.foto, "", t.falas);
  const caracteres = tamanhoDosBlocos(blocos);
  const texto = caracteres.conversa + caracteres.grafo + caracteres.mudancas + caracteres.resto;
  const tokens = Math.ceil(texto / CARACTERES_POR_TOKEN) + (t.foto ? TOKENS_DA_FOTO : 0);
  return { ...caracteres, foto: t.foto ? TOKENS_DA_FOTO * CARACTERES_POR_TOKEN : 0, tokens };
}

/** Como ia antes da issue #63: 40 falas, a foto e o bloco de mudanças em todo turno. */
const antes = (grafo: string): Turno => ({ falas: MAX_FALAS_NO_PROMPT, foto: true, mudancas: MUDANCAS, grafo });
/** Como vai agora num turno com o desenho parado desde a fala anterior. */
const agora = (grafo: string): Turno => ({ falas: FALAS_NO_PROMPT_V2, foto: false, grafo });

function tabela(nome: string, a: ReturnType<typeof medir>, d: ReturnType<typeof medir>): number {
  const queda = 1 - d.tokens / a.tokens;
  const linha = (k: keyof typeof a) => `  ${k.padEnd(9)} ${String(a[k]).padStart(7)} -> ${String(d[k]).padStart(7)}`;
  console.log([`${nome} (caracteres por bloco; foto em caracteres-equivalentes)`, ...(["conversa", "grafo", "mudancas", "foto", "resto", "tokens"] as const).map(linha), `  queda na entrada dinâmica: ${(queda * 100).toFixed(0)}%`].join("\n"));
  return queda;
}

describe("custo do prompt da fala no quadro (sem API)", () => {
  it("o turno com o desenho parado não leva foto nem bloco de mudanças", () => {
    const d = medir(agora(grafoGrande()));
    assert.equal(d.foto, 0);
    assert.equal(d.mudancas, 0);
  });

  it("a conversa vai com no máximo FALAS_NO_PROMPT_V2 falas", () => {
    const blocos = blocosDoSistemaDinamicoPerguntarV2(estadoCom40Falas(), kit, "APROFUNDAMENTO", [], "", undefined, [], AGORA);
    const conversa = blocos.find((b) => b.bloco === "conversa")!.texto;
    assert.equal(conversa.split("\n").length, Math.min(40, FALAS_NO_PROMPT_V2));
  });

  it("grafo grande (24 mil caracteres): mede a queda", () => {
    const queda = tabela("grafo grande", medir(antes(grafoGrande())), medir(agora(grafoGrande())));
    assert.ok(queda > 0, "a entrada dinâmica não caiu");
  });

  it("grafo médio (6 mil caracteres): mede a queda", () => {
    const queda = tabela("grafo médio", medir(antes(grafoGrande(6_000))), medir(agora(grafoGrande(6_000))));
    assert.ok(queda > 0, "a entrada dinâmica não caiu");
  });
});
