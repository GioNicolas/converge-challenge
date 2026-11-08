"use client";

// Ferramenta local de teste: cola uma vaga, conversa com o agente para definir o plano da
// entrevista, aprova (gera o kit) e abre a entrevista. Não faz parte do produto.
import { useEffect, useRef, useState } from "react";
import type { InterviewPlan, JobPosting } from "@/lib/hiring/job-posting";
import { vagaDeExemplo } from "@/lib/agente/planejamento/vaga-exemplo";

type Turno = { quem: "usuario" | "agente"; texto: string };
type Estado = { fake: boolean; temChave: boolean; modeloPlanejamento: string; modeloFinal: string };
type Resumo = { area: string; persona: string; titulo: string; criterios: string[] };

const campo = "w-full rounded-lg border border-borda bg-superficie p-3 text-sm";
const botao = "rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const botaoCinza = "rounded-lg bg-superficie-2 px-4 py-2 text-sm font-medium disabled:opacity-50";

async function postar<T>(url: string, corpo: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = (await res.json().catch(() => ({}))) as T & { erro?: string; detalhes?: unknown };
  if (!res.ok) throw new Error(dados.erro ?? `HTTP ${res.status}`);
  return dados;
}

function PlanoVista({ plano }: { plano: InterviewPlan }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>{plano.summary}</p>
      <div>
        <h3 className="mb-1 font-semibold">Etapas</h3>
        <table className="w-full text-left">
          <thead className="text-xs text-texto-suave">
            <tr>
              <th className="py-1 pr-2">Ferramenta</th>
              <th className="py-1 pr-2">Min</th>
              <th className="py-1 pr-2">Desafio</th>
              <th className="py-1">Por quê</th>
            </tr>
          </thead>
          <tbody>
            {plano.stages.map((e, i) => (
              <tr key={i} className="border-t border-borda align-top">
                <td className="py-1 pr-2">{e.tool}</td>
                <td className="py-1 pr-2">{e.minutes}</td>
                <td className="py-1 pr-2">
                  <strong>{e.challenge.title}</strong>
                  <br />
                  {e.challenge.brief}
                </td>
                <td className="py-1">{e.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="mb-1 font-semibold">Pontos de foco</h3>
        <ul className="flex flex-col gap-1">
          {plano.focusPoints.map((f, i) => (
            <li key={i}>
              <strong>{Math.round(f.weight * 100)}%</strong> {f.topic}
              <br />
              <span className="text-texto-suave">na vaga: “{f.evidenceFromPosting}”</span>
            </li>
          ))}
        </ul>
      </div>
      {plano.outOfScope.length > 0 && (
        <div>
          <h3 className="mb-1 font-semibold">Fora de escopo</h3>
          <ul className="list-disc pl-5">
            {plano.outOfScope.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PaginaVagaInterno() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [descricao, setDescricao] = useState("");
  const [indiceExemplo, setIndiceExemplo] = useState(() => Math.floor(Math.random() * 10));
  const [historico, setHistorico] = useState<Turno[]>([]);
  const [iniciada, setIniciada] = useState(false);
  const [vaga, setVaga] = useState<JobPosting | null>(null);
  const [plano, setPlano] = useState<InterviewPlan | null>(null);
  const [resposta, setResposta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avaliacao, setAvaliacao] = useState<{ id: string; resumo: Resumo } | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/dev/estado")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setEstado)
      .catch((e) => setErro(`Não consegui ler o estado: ${e.message}`));
  }, []);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [historico, ocupado]);

  function gerarExemplo() {
    setDescricao(vagaDeExemplo(indiceExemplo).texto);
    setIndiceExemplo((i) => i + 1);
  }

  async function turno(novoHistorico: Turno[], vagaAtual: JobPosting | null, planoAtual: InterviewPlan | null) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await postar<{ mensagem: string; vaga: JobPosting | null; plano: InterviewPlan | null; diagnostico?: string }>(
        "/api/dev/plano",
        { descricao, historico: novoHistorico, vaga: vagaAtual, plano: planoAtual },
      );
      setHistorico([
        ...novoHistorico,
        { quem: "agente", texto: r.diagnostico ? `${r.mensagem}

[detalhe técnico: ${r.diagnostico}]` : r.mensagem },
      ]);
      setVaga(r.vaga);
      setPlano(r.plano);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function comecar() {
    setIniciada(true);
    setHistorico([]);
    setVaga(null);
    setPlano(null);
    setAvaliacao(null);
    void turno([], null, null);
  }

  function enviar() {
    const texto = resposta.trim();
    if (!texto || ocupado) return;
    setResposta("");
    const novo = [...historico, { quem: "usuario" as const, texto }];
    setHistorico(novo);
    void turno(novo, vaga, plano);
  }

  async function aprovar() {
    if (!vaga || !plano) return;
    if (!window.confirm("Isto chama o Opus: ~70–100 s e ~US$ 0,15. Continuar?")) return;
    setAprovando(true);
    setErro(null);
    try {
      const r = await postar<{ avaliacao_id: string; resumo: Resumo }>("/api/dev/plano/aprovar", { vaga, plano });
      setAvaliacao({ id: r.avaliacao_id, resumo: r.resumo });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAprovando(false);
    }
  }

  return (
    <main className="min-h-dvh bg-fundo px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-semibold">Plano de entrevista a partir da vaga (teste local)</h1>
          <p className="text-sm text-texto-suave">
            {estado
              ? `${estado.fake ? "MODO FAKE (AGENTE_FAKE=1): sem custo, respostas de mentira." : estado.temChave ? "Modelo real." : "SEM CHAVE e sem AGENTE_FAKE: as chamadas vão falhar."} Planejamento: ${estado.modeloPlanejamento} · Kit final: ${estado.modeloFinal}`
              : "Lendo estado..."}
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <textarea
            className={campo}
            rows={8}
            placeholder="Cole aqui a descrição da vaga"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <div className="flex gap-2">
            <button className={botaoCinza} onClick={gerarExemplo} disabled={ocupado}>
              Gerar vaga de exemplo
            </button>
            <button className={botao} onClick={comecar} disabled={ocupado || !descricao.trim()}>
              Começar conversa
            </button>
          </div>
        </section>

        {erro && <p className="rounded-lg bg-red-100 p-3 text-sm text-red-800">Erro: {erro}</p>}

        {iniciada && (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-lg bg-superficie p-4">
              <h2 className="font-semibold">Conversa</h2>
              <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto text-sm">
                {historico.map((t, i) => (
                  <p key={i} className={t.quem === "agente" ? "rounded-lg bg-marca-suave p-2" : "rounded-lg bg-superficie-2 p-2"}>
                    <strong>{t.quem === "agente" ? "Agente" : "Você"}:</strong> {t.texto}
                  </p>
                ))}
                {ocupado && <p className="text-texto-suave">Agente pensando...</p>}
                <div ref={fim} />
              </div>
              <div className="flex gap-2">
                <input
                  className={campo}
                  placeholder="Responda ou peça mudanças no plano"
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                  disabled={ocupado}
                />
                <button className={botao} onClick={enviar} disabled={ocupado || !resposta.trim()}>
                  Enviar
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg bg-superficie p-4">
              <h2 className="font-semibold">Plano{vaga ? `: ${vaga.title}` : ""}</h2>
              {plano ? <PlanoVista plano={plano} /> : <p className="text-sm text-texto-suave">Ainda sem plano.</p>}
              {plano && !avaliacao && (
                <>
                  <p className="text-sm text-alerta">Atenção: aprovar chama o Opus (~70–100 s, ~US$ 0,15).</p>
                  <button className={botao} onClick={aprovar} disabled={aprovando || ocupado}>
                    {aprovando ? "Gerando entrevista (aguarde ~1–2 min)..." : "Aprovar plano e gerar entrevista"}
                  </button>
                  {aprovando && <p className="animate-pulse text-sm">Gerando o kit...</p>}
                </>
              )}
              {avaliacao && (
                <div className="flex flex-col gap-1 rounded-lg bg-marca-suave p-3 text-sm">
                  <p>
                    Entrevista gerada e aprovada. avaliacao_id: <code>{avaliacao.id}</code>
                  </p>
                  <p>
                    {avaliacao.resumo.area} · {avaliacao.resumo.persona}
                  </p>
                  <p>Desafio: {avaliacao.resumo.titulo}</p>
                  <p>Critérios: {avaliacao.resumo.criterios.join(", ")}</p>
                  <a className="font-medium text-marca underline" href={`/dev/entrevista-texto?avaliacao=${avaliacao.id}`}>
                    Iniciar a entrevista
                  </a>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

// Página do quadro: tema claro (o resto do app é escuro); ver app/globals.css.
export default function PaginaVaga() {
  return (
    <div className="tema-quadro-pagina contents">
      <PaginaVagaInterno />
    </div>
  );
}
