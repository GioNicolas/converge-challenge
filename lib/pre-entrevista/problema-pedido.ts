/**
 * A questão que a recrutadora pede pelo nome ("quero que use o two sum", "pode ser busca binária").
 *
 * O pedido é lido direto da fala, sem LLM, como a duração e as linguagens: a resposta do Totti no mesmo turno já
 * precisa saber se a questão existe no banco. O extrator (lento) também pode trazer o pedido, mas só vale quando a
 * leitura da fala não achou nada (ver `aplicarProblemaDoExtrator`).
 *
 * Com o pedido reconhecido, a questão fica fixada: a config sai com `problemaFixado` e toda entrevista da vaga abre com
 * ela (ver `comQuestaoSorteada`). Sem pedido, nada muda: a questão continua sorteada pelo nível e pelo foco.
 */
import type { InterviewMode } from "@/lib/contracts";
import { problems, type PublicProblem } from "@/lib/problems";
import { alternativasDoNivel, normalizarPedido, resolverProblemaPedido } from "@/lib/problems/selecao";
import { limitarPalavras } from "./frases";
import type { Rascunho, Turno } from "./rascunho";

/** O que a fala dela diz sobre a questão. */
export type LeituraDoPedido =
  /** Nomeou uma questão do banco. */
  | { tipo: "problema"; problema: PublicProblem; texto: string }
  /** Pediu uma questão pelo nome, mas o nome não é de nenhuma do banco. */
  | { tipo: "desconhecido"; texto: string }
  /** Prefere que a questão seja sorteada ("pode sortear", "deixa o sorteio"). */
  | { tipo: "sorteio"; texto: string };

/** `turno` do pedido que veio do extrator: chega depois da resposta do Totti, então nunca é "desta fala". */
const TURNO_DO_EXTRATOR = 0;

export type ResultadoDoPedido = NonNullable<Rascunho["pedidoProblema"]>["resultado"];

/** Verbo ou expressão de pedido. "de" e "da" ficam de fora: são preposições na maioria das falas. */
const RE_PEDIDO =
  /\b(?:quero|queria|gostaria|prefiro|preferia|use|usa|usar|usem|usaria|coloca|coloque|colocar|bota|passa|passe|passar|manda|aplica|aplique|aplicar|escolhe|escolha|pode ser|vamos de|vai de|seja)\b/;
/** Palavra que diz que a fala é sobre a questão da entrevista. */
const RE_QUESTAO = /\b(?:problema|questao|exercicio|desafio|algoritmo)\b/;
/** Recusa logo antes do pedido: "não quero o two sum", "não usa". */
const RE_NEGACAO = /\bnao (?:quero|queria|use|usa|usar|usem|coloca|coloque|passa|passe|precisa)\b/;
/** "Quero o problema das N rainhas": pedido de uma questão pelo nome, conhecida ou não. O nome é o grupo 1. */
const RE_PEDIDO_PELO_NOME =
  /\b(?:quero|queria|gostaria|prefiro|use|usa|usar|usem|coloca|coloque|passa|passe|aplica|aplique|manda|dar|vamos de)\s+(?:que (?:seja|use|usem|caia) )?(?:o|a|um|uma)\s+(?:problema|questao|exercicio|desafio)\s+(?:d[oa]s?|chamad[oa])\s+(.+)$/;
/** Palavras que encerram o nome pedido ("das n rainhas na entrevista" → "n rainhas"). */
const FIM_DO_NOME = new Set(["na", "no", "nas", "nos", "pra", "para", "porque", "que", "e", "com", "em", "ai", "por", "pro"]);
const RE_SORTEIO =
  /\b(?:pode sortear|sorteia|sorteie|deixa (?:o )?sorteio|deixar (?:o )?sorteio|prefiro (?:o )?sorteio|fica (?:com )?o sorteio|qualquer (?:questao|problema|uma))\b/;

/** Frases da fala, já normalizadas. Vírgula e "mas" também separam: "não quero o two sum, prefiro busca binária" são dois pedidos. */
function frases(texto: string): string[] {
  return texto
    .split(/[.!?;,\n]+|\s+mas\s+/i)
    .map(normalizarPedido)
    .filter(Boolean);
}

/** O nome pedido numa frase do tipo "quero o problema das N rainhas", até 5 palavras, ou undefined. */
function nomePedido(frase: string): string | undefined {
  const m = RE_PEDIDO_PELO_NOME.exec(frase);
  if (!m) return undefined;
  const palavras: string[] = [];
  for (const w of m[1].split(" ")) {
    if (FIM_DO_NOME.has(w) || palavras.length >= 5) break;
    palavras.push(w);
  }
  return palavras.length ? palavras.join(" ") : undefined;
}

/**
 * O que a fala diz sobre a questão, ou undefined se não fala disso. Uma questão do banco só conta quando a frase é de
 * pedido ("quero", "usa", "pode ser") ou fala da questão ("problema", "exercício"): "o time faz busca binária o dia
 * todo" não fixa nada. Função pura.
 */
export function lerPedidoDeProblema(texto: string): LeituraDoPedido | undefined {
  for (const frase of frases(texto)) {
    if (RE_NEGACAO.test(frase)) continue;
    if (RE_SORTEIO.test(frase)) return { tipo: "sorteio", texto: frase };
    const contexto = RE_PEDIDO.test(frase) || RE_QUESTAO.test(frase);
    const problema = contexto ? resolverProblemaPedido(frase) : undefined;
    if (problema) return { tipo: "problema", problema, texto: frase };
    const nome = nomePedido(frase);
    if (nome) {
      const doNome = resolverProblemaPedido(nome);
      return doNome ? { tipo: "problema", problema: doNome, texto: frase } : { tipo: "desconhecido", texto: nome };
    }
  }
  return undefined;
}

/** A questão do banco que a fala recusa ("não quero o two sum"), ou undefined. */
function lerRecusaDeProblema(texto: string): PublicProblem | undefined {
  for (const frase of frases(texto)) {
    if (RE_NEGACAO.test(frase)) {
      const problema = resolverProblemaPedido(frase);
      if (problema) return problema;
    }
  }
  return undefined;
}

/** O resultado de um pedido no formato atual: no quadro não há banco, a questão é gerada para a vaga. */
function resultadoNoFormato(leitura: LeituraDoPedido, mode: InterviewMode): ResultadoDoPedido {
  if (leitura.tipo === "sorteio") return "sorteio";
  if (mode !== "live_coding") return "system_design";
  return leitura.tipo === "problema" ? "reconhecido" : "nao_existe";
}

/**
 * Lê a fala dela e aplica ao rascunho o que ela diz sobre a questão. `turno` é o número da fala dela na transcrição
 * (1 = abertura do Totti). Questão reconhecida fica fixada; pedido de questão que não existe desfaz a fixação anterior
 * (o Totti oferece outras); "pode sortear" volta ao sorteio. No quadro, o pedido fica registrado e a fala que responde
 * à pergunta do tema (a última fala do Totti fala de "tema") vira contexto para a questão gerada. Função pura.
 */
export function aplicarPedidoDeProblema(r: Rascunho, fala: string, turno: number, ultimaFalaAgente?: string): Rascunho {
  // A resposta à pergunta do tema é o tema, mesmo quando soa como pedido ("quero um desafio sobre pagamentos").
  const pedido = r.pedidoProblema;
  const perguntouTema = !!ultimaFalaAgente && /\btemas?\b/i.test(ultimaFalaAgente);
  if (r.mode === "system_design" && pedido?.resultado === "system_design" && !pedido.tema && perguntouTema) {
    return { ...r, pedidoProblema: { ...pedido, tema: limitarPalavras(fala, 20) } };
  }
  const leitura = lerPedidoDeProblema(fala);
  if (!leitura) {
    // Recusa da questão que estava fixada: volta ao sorteio.
    const recusada = lerRecusaDeProblema(fala);
    return recusada && r.pedidoProblema?.resultado === "reconhecido" && r.problemId === recusada.id
      ? { ...r, problemId: undefined, pedidoProblema: undefined }
      : r;
  }
  // "Pode sortear" sem pedido anterior não muda nada: o sorteio já é o padrão.
  if (leitura.tipo === "sorteio" && !r.pedidoProblema) return r;
  const resultado = resultadoNoFormato(leitura, r.mode);
  const texto = leitura.tipo === "problema" ? leitura.problema.title : limitarPalavras(leitura.texto, 8);
  const pedidoProblema = { texto, resultado, turno, origem: "fala" as const };
  if (resultado === "reconhecido" && leitura.tipo === "problema") return { ...r, problemId: leitura.problema.id, pedidoProblema };
  // No quadro o problemId é do catálogo da pré-entrevista: só o pedido é registrado, a escolha fica.
  if (r.mode !== "live_coding") return { ...r, pedidoProblema };
  return { ...r, problemId: undefined, pedidoProblema };
}

/**
 * O `problemId` que o extrator devolveu, aplicado ao rascunho. Só vale quando a fala dela não trouxe um pedido
 * (a leitura da fala vence: tem a transcrição do turno). Sem correspondência no banco, o campo fica vazio e o aviso sobe.
 * Pedido do extrator fica com `TURNO_DO_EXTRATOR` (ver `linhasDoPedido`). Função pura quanto ao rascunho.
 */
export function aplicarProblemaDoExtrator(r: Rascunho, valor: string | undefined, avisos: string[]): Rascunho {
  if (valor === undefined || r.pedidoProblema?.origem === "fala") return r;
  const problema = problems[valor] ?? resolverProblemaPedido(valor);
  const pedido = (texto: string, resultado: ResultadoDoPedido) => ({ texto, resultado, turno: TURNO_DO_EXTRATOR, origem: "extrator" as const });
  if (r.mode !== "live_coding") {
    return { ...r, problemId: undefined, pedidoProblema: pedido(problema?.title ?? limitarPalavras(valor, 8), "system_design") };
  }
  if (!problema) {
    avisos.push(`problemId "${valor}" descartado: nenhuma questão do banco com esse nome`);
    return { ...r, problemId: undefined, pedidoProblema: pedido(limitarPalavras(valor, 8), "nao_existe") };
  }
  return { ...r, problemId: problema.id, pedidoProblema: pedido(problema.title, "reconhecido") };
}

/**
 * O `problemId` do extrator só vale se alguma fala da recrutadora cita a questão (pelo id, título, apelido ou, para
 * uma que não existe, pelo nome que o modelo devolveu). Sem isso é palpite do modelo e não fixa nada. Função pura.
 */
export function problemaTemEvidencia(valor: string | undefined, transcricao: Turno[]): boolean {
  if (!valor) return false;
  const alvo = problems[valor] ?? resolverProblemaPedido(valor);
  const nome = normalizarPedido(valor);
  return transcricao
    .filter((t) => t.role === "recrutadora")
    .some((t) => {
      const fala = normalizarPedido(t.text);
      return alvo ? resolverProblemaPedido(fala)?.id === alvo.id : !!nome && ` ${fala} `.includes(` ${nome} `);
    });
}

/** A questão fixada a pedido dela, ou undefined (sorteio pelo nível e pelo foco). */
export function problemaFixado(r: Pick<Rascunho, "mode" | "problemId" | "pedidoProblema">): PublicProblem | undefined {
  if (r.mode !== "live_coding" || r.pedidoProblema?.resultado !== "reconhecido" || !r.problemId) return undefined;
  return problems[r.problemId];
}

function listarTitulos(titulos: string[]): string {
  return titulos.length <= 1 ? (titulos[0] ?? "") : `${titulos.slice(0, -1).join(", ")} ou ${titulos.at(-1)}`;
}

/**
 * Linhas de "O QUE JÁ SE SABE" sobre a questão. `destaFala`: o pedido veio da última fala dela, então a linha diz ao
 * Totti o que responder; nos turnos seguintes a linha só registra o que ficou. Sem pedido, nenhuma linha. Função pura.
 */
export function linhasDoPedido(r: Rascunho, destaFala: boolean): string[] {
  const pedido = r.pedidoProblema;
  if (!pedido) return [];
  const fixado = problemaFixado(r);
  switch (pedido.resultado) {
    case "reconhecido":
      if (!fixado) return [];
      return destaFala
        ? [
            `- questão: ela pediu ${fixado.title}, que está no banco. Está fixada: toda entrevista desta vaga usa ${fixado.title}. ` +
              `Confirme numa frase curta (por exemplo: 'A questão vai ser ${fixado.title}.') e siga.`,
          ]
        : [`- questão: ${fixado.title}, fixada a pedido dela (toda entrevista da vaga usa essa).`];
    case "nao_existe": {
      if (!destaFala) return [`- questão: a que ela pediu ('${pedido.texto}') não está no banco; segue o sorteio pelo nível e pelo foco.`];
      const opcoes = alternativasDoNivel({ seniority: r.seniority, focus: r.focus }).map((p) => p.title);
      return [
        `- questão: ela pediu '${pedido.texto}', que NÃO está no banco. Não diga que anotou nem prometa essa questão. ` +
          `Diga que essa não está disponível, cite como opção ${listarTitulos(opcoes)} e pergunte se serve alguma ou se ela prefere deixar o sorteio.`,
      ];
    }
    case "system_design":
      if (destaFala) {
        return [
          `- questão: ela pediu '${pedido.texto}', mas no quadro a questão é gerada para esta vaga, não sai de um banco. ` +
            "Explique isso em uma frase e pergunte que tema ela quer ver no desafio. Não prometa enunciado.",
        ];
      }
      return pedido.tema
        ? [`- tema que ela quer ver no desafio do quadro: ${pedido.tema} (entra como contexto da questão gerada; não prometa enunciado).`]
        : [];
    case "sorteio":
      return destaFala
        ? ["- questão: ela preferiu o sorteio; a questão sai do banco pelo nível e pelo foco. Confirme numa frase curta e siga."]
        : ["- questão: sorteada pelo nível e pelo foco (ela preferiu o sorteio)."];
  }
}

/** Frase do resumo final sobre a questão fixada, ou "" sem questão fixada. */
export function fraseDaQuestao(r: Rascunho): string {
  const fixado = problemaFixado(r);
  return fixado ? `A questão vai ser ${fixado.title}, para todos os candidatos.` : "";
}

/** Nota para a questão gerada do quadro com o tema que ela pediu, ou "" sem tema. */
export function notaDoTema(r: Rascunho): string {
  const tema = r.mode === "system_design" ? r.pedidoProblema?.tema : undefined;
  return tema ? `Tema que ela quer ver no desafio do quadro: ${tema}` : "";
}
