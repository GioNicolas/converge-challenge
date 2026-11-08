"use client";

// Quem abre o link do convite fora do horário marcado. Antes: o horário, uma contagem até a sala abrir e
// o botão travado; quando a contagem chega a zero, a página recarrega no servidor e a entrevista aparece.
// Depois do horário: o aviso de que passou. A contagem usa o relógio do servidor (`sala.agora`) corrigido
// pelo tempo passado no aparelho, para não depender de o relógio do celular estar certo.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Clock, Lock } from "lucide-react";
import type { EstadoSala } from "@/lib/convites/sala";
import { curvaSuave } from "@/lib/design/motion";

const FUSO = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2 dias", "3 h 05 min", "4:09" (menos de uma hora: minutos e segundos, como um relógio). */
function falta(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const dias = Math.floor(s / 86400);
  if (dias >= 1) return `${dias} ${dias === 1 ? "dia" : "dias"}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 1) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function SalaFechada({ sala }: { sala: EstadoSala }) {
  const router = useRouter();
  // Diferença entre o relógio do servidor e o do aparelho, medida na chegada da página.
  const [desvio] = useState(() => sala.agora - Date.now());
  const [agora, setAgora] = useState(sala.agora);
  const cedo = sala.situacao === "cedo";
  const restante = sala.janela.abre - agora;

  useEffect(() => {
    if (!cedo) return;
    const t = setInterval(() => setAgora(Date.now() + desvio), 1000);
    return () => clearInterval(t);
  }, [cedo, desvio]);

  // Chegou a hora: o servidor confere de novo e mostra a entrevista.
  useEffect(() => {
    if (cedo && restante <= 0) router.refresh();
  }, [cedo, restante, router]);

  const inicio = new Date(sala.agendadoPara);

  return (
    <div className="tema-recrutador min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: curvaSuave }}
          className="flex flex-col gap-6"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-superficie-2 text-texto">
            {cedo ? <Lock size={18} strokeWidth={1.75} /> : <Clock size={18} strokeWidth={1.75} />}
          </span>

          <div className="flex flex-col gap-2">
            <span className="rotulo text-texto-suave">{sala.cargo}</span>
            <h1 className="titulo-display text-[34px] leading-[1.08] text-texto">
              {cedo ? "Ainda não é a hora da sua entrevista" : "O horário da sua entrevista já passou"}
            </h1>
          </div>

          <div className="cartao flex flex-col gap-0.5 px-5 py-4">
            <span className="text-[16px] font-semibold text-texto">{maiuscula(fmtDia.format(inicio))}</span>
            <span className="numero text-[14.5px] text-texto-suave">
              às {fmtHora.format(inicio)} (horário de Brasília) · {sala.durationMin} min
            </span>
          </div>

          {cedo ? (
            <>
              <div className="flex flex-col items-center gap-1 rounded-[22px] bg-superficie-2/60 px-5 py-6 text-center">
                <span className="text-[13px] text-texto-suave">A sala abre em</span>
                <span className="numero titulo-display text-[44px] leading-none text-texto" aria-live="polite">
                  {falta(restante)}
                </span>
                <span className="mt-1 text-[12.5px] text-texto-suave">Dois minutos antes do horário. Esta página abre sozinha.</span>
              </div>
              <button
                type="button"
                disabled
                className="min-h-12 w-full cursor-not-allowed rounded-full bg-texto text-[15px] font-medium text-texto-claro opacity-30"
              >
                Entrar na entrevista
              </button>
            </>
          ) : (
            <p className="text-[15px] leading-relaxed text-texto-suave">
              Se você perdeu o horário, responda o e-mail do convite que o time de recrutamento combina outro com você.
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
