"use client";

// A casca do workspace: o menu de vagas à esquerda e o conteúdo à direita.
// No desktop o menu recolhe para um trilho só com ícones (botão no topo ou ⌘B / Ctrl+B) e lembra a
// escolha. A largura anima e o conteúdo acompanha; os textos somem antes de o trilho fechar, para não
// aparecerem cortados. No celular o menu vira uma gaveta, aberta pelo botão do topo.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { LayoutList, Menu, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { useVagas, type EtapaVaga } from "@/lib/vagas/workspace";
import { curvaSuave } from "@/lib/design/motion";
import { RastroDoTotti } from "@/components/totti/Rastro";
import Marca from "./Marca";
import MenuVagas from "./MenuVagas";

type Props = { children: ReactNode; vagaAtual?: string; etapaAtual?: EtapaVaga };

const CHAVE = "converge.menu-recolhido.v1";
const LARGURA = { aberta: 264, recolhida: 72 };
const ABRIR_FECHAR = { duration: 0.36, ease: curvaSuave };

/** Menu recolhido ou não, guardado no navegador. `animar` só liga depois da primeira leitura, para a
 *  página não abrir com o menu fechando na frente da pessoa. */
function useRecolhido() {
  const [recolhido, setRecolhido] = useState(false);
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    setRecolhido(localStorage.getItem(CHAVE) === "1");
    const id = requestAnimationFrame(() => setAnimar(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const alternar = useCallback(() => {
    setRecolhido((r) => {
      localStorage.setItem(CHAVE, r ? "0" : "1");
      return !r;
    });
  }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && !(e.target as HTMLElement)?.closest("input, textarea")) {
        e.preventDefault();
        alternar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alternar]);
  return { recolhido, animar, alternar };
}

export default function Casca({ children, vagaAtual, etapaAtual }: Props) {
  const { vagas, rascunhos } = useVagas();
  const caminho = usePathname();
  const naMemoria = caminho === "/vagas/aprendizado";
  const [gaveta, setGaveta] = useState(false);
  const { recolhido, animar, alternar } = useRecolhido();

  const totalVagas = vagas && rascunhos ? vagas.filter((v) => v.etapa !== "encerrada").length + rascunhos.length : undefined;

  // O rastro do Totti: o que ele está fazendo, lido do que existe de verdade no painel.
  const linhasRastro = useMemo(() => {
    const curto = (s: string) => (s.length > 34 ? `${s.slice(0, 33)}…` : s);
    const abertas = (vagas ?? []).filter((v) => v.etapa !== "encerrada");
    const linhas = [
      ...abertas.filter((v) => v.funil.emAndamento > 0).map((v) => `${v.funil.emAndamento} entrevista(s) em andamento · ${curto(v.cargo)}`),
      ...abertas.filter((v) => v.funil.novos > 0).map((v) => `${v.funil.novos} relatório(s) novo(s) · ${curto(v.cargo)}`),
      ...(rascunhos ?? []).map((r) => `plano de ${curto(r.cargo)} esperando você`),
    ].slice(0, 5);
    return linhas.length ? linhas : ["acompanhando as vagas abertas", "pronto para ler uma nova vaga"];
  }, [vagas, rascunhos]);

  const lateral = (compacto: boolean, noCelular = false) => (
    <div className="flex h-full flex-col gap-6 overflow-hidden px-3 py-5">
      {/* Topo: a marca e o botão de recolher. Recolhido, sobra só o botão de abrir. */}
      <div className="relative flex h-9 items-center">
        <Texto visivel={!compacto}>
          <Marca />
        </Texto>
        {!noCelular && (
          <button
            onClick={alternar}
            aria-label={compacto ? "Abrir o menu" : "Recolher o menu"}
            aria-expanded={!compacto}
            title={`${compacto ? "Abrir" : "Recolher"} o menu (⌘B / Ctrl+B)`}
            className={`absolute top-0 flex size-9 items-center justify-center rounded-xl text-texto-suave transition-[left,background-color,color] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-superficie-2 hover:text-texto ${
              compacto ? "left-[6px]" : "left-[204px]"
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={compacto ? "abrir" : "fechar"}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.14 }}
              >
                {compacto ? <PanelLeftOpen size={17} strokeWidth={1.75} /> : <PanelLeftClose size={17} strokeWidth={1.75} />}
              </motion.span>
            </AnimatePresence>
          </button>
        )}
      </div>

      <Link
        href="/vagas/nova"
        title={compacto ? "Nova vaga" : undefined}
        aria-label="Nova vaga"
        className="flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full bg-texto pl-[16.5px] text-[13.5px] font-medium whitespace-nowrap text-texto-claro transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.98]"
      >
        <Plus size={15} strokeWidth={2} className="shrink-0" />
        <Texto visivel={!compacto}>Nova vaga</Texto>
      </Link>

      <nav className="-mb-2 flex flex-col gap-0.5" aria-label="Atalhos">
        <ItemMenu
          href="/vagas"
          icone={<LayoutList size={16} strokeWidth={1.75} />}
          atual={!vagaAtual && !naMemoria}
          n={totalVagas}
          compacto={compacto}
          onClick={() => setGaveta(false)}
        >
          Todas as vagas
        </ItemMenu>
      </nav>

      <motion.div
        animate={{ opacity: compacto ? 0 : 1 }}
        transition={{ duration: compacto ? 0.12 : 0.24, delay: compacto ? 0 : 0.14 }}
        className={`-mx-1 min-h-0 w-[240px] flex-1 overflow-y-auto px-1 ${compacto ? "pointer-events-none" : ""}`}
        aria-hidden={compacto}
      >
        {vagas && (
          <MenuVagas
            key={vagaAtual ?? "inicio"}
            vagas={vagas}
            vagaAtual={vagaAtual}
            etapaAtual={etapaAtual}
            onNavegar={() => setGaveta(false)}
          />
        )}
      </motion.div>

      {/* Recolhido, o rastro some (não há espaço para ler); aberto, ele digita a linha do momento. */}
      <motion.div
        animate={{ opacity: compacto ? 0 : 1, height: compacto ? 0 : "auto" }}
        transition={{ duration: compacto ? 0.12 : 0.24, delay: compacto ? 0 : 0.14 }}
        className="w-[240px] shrink-0 overflow-hidden"
        aria-hidden={compacto}
      >
        <RastroDoTotti linhas={linhasRastro} />
      </motion.div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <motion.aside
        initial={false}
        animate={{ width: recolhido ? LARGURA.recolhida : LARGURA.aberta }}
        transition={animar ? ABRIR_FECHAR : { duration: 0 }}
        className="sticky top-0 hidden h-dvh shrink-0 md:block"
      >
        {lateral(recolhido)}
      </motion.aside>

      {/* Celular: barra no topo e gaveta */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-borda bg-fundo/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Marca />
        <button
          onClick={() => setGaveta(true)}
          aria-label="Abrir o menu"
          className="flex size-9 items-center justify-center rounded-controle text-texto hover:bg-superficie-2"
        >
          <Menu size={18} />
        </button>
      </div>
      <AnimatePresence>
        {gaveta && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGaveta(false)}
            className="fixed inset-0 z-40 bg-[rgb(17_17_17/0.28)] md:hidden"
          >
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: curvaSuave }}
              onClick={(e) => e.stopPropagation()}
              className="relative h-full w-[280px] bg-fundo"
            >
              <button
                onClick={() => setGaveta(false)}
                aria-label="Fechar o menu"
                className="absolute top-5 right-3 z-10 flex size-8 items-center justify-center rounded-controle text-texto-suave hover:text-texto"
              >
                <X size={16} />
              </button>
              {lateral(false, true)}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="min-w-0 flex-1 px-5 pt-20 pb-20 md:px-14 md:pt-14">{children}</main>
    </div>
  );
}

/** Texto do menu: some rápido ao recolher e volta com um pequeno atraso ao abrir, quando já há espaço. */
function Texto({ visivel, children, className = "" }: { visivel: boolean; children: ReactNode; className?: string }) {
  return (
    <motion.span
      animate={{ opacity: visivel ? 1 : 0, x: visivel ? 0 : -4 }}
      transition={{ duration: visivel ? 0.22 : 0.1, delay: visivel ? 0.12 : 0, ease: curvaSuave }}
      className={`flex min-w-0 items-center gap-2 whitespace-nowrap ${className}`}
      aria-hidden={!visivel}
    >
      {children}
    </motion.span>
  );
}

function ItemMenu({
  href,
  icone,
  atual,
  n,
  compacto,
  onClick,
  children,
}: {
  href: string;
  icone: ReactNode;
  atual: boolean;
  n?: number;
  compacto: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={atual ? "page" : undefined}
      aria-label={compacto ? `${children}${n !== undefined ? ` (${n})` : ""}` : undefined}
      title={compacto ? children : undefined}
      className={`relative flex h-9 items-center gap-2.5 overflow-hidden rounded-xl pr-2.5 pl-[15px] text-[13.5px] whitespace-nowrap transition-colors ${
        atual ? "bg-superficie font-medium text-texto shadow-padrao" : "text-texto-suave hover:translate-x-0.5 hover:bg-superficie-2/60 hover:text-texto"
      }`}
    >
      <span className="shrink-0">{icone}</span>
      <Texto visivel={!compacto} className="flex-1 justify-between">
        <span className="truncate">{children}</span>
        {n !== undefined && <span className="numero text-[12px] font-normal text-texto-suave">{n}</span>}
      </Texto>
    </Link>
  );
}
