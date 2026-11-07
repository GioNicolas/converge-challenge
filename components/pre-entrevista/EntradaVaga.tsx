"use client";

// Etapa 1: o recrutador cola a vaga ou anexa o documento (PDF, TXT, Markdown).
// O primeiro documento preenche a descrição (dá para conferir e editar); os seguintes viram contexto.
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { motion } from "motion/react";
import { ArrowRight, Upload } from "lucide-react";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import type { Vaga } from "@/lib/pre-entrevista/classificador";
import { ACEITOS, lerDocumento, type Documento } from "@/lib/pre-entrevista/tela/documentos";
import { curvaSuave } from "@/lib/design/motion";
import Passos from "./Passos";
import ListaDocumentos from "./ListaDocumentos";

type Anexo = Documento & { uso: "descrição" | "contexto" };
type Props = { onEnviar: (vaga: Vaga) => void; erro: string | null };

const campo =
  "w-full rounded-controle border border-borda bg-superficie-2 px-3 py-2.5 text-[15px] text-texto placeholder:text-texto-suave/60 outline-none transition-colors duration-150 focus:border-texto/40 focus:bg-superficie";

export default function EntradaVaga({ onEnviar, erro }: Props) {
  const [cargo, setCargo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [contexto, setContexto] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [lendo, setLendo] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement>(null);

  async function adicionar(arquivos: FileList | File[]) {
    setErroArquivo(null);
    // A descrição está livre se estiver vazia e nenhum documento já a ocupou.
    let descricaoLivre = !descricao.trim() && !anexos.some((a) => a.uso === "descrição");
    for (const arquivo of Array.from(arquivos)) {
      setLendo((n) => n + 1);
      try {
        const doc = await lerDocumento(arquivo);
        if (anexos.some((a) => a.id === doc.id)) continue;
        // O primeiro documento vira a descrição se ela estiver vazia; o cargo sai do nome do arquivo.
        const uso: Anexo["uso"] = descricaoLivre ? "descrição" : "contexto";
        if (descricaoLivre) {
          setDescricao(doc.texto);
          descricaoLivre = false;
        }
        setCargo((atual) => atual || doc.nome.replace(/\.(pdf|txt|md|markdown)$/i, "").replace(/[-_]+/g, " "));
        setAnexos((lista) => [...lista, { ...doc, uso }]);
      } catch (e) {
        setErroArquivo(e instanceof Error ? e.message : String(e));
      } finally {
        setLendo((n) => n - 1);
      }
    }
  }

  function remover(id: string) {
    const doc = anexos.find((a) => a.id === id);
    if (doc?.uso === "descrição" && descricao === doc.texto) setDescricao("");
    setAnexos((lista) => lista.filter((a) => a.id !== id));
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files.length) void adicionar(e.dataTransfer.files);
  }

  function usarExemplo() {
    const exemplo = VAGAS.find((v) => v.id === "backend-senior-pagamentos") ?? VAGAS[0];
    setCargo(exemplo.roleTitle);
    setDescricao(exemplo.jobDescription);
    setContexto(exemplo.context ?? "");
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const extras = anexos
      .filter((a) => a.uso === "contexto")
      .map((a) => `Documento anexado: ${a.nome}\n${a.texto}`);
    const contextoFinal = [contexto.trim(), ...extras].filter(Boolean).join("\n\n");
    if (!cargo.trim() || !descricao.trim()) return;
    onEnviar({ roleTitle: cargo.trim(), jobDescription: descricao.trim(), context: contextoFinal || undefined });
  }

  const pronto = cargo.trim() && descricao.trim() && lendo === 0;

  return (
    <motion.form
      onSubmit={enviar}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: curvaSuave }}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8"
    >
      <div className="flex flex-col gap-5">
        <Passos atual={1} />
        <div className="flex flex-col gap-3">
          <h1 className="text-[44px] leading-[1.05] font-normal tracking-[-0.025em] text-texto">Nova entrevista</h1>
          <p className="max-w-xl text-[17px] leading-relaxed text-texto-suave">
            Cole a vaga ou anexe o documento. A Totti lê, sugere o formato e monta a entrevista com você.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.45fr_1fr]">
        <section className="flex flex-col gap-4 rounded-padrao bg-superficie p-6">
          <span className="rotulo text-texto-suave">Vaga</span>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13.5px] text-texto-suave">Cargo</span>
            <input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              placeholder="Engenheira de Software Sênior — Backend"
              className={campo}
              required
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[13.5px] text-texto-suave">Descrição</span>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Responsabilidades, requisitos, stack…"
              rows={13}
              className={`${campo} flex-1 resize-y leading-relaxed`}
              required
            />
          </label>
        </section>

        <div className="flex flex-col gap-3">
          <section className="flex flex-col gap-3 rounded-padrao bg-superficie p-6">
            <span className="rotulo text-texto-suave">Documentos</span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={soltar}
              onClick={() => seletor.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && seletor.current?.click()}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-controle border border-dashed px-4 py-7 text-center transition-colors duration-150 ${
                arrastando ? "border-texto bg-marca-suave" : "border-texto/20 hover:border-texto/40 hover:bg-superficie-2"
              }`}
            >
              <Upload size={18} strokeWidth={1.5} className="text-texto-suave" />
              <span className="text-[14px] text-texto">
                {lendo > 0 ? "Lendo o documento…" : "Arraste aqui ou escolha um arquivo"}
              </span>
              <span className="rotulo text-texto-suave">PDF · TXT · Markdown · até 10 MB</span>
              <input
                ref={seletor}
                type="file"
                accept={ACEITOS}
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void adicionar(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {anexos.length > 0 && <ListaDocumentos documentos={anexos} onRemover={remover} />}
            {erroArquivo && <p className="text-[13.5px] text-perigo">{erroArquivo}</p>}
            <p className="text-[13px] leading-relaxed text-texto-suave">
              O arquivo é lido aqui no navegador. O primeiro preenche a descrição; os outros entram como contexto.
            </p>
          </section>

          <section className="flex flex-col gap-3 rounded-padrao bg-superficie p-6">
            <span className="rotulo text-texto-suave">Contexto · opcional</span>
            <textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              placeholder="Empresa, time, momento da contratação…"
              rows={3}
              className={`${campo} resize-y`}
            />
          </section>
        </div>
      </div>

      {erro && <p className="text-[14px] text-perigo">{erro}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!pronto}
          className="flex items-center gap-2 rounded-controle bg-[var(--destaque)] px-5 py-3 text-[15px] font-medium text-texto transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-40"
        >
          Começar com a Totti
          <ArrowRight size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={usarExemplo}
          className="rounded-controle bg-superficie px-5 py-3 text-[15px] text-texto transition-colors duration-150 hover:bg-superficie-2"
        >
          Usar um exemplo
        </button>
      </div>
    </motion.form>
  );
}
