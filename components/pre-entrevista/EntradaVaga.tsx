"use client";

// Etapa 1: o recrutador cola a vaga. A Totti lê, classifica e começa a conversa.
import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import type { Vaga } from "@/lib/pre-entrevista/classificador";
import { curvaSuave } from "@/lib/design/motion";

type Props = { onEnviar: (vaga: Vaga) => void; erro: string | null };

export default function EntradaVaga({ onEnviar, erro }: Props) {
  const [cargo, setCargo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [contexto, setContexto] = useState("");

  function usarExemplo() {
    const exemplo = VAGAS.find((v) => v.id === "backend-senior-pagamentos") ?? VAGAS[0];
    setCargo(exemplo.roleTitle);
    setDescricao(exemplo.jobDescription);
    setContexto(exemplo.context ?? "");
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cargo.trim() || !descricao.trim()) return;
    onEnviar({ roleTitle: cargo.trim(), jobDescription: descricao.trim(), context: contexto.trim() || undefined });
  }

  const campo =
    "w-full rounded-controle border border-borda bg-superficie-2/60 px-3.5 py-2.5 text-corpo-grande text-texto placeholder:text-texto-suave/70 outline-none transition-[border-color,box-shadow] duration-rapida ease-suave focus:border-marca focus:shadow-[0_0_0_3px_var(--marca-suave)]";

  return (
    <motion.form
      onSubmit={enviar}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, ease: curvaSuave }}
      className="mx-auto flex w-full max-w-2xl flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <p className="label-pequena text-marca">Nova entrevista</p>
        <h1 className="titulo text-3xl text-texto">Cole a vaga. A Totti monta a entrevista com você.</h1>
        <p className="text-corpo-grande leading-relaxed text-texto-suave">
          Ela lê a descrição, sugere o formato e a senioridade e conversa com você para definir o que avaliar.
        </p>
      </header>

      <div className="vidro flex flex-col gap-4 rounded-padrao p-5 shadow-cartao">
        <label className="flex flex-col gap-1.5">
          <span className="text-corpo font-medium text-texto">Cargo</span>
          <input
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Ex.: Engenheira de Software Sênior — Backend"
            className={campo}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-corpo font-medium text-texto">Descrição da vaga</span>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Cole aqui a descrição completa: responsabilidades, requisitos, stack…"
            rows={10}
            className={`${campo} resize-y leading-relaxed`}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-corpo font-medium text-texto">
            Contexto <span className="font-normal text-texto-suave">(opcional)</span>
          </span>
          <textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Empresa, time, momento da contratação…"
            rows={2}
            className={`${campo} resize-y`}
          />
        </label>

        {erro && <p className="rounded-controle bg-perigo/15 px-3 py-2 text-corpo text-perigo">{erro}</p>}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!cargo.trim() || !descricao.trim()}
            className="flex items-center gap-2 rounded-full bg-marca px-5 py-2.5 text-corpo-grande font-medium text-texto-claro transition-[opacity,transform] duration-rapida ease-suave hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          >
            <Sparkles size={16} strokeWidth={1.75} />
            Começar com a Totti
          </button>
          <button
            type="button"
            onClick={usarExemplo}
            className="rounded-full px-4 py-2.5 text-corpo-grande font-medium text-texto-suave transition-colors duration-rapida ease-suave hover:bg-superficie-2 hover:text-texto"
          >
            Usar um exemplo
          </button>
        </div>
      </div>
    </motion.form>
  );
}
