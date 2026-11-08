"use client";

// Logo depois de publicar: os convites saem sozinhos para quem se inscreveu, sem o recrutador escolher
// ninguém. Um cartão no meio da tela mostra cada candidato e o e-mail saindo; o botão de baixo é o mesmo
// "Publicar vaga" (mesmo `layoutId`), que voa da barra até aqui, conta o envio e vira "Abrir a vaga".
// Cada candidato vai numa chamada própria ao /api/convites: a linha só fica pronta quando o servidor responde.
// Só os candidatos de teste (CANDIDATOS_TESTE) e o testador recebem e-mail de verdade; os demais são demonstração.
// Quem está testando o site pode deixar o próprio e-mail aqui e entrar na fila (lib/vagas/testador.ts): o convite
// chega para a pessoa, e ela faz o resto do caminho como candidata. Da segunda vaga em diante já entra sozinha.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Send } from "lucide-react";
import type { VagaEmpresa } from "@/lib/vagas/workspace";
import { aguardandoConvite, candidatoTestador, convidar, type CandidatoVaga } from "@/lib/vagas/candidatos";
import { lerTestador, salvarTestador } from "@/lib/vagas/testador";
import { curvaSuave } from "@/lib/design/motion";

type Status = "fila" | "enviando" | "enviado" | "erro";
type Linha = { c: CandidatoVaga; status: Status; real: boolean; link?: string };

/** Cada linha fica ao menos isso em "enviando": dá para ver o e-mail sair mesmo quando o servidor é instantâneo. */
const ENVIO_MINIMO_MS = 420;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Props = { vaga: VagaEmpresa; onAbrir: () => void };

export default function EnvioConvites({ vaga, onAbrir }: Props) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [terminou, setTerminou] = useState(false);
  // O convite para entrar na fila só aparece para quem ainda não deixou o e-mail.
  const [pedirEmail, setPedirEmail] = useState(false);
  const comecou = useRef(false);

  const mudar = useCallback(
    (i: number, mudanca: Partial<Linha>) => setLinhas((l) => l && l.map((x) => (x.c.i === i ? { ...x, ...mudanca } : x))),
    [],
  );

  /** Manda o convite de um candidato e atualiza a linha dele. */
  const enviar = useCallback(
    async (c: CandidatoVaga) => {
      const plano = vaga.resumo;
      if (!plano) return;
      mudar(c.i, { status: "enviando" });
      try {
        const [res] = await Promise.all([
          fetch("/api/convites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vagaId: vaga.id,
              cargo: vaga.cargo,
              configId: plano.configId,
              formato: plano.formato,
              duracaoMin: plano.duracaoMin,
              candidatos: [{ nome: c.nome, email: c.email, ...(c.testador ? { testador: true } : {}) }],
            }),
          }),
          esperar(ENVIO_MINIMO_MS),
        ]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { resultados } = (await res.json()) as {
          resultados: { status: "enviado" | "simulado" | "erro"; link?: string }[];
        };
        const r = resultados[0];
        if (!r || r.status === "erro") throw new Error("envio recusado");
        convidar(vaga.id, [c.i]);
        mudar(c.i, { status: "enviado", real: r.status === "enviado", link: r.link });
      } catch {
        mudar(c.i, { status: "erro" });
      }
    },
    [vaga, mudar],
  );

  useEffect(() => {
    if (comecou.current || !vaga.resumo) return;
    comecou.current = true;
    setPedirEmail(lerTestador() === null);

    void (async () => {
      const fila = await aguardandoConvite(vaga.id, vaga.funil);
      setLinhas(fila.map((c) => ({ c, status: "fila", real: false })));
      // Um instante para as linhas entrarem antes do primeiro envio.
      await esperar(500);
      for (const c of fila) await enviar(c);
      setTerminou(true);
    })();
  }, [vaga, enviar]);

  /** O testador deixou o e-mail: entra no topo da fila e o convite dele sai na hora, junto com os outros. */
  const entrarNaFila = (nome: string, email: string): string | null => {
    const salvo = salvarTestador(nome, email);
    if (!salvo.ok) return salvo.erro;
    const c = candidatoTestador(salvo.testador);
    setPedirEmail(false);
    setLinhas((l) => [{ c, status: "fila", real: false }, ...(l ?? []).filter((x) => x.c.i !== c.i && x.c.email !== c.email)]);
    void enviar(c);
    return null;
  };

  const total = linhas?.length ?? 0;
  const feitos = linhas?.filter((l) => l.status === "enviado" || l.status === "erro").length ?? 0;
  const enviados = linhas?.filter((l) => l.status === "enviado").length ?? 0;
  const reais = linhas?.filter((l) => l.status === "enviado" && l.real).length ?? 0;
  const erros = linhas?.filter((l) => l.status === "erro").length ?? 0;
  const pronto = (terminou && feitos === total) || (linhas !== null && total === 0) || !vaga.resumo;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: curvaSuave }}
      className="absolute inset-0 z-20 flex items-center justify-center rounded-padrao bg-fundo/60 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: curvaSuave }}
        className="flex max-h-full w-full max-w-md flex-col gap-5 rounded-[24px] bg-superficie p-7 shadow-flutuante"
        role="dialog"
        aria-label="Vaga publicada"
      >
        <div className="flex items-center gap-4">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.15 }}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-texto text-texto-claro"
          >
            <Visto tamanho={20} atraso={0.3} />
          </motion.span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="titulo-display truncate text-[24px] text-texto">Vaga publicada</h2>
            <p className="text-[14px] leading-snug text-texto-suave">
              {total === 0 && linhas !== null
                ? "Ninguém se inscreveu ainda. O link da vaga já está pronto."
                : pronto
                  ? "Todo mundo que se inscreveu recebeu o convite."
                  : "Mandando o convite da entrevista para quem se inscreveu."}
            </p>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {pedirEmail && linhas !== null && <EntrarNaFila onEntrar={entrarNaFila} />}
        </AnimatePresence>

        {total > 0 && (
          <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto">
            {linhas!.map((l, k) => (
              <motion.li
                layout="position"
                key={l.c.i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: 0.25 + k * 0.05, ease: curvaSuave }}
                className="flex items-center gap-3 rounded-xl px-2 py-2"
              >
                <span
                  className={`numero flex size-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-medium transition-colors duration-300 ${
                    l.status === "enviado" ? "bg-texto text-texto-claro" : "bg-superficie-2 text-texto-suave"
                  }`}
                >
                  {iniciais(l.c.nome)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 truncate text-[14px] text-texto">
                    <span className="truncate">{l.c.nome}</span>
                    {l.c.testador && (
                      <span className="rotulo shrink-0 rounded-full bg-superficie-2 px-2 py-0.5 text-[10.5px] text-texto-suave">você</span>
                    )}
                  </span>
                  <span className="truncate text-[12px] text-texto-suave">
                    {l.c.email}
                    {/* Sem e-mail de verdade (limite, ou ambiente sem envio): o link vai direto aqui. */}
                    {l.c.testador && l.status === "enviado" && !l.real && l.link && (
                      <>
                        {" · "}
                        <a href={l.link} target="_blank" rel="noreferrer" className="text-texto underline underline-offset-2">
                          abrir o convite
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <Situacao status={l.status} />
              </motion.li>
            ))}
          </ul>
        )}

        <div className="flex flex-col items-center gap-2.5">
          <motion.button
            layoutId="cta-publicar"
            onClick={pronto ? onAbrir : undefined}
            disabled={!pronto}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="group relative flex w-full items-center justify-center overflow-hidden rounded-full bg-texto px-5 py-3 text-[15px] font-medium text-texto-claro disabled:cursor-default enabled:hover:opacity-90"
          >
            {/* O botão enche da esquerda para a direita conforme os convites saem */}
            {!pronto && total > 0 && (
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-texto-claro/12"
                animate={{ width: `${(feitos / total) * 100}%` }}
                transition={{ duration: 0.4, ease: curvaSuave }}
              />
            )}
            <motion.span layout="position" className="relative flex items-center gap-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={pronto ? "abrir" : "enviando"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2"
                >
                  {pronto ? (
                    <>
                      Abrir a vaga <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  ) : (
                    <span className="numero">
                      {linhas === null ? "Buscando os inscritos…" : `Enviando convites · ${feitos} de ${total}`}
                    </span>
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          </motion.button>
          <AnimatePresence>
            {pronto && total > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="numero text-center text-[12.5px] text-texto-suave"
              >
                {resumo(enviados, reais, erros)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** O campo para quem está testando: nome e e-mail, e a pessoa entra na fila como candidata. */
function EntrarNaFila({ onEntrar }: { onEntrar: (nome: string, email: string) => string | null }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const submeter = (e: FormEvent) => {
    e.preventDefault();
    setErro(onEntrar(nome, email));
  };
  const campo =
    "min-w-0 rounded-full bg-superficie px-3.5 py-2 text-[13.5px] text-texto placeholder:text-texto-suave/70 outline-none ring-1 ring-borda focus:ring-texto/40";
  return (
    <motion.form
      onSubmit={submeter}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: curvaSuave }}
      className="shrink-0 overflow-hidden"
    >
      <div className="flex flex-col gap-3 rounded-2xl bg-superficie-2 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-[14px] font-medium text-texto">Quer ver pelo lado do candidato?</p>
          <p className="text-[13px] leading-snug text-texto-suave">
            Deixe seu e-mail e entre na fila. O convite chega para você, a entrevista é com o Totti e a resposta vem no fim.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" aria-label="Seu nome" className={campo} />
          <input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErro(null);
            }}
            type="email"
            required
            placeholder="seu@email.com"
            autoComplete="email"
            aria-label="Seu e-mail"
            aria-invalid={erro !== null}
            className={campo}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-perigo" role="alert">
            {erro}
          </span>
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-texto px-4 py-2 text-[13.5px] font-medium text-texto-claro hover:opacity-90"
          >
            Entrar na fila <Send size={13} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </motion.form>
  );
}

function resumo(enviados: number, reais: number, erros: number) {
  const partes = [
    reais > 0 ? `${reais} por e-mail` : null,
    enviados - reais > 0 ? `${enviados - reais} de demonstração, sem e-mail` : null,
    erros > 0 ? `${erros} não ${erros === 1 ? "saiu" : "saíram"}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

/** À direita de cada candidato: na fila, o e-mail saindo, ou o visto quando o servidor confirmou. */
function Situacao({ status }: { status: Status }) {
  return (
    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {status === "fila" && (
          <motion.span key="fila" exit={{ opacity: 0, scale: 0.6 }} className="size-1.5 rounded-full bg-texto-suave/40" />
        )}
        {status === "enviando" && (
          <motion.span
            key="enviando"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, x: 14, y: -10, scale: 0.7 }}
            transition={{ duration: 0.22 }}
            className="text-texto"
          >
            {/* O aviãozinho balança no lugar enquanto espera e sai voando quando chega a resposta */}
            <motion.span
              className="block"
              animate={{ x: [0, 2, 0], y: [0, -2, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Send size={15} strokeWidth={1.75} />
            </motion.span>
          </motion.span>
        )}
        {status === "enviado" && (
          <motion.span
            key="enviado"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 24 }}
            className="flex size-6 items-center justify-center rounded-full bg-texto text-texto-claro"
            aria-label="Convite enviado"
          >
            <Visto tamanho={12} atraso={0.05} />
          </motion.span>
        )}
        {status === "erro" && (
          <motion.span key="erro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] text-perigo">
            falhou
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** O visto desenhado (o mesmo traço do cartão de conversa concluída). */
function Visto({ tamanho, atraso }: { tamanho: number; atraso: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" aria-hidden>
      <motion.path
        d="M3.5 8.4 L6.6 11.3 L12.5 4.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, delay: atraso, ease: [0.32, 0.72, 0, 1] }}
      />
    </svg>
  );
}

const iniciais = (nome: string) => {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase();
};
