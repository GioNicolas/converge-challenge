/**
 * Simula a pré-entrevista de ponta a ponta: a recrutadora é um LLM (OpenRouter, gemini-2.5-flash-lite)
 * com uma persona, e a conversa passa pelas mesmas funções do servidor, sem HTTP.
 * Aqui a extração roda de forma síncrona a cada turno (não há segundo plano no simulador).
 *
 *   npm run pre:simular                                  # todas as personas
 *   npm run pre:simular -- muda_foco                     # só uma
 *   npm run pre:simular -- questionadora muda_foco       # várias
 */
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import { classificarVaga } from "@/lib/pre-entrevista/classificador";
import { chat, type Mensagem } from "@/lib/pre-entrevista/llm";
import { descreverPasso } from "@/lib/pre-entrevista/planejador";
import { paraInterviewConfig } from "@/lib/pre-entrevista/rascunho";
import { criarSessao, extrairAgora, type Sessao } from "@/lib/pre-entrevista/sessoes";
import { abrirConversa, conduzirTurno } from "@/lib/pre-entrevista/turno";

/** Teto de falas da recrutadora por conversa (segurança). */
const MAX_FALAS_RECRUTADORA = 14;
/** Outro modelo que o do produto (gemini-flash-lite), para não disputar o limite de taxa do fallback. */
const MODELO_RECRUTADORA = "meta-llama/llama-3.3-70b-instruct";

interface Persona {
  id: string;
  vagaId: string;
  descricao: string;
}

const PERSONAS: Persona[] = [
  {
    id: "objetiva",
    vagaId: "backend-senior-pagamentos",
    descricao:
      "Você sabe o que quer e responde direto, em uma ou duas frases. Quer foco em idempotência, consistência e falhas no meio do fluxo. " +
      "Eliminatório para você: o candidato não considerar falhas de rede. Duração: sessenta minutos, porque o desenho é grande. " +
      "Tom: mais desafiador, quer ver como ele defende uma decisão. Sem dicas: ele que se vire.",
  },
  {
    id: "muda_foco",
    vagaId: "ia-pleno",
    descricao:
      "Você quer que a pessoa saiba implementar algoritmos complexos com soluções simples, pensando em escalabilidade. " +
      "Aceita live coding. Dispensa pressão: diz que não precisa muito. Dá respostas curtas e às vezes genéricas, como 'um pouco de cada' " +
      "ou 'implementar bem os algoritmos'. Quando perguntarem se uso de IA continua no foco, diz que ainda conta, mas bem menos.",
  },
  {
    id: "questionadora",
    vagaId: "ia-pleno",
    descricao:
      "Você é técnica e gosta de entender o processo antes de responder. Quer avaliar algoritmos e código limpo, e uso de IA (revisar o que a IA gera). " +
      "Dispensa pressão: não precisa ser rigorosa com prazo. Siga esta ordem, sem pular etapas: " +
      "(1) na primeira vez que o Totti perguntar o que separa um candidato ótimo de um mediano, antes de responder, pergunte uma única vez: " +
      "'mas como isso vai ser avaliado num live code?'; depois responda com um comportamento concreto. " +
      "(2) Não fale de dicas até o Totti fazer o resumo. Só depois do resumo, pede: 'tira a dica'. " +
      "(3) Quando o Totti confirmar a mudança e perguntar se pode finalizar, aprova com 'pode finalizar'. Não pede mais nada depois disso.",
  },
  {
    id: "vaga",
    vagaId: "fullstack-startup",
    descricao:
      "No começo responde de forma genérica ('quero alguém bom', 'alguém que saiba bem'). Só depois de uma pergunta com opções concretas " +
      "você dá um exemplo do que observa. No meio da conversa, primeiro diz trinta minutos de duração e depois muda para quarenta e cinco. " +
      "Aceita dicas leves se o candidato travar. Quer um ambiente de startup, com prazo curto e prioridades que mudam.",
  },
];

/** Logs do servidor que poluem a saída do simulador. Os eventos relevantes são impressos pela própria conversa. */
const PREFIXOS_SILENCIADOS = ["[pre-entrevista]", "[extrator]"];

function silenciarLogsDoServidor(): void {
  const log = console.log;
  const warn = console.warn;
  const silenciar =
    (original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (typeof args[0] === "string" && PREFIXOS_SILENCIADOS.some((p) => (args[0] as string).startsWith(p))) return;
      original(...args);
    };
  console.log = silenciar(log);
  console.warn = silenciar(warn);
}

function promptRecrutadora(persona: Persona, descricaoVaga: string): string {
  return `Você é uma recrutadora brasileira real, conversando por texto com o Totti, uma assistente que monta a configuração de uma entrevista técnica para a vaga abaixo.

VAGA:
${descricaoVaga}

SEU PERFIL:
${persona.descricao}

Como responder:
- Responda como a recrutadora: curta, informal, às vezes com um erro de digitação leve.
- Uma ou duas frases por resposta. Nunca fale como assistente de IA nem explique o que está fazendo.
- Responda só o que o Totti perguntou ou pediu. Se ela pedir confirmação de algo que você não quer, diga que não.
- Responda somente com a sua fala, sem aspas e sem prefixo.`;
}

/** Fala da recrutadora simulada. Do ponto de vista dela, as falas do Totti são "user" e as dela são "assistant". */
async function falaDaRecrutadora(persona: Persona, descricaoVaga: string, sessao: Sessao): Promise<string> {
  const mensagens: Mensagem[] = [{ role: "system", content: promptRecrutadora(persona, descricaoVaga) }];
  for (const t of sessao.transcricao) {
    mensagens.push({ role: t.role === "agente" ? "user" : "assistant", content: t.text });
  }
  const pedir = () =>
    chat({
      alvos: [{ provedor: "openrouter", model: MODELO_RECRUTADORA }],
      messages: mensagens,
      temperature: 0.8,
      maxTokens: 200,
    });
  let resposta: Awaited<ReturnType<typeof pedir>>;
  try {
    resposta = await pedir();
  } catch (err) {
    // Limite de taxa do upstream: espera 3 s e tenta uma vez só.
    if (!(err instanceof Error) || !/HTTP 429/.test(err.message)) throw err;
    await new Promise((r) => setTimeout(r, 3000));
    resposta = await pedir();
  }
  return resposta.content
    .replace(/^\s*recrutadora\s*:\s*/i, "")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim();
}

interface Registro {
  n: number;
  recrutadora: string;
  passo: string;
  fala: string;
  msTotti: number;
  msCobertura: number;
  msExtracao: number;
  provedor: string;
}

// ---------------------------------------------------------------------------
// Checagens automáticas
// ---------------------------------------------------------------------------

const STOP = new Set([
  "para",
  "pra",
  "que",
  "uma",
  "um",
  "com",
  "nao",
  "por",
  "como",
  "isso",
  "essa",
  "esse",
  "voce",
  "pode",
  "sobre",
  "mais",
  "mas",
  "uns",
  "dela",
  "dele",
  "seu",
  "sua",
  "sao",
  "ser",
  "esta",
  "num",
  "numa",
  "nos",
  "nas",
  "dos",
  "das",
  "ele",
  "ela",
  "quer",
  "tem",
  "vai",
  "vou",
  "faz",
  "fazer",
  "alguem",
  "tudo",
]);

/** Palavras relevantes de um texto, sem acento e sem as mais comuns. */
function palavras(texto: string): Set<string> {
  const normal = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return new Set(normal.split(/[^a-z0-9_]+/).filter((w) => w.length > 3 && !STOP.has(w)));
}

/** Similaridade de Jaccard entre as palavras de dois textos (0 a 1). */
function similaridade(a: string, b: string): number {
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  const inter = [...pa].filter((w) => pb.has(w)).length;
  return inter / (pa.size + pb.size - inter);
}

/** A parte da fala que é a pergunta: o trecho depois do último ponto. */
function parteDaPergunta(texto: string): string {
  const corte = texto.lastIndexOf(".");
  return corte >= 0 ? texto.slice(corte + 1) : texto;
}

/** Perguntas (frases que terminam em ?) de cada fala do Totti. */
function perguntasDe(texto: string): string[] {
  return texto.match(/[^.!?]*\?/g)?.map((s) => s.trim()) ?? [];
}

function checarRepeticao(sessao: Sessao): string[] {
  const avisos: string[] = [];
  const falas = sessao.transcricao.map((t, i) => ({ i, t })).filter((x) => x.t.role === "agente");
  for (let a = 0; a < falas.length; a++) {
    for (let b = a + 1; b < falas.length; b++) {
      for (const pa of perguntasDe(falas[a].t.text)) {
        for (const pb of perguntasDe(falas[b].t.text)) {
          const s = similaridade(pa, pb);
          if (s > 0.6) avisos.push(`perguntas parecidas (${s.toFixed(2)}): "${pa}" x "${pb}"`);
        }
      }
    }
  }
  // Cada fala contra as 3 anteriores, pela parte da pergunta (depois do último ponto).
  const agentes = sessao.transcricao.map((t, i) => ({ i, t })).filter((x) => x.t.role === "agente");
  for (let k = 1; k < agentes.length; k++) {
    for (let j = Math.max(0, k - 3); j < k; j++) {
      const s = similaridade(parteDaPergunta(agentes[k].t.text), parteDaPergunta(agentes[j].t.text));
      if (s > 0.5) avisos.push(`fala ${agentes[k].i + 1} repete a pergunta da fala ${agentes[j].i + 1} (${s.toFixed(2)})`);
    }
  }
  for (const [id, n] of Object.entries(sessao.plano.perguntasPorTopico)) {
    if (n > 2) avisos.push(`tópico "${id}" perguntado ${n} vezes (limite 2)`);
  }
  return avisos;
}

/** Identificadores internos, sem acento (`pressao` é rótulo; `pressão` é palavra natural). Vale no texto original. */
const IDENTIFICADOR_INTERNO = /\b(tecnico|pressao|escala_produto|uso_ia|criterio_\w+|nara)\b/;
/** Expressões internas, comparadas sem acento. */
const EXPRESSAO_INTERNA = /dominio tecnico|escala e produto|pressao e adaptacao/;

function checarEstilo(sessao: Sessao): string[] {
  const avisos: string[] = [];
  for (const [i, t] of sessao.transcricao.entries()) {
    if (t.role !== "agente") continue;
    const sem = t.text.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (IDENTIFICADOR_INTERNO.test(t.text) || EXPRESSAO_INTERNA.test(sem.toLowerCase()))
      avisos.push(`fala ${i + 1} usa rótulo interno: "${t.text}"`);
    if (/^\s*entendi/i.test(t.text)) avisos.push(`fala ${i + 1} começa com "Entendi": "${t.text}"`);
    // A apresentação é só a abertura (índice 0): depois dela, o Totti não se apresenta de novo.
    if (i > 0 && /\bsou (a )?totti\b/i.test(sem)) avisos.push(`fala ${i + 1} se apresenta de novo: "${t.text}"`);
    const frases = t.text.split(/[.!?]+/).filter((s) => s.trim()).length;
    if (i > 0 && frases > 4) avisos.push(`fala ${i + 1} tem ${frases} frases`);
  }
  return avisos;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function simularPersona(persona: Persona): Promise<void> {
  const vaga = VAGAS.find((v) => v.id === persona.vagaId);
  if (!vaga) throw new Error(`vaga "${persona.vagaId}" não encontrada em fixtures/pre-entrevista/vagas.ts`);

  console.log(`\n================================================================`);
  console.log(`persona: ${persona.id} | vaga: ${vaga.id} (${vaga.roleTitle})`);
  console.log(`================================================================`);

  const classificacao = await classificarVaga({ roleTitle: vaga.roleTitle, jobDescription: vaga.jobDescription });
  const sessao = criarSessao({ roleTitle: vaga.roleTitle, jobDescription: vaga.jobDescription }, classificacao, Date.now());
  abrirConversa(sessao);

  const registros: Registro[] = [];
  let erroFatal: string | undefined;
  for (let n = 1; n <= MAX_FALAS_RECRUTADORA; n++) {
    let recrutadora = "";
    let passo = "";
    let logsNovos: Sessao["logs"] = [];
    let msExtracao = 0;
    try {
      recrutadora = await falaDaRecrutadora(persona, vaga.jobDescription, sessao);
      const antes = sessao.logs.length;
      const { passo: p } = await conduzirTurno(sessao, recrutadora);
      logsNovos = sessao.logs.slice(antes);
      passo = descreverPasso(p);
      const inicio = Date.now();
      await extrairAgora(sessao);
      msExtracao = Date.now() - inicio;
      if (p.tipo === "encerrar") {
        registros.push(registrar(n, recrutadora, passo, sessao, logsNovos, msExtracao));
        break;
      }
    } catch (err) {
      erroFatal = err instanceof Error ? err.message : String(err);
      break;
    }
    registros.push(registrar(n, recrutadora, passo, sessao, logsNovos, msExtracao));
    console.log(`  fala ${n}: passo ${passo}`);
  }

  imprimirTranscricao(persona, sessao, registros, erroFatal);
  imprimirConfig(sessao);
  imprimirChecagens(sessao);
}

function registrar(n: number, recrutadora: string, passo: string, sessao: Sessao, logs: Sessao["logs"], msExtracao: number): Registro {
  const fala = [...sessao.transcricao].reverse().find((t) => t.role === "agente")?.text ?? "";
  const evFala = [...logs].reverse().find((e) => e.tipo === "fala_agente");
  const evCob = logs.find((e) => e.tipo === "cobertura");
  return {
    n,
    recrutadora,
    passo,
    fala,
    msTotti: evFala?.ms ?? 0,
    msCobertura: evCob?.ms ?? 0,
    msExtracao,
    provedor: evFala ? `${evFala.provedor ?? "?"}/${evFala.model ?? "?"}` : "?",
  };
}

function imprimirTranscricao(persona: Persona, sessao: Sessao, registros: Registro[], erroFatal?: string): void {
  console.log(`\n--- transcrição completa (${persona.id}) ---`);
  const abertura = sessao.transcricao[0];
  console.log(`  1. Totti [abertura, sem LLM]: ${abertura.text}`);
  for (const r of registros) {
    console.log(`  ${r.n * 2}. Recrutadora: ${r.recrutadora}`);
    console.log(`     passo: ${r.passo}`);
    console.log(
      `     tempos: Totti ${r.msTotti} ms (${r.provedor}) | cobertura sincrona ${r.msCobertura} ms | extração ${r.msExtracao} ms`,
    );
    console.log(`  ${r.n * 2 + 1}. Totti: ${r.fala}`);
  }
  if (erroFatal) console.log(`  ERRO: ${erroFatal}`);
  if (registros.length >= MAX_FALAS_RECRUTADORA && registros.at(-1)?.passo !== "encerrar") {
    console.log(`  (parou no teto de ${MAX_FALAS_RECRUTADORA} falas da recrutadora, sem encerrar)`);
  }

  const totalTotti = registros.reduce((acc, r) => acc + r.msTotti, 0);
  const totalCob = registros.reduce((acc, r) => acc + r.msCobertura, 0);
  const totalExt = registros.reduce((acc, r) => acc + r.msExtracao, 0);
  console.log(
    `  totais: ${registros.length} falas da recrutadora | Totti ${totalTotti} ms | cobertura ${totalCob} ms | extração ${totalExt} ms`,
  );
  console.log(`  perguntas por tópico: ${JSON.stringify(sessao.plano.perguntasPorTopico)}`);
  console.log(`  resumos: ${sessao.plano.resumos}`);
}

function imprimirConfig(sessao: Sessao): void {
  console.log("\n--- config final (paraInterviewConfig) ---");
  const resultado = paraInterviewConfig(sessao.rascunho, sessao.preferencias);
  if (!resultado.ok) {
    console.log(`  recusada:\n${resultado.erros.map((e) => `    - ${e}`).join("\n")}`);
    return;
  }
  console.log(JSON.stringify(resultado.config, null, 2));
}

function imprimirChecagens(sessao: Sessao): void {
  console.log("\n--- checagens automáticas ---");
  const repeticao = checarRepeticao(sessao);
  const estilo = checarEstilo(sessao);
  const eventosRuins = sessao.logs.filter((e) => e.tipo === "erro" || e.tipo === "aviso");
  if (repeticao.length === 0) console.log("  repetição: nenhuma");
  for (const a of repeticao) console.log(`  repetição: ${a}`);
  if (estilo.length === 0) console.log("  estilo: nada a apontar");
  for (const a of estilo) console.log(`  estilo: ${a}`);
  console.log(`  eventos de erro/aviso: ${eventosRuins.length}`);
  for (const e of eventosRuins) console.log(`    #${e.id} ${e.tipo}: ${e.resumo}`);
}

async function main(): Promise<void> {
  silenciarLogsDoServidor();
  const filtros = process.argv.slice(2);
  const desconhecidas = filtros.filter((f) => !PERSONAS.some((p) => p.id === f));
  if (desconhecidas.length > 0) {
    throw new Error(`persona(s) "${desconhecidas.join(", ")}" não existe(m): ${PERSONAS.map((p) => p.id).join(", ")}`);
  }
  const personas = filtros.length ? PERSONAS.filter((p) => filtros.includes(p.id)) : PERSONAS;
  for (const persona of personas) {
    await simularPersona(persona);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
