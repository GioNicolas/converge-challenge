"use client";

// Documentos anexados (lidos no navegador): nome, tipo, páginas e tamanho, com remover.
import { AnimatePresence, motion } from "motion/react";
import { FileText, X } from "lucide-react";
import { tamanhoLegivel, type Documento } from "@/lib/pre-entrevista/tela/documentos";

type Props = {
  documentos: (Documento & { uso?: string })[];
  onRemover: (id: string) => void;
  compacto?: boolean;
};

export default function ListaDocumentos({ documentos, onRemover, compacto = false }: Props) {
  return (
    <ul className={`flex ${compacto ? "flex-wrap gap-1.5" : "flex-col gap-1.5"}`}>
      <AnimatePresence initial={false}>
        {documentos.map((d) => (
          <motion.li
            key={d.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2.5 rounded-controle border border-borda bg-superficie px-2.5 py-2"
          >
            <FileText size={16} strokeWidth={1.5} className="shrink-0 text-texto-suave" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13.5px] text-texto">{d.nome}</span>
              {!compacto && (
                <span className="rotulo text-texto-suave">
                  {d.tipo === "pdf" ? "PDF" : "Texto"}
                  {d.paginas ? ` · ${d.paginas} pág.` : ""} · {tamanhoLegivel(d.tamanho)}
                  {d.uso ? ` · ${d.uso}` : ""}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemover(d.id)}
              aria-label={`Remover ${d.nome}`}
              className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-[3px] text-texto-suave transition-colors hover:bg-fundo hover:text-texto"
            >
              <X size={14} />
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
