"use client";

// Onboarding do recrutador: a primeira tela antes do painel de vagas. Explica, em uma página só, o
// caminho de uma vaga com o Totti e deixa claro quanto fica com o recrutador (pouco) e quanto fica com
// o Totti (o resto). Mesmo tema do workspace: papel e tinta, cartões, pílula preta para a ação.
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CalendarCheck, FileText, MessageSquare, Mic, ScrollText, Send } from "lucide-react";
import type { ReactNode } from "react";
import { curvaSuave } from "@/lib/design/motion";
import Marca from "./Marca";

type Quem = "voce" | "totti";
type Passo = { quem: Quem; titulo: string; texto: string; icone: ReactNode };

const ICONE = { size: 17, strokeWidth: 1.75 } as const;

const PASSOS: Passo[] = [
  {
    quem: "voce",
    titulo: "Cole a descrição da vaga",
    texto: "Texto ou documento (PDF, TXT, Markdown). Não precisa formatar nada.",
    icone: <FileText {...ICONE} />,
  },
  {
    quem: "totti",
    titulo: "O Totti lê e sugere o formato",
    texto: "Entende o cargo e a senioridade e propõe a entrevista certa: código na IDE ou system design no quadro.",
    icone: <ScrollText {...ICONE} />,
  },
  {
    quem: "voce",
    titulo: "Uma conversa rápida com o Totti",
    texto: "Ele pergunta o que importa para o time e vocês combinam o foco e os critérios de avaliação.",
    icone: <MessageSquare {...ICONE} />,
  },
  {
    quem: "voce",
    titulo: "Confira o plano e publique",
    texto: "O plano chega pronto. Ajuste o que quiser e publique: os convites saem sozinhos para os inscritos.",
    icone: <Send {...ICONE} />,
  },
  {
    quem: "totti",
    titulo: "O Totti conduz as entrevistas",
    texto: "Cada candidato agenda o próprio horário e faz a entrevista por voz, com o Totti acompanhando o código ou o quadro.",
    icone: <Mic {...ICONE} />,
  },
  {
    quem: "voce",
    titulo: "Leia os escores e decida",
    texto: "Cada entrevista vira um relatório com escore e evidências. Você só compara e escolhe quem segue.",
    icone: <CalendarCheck {...ICONE} />,
  },
];

const entrar = (atraso: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.42, delay: atraso, ease: curvaSuave },
});

export default function Onboarding() {
  const seus = PASSOS.filter((p) => p.quem === "voce").length;

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
          <span className="rotulo-neutro !self-start">Como funciona</span>
          <h1 className="titulo-display text-[40px] text-texto md:text-[52px]">
            Você descreve a vaga.
            <br />
            <span className="text-texto-suave">O Totti faz as entrevistas.</span>
          </h1>
          <p className="max-w-[560px] text-[16px] leading-[1.55] text-texto-suave">
            O Totti é o entrevistador técnico da Converge. Ele monta o plano com você, conversa com cada candidato
            por voz e entrega um relatório pronto para decidir. Do seu lado, são só {seus} passos curtos.
          </p>
        </motion.section>

        {/* Passo a passo */}
        <section className="flex flex-col gap-4" aria-labelledby="passos">
          <motion.div {...entrar(0.08)} className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 id="passos" className="text-[15px] font-semibold tracking-[-0.015em] text-texto">
              O caminho de uma vaga
            </h2>
            <Legenda />
          </motion.div>

          <ol className="cartao flex flex-col">
            {PASSOS.map((p, i) => (
              <motion.li key={p.titulo} {...entrar(0.12 + i * 0.05)} className="linha-lista">
                <PassoLinha passo={p} n={i + 1} />
              </motion.li>
            ))}
          </ol>
        </section>

        {/* Quem faz o quê */}
        <motion.section {...entrar(0.5)} className="grid gap-4 md:grid-cols-2">
          <Coluna
            titulo="Fica com você"
            itens={["Dizer o que a vaga precisa", "Aprovar o plano da entrevista", "Escolher quem segue no processo"]}
            destaque
          />
          <Coluna
            titulo="Fica com o Totti"
            itens={[
              "Montar o plano e os critérios",
              "Enviar convites e cuidar da agenda",
              "Conduzir cada entrevista técnica",
              "Escrever o relatório com escore",
            ]}
          />
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

function Legenda() {
  return (
    <span className="flex items-center gap-3 text-[12.5px] text-texto-suave">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-texto" aria-hidden /> Você
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-superficie-2 ring-1 ring-texto/15" aria-hidden /> Totti
      </span>
    </span>
  );
}

function Coluna({ titulo, itens, destaque }: { titulo: string; itens: string[]; destaque?: boolean }) {
  return (
    <div className="cartao flex flex-col gap-3 px-6 py-5">
      <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-texto">
        <span className={`size-2 rounded-full ${destaque ? "bg-texto" : "bg-superficie-2 ring-1 ring-texto/15"}`} aria-hidden />
        {titulo}
      </span>
      <ul className="flex flex-col gap-2">
        {itens.map((t) => (
          <li key={t} className="text-[14px] leading-[1.45] text-texto-suave">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
