"use client";

// O menu lateral: as vagas abertas por último (com centenas de vagas, a lista completa fica na tela
// inicial, com busca e filtros). Cada vaga fica recolhida e abre nas etapas dela
// (Plano combinado · Candidatos · Escores). A vaga e a etapa atuais ficam abertas e marcadas com um
// traço preto à esquerda. Um ponto ao lado do nome avisa que chegou relatório novo.
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import {
  etapasDa,
  NOME_ETAPA,
  contagemDa,
  novosDa,
  numeroCurto,
  useRecentes,
  type EtapaVaga,
  type VagaEmpresa,
} from "@/lib/vagas/workspace";
import { comReais, useEntrevistasReais } from "@/lib/vagas/entrevistas";
import { curvaSuave } from "@/lib/design/motion";

type Props = { vagas: VagaEmpresa[]; vagaAtual?: string; etapaAtual?: EtapaVaga; onNavegar?: () => void };

export default function MenuVagas({ vagas, vagaAtual, etapaAtual, onNavegar }: Props) {
  const recentes = useRecentes();
  const ids = [...new Set([...(vagaAtual ? [vagaAtual] : []), ...recentes])];
  const reais = useEntrevistasReais();
  const lista = ids
    .map((id) => vagas.find((v) => v.id === id))
    .filter((v): v is VagaEmpresa => !!v)
    .slice(0, 6)
    // As entrevistas feitas pelo link contam nos números do menu, como na tela inicial.
    .map((v) => (v.resumo ? { ...v, funil: comReais(v.funil, reais?.[v.resumo.configId]) } : v));
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(vagaAtual ? [vagaAtual] : []));

  const alternar = (id: string) =>
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <nav className="flex flex-col gap-1" aria-label="Vagas recentes">
      <span className="rotulo px-2 pb-1 text-texto-suave">Recentes</span>
      {lista.length === 0 ? (
        <p className="px-2 text-[13px] leading-relaxed text-texto-suave">As vagas que você abrir aparecem aqui.</p>
      ) : (
        <ul className="flex flex-col">
          {lista.map((v) => (
            <ItemVaga
              key={v.id}
              vaga={v}
              aberto={abertos.has(v.id)}
              atual={v.id === vagaAtual}
              etapaAtual={v.id === vagaAtual ? etapaAtual : undefined}
              onAlternar={() => alternar(v.id)}
              onNavegar={onNavegar}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}

function ItemVaga({
  vaga,
  aberto,
  atual,
  etapaAtual,
  onAlternar,
  onNavegar,
}: {
  vaga: VagaEmpresa;
  aberto: boolean;
  atual: boolean;
  etapaAtual?: EtapaVaga;
  onAlternar: () => void;
  onNavegar?: () => void;
}) {
  const novos = novosDa(vaga);
  return (
    <li>
      <button
        onClick={onAlternar}
        aria-expanded={aberto}
        className={`group flex w-full items-center gap-1.5 rounded-controle px-2 py-1.5 text-left transition-colors hover:bg-superficie-2 ${
          atual ? "text-texto" : "text-texto/80"
        }`}
      >
        <ChevronRight
          size={13}
          strokeWidth={1.75}
          className={`shrink-0 text-texto-suave transition-transform duration-200 ${aberto ? "rotate-90" : ""}`}
        />
        <span className={`flex-1 truncate text-[13.5px] ${atual ? "font-medium" : ""}`}>{vaga.cargo}</span>
        {novos > 0 && <span className="size-1.5 shrink-0 rounded-full bg-texto" title={`${novos} relatório(s) novo(s)`} />}
      </button>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: curvaSuave }}
            className="ml-[15px] overflow-hidden border-l border-borda"
          >
            {etapasDa(vaga).map((etapa) => {
              const ativo = etapa === etapaAtual;
              const n = contagemDa(vaga, etapa);
              return (
                <li key={etapa}>
                  <Link
                    href={`/vagas/vaga?id=${encodeURIComponent(vaga.id)}&etapa=${etapa}`}
                    onClick={onNavegar}
                    aria-current={ativo ? "page" : undefined}
                    className={`-ml-px flex items-center justify-between border-l py-1.5 pr-2 pl-3.5 text-[13px] transition-colors ${
                      ativo ? "border-texto text-texto" : "border-transparent text-texto-suave hover:text-texto"
                    }`}
                  >
                    {NOME_ETAPA[etapa]}
                    {n !== null && <span className="numero text-[12px] text-texto-suave">{numeroCurto(n)}</span>}
                  </Link>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}
