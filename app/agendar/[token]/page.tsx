"use client";

// Página do candidato para escolher o horário da entrevista. Abre pelo link do e-mail, quase sempre
// no celular: uma coluna, alvos de 48px e o botão de confirmar preso no rodapé, à mão do polegar.
// O tema (papel e tinta) vem de app/agendar/layout.tsx. Os horários são sempre de Brasília.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check } from "lucide-react";

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
  joinUrl?: string;
  horarios: string[];
  horariosTeste?: string[];
};
type Confirmado = { agendadoPara: string; joinUrl: string; emailStatus: "enviado" | "simulado" | "erro" };

const FORMATO: Record<Modo, string> = {
  live_coding: "Programação ao vivo, no navegador",
  system_design: "Desenho de arquitetura, num quadro",
};
const LINGUAGEM: Record<string, string> = { python: "Python", cpp: "C++", c: "C", java: "Java", javascript: "JavaScript", typescript: "TypeScript", go: "Go", rust: "Rust" };

const fmt = (opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, ...opcoes });
const fmtSemana = fmt({ weekday: "long" });
const fmtDiaMes = fmt({ day: "numeric", month: "long" });
const fmtExtenso = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtHora = fmt({ hour: "2-digit", minute: "2-digit" });
const fmtCurto = fmt({ weekday: "short", day: "numeric", month: "short" });

const horaDe = (iso: string) => fmtHora.format(new Date(iso));
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Chave de agrupamento: a data civil em Brasília (não a UTC). */
const chaveDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d);

/** "Hoje" / "Amanhã" / "Segunda-feira", e "9 de novembro" ao lado. */
function rotuloDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const k = chaveDia(d);
  const titulo =
    k === chaveDia(hoje)
      ? "Hoje"
      : k === chaveDia(new Date(hoje.getTime() + 24 * 60 * 60 * 1000))
        ? "Amanhã"
        : maiuscula(fmtSemana.format(d));
  return { titulo, data: fmtDiaMes.format(d) };
}

/** "Seg, 9 de nov · 14:00" pro resumo no rodapé. */
const resumoCurto = (iso: string) =>
  `${maiuscula(fmtCurto.format(new Date(iso)).replace(/\./g, ""))} · ${horaDe(iso)}`;

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

  // Horários agrupados por dia, na ordem em que vêm do servidor (os de teste, de hoje, primeiro).
  const dias = useMemo(() => {
    const grupos = new Map<string, string[]>();
    for (const h of convite?.horarios ?? []) {
      const k = chaveDia(new Date(h));
      grupos.set(k, [...(grupos.get(k) ?? []), h]);
    }
    return [...grupos.values()];
  }, [convite]);
  const teste = useMemo(() => new Set(convite?.horariosTeste ?? []), [convite]);

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

  const agendado = situacao === "pronto" && convite && (convite.status === "agendado" || confirmado);
  const escolhendo = situacao === "pronto" && convite && !agendado;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-4 pt-8 sm:pt-16">
      <p className="rotulo text-texto-suave">Time de Recrutamento</p>

      {situacao === "carregando" && (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Carregando">
          <div className="h-8 w-3/4 animate-pulse rounded-controle bg-superficie-2" />
          <div className="h-4 w-1/2 animate-pulse rounded-controle bg-superficie-2" />
          <div className="mt-8 h-40 animate-pulse rounded-padrao bg-superficie-2" />
        </div>
      )}

      {situacao === "naoExiste" && (
        <Aviso titulo="Convite não encontrado">
          Este link não existe ou já expirou (ele vale por 7 dias). Se você ainda quer marcar a entrevista, responda o
          e-mail do convite.
        </Aviso>
      )}

      {situacao === "erro" && (
        <Aviso titulo="Não foi possível carregar">
          Verifique a conexão e tente de novo.
          <button
            type="button"
            onClick={() => {
              setSituacao("carregando");
              carregar();
            }}
            className="mt-5 block min-h-12 w-full rounded-padrao border border-borda bg-superficie text-[16px] font-medium text-texto"
          >
            Tentar de novo
          </button>
        </Aviso>
      )}

      {agendado && (
        <Feito
          agendadoPara={confirmado?.agendadoPara ?? convite.agendadoPara}
          joinUrl={confirmado?.joinUrl ?? convite.joinUrl}
          emailStatus={confirmado?.emailStatus}
          durationMin={convite.durationMin}
        />
      )}

      {escolhendo && (
        <>
          <h1 className="titulo-display mt-3 text-[28px] leading-[1.12] text-texto">
            {convite.primeiroNome ? `Olá, ${convite.primeiroNome}.` : "Olá."} Escolha o horário da sua entrevista.
          </h1>

          <dl className="cartao mt-6 text-[15px]">
            <Linha rotulo="Vaga">{convite.cargo}</Linha>
            <Linha rotulo="Duração">{convite.durationMin} minutos</Linha>
            <Linha rotulo="Formato">{FORMATO[convite.mode]}</Linha>
            {convite.mode === "live_coding" && convite.languages.length > 0 && (
              <Linha rotulo="Linguagem">{convite.languages.map((l) => LINGUAGEM[l] ?? l).join(" ou ")}, à sua escolha</Linha>
            )}
          </dl>

          {dias.length === 0 ? (
            <p className="mt-8 text-[15px] text-texto-suave">
              Não há horários disponíveis no momento. Responda o e-mail do convite e a gente combina outro.
            </p>
          ) : (
            <div className="mt-8 space-y-6 pb-36">
              <p className="rotulo text-texto-suave">Horários de Brasília</p>
              {dias.map((horarios) => {
                const { titulo, data } = rotuloDia(horarios[0]);
                return (
                  <section key={horarios[0]} aria-label={`${titulo}, ${data}`}>
                    <h2 className="mb-2.5 flex items-baseline gap-2 text-[15px]">
                      <span className="font-semibold text-texto">{titulo}</span>
                      <span className="text-texto-suave">{data}</span>
                    </h2>
                    <div className="grid grid-cols-3 gap-2">
                      {horarios.map((h) => {
                        const ativo = escolhido === h;
                        const ehTeste = teste.has(h);
                        return (
                          <button
                            key={h}
                            type="button"
                            onClick={() => {
                              setEscolhido(h);
                              setErro(null);
                            }}
                            aria-pressed={ativo}
                            aria-label={`${titulo}, ${data}, ${horaDe(h)}${ehTeste ? " (teste)" : ""}`}
                            className={`numero flex min-h-12 flex-col items-center justify-center rounded-padrao border text-[16px] font-medium transition-colors duration-150 ${
                              ativo
                                ? "border-texto bg-texto text-texto-claro"
                                : "border-borda bg-superficie text-texto active:bg-superficie-2 hover:border-texto/40"
                            }`}
                          >
                            {horaDe(h)}
                            {ehTeste && (
                              <span className={`text-[11px] font-normal leading-none ${ativo ? "text-texto-claro/70" : "text-texto-suave"}`}>
                                teste
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {dias.length > 0 && (
            // Rodapé fixo: no celular a lista é longa e o botão fica sempre à vista.
            <div className="fixed inset-x-0 bottom-0 border-t border-borda bg-fundo/95 backdrop-blur-sm">
              <div className="mx-auto w-full max-w-[440px] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                {erro ? (
                  <p role="alert" className="mb-2 text-[14px] text-perigo">
                    {erro}
                  </p>
                ) : (
                  <p className="mb-2 text-[14px] text-texto-suave" aria-live="polite">
                    {escolhido ? (
                      <>
                        Escolhido: <span className="numero font-medium text-texto">{resumoCurto(escolhido)}</span>
                      </>
                    ) : (
                      "Toque em um horário"
                    )}
                  </p>
                )}
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={!escolhido || enviando}
                  className="min-h-12 w-full rounded-padrao bg-texto text-[16px] font-medium text-texto-claro transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  {enviando ? "Confirmando…" : "Confirmar horário"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="linha-lista flex gap-4 px-4 py-3">
      <dt className="w-[84px] shrink-0 text-texto-suave">{rotulo}</dt>
      <dd className="min-w-0 text-texto">{children}</dd>
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h1 className="titulo-display text-[28px] leading-[1.12] text-texto">{titulo}</h1>
      <div className="mt-3 text-[15px] leading-relaxed text-texto-suave">{children}</div>
    </div>
  );
}

/** Tela final: horário marcado. `emailStatus` só vem logo após marcar; no convite já marcado não há. */
function Feito({
  agendadoPara,
  joinUrl,
  emailStatus,
  durationMin,
}: {
  agendadoPara?: string;
  joinUrl?: string;
  emailStatus?: Confirmado["emailStatus"];
  durationMin: number;
}) {
  const emailFalhou = emailStatus === "simulado" || emailStatus === "erro";
  const d = agendadoPara ? new Date(agendadoPara) : null;
  return (
    <div className="mt-3">
      <span className="grid size-10 place-items-center rounded-full bg-texto text-texto-claro">
        <Check size={20} strokeWidth={2.25} aria-hidden />
      </span>
      <h1 className="titulo-display mt-5 text-[28px] leading-[1.12] text-texto">Entrevista marcada</h1>

      {d && (
        <div className="cartao mt-6 px-4 py-4">
          <p className="text-[17px] font-semibold text-texto">{maiuscula(fmtExtenso.format(d))}</p>
          <p className="numero mt-0.5 text-[15px] text-texto-suave">
            às {horaDe(agendadoPara!)} (horário de Brasília) · {durationMin} min
          </p>
        </div>
      )}

      <p className="mt-5 text-[15px] leading-relaxed text-texto-suave">
        {emailFalhou
          ? "Não conseguimos enviar o e-mail de confirmação agora. Guarde este link: é por ele que você entra na hora marcada."
          : emailStatus === "enviado"
            ? "Mandamos um e-mail de confirmação com este mesmo link. No horário, é só entrar: não precisa instalar nada."
            : "No horário, é só entrar pelo botão abaixo ou pelo link do e-mail de confirmação. Não precisa instalar nada."}
      </p>

      {joinUrl && (
        <a
          href={joinUrl}
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-padrao bg-texto text-[16px] font-medium text-texto-claro transition-opacity hover:opacity-90"
        >
          Entrar na entrevista
        </a>
      )}
    </div>
  );
}
