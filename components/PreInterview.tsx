"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Clock, Code2, Lightbulb, Mic, MessageSquare, Play } from "lucide-react";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import type { InterviewConfig } from "@/lib/contracts";
import { LANGUAGE_LABELS } from "@/lib/ide-constants";
import { DIFFICULTIES, difficultyForSeniority } from "@/lib/problems";
import { curvaSuave, duracao } from "@/lib/design/motion";
import Orb from "./Orb";

const PASSOS = [
  {
    icon: MessageSquare,
    titulo: "Conversa inicial",
    texto: "O entrevistador se apresenta e lê o problema com você. Pergunte à vontade: esclarecer é parte da avaliação.",
  },
  {
    icon: Code2,
    titulo: "Explique o plano, depois codifique",
    texto: "Conte sua abordagem em voz alta antes de escrever. Você resolve no editor, na linguagem que preferir, e roda os testes quando quiser.",
  },
  // O passo das dicas depende da política da vaga (ver DICAS).
  {
    icon: Mic,
    titulo: "Voz ou texto",
    texto: "Converse por voz (o navegador vai pedir acesso ao microfone) ou pelo chat. O agente também pode apontar trechos do seu código.",
  },
];

/** O passo das dicas segue o que a recrutadora combinou (`config.hints`): sem prometer o que o agente não vai dar. */
const DICAS: Record<NonNullable<InterviewConfig["hints"]>, { titulo: string; texto: string }> = {
  livres: {
    titulo: "Dicas, se precisar",
    texto: "Pode pedir ajuda a qualquer momento. As dicas são graduais e ficam registradas no relatório.",
  },
  leves: {
    titulo: "Uma dica, se travar",
    texto: "Se travar, dá para pedir uma dica leve, uma vez só. Ela fica registrada no relatório.",
  },
  nenhuma: {
    titulo: "Sem dicas",
    texto: "Esta entrevista não tem dicas. Se travar, conte onde travou e o que já tentou: isso também conta.",
  },
};

/** `vaga`: config da vaga (saída da pré-entrevista da recrutadora); sem ela, a padrão. */
export default function PreInterview({ vaga = DEFAULT_CONFIG, convite }: { vaga?: InterviewConfig; convite?: string }) {
  const router = useRouter();
  const { roleTitle, durationMin, languages } = vaga;
  const passos = [...PASSOS.slice(0, 2), { icon: Lightbulb, ...DICAS[vaga.hints ?? "livres"] }, ...PASSOS.slice(2)];
  const nivel = DIFFICULTIES.find((d) => d.id === (vaga.difficulty ?? difficultyForSeniority(vaga.seniority)))?.label;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: duracao, ease: curvaSuave }}
        className="w-full max-w-2xl rounded-padrao bg-superficie border border-borda shadow-flutuante p-8 sm:p-10"
      >
        <div className="flex items-center gap-4">
          <Orb state="ocioso" size={56} />
          <div>
            <p className="label-pequena">{roleTitle}</p>
            <h1 className="titulo text-3xl">Pronto(a) para começar?</h1>
          </div>
        </div>

        <p className="mt-5 text-corpo-grande text-texto-suave">
          Você vai fazer uma entrevista técnica com um agente de voz, que acompanha seu raciocínio e seu código em tempo real. Veja como ela funciona.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-superficie-2 px-3 py-1 text-mini font-medium numero">
            <Clock size={14} strokeWidth={1.75} /> {durationMin} minutos
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-superficie-2 px-3 py-1 text-mini font-medium">
            <Code2 size={14} strokeWidth={1.75} /> {languages.map((l) => LANGUAGE_LABELS[l] ?? l).join(", ")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-superficie-2 px-3 py-1 text-mini font-medium">
            Nível {nivel}
          </span>
        </div>

        <ol className="mt-8 space-y-5">
          {passos.map(({ icon: Icon, titulo, texto }, i) => (
            <motion.li
              key={titulo}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duracao, ease: curvaSuave, delay: 0.08 * (i + 1) }}
              className="flex gap-4"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-controle bg-marca-suave text-marca">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="titulo text-corpo-grande">{titulo}</h2>
                <p className="text-corpo text-texto-suave">{texto}</p>
              </div>
            </motion.li>
          ))}
        </ol>

        <p className="mt-8 text-corpo text-texto-suave">
          Ao encerrar, ou quando o tempo acabar, você recebe um relatório com o que foi avaliado. Não há pegadinhas: o objetivo é ver como você pensa.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-controle px-5 py-3 text-corpo font-medium text-texto-suave transition-colors duration-rapida hover:text-texto"
          >
            Ainda não
          </button>
          <button
            type="button"
            onClick={() =>
              // System design abre o quadro; live coding abre o IDE. A mesma config e o mesmo convite seguem nos dois.
              router.push(`${vaga.mode === "system_design" ? "/entrevista/system-design" : "/entrevista"}?config=${encodeURIComponent(vaga.id)}${convite ? `&convite=${convite}` : ""}`)
            }
            className="inline-flex items-center justify-center gap-2 rounded-controle bg-marca px-6 py-3 text-corpo font-semibold text-texto-claro transition-all duration-rapida ease-suave hover:brightness-110 active:scale-[0.98]"
          >
            <Play size={16} strokeWidth={1.75} /> Estou pronto(a), iniciar
          </button>
        </div>
      </motion.div>
    </main>
  );
}
