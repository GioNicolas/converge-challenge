"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { InterviewConfig } from "@/lib/contracts";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import type { EventoLog, TipoEvento } from "@/lib/pre-entrevista/log";
import type { EstadoSessao } from "@/lib/pre-entrevista/sessoes";
import type { Origem } from "@/lib/pre-entrevista/rascunho";
import { useTranscricao } from "@/lib/transcricao/useTranscricao";
import { acrescentarFala } from "@/lib/transcricao/tipos";
import { DICA_DITADO_ENTER, useEnterDoDitado } from "@/lib/transcricao/enterDoDitado";
import { BotaoDitado, EstadoDitado } from "@/components/transcricao/ControleDitado";
import { useVozAgente } from "@/lib/voz/useVozAgente";
import ControleVoz from "@/components/voz/ControleVoz";

const API = "/api/pre-entrevista/sessoes";

const TIPOS: TipoEvento[] = [
  "sessao_criada",
  "classificacao",
  "competencias",
  "fala_recrutadora",
  "fala_agente",
  "extracao",
  "cobertura",
  "plano",
  "rascunho_atualizado",
  "finalizacao",
  "erro",
  "aviso",
];

const COR_TIPO: Record<TipoEvento, string> = {
  sessao_criada: "bg-slate-200 text-slate-800",
  classificacao: "bg-blue-100 text-blue-800",
  competencias: "bg-sky-100 text-sky-900",
  fala_recrutadora: "bg-emerald-100 text-emerald-800",
  fala_agente: "bg-indigo-100 text-indigo-800",
  extracao: "bg-amber-100 text-amber-900",
  cobertura: "bg-cyan-100 text-cyan-900",
  plano: "bg-fuchsia-100 text-fuchsia-900",
  rascunho_atualizado: "bg-violet-100 text-violet-800",
  finalizacao: "bg-teal-100 text-teal-800",
  erro: "bg-red-100 text-red-800",
  aviso: "bg-yellow-100 text-yellow-900",
};

const NOME_AREA: Record<string, string> = {
  tecnico: "domínio técnico",
  pressao: "pressão e adaptação",
  escala_produto: "escala e produto",
  uso_ia: "IA aplicada",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** De onde veio um critério: a fala dela (com o número da fala) ou o catálogo. */
function descreverOrigem(origem: Origem | undefined): string {
  if (origem && origem !== "catalogo") return `de onde veio: '${origem.fala}' (fala ${origem.turno})`;
  return "sugestão do catálogo";
}

function Selo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${className ?? "bg-neutral-200"}`}>{children}</span>;
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{titulo}</h2>
      {children}
    </section>
  );
}

/** Formato dos erros da API: `erro` (resumo), `detalhe` e, na validação, a lista `erros`. */
type CorpoErro = { erro?: string; detalhe?: string; erros?: string[] };

function textoDeErro(j: CorpoErro, status: number): string {
  const partes = [j.erro, j.detalhe, ...(j.erros ?? [])].filter((p): p is string => Boolean(p));
  return partes.join(" — ") || `HTTP ${status}`;
}

async function mensagemDeErro(r: Response): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as CorpoErro;
  return textoDeErro(j, r.status);
}

export default function PaginaPreEntrevista() {
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoSessao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário inicial
  const [cargo, setCargo] = useState("");
  const [vaga, setVaga] = useState("");
  const [contexto, setContexto] = useState("");
  const [criando, setCriando] = useState(false);

  // Conversa
  const [fala, setFala] = useState("");
  const [enviando, setEnviando] = useState(false);
  const listaConversaRef = useRef<HTMLDivElement>(null);
  const campoFalaRef = useRef<HTMLTextAreaElement>(null);

  // Logs
  const [filtro, setFiltro] = useState<"todos" | TipoEvento>("todos");
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set());
  const listaLogsRef = useRef<HTMLDivElement>(null);

  // Revisão e confirmação
  const [revisando, setRevisando] = useState(false);
  const [jsonRevisao, setJsonRevisao] = useState("");
  const [erroRevisao, setErroRevisao] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [final, setFinal] = useState<{ config?: InterviewConfig; erros?: string[] } | null>(null);
  const ditado = useTranscricao({
    bloqueada: enviando || !sessaoId || revisando || finalizando || !!final,
    aoTexto: (texto) => setFala((atual) => acrescentarFala(atual, texto)),
  });
  const ultimaFala = estado?.transcricao.at(-1);
  const voz = useVozAgente({
    ultimaFala: ultimaFala?.role === "agente" ? { id: `${sessaoId}:${estado?.transcricao.length}`, texto: ultimaFala.text } : null,
    bloqueada: enviando || !sessaoId || revisando || finalizando || !!final,
  });

  // Atualiza o estado da sessão a cada 1 s enquanto ela está aberta.
  useEffect(() => {
    if (!sessaoId) return;
    let ativo = true;
    const buscar = async () => {
      try {
        const r = await fetch(`${API}/${sessaoId}`, { cache: "no-store" });
        if (!r.ok) {
          if (ativo) setErro(`não consegui atualizar a sessão (${await mensagemDeErro(r)})`);
          return;
        }
        const json = (await r.json()) as EstadoSessao;
        if (ativo) setEstado(json);
      } catch (err) {
        if (ativo) setErro(`sem conexão com o servidor: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void buscar();
    const timer = setInterval(buscar, 1000);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [sessaoId]);

  // Mantém a conversa e os logs rolando para o fim quando chegam itens novos.
  const quantidadeFalas = estado?.transcricao.length ?? 0;
  const quantidadeLogs = estado?.logs.length ?? 0;
  useEffect(() => {
    const conversa = listaConversaRef.current;
    if (conversa) conversa.scrollTop = conversa.scrollHeight;
  }, [quantidadeFalas, enviando]);
  useEffect(() => {
    const logs = listaLogsRef.current;
    if (logs) logs.scrollTop = logs.scrollHeight;
  }, [quantidadeLogs]);

  function preencherExemplo() {
    const exemplo = VAGAS.find((v) => v.id === "ia-pleno");
    if (!exemplo) return;
    setCargo(exemplo.roleTitle);
    setVaga(exemplo.jobDescription);
    setContexto(exemplo.context ?? "");
  }

  async function criarSessao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (criando) return;
    setCriando(true);
    setErro(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleTitle: cargo, jobDescription: vaga, context: contexto || undefined }),
      });
      if (!r.ok) {
        setErro(`não consegui criar a sessão (${await mensagemDeErro(r)})`);
        return;
      }
      const json = (await r.json()) as EstadoSessao;
      setEstado(json);
      setSessaoId(json.id);
    } catch (err) {
      setErro(`sem conexão com o servidor: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCriando(false);
    }
  }

  async function enviarFala() {
    const texto = fala.trim();
    if (!sessaoId || !texto || enviando || ditado.ativa) return;
    voz.parar();
    setEnviando(true);
    setErro(null);
    setFala("");
    try {
      const r = await fetch(`${API}/${sessaoId}/mensagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto }),
      });
      const json = (await r.json().catch(() => ({}))) as Partial<EstadoSessao> & CorpoErro & { estado?: EstadoSessao };
      if (!r.ok) {
        // A fala foi desfeita no servidor: devolve o texto para reenviar.
        setFala(texto);
        setErro(textoDeErro(json, r.status));
        if (json.estado) setEstado(json.estado);
        return;
      }
      setEstado(json as EstadoSessao);
    } catch (err) {
      setFala(texto);
      setErro(`sem conexão com o servidor: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnviando(false);
    }
  }

  // Enter com o microfone ligado para de ouvir; o Enter seguinte envia o que foi transcrito.
  const teclaNaFala = useEnterDoDitado(ditado, () => void enviarFala());

  function abrirRevisao() {
    if (!estado) return;
    setJsonRevisao(JSON.stringify(estado.rascunho, null, 2));
    setErroRevisao(null);
    setFinal(null);
    setRevisando(true);
  }

  async function confirmarRevisao() {
    if (!sessaoId) return;
    let rascunho: unknown;
    try {
      rascunho = JSON.parse(jsonRevisao);
    } catch (err) {
      setErroRevisao(`JSON inválido: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setFinalizando(true);
    setErroRevisao(null);
    try {
      const r = await fetch(`${API}/${sessaoId}/finalizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rascunho }),
      });
      const json = (await r.json().catch(() => ({}))) as CorpoErro & { ok?: boolean; config?: InterviewConfig };
      if (r.ok && json.ok && json.config) setFinal({ config: json.config });
      else if (r.status === 422) setFinal({ erros: json.erros ?? ["configuração inválida"] });
      else setErroRevisao(textoDeErro(json, r.status));
    } catch (err) {
      setErroRevisao(`sem conexão com o servidor: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFinalizando(false);
    }
  }

  function alternarLog(id: number) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function novaSessao() {
    setSessaoId(null);
    setEstado(null);
    setFala("");
    setErro(null);
    setRevisando(false);
    setFinal(null);
    setAbertos(new Set());
  }

  // ---------------------------------------------------------------------------
  // Formulário inicial
  // ---------------------------------------------------------------------------
  if (!sessaoId || !estado) {
    return (
      <div className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900">
        <main className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Pré-entrevista</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Cole a vaga. O Totti classifica o formato e a senioridade e conversa com você para montar a entrevista.
          </p>
          <form onSubmit={criarSessao} className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <label className="block">
              <span className="text-sm font-medium">Cargo</span>
              <input
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Descrição da vaga</span>
              <textarea
                value={vaga}
                onChange={(e) => setVaga(e.target.value)}
                required
                rows={14}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Contexto (opcional)</span>
              <textarea
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            {erro && <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{erro}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={criando}
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {criando ? "Classificando a vaga…" : "Criar sessão"}
              </button>
              <button
                type="button"
                onClick={preencherExemplo}
                disabled={criando}
                className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Preencher exemplo
              </button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Sessão: conversa, rascunho ao vivo e logs
  // ---------------------------------------------------------------------------
  const r = estado.rascunho;
  const encerrando = estado.planejamento.passo?.tipo === "encerrar";
  const logsFiltrados = estado.logs.filter((l) => filtro === "todos" || l.tipo === filtro);

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-6 text-neutral-900">
      <header className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{estado.vaga.roleTitle}</h1>
          <p className="font-mono text-xs text-neutral-500">
            sessão {estado.id} · {estado.logs.length} eventos
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={abrirRevisao}
            className={`rounded px-3 py-2 text-sm font-medium text-white ${encerrando ? "bg-emerald-700 ring-2 ring-emerald-300" : "bg-neutral-900"}`}
          >
            Revisar e confirmar
          </button>
          <button onClick={novaSessao} className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-medium">
            Nova sessão
          </button>
        </div>
      </header>

      {erro && <p className="mx-auto mb-4 max-w-7xl rounded bg-red-100 px-3 py-2 text-sm text-red-800">{erro}</p>}

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna 1: conversa */}
        <Bloco titulo="Conversa">
          <div ref={listaConversaRef} className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {estado.transcricao.map((t, i) => (
              <div key={i} className={`rounded px-3 py-2 text-sm ${t.role === "agente" ? "bg-indigo-50" : "bg-emerald-50"}`}>
                <p className="text-xs font-semibold text-neutral-500">{t.role === "agente" ? "Totti" : "Recrutadora"}</p>
                <p className="whitespace-pre-wrap">{t.text}</p>
              </div>
            ))}
            {enviando && <p className="text-sm italic text-neutral-500">Totti está digitando…</p>}
          </div>
          <ControleVoz voz={voz} texto={ultimaFala?.role === "agente" ? ultimaFala.text : undefined} disabled={enviando || revisando || finalizando || !!final} />
          <div className="mt-3 flex gap-2">
            <textarea
              ref={campoFalaRef}
              value={fala}
              readOnly={ditado.ativa}
              onChange={(e) => setFala(e.target.value)}
              onKeyDown={teclaNaFala}
              disabled={enviando}
              rows={2}
              placeholder="Responda ao Totti (Enter envia, Shift+Enter quebra linha)"
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100"
            />
            <BotaoDitado transcricao={ditado} campo={campoFalaRef} disabled={enviando} />
            <button
              onClick={() => void enviarFala()}
              disabled={enviando || !fala.trim() || ditado.ativa}
              className="rounded bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
          <EstadoDitado transcricao={ditado} dica={DICA_DITADO_ENTER} />
        </Bloco>

        {/* Coluna 2: rascunho ao vivo */}
        <Bloco titulo="Rascunho ao vivo">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Selo className="bg-blue-100 text-blue-800">{r.mode}</Selo>
            <Selo className="bg-blue-100 text-blue-800">{r.seniority}</Selo>
            {estado.status.extraindo && <Selo className="bg-amber-200 text-amber-900">extraindo…</Selo>}
            <span className="text-xs text-neutral-500">
              confirmado: mode {r.confirmado.mode ? "sim" : "não"}, senioridade {r.confirmado.seniority ? "sim" : "não"}, foco{" "}
              {r.confirmado.focus ? "sim" : "não"}
            </span>
          </div>

          <h3 className="mb-1 text-xs font-semibold text-neutral-500">Foco</h3>
          <ul className="mb-3 space-y-1 text-sm">
            {r.focus.map((f) => (
              <li key={f.area} className="flex items-center gap-2">
                <span className="w-40 shrink-0">{NOME_AREA[f.area] ?? f.area}</span>
                <div className="h-2 flex-1 rounded bg-neutral-200">
                  <div className="h-2 rounded bg-neutral-800" style={{ width: pct(f.weight) }} />
                </div>
                <span className="w-10 text-right font-mono text-xs">{f.weight.toFixed(2)}</span>
              </li>
            ))}
          </ul>

          <h3 className="mb-1 text-xs font-semibold text-neutral-500">Ênfase por área (0 a 3)</h3>
          <table className="mb-3 w-full text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="py-1 font-medium">Área</th>
                <th className="py-1 font-medium">Ênfase</th>
                <th className="py-1 font-medium">Origem</th>
                <th className="py-1 font-medium">Peso</th>
              </tr>
            </thead>
            <tbody>
              {estado.pesos.map((p) => (
                <tr key={p.area} className="border-t border-neutral-200">
                  <td className="py-1">{NOME_AREA[p.area] ?? p.area}</td>
                  <td className="py-1 font-mono text-xs">{p.enfase.toFixed(1)}</td>
                  <td className="py-1 text-xs text-neutral-500">
                    {p.origem}: {p.motivo}
                  </td>
                  <td className="py-1 font-mono text-xs">{p.noFoco ? p.peso.toFixed(2) : "fora"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mb-1 text-xs font-semibold text-neutral-500">Critérios ({r.criteria.length})</h3>
          <ul className="mb-3 max-h-48 space-y-2 overflow-y-auto text-sm">
            {r.criteria.map((c) => (
              <li key={c.id} className="rounded border border-neutral-200 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Selo>{c.focus}</Selo>
                  <span className="font-mono text-xs">peso {c.weight}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-600">{c.description}</p>
                <p className="mt-1 text-xs text-neutral-400">{descreverOrigem(r.origens?.[c.id])}</p>
              </li>
            ))}
          </ul>

          <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-neutral-500">Duração</dt>
            <dd>{r.durationMin ? `${r.durationMin} min` : "padrão do modo"}</dd>
            <dt className="text-neutral-500">Notas</dt>
            <dd className="whitespace-pre-wrap">{r.recruiterNotes || "(vazio)"}</dd>
          </dl>

          <h3 className="mb-1 text-xs font-semibold text-neutral-500">Não avaliado nesta entrevista</h3>
          <p className="mb-3 text-sm">{estado.naoAvaliado.length ? estado.naoAvaliado.join(", ") : "(nada)"}</p>

          <h3 className="mb-1 text-xs font-semibold text-neutral-500">Competências da vaga</h3>
          {estado.competencias.length === 0 ? (
            <p className="mb-3 text-sm text-neutral-500">(nenhuma extraída)</p>
          ) : (
            <table className="mb-3 w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="py-1 font-medium">Competência</th>
                  <th className="py-1 font-medium">Live coding</th>
                  <th className="py-1 font-medium">System design</th>
                </tr>
              </thead>
              <tbody>
                {estado.competencias.map((c) => (
                  <tr key={c.nome} className="border-t border-neutral-200">
                    <td className="py-1">{c.nome}</td>
                    <td className="py-1">{c.verificavel.live_coding ? "✅" : "❌"}</td>
                    <td className="py-1">{c.verificavel.system_design ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="mb-1 text-xs font-semibold text-neutral-500">Tópicos</h3>
          <table className="mb-3 w-full text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="py-1 font-medium">Tópico</th>
                <th className="py-1 font-medium">Cobertura</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {estado.topicos.map((t) => (
                <tr key={t.id} className="border-t border-neutral-200">
                  <td className="py-1 font-mono text-xs">{t.id}</td>
                  <td className="py-1 font-mono text-xs">{pct(t.cobertura)}</td>
                  <td className="py-1">{t.coberto ? "✅" : "⏳"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mb-3 space-y-1 rounded border border-fuchsia-200 bg-fuchsia-50 p-2 text-xs">
            <p>
              <span className="font-semibold text-neutral-600">Passo atual: </span>
              <span className="font-mono">{estado.planejamento.descricaoPasso ?? "(nenhum ainda)"}</span>
            </p>
            <p>
              <span className="font-semibold text-neutral-600">Em jogo: </span>
              <span className="font-mono">{estado.planejamento.emJogo.join(", ") || "nenhuma"}</span>
            </p>
            <p>
              <span className="font-semibold text-neutral-600">Perguntas por tópico: </span>
              <span className="font-mono">
                {Object.entries(estado.planejamento.perguntasPorTopico)
                  .map(([id, n]) => `${id}=${n}`)
                  .join("  ") || "nenhuma"}
              </span>
            </p>
            <p>
              <span className="font-semibold text-neutral-600">Resumos: </span>
              <span className="font-mono">{estado.planejamento.resumos}</span>
            </p>
          </div>

          {final && (
            <div className="mt-4 rounded border border-neutral-200 p-3 text-sm">
              {final.config ? (
                <>
                  <p className="font-medium text-emerald-800">Config final gerada: {final.config.id}</p>
                  <a href={`/api/configs/${final.config.id}`} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    /api/configs/{final.config.id}
                  </a>
                  <div className="mt-2">
                    <a
                      href={`${final.config.mode === "system_design" ? "/entrevista/system-design" : "/entrevista"}?config=${final.config.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block rounded bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-800"
                    >
                      Abrir a entrevista com esta config →
                    </a>
                    <a
                      href={`/?config=${final.config.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-block rounded border border-emerald-700 px-3 py-1.5 text-emerald-800 hover:bg-emerald-50"
                    >
                      Link do candidato (/?config={final.config.id})
                    </a>
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 text-xs text-neutral-100">
                    {JSON.stringify(final.config, null, 2)}
                  </pre>
                </>
              ) : (
                <>
                  <p className="font-medium text-red-800">Não dá para finalizar ainda:</p>
                  <ul className="list-inside list-disc text-red-800">
                    {final.erros?.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {revisando && (
            <div className="mt-4 space-y-2 rounded border border-neutral-300 p-3">
              <p className="text-xs text-neutral-500">Edite o rascunho (JSON) e confirme para gerar a config.</p>
              <ul className="space-y-1 text-xs text-neutral-400">
                {estado.rascunho.criteria.map((c) => (
                  <li key={c.id}>
                    {c.name}: {descreverOrigem(estado.rascunho.origens?.[c.id])}
                  </li>
                ))}
              </ul>
              <textarea
                value={jsonRevisao}
                onChange={(e) => setJsonRevisao(e.target.value)}
                rows={14}
                className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
              />
              {erroRevisao && <p className="rounded bg-red-100 px-2 py-1 text-xs text-red-800">{erroRevisao}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void confirmarRevisao()}
                  disabled={finalizando}
                  className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {finalizando ? "Confirmando…" : "Confirmar"}
                </button>
                <button onClick={() => setRevisando(false)} className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium">
                  Fechar
                </button>
              </div>
            </div>
          )}
        </Bloco>

        {/* Coluna 3: logs */}
        <Bloco titulo="Logs">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as "todos" | TipoEvento)}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value="todos">todos os tipos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <a
              href={`${API}/${estado.id}/log`}
              download
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm font-medium"
            >
              Baixar sessão (.json)
            </a>
          </div>
          <div ref={listaLogsRef} className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {logsFiltrados.length === 0 && <p className="text-sm text-neutral-500">Nenhum evento.</p>}
            {logsFiltrados.map((l: EventoLog) => (
              <div
                key={l.id}
                className={`rounded border-l-4 bg-white text-sm shadow-sm ${
                  l.nivel === "erro" ? "border-red-500" : l.nivel === "aviso" ? "border-yellow-500" : "border-neutral-200"
                }`}
              >
                <button onClick={() => alternarLog(l.id)} className="w-full px-2 py-1.5 text-left">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-neutral-500">
                      #{l.id} +{(l.t / 1000).toFixed(1)} s
                    </span>
                    <Selo className={COR_TIPO[l.tipo]}>{l.tipo}</Selo>
                    {l.fallback && <Selo className="bg-orange-200 text-orange-900">fallback</Selo>}
                    {l.ms !== undefined && <span className="font-mono text-xs text-neutral-500">{l.ms} ms</span>}
                    {l.provedor && (
                      <span className="font-mono text-xs text-neutral-500">
                        {l.provedor}
                        {l.model ? `/${l.model}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 break-words text-neutral-800">{l.resumo}</p>
                </button>
                {abertos.has(l.id) && (
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-neutral-200 bg-neutral-50 p-2 text-xs">
                    {JSON.stringify(l.dados, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Bloco>
      </div>
    </div>
  );
}
