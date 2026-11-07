"use client";

// Página do candidato para escolher o horário da entrevista. Abre pelo link do email, então é
// pensada para celular: uma coluna, alvos grandes. Os horários são sempre de Brasília.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

const FUSO = "America/Sao_Paulo";

type Modo = "live_coding" | "system_design";
type Convite = {
  cargo: string;
  mode: Modo;
  durationMin: number;
  languages: string[];
  primeiroNome: string;
  status: "enviado" | "simulado" | "agendado";
  agendadoPara?: string;
  horarios: string[];
};
type Confirmado = { agendadoPara: string; joinUrl: string; emailStatus: "enviado" | "simulado" | "erro" };

const FORMATO: Record<Modo, string> = {
  live_coding: "programação ao vivo no navegador",
  system_design: "desenho de arquitetura num quadro",
};
const LINGUAGEM: Record<string, string> = { python: "Python", cpp: "C++", c: "C" };

const dia = (iso: string) => new Date(iso);

/** "seg, 9 de nov" (Brasília). */
function textoDia(iso: string) {
  const d = dia(iso);
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" }).format(d).replace(".", "");
  const numeroDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric" }).format(d);
  const mes = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, month: "short" }).format(d).replace(".", "");
  return `${semana}, ${numeroDia} de ${mes}`;
}

const horaDe = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(dia(iso));

/** Chave de agrupamento: a data civil em Brasília (não a UTC). */
const chaveDia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(dia(iso));

export default function AgendarPagina() {
  const { token } = useParams<{ token: string }>();
  const [convite, setConvite] = useState<Convite | null>(null);
  const [situacao, setSituacao] = useState<"carregando" | "pronto" | "naoExiste" | "erro">("carregando");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/convites/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) return setSituacao("naoExiste");
      if (!res.ok) return setSituacao("erro");
      setConvite((await res.json()) as Convite);
      setSituacao("pronto");
    } catch {
      setSituacao("erro");
    }
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Horários agrupados por dia, na ordem em que vêm do servidor.
  const dias = useMemo(() => {
    const grupos = new Map<string, string[]>();
    for (const h of convite?.horarios ?? []) {
      const k = chaveDia(h);
      grupos.set(k, [...(grupos.get(k) ?? []), h]);
    }
    return [...grupos.values()];
  }, [convite]);

  async function confirmar() {
    if (!escolhido || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/convites/${encodeURIComponent(token)}/agendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horario: escolhido }),
      });
      if (res.status === 409) {
        // Já foi marcado (outra aba ou outro aparelho): mostra o horário que ficou.
        await carregar();
        return;
      }
      if (res.status === 400) {
        setErro("Esse horário não está mais disponível. Escolha outro.");
        setEscolhido(null);
        await carregar();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmado((await res.json()) as Confirmado);
    } catch {
      setErro("Não foi possível confirmar agora. Verifique a conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <section className="vidro w-full max-w-md space-y-5 rounded-padrao p-6 shadow-flutuante sm:p-8">
        {situacao === "carregando" && <p className="py-10 text-center text-texto-suave">Carregando…</p>}

        {situacao === "naoExiste" && (
          <p className="py-6 text-center text-texto-suave">Este convite não existe ou expirou.</p>
        )}

        {situacao === "erro" && (
          <p className="py-6 text-center text-texto-suave">Não foi possível carregar o convite. Tente de novo em instantes.</p>
        )}

        {situacao === "pronto" && convite && (convite.status === "agendado" || confirmado) && (
          <Feito
            agendadoPara={confirmado?.agendadoPara ?? convite.agendadoPara}
            joinUrl={confirmado?.joinUrl}
            emailStatus={confirmado?.emailStatus}
          />
        )}

        {situacao === "pronto" && convite && convite.status !== "agendado" && !confirmado && (
          <>
            <div className="space-y-2">
              <h1 className="titulo text-2xl">Olá, {convite.primeiroNome}! Escolha o horário da sua entrevista</h1>
              <p className="text-[15px] text-texto-suave">
                Vaga: {convite.cargo} · {convite.durationMin} min · {FORMATO[convite.mode]}
              </p>
              {convite.mode === "live_coding" && convite.languages.length > 0 && (
                <p className="text-[15px] text-texto-suave">
                  Você escolhe a linguagem: {convite.languages.map((l) => LINGUAGEM[l] ?? l).join(" ou ")}
                </p>
              )}
            </div>

            {dias.length === 0 ? (
              <p className="text-texto-suave">
                Não há horários disponíveis no momento. Entre em contato com a equipe de recrutamento.
              </p>
            ) : (
              <div className="space-y-5">
                {dias.map((horarios) => (
                  <div key={horarios[0]} className="space-y-2">
                    <h2 className="text-[14px] font-medium text-texto">{textoDia(horarios[0])}</h2>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {horarios.map((h) => {
                        const ativo = escolhido === h;
                        return (
                          <button
                            key={h}
                            type="button"
                            onClick={() => setEscolhido(h)}
                            aria-pressed={ativo}
                            className={`numero min-h-12 rounded-controle text-[16px] transition-colors duration-150 ${
                              ativo ? "bg-texto text-texto-claro" : "bg-superficie-2/70 text-texto hover:bg-superficie-2"
                            }`}
                          >
                            {horaDe(h)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {erro && <p className="text-[14px] text-perigo">{erro}</p>}

            {dias.length > 0 && (
              <button
                type="button"
                onClick={confirmar}
                disabled={!escolhido || enviando}
                className="min-h-12 w-full rounded-full bg-texto text-[16px] font-medium text-texto-claro transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {enviando ? "Confirmando…" : "Confirmar horário"}
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}

/** Tela final: horário marcado. `emailStatus` só vem logo após marcar; no convite já marcado não há. */
function Feito({ agendadoPara, joinUrl, emailStatus }: { agendadoPara?: string; joinUrl?: string; emailStatus?: Confirmado["emailStatus"] }) {
  const emailFalhou = emailStatus === "simulado" || emailStatus === "erro";
  return (
    <div className="space-y-4 text-center">
      <CheckCircle2 size={40} strokeWidth={1.75} className="mx-auto text-sucesso" />
      <h1 className="titulo text-2xl">
        Entrevista marcada para {agendadoPara ? `${textoDia(agendadoPara)}, às ${horaDe(agendadoPara)}` : "o horário escolhido"}
      </h1>
      {emailFalhou ? (
        <p className="text-texto-suave">Não foi possível enviar o e-mail de confirmação agora. Guarde este link para entrar na hora marcada.</p>
      ) : (
        <p className="text-texto-suave">Você vai receber um e-mail de confirmação com o link.</p>
      )}
      {emailFalhou && joinUrl && (
        <a
          href={joinUrl}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-texto text-[16px] font-medium text-texto-claro hover:opacity-90"
        >
          Entrar na entrevista
        </a>
      )}
    </div>
  );
}
