"use client";

// Onboarding do recrutador: a primeira tela antes do painel de vagas. Explica, em uma página só, o
// caminho de uma vaga com o Totti e deixa claro quanto fica com o recrutador (pouco) e quanto fica com
// o Totti (o resto). Mesmo tema do workspace: papel e tinta, cartões, pílula preta para a ação.
// Ao abrir, grava um cookie: a partir daí a raiz do site vai direto para /vagas (ver app/page.tsx).
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarCheck, ClipboardCheck, FileText, FileSearch, MessageSquare, Mic, ScrollText, Send } from "lucide-react";
import { curvaSuave } from "@/lib/design/motion";
import { COOKIE_ONBOARDING } from "@/lib/vagas/onboarding";
import Marca from "./Marca";

type Quem = "voce" | "totti";
/** `resumo` é a frase curta que entra no cartão "Fica com você" / "Fica com o Totti". */
type Passo = { quem: Quem; titulo: string; texto: string; resumo: string; icone: ReactNode };

const ICONE = { size: 17, strokeWidth: 1.75 } as const;

const PASSOS: Passo[] = [
  {
    quem: "voce",
    titulo: "Cole a descrição da vaga",
    texto: "Texto ou documento (PDF, TXT, Markdown). Não precisa formatar nada.",
    resumo: "Dizer o que a vaga precisa",
    icone: <FileText {...ICONE} />,
  },
  {
    quem: "totti",
    titulo: "O Totti lê e sugere o formato",
    texto: "Entende o cargo e a senioridade e propõe a entrevista certa: código na IDE ou system design no quadro.",
    resumo: "Ler a vaga e sugerir o formato",
    icone: <ScrollText {...ICONE} />,
  },
  {
    quem: "voce",
    titulo: "Uma conversa rápida com o Totti",
    texto: "Ele pergunta o que importa para o time e vocês combinam o foco e os critérios de avaliação.",
    resumo: "Combinar o foco e os critérios",
    icone: <MessageSquare {...ICONE} />,
  },
  {
    quem: "voce",
    titulo: "Confira o plano e publique",
    texto: "O plano chega pronto. Ajuste o que quiser e publique com um clique.",
    resumo: "Aprovar o plano da entrevista",
    icone: <Send {...ICONE} />,
  },
  {
    quem: "totti",
    titulo: "Os convites saem sozinhos",
    texto: "Cada inscrito recebe o convite por e-mail e escolhe o próprio horário. Você não monta agenda.",
    resumo: "Enviar convites e cuidar da agenda",
    icone: <CalendarCheck {...ICONE} />,
  },
  {
    quem: "totti",
    titulo: "O Totti conduz as entrevistas",
    texto: "Conversa com cada candidato por voz e acompanha o código ou o quadro enquanto ele resolve o problema.",
    resumo: "Conduzir cada entrevista técnica",
    icone: <Mic {...ICONE} />,
  },
  {
    quem: "totti",
    titulo: "O Totti escreve o relatório",
    texto: "Cada entrevista vira um relatório com o que o candidato fez, como raciocinou e as evidências.",
    resumo: "Escrever o relatório de cada entrevista",
    icone: <FileSearch {...ICONE} />,
  },
  {
    quem: "voce",
    titulo: "Leia os relatórios e decida",
    texto: "Você compara os candidatos e escolhe quem segue no processo.",
    resumo: "Escolher quem segue no processo",
    icone: <ClipboardCheck {...ICONE} />,
  },
];

const DOS = (quem: Quem) => PASSOS.filter((p) => p.quem === quem);

export default function Onboarding() {
  const reduzir = useReducedMotion() ?? false;
  // Com "reduzir movimento", os blocos só aparecem, sem deslizar nem entrar em sequência.
  const entrar = (atraso: number) =>
    reduzir
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.42, delay: atraso, ease: curvaSuave },
        };

  useEffect(() => {
    document.cookie = `${COOKIE_ONBOARDING}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <Marca />
        <Link href="/vagas" className="text-[13.5px] text-texto-suave transition-colors hover:text-texto">
          Pular
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-14 px-5 pt-8 pb-20 md:px-10 md:pt-14">
        {/* Abertura */}
        <motion.section {...entrar(0)} className="flex flex-col gap-5">
          <div>
            <span className="rotulo-neutro">Como funciona</span>
          </div>
          <h1 className="titulo-display text-[40px] text-texto md:text-[52px]">
            Você descreve a vaga.
            <br />
            <span className="text-texto-suave">O Totti faz as entrevistas.</span>
          </h1>
          <p className="max-w-[560px] text-[16px] leading-[1.55] text-texto-suave">
            O Totti é o entrevistador técnico da Converge. Ele monta o plano com você, conversa com cada candidato
            por voz e entrega um relatório pronto para decidir. Do seu lado, são só {DOS("voce").length} passos curtos.
          </p>
        </motion.section>

        {/* Passo a passo */}
        <section className="flex flex-col gap-4" aria-labelledby="passos">
          <motion.div {...entrar(0.08)} className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 id="passos" className="text-[15px] font-semibold tracking-[-0.015em] text-texto">
              O caminho de uma vaga
            </h2>
            <span className="flex items-center gap-3 text-[12.5px] text-texto-suave">
              <span className="flex items-center gap-1.5">
                <Ponto quem="voce" /> Você
              </span>
              <span className="flex items-center gap-1.5">
                <Ponto quem="totti" /> Totti
              </span>
            </span>
          </motion.div>

          <ol className="cartao flex flex-col">
            {PASSOS.map((p, i) => (
              <motion.li key={p.titulo} {...entrar(0.12 + i * 0.04)} className="linha-lista">
                <PassoLinha passo={p} n={i + 1} />
              </motion.li>
            ))}
          </ol>
        </section>

        {/* Quem faz o quê: sai da mesma lista de passos, para nunca divergir dela */}
        <motion.section {...entrar(0.5)} className="grid gap-4 md:grid-cols-2">
          <Coluna quem="voce" titulo="Fica com você" />
          <Coluna quem="totti" titulo="Fica com o Totti" />
        </motion.section>

        {/* Ação */}
        <motion.section
          {...entrar(0.58)}
          className="flex flex-col items-start gap-4 rounded-[18px] bg-texto px-6 py-7 text-texto-claro md:flex-row md:items-center md:justify-between md:px-8"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[17px] font-semibold tracking-[-0.02em]">Pronto para a primeira vaga?</span>
            <span className="text-[14px] text-texto-claro/65">Tudo acontece numa tela só, do texto da vaga até os convites enviados.</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-nowrap">
            <Link
              href="/vagas"
              className="flex h-10 items-center rounded-full px-4 text-[13.5px] text-texto-claro/75 transition-colors hover:text-texto-claro"
            >
              Ver minhas vagas
            </Link>
            <Link
              href="/vagas/nova"
              className="group flex h-10 items-center gap-2 rounded-full bg-texto-claro px-5 text-[13.5px] font-medium text-texto transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
            >
              Criar a primeira vaga
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

function PassoLinha({ passo, n }: { passo: Passo; n: number }) {
  const voce = passo.quem === "voce";
  return (
    <div className="flex items-start gap-4 px-5 py-5 md:gap-5 md:px-6">
      <span className="numero w-6 shrink-0 pt-[9px] text-[12px] text-texto-suave">{String(n).padStart(2, "0")}</span>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          voce ? "bg-texto text-texto-claro" : "bg-superficie-2 text-texto"
        }`}
        aria-hidden
      >
        {passo.icone}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-[3px]">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[15px] font-medium tracking-[-0.012em] text-texto">{passo.titulo}</span>
          <span className={voce ? "rotulo-destaque" : "rotulo-neutro"}>{voce ? "Você" : "Totti"}</span>
        </div>
        <p className="max-w-[560px] text-[14px] leading-[1.5] text-texto-suave">{passo.texto}</p>
      </div>
    </div>
  );
}

/** A marca de quem faz: preto cheio para você, cinza com traço para o Totti. */
function Ponto({ quem }: { quem: Quem }) {
  return (
    <span
      className={`size-2 rounded-full ${quem === "voce" ? "bg-texto" : "bg-superficie-2 ring-1 ring-texto/15"}`}
      aria-hidden
    />
  );
}

function Coluna({ quem, titulo }: { quem: Quem; titulo: string }) {
  return (
    <div className="cartao flex flex-col gap-3 px-6 py-5">
      <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-texto">
        <Ponto quem={quem} />
        {titulo}
      </span>
      <ul className="flex flex-col gap-2">
        {DOS(quem).map((p) => (
          <li key={p.titulo} className="text-[14px] leading-[1.45] text-texto-suave">
            {p.resumo}
          </li>
        ))}
      </ul>
    </div>
  );
}
