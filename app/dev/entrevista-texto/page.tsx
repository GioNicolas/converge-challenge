"use client";

// Teste local: uma entrevista COMPLETA por texto contra o cérebro real (só rotas HTTP).
// Simula o que o quadro do Excalidraw mandaria: desenho (grafo em texto), falas, plin, resposta, fases.
// Só para desenvolvimento. Guia: docs/teste-local-entrevista-texto.md
import { useCallback, useEffect, useRef, useState } from "react";
import { diffGrafo } from "@/lib/dev/entrevista-texto/diff";
import { GRAFO_BOM, GRAFO_MODELO, GRAFO_RUIM, GRAFO_VAZIO } from "@/lib/dev/entrevista-texto/exemplos";

const DEMOS = ["demo", "demo-chat", "demo-pagamentos", "demo-produto"];
const FASES = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO", "ENCERRADA"] as const;
type Fase = (typeof FASES)[number];
type Status = "ok" | "duvida" | "redirecionar" | "dica";

/** Mesma tabela do quadro/servidor: que tipo de plin cada fase aceita. */
const PLINS: Partial<Record<Fase, Status[]>> = {
  ALTO_NIVEL: ["redirecionar"],
  APROFUNDAMENTO: ["duvida", "redirecionar", "dica"],
  FECHAMENTO: ["duvida"],
};
const MAX_PERGUNTAS = 5;
const INTERVALO_MS = 60_000;
const LIMITE_ANALISE_MS = 8_000;

type Msg = { quem: "agente" | "candidato"; texto: string };
type Analise = {
  status: Status;
  pergunta: string | null;
  nota: string | null;
  elementos: string[];
  degrau: number | null;
  observacoes: { criterio: string; sinal: string; espontaneo: boolean; evidencia: string }[];
};
type Pendente = { pergunta: string; nota: string | null; elementos: string[] };
type EstadoServidor = {
  fase: string;
  plin: string;
  plinPendente: boolean;
  perguntaAtiva: boolean;
  perguntasFeitas: number;
  criteriosSemEvidencia: string[];
  observacoes: number;
  analises: number;
};
type Evidencia = { tipo: "fala" | "desenho"; horario: string; texto?: string; elementos?: string[]; imagem?: string };
type Scorecard = {
  nota_geral: number | null;
  recomendacao: string;
  criterios: { criterio: string; nota: number | null; justificativa: string; evidencias: Evidencia[] }[];
  pontos_fortes: string[];
  pontos_a_aprofundar: string[];
  briefing_para_proxima_etapa: string;
  origem: string;
  ajustes: string[];
};
type Registro = { quando: string; ms: number; status: number | string; req: unknown; res: unknown };

const ROTULO_RECOMENDACAO: Record<string, string> = {
  avancar: "Sugestão: avançar",
  avancar_com_ressalvas: "Sugestão: avançar com ressalvas",
  nao_avancar: "Sugestão: não avançar",
  evidencia_insuficiente: "Evidência insuficiente para sugerir",
};

export default function PaginaEntrevistaTexto() {
  const [avaliacao, setAvaliacao] = useState("demo");
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [problema, setProblema] = useState<{ titulo: string; enunciado: string } | null>(null);
  const [fase, setFaseEstado] = useState<Fase>("REQUISITOS");
  const [grafo, setGrafo] = useState(GRAFO_VAZIO);
  const [conversa, setConversa] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [ativa, setAtiva] = useState<Pendente | null>(null);
  const [requisitos, setRequisitos] = useState<string[]>([]);
  const [estado, setEstado] = useState<EstadoServidor | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [logs, setLogs] = useState<Record<string, Registro>>({});
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroScorecard, setErroScorecard] = useState<string | null>(null);

  // Espelhos para as funções assíncronas lerem o valor mais recente.
  const r = useRef({
    sessao: null as string | null,
    fase: "REQUISITOS" as Fase,
    grafo: GRAFO_VAZIO,
    baseAnalisada: GRAFO_VAZIO,
    baseEventos: GRAFO_VAZIO,
    conversa: [] as Msg[],
    clicadas: 0,
    ultimoClique: 0,
    finalFeita: false,
    pendente: null as Pendente | null,
    ativa: false,
    fragmentos: [] as string[],
    rodando: false,
    fila: null as boolean | null,
  });

  const aviso = useCallback((t: string) => setAvisos((a) => [...a.slice(-5), t]), []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("avaliacao");
    if (id) setAvaliacao(id);
  }, []);

  const chamar = useCallback(async (rotulo: string, metodo: "GET" | "POST", url: string, corpo?: unknown, timeoutMs = 20_000) => {
    const t0 = Date.now();
    let status: number | string = "erro";
    let dados: unknown = null;
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      dados = await res.json().catch(() => null);
    } catch (e) {
      dados = { erro: e instanceof Error ? e.message : "falha de rede" };
    }
    const ms = Date.now() - t0;
    setLogs((l) => ({ ...l, [rotulo]: { quando: new Date().toLocaleTimeString(), ms, status, req: corpo ?? null, res: dados } }));
    return { ok: typeof status === "number" && status < 300, status, dados: dados as Record<string, unknown> | null, ms };
  }, []);

  const emitir = useCallback(
    async (eventos: { tipo: string; dados: unknown }[]) => {
      if (!r.current.sessao || !eventos.length) return;
      const base = Date.now();
      await chamar("eventos", "POST", `/api/sessoes/${r.current.sessao}/eventos`, {
        eventos: eventos.map((e, i) => ({ horario: new Date(base + i).toISOString(), tipo: e.tipo, dados: e.dados })),
      });
    },
    [chamar],
  );

  const dizer = useCallback((quem: Msg["quem"], t: string) => {
    r.current.conversa = [...r.current.conversa, { quem, texto: t }];
    setConversa(r.current.conversa);
  }, []);

  const atualizarFase = useCallback((f: Fase) => {
    r.current.fase = f;
    setFaseEstado(f);
  }, []);

  const atualizarEstado = useCallback(async () => {
    if (!r.current.sessao) return;
    const res = await chamar("estado", "GET", `/api/dev/sessoes/${r.current.sessao}/estado`);
    if (!res.ok || !res.dados) return;
    const e = res.dados as unknown as EstadoServidor;
    setEstado(e);
    // O servidor pode adiantar a fase (5ª resposta leva ao FECHAMENTO, como no quadro).
    const idx = FASES.indexOf(e.fase as Fase);
    if (idx > FASES.indexOf(r.current.fase)) {
      atualizarFase(e.fase as Fase);
      aviso(`O servidor avançou a fase para ${e.fase}.`);
    }
  }, [chamar, atualizarFase, aviso]);

  // ---------------------------------------------------------------------------------------------
  // Iniciar
  // ---------------------------------------------------------------------------------------------
  async function iniciar() {
    setScorecard(null);
    setErroScorecard(null);
    setAvisos([]);
    setLogs({});
    setPendente(null);
    setAtiva(null);
    setRequisitos([]);
    setEstado(null);
    r.current = { ...r.current, sessao: null, conversa: [], clicadas: 0, ultimoClique: 0, finalFeita: false, pendente: null, ativa: false, fragmentos: [], rodando: false, fila: null, baseAnalisada: grafo, baseEventos: grafo };
    setConversa([]);
    const res = await chamar("criar_sessao", "POST", "/api/sessoes", { avaliacao_id: avaliacao.trim(), candidato_id: "dev-texto" });
    if (!res.ok || !res.dados) {
      aviso(`Não criou a sessão (${res.status}): ${String((res.dados as { erro?: string } | null)?.erro ?? "erro")}`);
      return;
    }
    const d = res.dados as { sessao_id: string; problema: { titulo: string; enunciado: string } };
    r.current.sessao = d.sessao_id;
    setSessaoId(d.sessao_id);
    setProblema(d.problema);
    atualizarFase("REQUISITOS");
    dizer("agente", d.problema.enunciado);
    await emitir([{ tipo: "fala", dados: { quem: "agente", texto: d.problema.enunciado } }, { tipo: "fase", dados: { fase: "REQUISITOS" } }]);
    await atualizarEstado();
  }

  // ---------------------------------------------------------------------------------------------
  // Análise (uma por vez; "o último vence")
  // ---------------------------------------------------------------------------------------------
  const tratarResposta = useCallback(
    (a: Analise) => {
      void emitir([{ tipo: "analise", dados: a }]);
      if (r.current.ativa) return; // o candidato está no meio de uma resposta
      const f = r.current.fase;
      const permitido = (PLINS[f] ?? []).includes(a.status) && !!a.pergunta?.trim();
      const limite = f === "FECHAMENTO" ? r.current.finalFeita : r.current.clicadas >= MAX_PERGUNTAS;
      const intervalo = Date.now() - r.current.ultimoClique < INTERVALO_MS && r.current.ultimoClique > 0;
      if (a.status === "ok") {
        r.current.pendente = null;
        setPendente(null);
      } else if (permitido && !limite && !intervalo) {
        const p = { pergunta: a.pergunta ?? "", nota: a.nota, elementos: a.elementos };
        r.current.pendente = p;
        setPendente(p);
      }
    },
    [emitir],
  );

  const executarAnalise = useCallback(
    async (forcar: boolean) => {
      const s = r.current;
      if (!s.sessao || s.ativa || s.fase === "ENCERRADA") return;
      if (s.rodando) {
        s.fila = (s.fila ?? false) || forcar;
        return;
      }
      const d = diffGrafo(s.baseAnalisada, s.grafo);
      const mudancas = d.texto || (forcar ? "(o candidato terminou de responder)" : "");
      if (!mudancas) {
        aviso("Sem mudanças no desenho desde a última análise: nada a analisar.");
        return;
      }
      s.rodando = true;
      setAnalisando(true);
      s.baseAnalisada = s.grafo;
      try {
        const res = await chamar("analisar", "POST", `/api/sessoes/${s.sessao}/analisar`, {
          sessao_id: s.sessao,
          fase: s.fase,
          grafo: s.grafo,
          mudancas,
          conversa_recente: s.conversa.slice(-8).map((m) => ({ quem: m.quem, texto: m.texto })),
          perguntas_feitas: s.clicadas,
          imagem_url: null,
        });
        if (res.ms > LIMITE_ANALISE_MS) aviso(`Análise levou ${res.ms} ms (> 8 s): o quadro real descartaria esta resposta.`);
        else if (res.ok && res.dados) tratarResposta(res.dados as unknown as Analise);
        else aviso(`/analisar falhou (${res.status}).`);
      } finally {
        s.rodando = false;
        setAnalisando(false);
        await atualizarEstado();
        if (s.fila !== null) {
          const f = s.fila;
          s.fila = null;
          void executarAnalise(f);
        }
      }
    },
    [chamar, tratarResposta, atualizarEstado, aviso],
  );

  async function enviarDesenho() {
    const s = r.current;
    if (!s.sessao) return;
    s.grafo = grafo;
    const d = diffGrafo(s.baseEventos, grafo);
    if (!d.texto) {
      aviso("O desenho não mudou desde o último envio.");
      return;
    }
    s.baseEventos = grafo;
    // Como no quadro: o primeiro desenho encerra REQUISITOS.
    if (s.fase === "REQUISITOS") {
      atualizarFase("ALTO_NIVEL");
      await emitir([{ tipo: "fase", dados: { fase: "ALTO_NIVEL" } }]);
    }
    await emitir([{ tipo: "desenho", dados: { grafo, mudancas: d.texto, ids: d.ids } }]);
    // Se o desenho mexeu no que a dúvida pendente cita, o servidor a expira: espelha aqui.
    if (s.pendente?.elementos.some((id) => d.ids.includes(id))) {
      s.pendente = null;
      setPendente(null);
      aviso("Você mexeu num elemento citado: a dúvida pendente expirou.");
    }
    await executarAnalise(false);
  }

  // ---------------------------------------------------------------------------------------------
  // Plin, fala, resposta
  // ---------------------------------------------------------------------------------------------
  async function clicarPlin() {
    const p = r.current.pendente;
    if (!p) return;
    r.current.pendente = null;
    r.current.ativa = true;
    r.current.fragmentos = [];
    r.current.clicadas += 1;
    r.current.ultimoClique = Date.now();
    if (r.current.fase === "FECHAMENTO") r.current.finalFeita = true;
    setPendente(null);
    setAtiva(p);
    dizer("agente", p.pergunta);
    await emitir([
      { tipo: "pergunta", dados: { pergunta: p.pergunta, nota: p.nota, elementos: p.elementos } },
      { tipo: "fala", dados: { quem: "agente", texto: p.pergunta } },
    ]);
    await atualizarEstado();
  }

  async function enviarTexto() {
    const t = texto.trim();
    if (!t || !r.current.sessao) return;
    setTexto("");
    dizer("candidato", t);
    if (r.current.ativa) {
      r.current.fragmentos.push(t);
      await emitir([{ tipo: "fala", dados: { quem: "candidato", texto: t } }]);
      return;
    }
    await emitir([{ tipo: "fala", dados: { quem: "candidato", texto: t } }]);
    const res = await chamar("perguntar", "POST", `/api/sessoes/${r.current.sessao}/perguntar`, {
      sessao_id: r.current.sessao,
      fase: r.current.fase,
      texto: t,
    });
    const d = res.dados as { responder?: boolean; texto?: string; requisito?: string | null } | null;
    if (res.ok && d?.responder && d.texto) {
      dizer("agente", d.texto);
      await emitir([{ tipo: "fala", dados: { quem: "agente", texto: d.texto } }]);
      const req = d.requisito;
      if (req) setRequisitos((x) => (x.includes(req) ? x : [...x, req]));
    } else if (!res.ok) aviso(`/perguntar falhou (${res.status}).`);
    await atualizarEstado();
  }

  async function terminarResposta() {
    if (!r.current.ativa) return;
    const t = r.current.fragmentos.join(" ").trim() || "(respondeu)";
    r.current.ativa = false;
    r.current.fragmentos = [];
    setAtiva(null);
    await emitir([{ tipo: "resposta", dados: { texto: t } }]);
    await atualizarEstado();
    // Como o quadro: ao fim da resposta, análise forçada.
    await executarAnalise(true);
  }

  // ---------------------------------------------------------------------------------------------
  // Fases e encerramento
  // ---------------------------------------------------------------------------------------------
  async function proximaFase() {
    const i = FASES.indexOf(r.current.fase);
    const nova = FASES[Math.min(i + 1, FASES.length - 2)];
    if (nova === r.current.fase) return;
    atualizarFase(nova);
    await emitir([{ tipo: "fase", dados: { fase: nova } }]);
    await atualizarEstado();
    if (r.current.pendente && !(PLINS[nova] ?? []).includes("duvida") && !(PLINS[nova] ?? []).includes("redirecionar")) {
      r.current.pendente = null;
      setPendente(null);
    }
  }

  async function encerrar() {
    if (!r.current.sessao) return;
    r.current.pendente = null;
    r.current.ativa = false;
    setPendente(null);
    setAtiva(null);
    atualizarFase("ENCERRADA");
    await emitir([{ tipo: "fase", dados: { fase: "ENCERRADA" } }]);
    setGerando(true);
    setErroScorecard(null);
    const res = await chamar("finalizar", "POST", `/api/sessoes/${r.current.sessao}/finalizar`, {}, 150_000);
    setGerando(false);
    if (res.ok && res.dados) setScorecard(res.dados as unknown as Scorecard);
    else setErroScorecard(String((res.dados as { erro?: string } | null)?.erro ?? `erro ${res.status}`));
    await atualizarEstado();
  }

  const destaque = new Set(ativa?.elementos ?? []);
  const ativaOuNaoEncerrada = sessaoId !== null && fase !== "ENCERRADA";

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 text-sm text-neutral-900">
      <h1 className="text-xl font-semibold">Entrevista por texto (teste local)</h1>

      <section className="flex flex-wrap items-end gap-2 rounded border bg-white p-3">
        <label className="flex flex-col gap-1">
          Avaliação
          <input className="rounded border px-2 py-1" value={avaliacao} onChange={(e) => setAvaliacao(e.target.value)} list="demos" />
          <datalist id="demos">{DEMOS.map((d) => <option key={d} value={d} />)}</datalist>
        </label>
        <select className="rounded border px-2 py-1" value="" onChange={(e) => e.target.value && setAvaliacao(e.target.value)}>
          <option value="">demos...</option>
          {DEMOS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button className="rounded bg-black px-3 py-1 text-white" onClick={iniciar}>Iniciar</button>
        {sessaoId && <span className="text-neutral-500">sessão {sessaoId}</span>}
      </section>

      {problema && (
        <section className="rounded border bg-white p-3">
          <h2 className="font-semibold">{problema.titulo}</h2>
          <p className="whitespace-pre-wrap">{problema.enunciado}</p>
        </section>
      )}

      {sessaoId && (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded border bg-neutral-100 p-3 font-mono text-xs">
          <span>fase: <b>{fase}</b></span>
          <span>servidor: {estado?.fase ?? "-"} / plin {estado?.plin ?? "-"}</span>
          <span>perguntas feitas: <b>{estado?.perguntasFeitas ?? 0}</b>/{MAX_PERGUNTAS}</span>
          <span>plin pendente: <b>{estado?.plinPendente ? "sim" : "não"}</b></span>
          <span>observações: {estado?.observacoes ?? 0}</span>
          <span>análises: {estado?.analises ?? 0}</span>
          <span>sem evidência: {estado?.criteriosSemEvidencia.join(", ") || "(nenhum)"}</span>
          {analisando && <span className="text-blue-700">analisando...</span>}
        </section>
      )}

      {avisos.length > 0 && (
        <ul className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
          {avisos.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}

      {ativaOuNaoEncerrada && (
        <div className="flex flex-wrap gap-2">
          <button className="rounded border px-3 py-1" onClick={proximaFase} disabled={fase === "FECHAMENTO"}>Próxima fase</button>
          <button className="rounded border border-red-400 px-3 py-1 text-red-700" onClick={encerrar}>Encerrar entrevista</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2 rounded border bg-white p-3">
          <h2 className="font-semibold">Quadro simulado (grafo)</h2>
          <div className="flex flex-wrap gap-2">
            <button className="rounded border px-2 py-1" onClick={() => setGrafo(GRAFO_RUIM)}>Exemplo ruim (encurtador)</button>
            <button className="rounded border px-2 py-1" onClick={() => setGrafo(GRAFO_BOM)}>Exemplo bom (encurtador)</button>
            <button className="rounded border px-2 py-1" onClick={() => setGrafo(GRAFO_MODELO)}>Modelo vazio</button>
          </div>
          <textarea
            className="h-80 w-full rounded border p-2 font-mono text-xs"
            spellCheck={false}
            value={grafo}
            onChange={(e) => setGrafo(e.target.value)}
          />
          {destaque.size > 0 && (
            <pre className="whitespace-pre-wrap rounded border bg-neutral-50 p-2 font-mono text-xs">
              {grafo.split("\n").map((linha, i) => {
                const id = linha.match(/^\s*- \[([^\]]+)\]/)?.[1];
                return (
                  <span key={i} className={id && destaque.has(id) ? "bg-yellow-200" : undefined}>
                    {linha}
                    {"\n"}
                  </span>
                );
              })}
            </pre>
          )}
          <button className="rounded bg-black px-3 py-1 text-white disabled:opacity-40" onClick={enviarDesenho} disabled={!ativaOuNaoEncerrada || !!ativa}>
            Enviar desenho
          </button>
          {ativa && <p className="text-xs text-neutral-500">Responda a pergunta antes de mexer no desenho (a análise fica em espera).</p>}
        </section>

        <section className="space-y-2 rounded border bg-white p-3">
          <h2 className="font-semibold">Conversa</h2>
          <div className="h-80 space-y-2 overflow-y-auto rounded border bg-neutral-50 p-2">
            {conversa.map((m, i) => (
              <div key={i} className={m.quem === "agente" ? "mr-8 rounded bg-blue-100 p-2" : "ml-8 rounded bg-green-100 p-2 text-right"}>
                <div className="text-[10px] uppercase text-neutral-500">{m.quem === "agente" ? "Entrevistador" : "Candidato"}</div>
                {m.texto}
              </div>
            ))}
          </div>
          {pendente && (
            <button className="rounded bg-amber-400 px-3 py-1 font-medium" onClick={clicarPlin}>
              🔔 O entrevistador tem uma dúvida
            </button>
          )}
          {ativa && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
              Nota no quadro: <b>{ativa.nota ?? "-"}</b> · elementos citados: {ativa.elementos.join(", ") || "nenhum"}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void enviarTexto();
            }}
          >
            <input
              className="flex-1 rounded border px-2 py-1"
              placeholder={ativa ? "Sua resposta à dúvida..." : "Fale com o entrevistador (ex.: qual a escala?)"}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={!ativaOuNaoEncerrada}
            />
            <button className="rounded border px-3 py-1" disabled={!ativaOuNaoEncerrada}>Enviar</button>
          </form>
          {ativa && (
            <button className="rounded bg-green-600 px-3 py-1 text-white" onClick={terminarResposta}>Terminei de responder</button>
          )}
          <div>
            <h3 className="font-semibold">Requisitos combinados</h3>
            <ul className="list-inside list-disc text-xs">
              {requisitos.length ? requisitos.map((q) => <li key={q}>{q}</li>) : <li className="list-none text-neutral-500">(nenhum ainda)</li>}
            </ul>
          </div>
        </section>
      </div>

      {gerando && <p className="rounded border bg-white p-3">Gerando o scorecard... (com o modelo real pode levar até 2 minutos)</p>}
      {erroScorecard && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{erroScorecard}</p>}
      {scorecard && <PainelScorecard sc={scorecard} />}

      <details className="rounded border bg-white p-3">
        <summary className="cursor-pointer font-semibold">Log bruto (última chamada de cada rota)</summary>
        {Object.entries(logs).map(([k, v]) => (
          <details key={k} className="mt-2">
            <summary className="cursor-pointer font-mono text-xs">{k} · {String(v.status)} · {v.ms} ms · {v.quando}</summary>
            <pre className="max-h-64 overflow-auto bg-neutral-50 p-2 text-[11px]">{JSON.stringify({ req: v.req, res: v.res }, null, 2)}</pre>
          </details>
        ))}
      </details>
    </main>
  );
}

function PainelScorecard({ sc }: { sc: Scorecard }) {
  return (
    <section className="space-y-3 rounded border-2 border-black bg-white p-4">
      <h2 className="text-lg font-semibold">Scorecard (visão do recrutador)</h2>
      <p>
        Nota geral: <b>{sc.nota_geral ?? "sem nota"}</b> / 4 · <b>{ROTULO_RECOMENDACAO[sc.recomendacao] ?? sc.recomendacao}</b>{" "}
        <span className="text-xs text-neutral-500">(origem: {sc.origem})</span>
      </p>
      <p className="text-xs text-neutral-600">
        A recomendação é só uma sugestão do sistema. Quem decide se o candidato avança é uma pessoa. O candidato nunca vê esta tela.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {sc.criterios.map((c) => (
          <div key={c.criterio} className="rounded border p-2">
            <div className="font-semibold">{c.criterio}: {c.nota ?? "sem nota"}</div>
            <p>{c.justificativa}</p>
            <ul className="mt-1 space-y-1 text-xs">
              {c.evidencias.map((e, i) => (
                <li key={i} className="rounded bg-neutral-100 p-1">
                  <b>{e.tipo}</b> {e.horario}
                  {e.texto && <> · “{e.texto}”</>}
                  {e.elementos?.length ? <> · elementos: {e.elementos.join(", ")}</> : null}
                  {e.imagem && <> · {e.imagem}</>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><h3 className="font-semibold">Pontos fortes</h3><ul className="list-inside list-disc">{sc.pontos_fortes.map((p) => <li key={p}>{p}</li>)}</ul></div>
        <div><h3 className="font-semibold">A aprofundar</h3><ul className="list-inside list-disc">{sc.pontos_a_aprofundar.map((p) => <li key={p}>{p}</li>)}</ul></div>
      </div>
      <div><h3 className="font-semibold">Briefing para a próxima etapa</h3><p>{sc.briefing_para_proxima_etapa}</p></div>
      {sc.ajustes.length > 0 && (
        <details><summary className="cursor-pointer text-xs">Correções automáticas aplicadas ({sc.ajustes.length})</summary>
          <ul className="list-inside list-disc text-xs">{sc.ajustes.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
