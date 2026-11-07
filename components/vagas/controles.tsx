"use client";

// Controles do workspace pensados para escala: busca (atalho "/"), abas com contagem, seletores de
// filtro, paginação e seção recolhível. Superfícies arredondadas, sem traços de divisão.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { curvaSuave } from "@/lib/design/motion";
import { numero } from "@/lib/vagas/workspace";

/** Campo de busca. "/" em qualquer lugar da página foca o campo; Esc limpa. */
export function Busca({ valor, onMudar, placeholder }: { valor: string; onMudar: (v: string) => void; placeholder: string }) {
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement)?.closest("input, textarea, select")) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-full bg-superficie-2/70 px-3.5 ring-texto/15 transition-[background-color,box-shadow] focus-within:bg-superficie focus-within:ring-2 sm:w-80">
      <Search size={14} className="shrink-0 text-texto-suave" />
      <input
        ref={campo}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onMudar("")}
        placeholder={placeholder}
        className="w-full bg-transparent text-[14px] text-texto outline-none placeholder:text-texto-suave/70"
      />
      {valor ? (
        <button onClick={() => onMudar("")} aria-label="Limpar busca" className="text-texto-suave hover:text-texto">
          <X size={14} />
        </button>
      ) : (
        <kbd className="rounded-md bg-fundo px-1.5 text-[11px] text-texto-suave/80">/</kbd>
      )}
    </label>
  );
}

export type Aba<T extends string> = { id: T; nome: string; n: number; destaque?: boolean };

/** Abas com contagem (ex.: Todas 42 · Para revisar 9), num controle segmentado. A atual vira uma pílula clara. */
export function Abas<T extends string>({ abas, atual, onMudar }: { abas: Aba<T>[]; atual: T; onMudar: (id: T) => void }) {
  return (
    <div className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full bg-superficie-2/70 p-1" role="tablist">
      {abas.map((a) => {
        const ativa = a.id === atual;
        return (
          <button
            key={a.id}
            role="tab"
            aria-selected={ativa}
            onClick={() => onMudar(a.id)}
            className={`relative flex shrink-0 items-baseline gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] whitespace-nowrap transition-colors ${
              ativa ? "text-texto" : "text-texto-suave hover:text-texto"
            }`}
          >
            {ativa && (
              <motion.span
                layoutId={`aba-${abas.map((x) => x.id).join("-")}`}
                transition={{ duration: 0.28, ease: curvaSuave }}
                className="absolute inset-0 rounded-full bg-superficie shadow-[0_1px_3px_rgb(17_17_17/0.1)]"
              />
            )}
            <span className="relative">{a.nome}</span>
            <span className={`numero relative text-[12px] ${a.destaque && a.n > 0 ? "font-medium text-texto" : "text-texto-suave"}`}>
              {numero(a.n)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Seletor de filtro compacto. Com valor escolhido, fica em tinta cheia para mostrar que está filtrando. */
export function Seletor<T extends string>({
  rotulo,
  valor,
  opcoes,
  onMudar,
  todos = "Todos",
}: {
  rotulo: string;
  valor: T | "";
  opcoes: { valor: T; nome: string; desativado?: boolean }[];
  onMudar: (v: T | "") => void;
  todos?: string | null;
}) {
  const ativo = valor !== "" && todos !== null;
  return (
    <label
      className={`relative flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors ${
        ativo ? "bg-texto text-texto-claro" : "bg-superficie-2/70 text-texto hover:bg-superficie-2"
      }`}
    >
      <span className={ativo ? "text-texto-claro/70" : "text-texto-suave"}>{rotulo}</span>
      <span className="max-w-[160px] truncate">{opcoes.find((o) => o.valor === valor)?.nome ?? todos}</span>
      <ChevronDown size={13} className="shrink-0 opacity-70" />
      <select
        value={valor}
        onChange={(e) => onMudar(e.target.value as T | "")}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={rotulo}
      >
        {todos !== null && <option value="">{todos}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor} disabled={o.desativado}>
            {o.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

/** "1–50 de 4.906" com anterior e próxima. */
export function Paginacao({
  pagina,
  porPagina,
  total,
  onMudar,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  onMudar: (p: number) => void;
}) {
  if (total === 0) return null;
  const paginas = Math.ceil(total / porPagina);
  const de = pagina * porPagina + 1;
  const ate = Math.min(total, (pagina + 1) * porPagina);
  const botao = "flex size-8 items-center justify-center rounded-full bg-superficie-2/70 text-texto transition-colors hover:bg-superficie-2 disabled:opacity-30 disabled:hover:bg-superficie-2/70";
  return (
    <div className="flex items-center justify-between gap-4 px-1 pt-4">
      <span className="numero text-[13px] text-texto-suave">
        {numero(de)}–{numero(ate)} de {numero(total)}
      </span>
      {paginas > 1 && (
        <div className="flex items-center gap-2">
          <span className="numero text-[12.5px] text-texto-suave">
            Página {numero(pagina + 1)} de {numero(paginas)}
          </span>
          <button className={botao} onClick={() => onMudar(pagina - 1)} disabled={pagina === 0} aria-label="Página anterior">
            <ChevronLeft size={15} />
          </button>
          <button className={botao} onClick={() => onMudar(pagina + 1)} disabled={pagina >= paginas - 1} aria-label="Próxima página">
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Seção que abre e fecha pelo título (ex.: "Com o Totti · 4"). */
export function Recolhivel({
  titulo,
  n,
  dica,
  aberto: controlado,
  onAlternar,
  inicial = false,
  children,
  id,
}: {
  titulo: string;
  n?: number;
  dica?: string;
  aberto?: boolean;
  onAlternar?: (aberto: boolean) => void;
  inicial?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const [interno, setInterno] = useState(inicial);
  const aberto = controlado ?? interno;
  const alternar = () => {
    setInterno(!aberto);
    onAlternar?.(!aberto);
  };
  return (
    <section id={id} className="cartao flex scroll-mt-8 flex-col">
      <button
        onClick={alternar}
        aria-expanded={aberto}
        className="group flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          <ChevronRight size={15} className={`text-texto-suave transition-transform duration-200 ${aberto ? "rotate-90" : ""}`} />
          <span className="text-[15px] font-semibold tracking-[-0.015em] text-texto">{titulo}</span>
          {n !== undefined && (
            <span className="numero rounded-full bg-superficie-2 px-2 py-px text-[12px] text-texto-suave">{numero(n)}</span>
          )}
        </span>
        <span className="text-[12.5px] text-texto-suave group-hover:text-texto">
          {aberto ? "Recolher" : (dica ?? "Abrir lista")}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: curvaSuave }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Voltar: sempre no mesmo lugar, acima do título. */
export function Voltar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-1.5 self-start text-[13.5px] text-texto-suave transition-colors hover:text-texto"
    >
      <ChevronLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}
