"use client";

/**
 * Fim do relatório: a recrutadora (ou o tech lead) decide se o candidato avança. Confirma antes, o candidato recebe o
 * retorno por e-mail e o Totti aprende com a decisão (Memória da Squad). No relatório de exemplo, tudo é simulado.
 */
import { useEffect, useId, useState } from "react";
import type { SituacaoDaDecisao } from "@/app/api/decisao/route";
import type { Decisao, DecisaoRegistrada, SituacaoDoEmail } from "@/lib/vagas/decisao";

const VERBO: Record<Decisao, string> = { avancar: "avanço", nao_avancar: "reprovação" };
const NOME: Record<Decisao, string> = { avancar: "Avançou", nao_avancar: "Não avançou" };

/** O que aconteceu com o e-mail, sem prometer o que não saiu. */
function textoDoEmail(email: SituacaoDoEmail, candidato: string): string {
  switch (email) {
    case "enviado":
      return `E-mail de retorno enviado para ${candidato}.`;
    case "simulado":
      return "Nenhum e-mail saiu de verdade: candidato de demonstração ou envio desligado.";
    case "sem_candidato":
      return "Esta entrevista não veio de um convite, então não há e-mail para avisar.";
    case "falhou":
      return "O e-mail de retorno falhou. Avise o candidato por outro canal.";
  }
}

type Fase =
  | { tipo: "carregando" }
  | { tipo: "escolher" }
  | { tipo: "confirmar"; decisao: Decisao }
  | { tipo: "decidido"; registro: DecisaoRegistrada; agora: boolean };

export default function DecisaoFinal({ sessionId }: { sessionId: string }) {
  const [situacao, setSituacao] = useState<SituacaoDaDecisao>({});
  const [fase, setFase] = useState<Fase>({ tipo: "carregando" });
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);
  const idMotivo = useId();

  useEffect(() => {
    let vivo = true;
    fetch(`/api/decisao?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<SituacaoDaDecisao>) : {}))
      .catch(() => ({}))
      .then((s: SituacaoDaDecisao) => {
        if (!vivo) return;
        setSituacao(s);
        setFase(s.decisao ? { tipo: "decidido", registro: s.decisao, agora: false } : { tipo: "escolher" });
      });
    return () => {
      vivo = false;
    };
  }, [sessionId]);

  const candidato = situacao.candidato ?? "o candidato";
  const nomeCurto = situacao.candidato ?? "este candidato";

  const confirmar = async (decisao: Decisao) => {
    setEnviando(true);
    setErro(false);
    try {
      let registro: DecisaoRegistrada;
      if (situacao.exemplo) {
        // Demonstração: nada é gravado nem enviado; só a espera de um envio de verdade.
        await new Promise((ok) => setTimeout(ok, 900));
        registro = { decisao, em: Date.now(), email: "enviado" };
      } else {
        const r = await fetch("/api/decisao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, decisao, motivo: motivo.trim() || undefined }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const corpo = (await r.json()) as DecisaoRegistrada & { jaDecidida?: boolean };
        registro = { decisao: corpo.decisao, em: corpo.em, email: corpo.email };
        if (corpo.jaDecidida) {
          setFase({ tipo: "decidido", registro, agora: false });
          return;
        }
      }
      setFase({ tipo: "decidido", registro, agora: true });
    } catch {
      setErro(true);
    } finally {
      setEnviando(false);
    }
  };

  const botaoForte =
    "inline-flex min-h-12 items-center justify-center rounded-full bg-texto px-6 text-[15px] font-semibold text-fundo outline-none transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-texto focus-visible:ring-offset-2 focus-visible:ring-offset-superficie disabled:opacity-50";
  const botaoSobrio =
    "inline-flex min-h-12 items-center justify-center rounded-full border border-borda bg-superficie px-6 text-[15px] font-medium text-texto outline-none transition-[background-color,transform] duration-150 hover:bg-superficie-2 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-texto focus-visible:ring-offset-2 focus-visible:ring-offset-superficie disabled:opacity-50";

  return (
    <section aria-labelledby="decisao-final" className="cartao space-y-5 p-6 sm:p-8">
      <header className="space-y-1">
        <p className="label-pequena">Decisão final</p>
        <h2 id="decisao-final" className="titulo text-2xl">
          {situacao.candidato ? `${situacao.candidato} avança no processo?` : "O candidato avança no processo?"}
        </h2>
      </header>

      <div aria-live="polite" className="space-y-5">
        {fase.tipo === "carregando" && <p className="label-pequena">Carregando…</p>}

        {fase.tipo === "escolher" && (
          <>
            <p className="max-w-2xl text-corpo text-texto-suave">
              Você decide; o Totti só recomenda. O candidato recebe o retorno por e-mail e a decisão vira critério na
              Memória da Squad.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className={botaoForte} onClick={() => setFase({ tipo: "confirmar", decisao: "avancar" })}>
                Avançar candidato
              </button>
              <button type="button" className={botaoSobrio} onClick={() => setFase({ tipo: "confirmar", decisao: "nao_avancar" })}>
                Não avançar
              </button>
            </div>
          </>
        )}

        {fase.tipo === "confirmar" && (
          <>
            <p className="max-w-2xl text-pretty leading-relaxed">
              <strong className="font-semibold">
                Confirmar {VERBO[fase.decisao]} de {nomeCurto}?
              </strong>{" "}
              Um e-mail de retorno será enviado para {candidato} e o Totti aprenderá com essa decisão.
            </p>
            {!situacao.exemplo && (
              <div className="max-w-2xl space-y-1.5">
                <label htmlFor={idMotivo} className="text-sm font-medium">
                  Por quê? <span className="font-normal text-texto-suave">(opcional: é daqui que o Totti tira o critério)</span>
                </label>
                <textarea
                  id={idMotivo}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={500}
                  rows={2}
                  disabled={enviando}
                  placeholder={
                    fase.decisao === "avancar"
                      ? "Ex.: explicou as escolhas antes de codar e se adaptou rápido à mudança."
                      : "Ex.: não testou casos de borda e travou sem pedir ajuda."
                  }
                  className="w-full resize-y rounded-controle border border-borda bg-fundo px-3 py-2 text-corpo outline-none placeholder:text-texto-suave/70 focus-visible:ring-2 focus-visible:ring-texto"
                />
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className={botaoForte} disabled={enviando} onClick={() => confirmar(fase.decisao)}>
                {enviando ? "Registrando…" : "Confirmar e avisar candidato"}
              </button>
              <button
                type="button"
                className={botaoSobrio}
                disabled={enviando}
                onClick={() => {
                  setErro(false);
                  setFase({ tipo: "escolher" });
                }}
              >
                Voltar
              </button>
            </div>
            {erro && <p className="text-sm text-perigo">Não consegui registrar a decisão. Tente de novo.</p>}
          </>
        )}

        {fase.tipo === "decidido" && (
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className={fase.registro.decisao === "avancar" ? "rotulo-destaque" : "rotulo-neutro"}>
                {NOME[fase.registro.decisao]}
              </span>
              <span className="label-pequena numero">
                {new Date(fase.registro.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </p>
            {fase.agora ? (
              <>
                <p className="text-lg font-semibold">Decisão registrada com sucesso!</p>
                <p className="max-w-2xl text-corpo text-texto-suave">
                  {situacao.exemplo || fase.registro.email === "enviado"
                    ? "E-mail de retorno enviado e critério incorporado à Memória da Squad."
                    : `${textoDoEmail(fase.registro.email, candidato)} A decisão foi incorporada à Memória da Squad.`}
                </p>
              </>
            ) : (
              <p className="max-w-2xl text-corpo text-texto-suave">
                Esta entrevista já foi decidida. {textoDoEmail(fase.registro.email, candidato)}
              </p>
            )}
            {situacao.exemplo && (
              <button
                type="button"
                onClick={() => setFase({ tipo: "escolher" })}
                className="text-sm text-texto-suave underline decoration-texto-suave/50 underline-offset-2 hover:text-texto"
              >
                Refazer a demonstração
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
