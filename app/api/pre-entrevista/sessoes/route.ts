import { NextResponse } from "next/server";
import { z } from "zod";
import type { FocusArea, InterviewMode } from "@/lib/contracts";
import { classificarVaga, pesosDoFoco, type Classificacao, type Decisao, type Vaga } from "@/lib/pre-entrevista/classificador";
import { extrairCompetencias } from "@/lib/pre-entrevista/competencias";
import { criarSessao, estadoDaSessao } from "@/lib/pre-entrevista/sessoes";
import { abrirConversa } from "@/lib/pre-entrevista/turno";
import { paraContrato } from "@/lib/squad-memory/config";
import { empresaAtual, hidratarSquadMemory, regrasAtivas } from "@/lib/squad-memory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Corpo = z.object({
  roleTitle: z.string().trim().min(1, "cargo obrigatório"),
  jobDescription: z.string().trim().min(1, "descrição da vaga obrigatória"),
  context: z.string().trim().optional(),
});

/** Cria a sessão: classifica a vaga (Jev), monta o rascunho e registra a abertura do Totti. */
export async function POST(req: Request) {
  const lido = Corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return NextResponse.json(
      { erro: "dados inválidos", erros: lido.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`) },
      { status: 400 },
    );
  }

  const vaga = {
    roleTitle: lido.data.roleTitle,
    jobDescription: lido.data.jobDescription,
    ...(lido.data.context ? { context: lido.data.context } : {}),
  };
  const criadaEm = Date.now();
  let classificacao: Classificacao;
  try {
    classificacao = await classificarVaga(vaga);
  } catch (err) {
    // Instabilidade do classificador não derruba a conversa: segue com uma leitura por palavras-chave,
    // que pergunta formato, nível e foco à recrutadora (`confirmar`) em vez de afirmar.
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error(`[pre-entrevista] classificação da vaga "${vaga.roleTitle}" falhou (${mensagem}); usando o fallback por palavras-chave`);
    classificacao = classificacaoPorPalavrasChave(vaga, criadaEm);
  }

  // Competências da vaga: uma chamada rápida. Se falhar, a sessão segue sem elas (o log registra o motivo).
  const competencias = await extrairCompetencias(vaga);
  // As regras ativas da empresa entram na conversa: o Totti pergunta "da última vez vocês pediram X, mantenho?".
  await hidratarSquadMemory();
  const regrasSquad = regrasAtivas(empresaAtual()).map(paraContrato);
  const sessao = criarSessao(vaga, classificacao, criadaEm, competencias, regrasSquad);
  abrirConversa(sessao);
  return NextResponse.json(estadoDaSessao(sessao), { status: 201 });
}

function decisaoFixa<T extends string>(valor: T, todos: T[], confianca: number): Decisao<T> {
  const resto = (1 - confianca) / Math.max(1, todos.length - 1);
  return {
    value: valor,
    confidence: confianca,
    probabilities: Object.fromEntries(todos.map((t) => [t, t === valor ? confianca : resto])) as Record<T, number>,
  };
}

/** Classificação determinística, só para quando o Jev está fora do ar. Confiança baixa de propósito: o Totti confirma. */
function classificacaoPorPalavrasChave(vaga: Vaga, inicio: number): Classificacao {
  const texto = `${vaga.roleTitle} ${vaga.jobDescription} ${vaga.context ?? ""}`.toLowerCase();
  const tem = (re: RegExp) => re.test(texto);
  // Siglas curtas ("ia", "ml", "jr", "sr") só como palavra inteira: "experiência" não é vaga de IA.
  const palavras = new Set(texto.split(/[^a-z0-9à-ÿ-]+/));
  const palavra = (...ps: string[]) => ps.some((p) => palavras.has(p));

  const ehSistema = tem(/staff|principal|arquitet|system design|sistemas distribu|escala|alta disponibilidade|plataforma|tech lead|lideran/);
  const modo: InterviewMode = ehSistema ? "system_design" : "live_coding";
  const senioridade: "junior" | "pleno" | "senior" = tem(/est[aá]gio|trainee|j[uú]nior/) || palavra("jr")
    ? "junior"
    : tem(/s[eê]nior|staff|principal|especialista|tech lead/) || palavra("sr", "lead")
      ? "senior"
      : "pleno";

  const notas: Record<FocusArea, number> = {
    tecnico: 2,
    pressao: tem(/startup|press[aã]o|ritmo|incidente|on-?call|plant[aã]o/) ? 2 : 1,
    escala_produto: modo === "system_design" || tem(/escala|volume|milh[oõ]es|performance|latência|latencia/) ? 2.5 : 1,
    uso_ia: tem(/llm|machine learning|intelig[eê]ncia artificial|chatbot|gpt|agentes? de ia/) || palavra("ia", "ml", "ai", "rag") ? 2.5 : 0.5,
  };
  const focusScores = (Object.keys(notas) as FocusArea[])
    .map((area) => ({ area, score: notas[area], pImportante: notas[area] >= 2 ? 0.8 : 0.2 }))
    .sort((a, b) => b.score - a.score);

  return {
    mode: decisaoFixa<InterviewMode>(modo, ["live_coding", "system_design"], 0.6),
    seniority: decisaoFixa(senioridade, ["junior", "pleno", "senior"], 0.6),
    focusScores,
    focus: pesosDoFoco(focusScores),
    nivelExplicito: 0.4,
    confirmar: ["mode", "seniority", "focus"],
    usage: { inputTokens: null, ms: Date.now() - inicio },
    request: { state: { fallback: "palavras-chave" }, questions: null },
    answers: { fallback: true },
    model: "fallback-palavras-chave",
  };
}
