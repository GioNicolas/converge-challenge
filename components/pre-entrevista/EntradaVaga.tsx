"use client";
import TituloRevelado from "@/components/totti/TituloRevelado";

// Nova vaga: uma lista única, de cima para baixo — 01 Cargo, 02 Descrição (texto ou documento), 03 Contexto.
// O documento (PDF, TXT, Markdown) é lido no navegador: o primeiro preenche a descrição, os outros viram contexto.
// Abaixo do título, cartões de exemplo preenchem os três campos; clicar em outro troca, clicar no marcado limpa.
import { useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, Lock, Paperclip } from "lucide-react";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import type { Vaga } from "@/lib/pre-entrevista/classificador";
import { ACEITOS, lerDocumento, type Documento } from "@/lib/pre-entrevista/tela/documentos";
import { curvaSuave } from "@/lib/design/motion";
import Passos from "./Passos";
import ListaDocumentos from "./ListaDocumentos";
import { useTranscricao } from "@/lib/transcricao/useTranscricao";
import { acrescentarFala } from "@/lib/transcricao/tipos";
import { BotaoDitado, EstadoDitado } from "@/components/transcricao/ControleDitado";

type Anexo = Documento & { uso: "descrição" | "contexto" };
type Props = {
  onEnviar: (vaga: Vaga) => void;
  erro: string | null;
  /** Valores já conhecidos (ex.: a vaga do workspace, se a leitura falhou). */
  inicial?: Vaga;
  /** Link de volta, mostrado acima do título. */
  voltar?: ReactNode;
};

/** Cartões de exemplo (vagas de `fixtures/pre-entrevista/vagas.ts`): nível e nome curto. Seis fecham a grade (uma linha no desktop, 3×2 ou 2×3 em telas menores). */
const EXEMPLOS: { id: string; nivel: string; nome: string }[] = [
  { id: "backend-senior-pagamentos", nivel: "Sênior", nome: "Backend" },
  { id: "frontend-junior", nivel: "Júnior", nome: "Frontend" },
  { id: "fullstack-startup", nivel: "Pleno", nome: "Full stack" },
  { id: "ia-pleno", nivel: "Pleno", nome: "IA" },
  { id: "tech-lead-mobile", nivel: "Tech lead", nome: "Mobile" },
  { id: "estagio-dados", nivel: "Estágio", nome: "Dados" },
];

const moldura =
  "rounded-controle border border-borda bg-fundo transition-[border-color,box-shadow] duration-150 hover:border-texto/25 focus-within:border-texto focus-within:shadow-[0_0_0_3px_rgb(17_17_17/0.06)]";
const campo = "w-full bg-transparent px-3 py-2.5 text-[15px] text-texto outline-none placeholder:text-texto-suave/50";

function Linha({ n, titulo, dica, opcional, children }: { n: string; titulo: string; dica: string; opcional?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-borda px-6 py-5 first:border-t-0">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2.5">
          <span className="rotulo text-texto-suave/70">{n}</span>
          <span className="text-[14.5px] font-medium text-texto">{titulo}</span>
          {opcional && <span className="rotulo text-texto-suave/70">Opcional</span>}
        </div>
        <p className="pl-[30px] text-[13px] text-texto-suave">{dica}</p>
      </div>
      {children}
    </div>
  );
}

export default function EntradaVaga({ onEnviar, erro, inicial, voltar }: Props) {
  const [cargo, setCargo] = useState(inicial?.roleTitle ?? "");
  const [descricao, setDescricao] = useState(inicial?.jobDescription ?? "");
  const [contexto, setContexto] = useState(inicial?.context ?? "");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [lendo, setLendo] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const campoDescricao = useRef<HTMLTextAreaElement>(null);
  const campoContexto = useRef<HTMLTextAreaElement>(null);
  const ditadoDescricao = useTranscricao({
    bloqueada: lendo > 0,
    aoTexto: (texto) => setDescricao((atual) => acrescentarFala(atual, texto)),
  });
  const ditadoContexto = useTranscricao({
    bloqueada: lendo > 0,
    aoTexto: (texto) => setContexto((atual) => acrescentarFala(atual, texto)),
  });
  const ditando = ditadoDescricao.ativa || ditadoContexto.ativa;

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

  function usarExemplo(id: string) {
    const exemplo = VAGAS.find((v) => v.id === id);
    if (!exemplo) return;
    ditadoDescricao.cancelar();
    ditadoContexto.cancelar();
    // Clicar no exemplo já marcado desfaz: os campos voltam vazios.
    if (exemploAtual === id) {
      setCargo("");
      setDescricao("");
      setContexto("");
      return;
    }
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
    if (!cargo.trim() || !descricao.trim() || ditando) return;
    onEnviar({ roleTitle: cargo.trim(), jobDescription: descricao.trim(), context: contextoFinal || undefined });
  }

  // O exemplo em uso é o que bate com os campos; editar qualquer um deles o desmarca.
  const exemploAtual = VAGAS.find((v) => v.roleTitle === cargo && v.jobDescription === descricao && (v.context ?? "") === contexto)?.id;

  const pronto = cargo.trim() && descricao.trim() && lendo === 0 && !ditando;
  const falta = !cargo.trim() ? "Falta o cargo" : !descricao.trim() ? "Falta a descrição" : lendo > 0 ? "Lendo o documento…" : null;

  return (
    <motion.form
      onSubmit={enviar}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: curvaSuave }}
      className="mx-auto flex w-full max-w-[720px] flex-col gap-9"
    >
      <div className="flex flex-col gap-5">
        {voltar}
        <Passos atual={1} />
        <div className="flex flex-col gap-2">
          <h1 className="titulo-display text-[48px] text-texto">
            <TituloRevelado texto="Nova vaga" />
          </h1>
          <p className="text-[16px] text-texto-suave">Cole a descrição. O Totti cuida do resto.</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-texto-suave">Comece de um exemplo ou escreva do zero abaixo</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {EXEMPLOS.map((e) => {
              const ativo = exemploAtual === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => usarExemplo(e.id)}
                  aria-pressed={ativo}
                  className={`relative flex flex-col rounded-controle border py-2 pl-3 pr-7 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98] ${
                    ativo
                      ? "border-texto bg-superficie shadow-[0_0_0_3px_rgb(17_17_17/0.08)]"
                      : "border-borda bg-superficie hover:-translate-y-px hover:border-texto/30 hover:shadow-[0_2px_8px_rgb(17_17_17/0.05)]"
                  }`}
                >
                  <span className="text-[11.5px] leading-tight text-texto-suave/80">{e.nivel}</span>
                  <span className="truncate text-[13.5px] font-medium leading-snug text-texto">{e.nome}</span>
                  <span
                    aria-hidden
                    className={`absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-texto text-fundo transition-[opacity,scale] duration-150 ${
                      ativo ? "scale-100 opacity-100" : "scale-75 opacity-0"
                    }`}
                  >
                    <Check size={10} strokeWidth={2.75} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-padrao border border-borda bg-superficie">
        <Linha n="01" titulo="Cargo" dica="Como a vaga aparece para o candidato.">
          <div className={moldura}>
            <input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              placeholder="Ex.: Engenheira de Software Sênior — Backend"
              className={campo}
              required
            />
          </div>
        </Linha>

        <Linha n="02" titulo="Descrição" dica="Cole o texto da vaga ou anexe o documento. O arquivo é lido aqui e não sai da sua máquina.">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false);
            }}
            onDrop={soltar}
            className={`relative ${moldura} ${arrastando ? "border-marca bg-marca-suave" : ""}`}
          >
            <textarea
              ref={campoDescricao}
              value={descricao}
              readOnly={ditadoDescricao.ativa}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Responsabilidades, requisitos, ferramentas do dia a dia…"
              rows={9}
              className={`${campo} block resize-y leading-relaxed`}
              required
            />
            <div className="flex items-center justify-between gap-3 border-t border-borda px-1.5 py-1.5">
              <BotaoDitado transcricao={ditadoDescricao} campo={campoDescricao} disabled={lendo > 0 || ditadoContexto.ativa} />
              <button
                type="button"
                onClick={() => seletor.current?.click()}
                className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[13px] text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
              >
                <Paperclip size={14} strokeWidth={1.75} />
                {lendo > 0 ? "Lendo o documento…" : "Anexar documento"}
                <span className="rotulo hidden text-texto-suave/60 sm:inline">PDF · TXT · MD · até 10 MB</span>
              </button>
              <span className="numero pr-2 text-[12px] text-texto-suave/70">
                {descricao.length > 0 ? `${descricao.length.toLocaleString("pt-BR")} caracteres` : "ou arraste o arquivo para cá"}
              </span>
            </div>
            {arrastando && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-controle border border-dashed border-marca bg-fundo/85 text-[14px] text-texto">
                Solte para anexar
              </div>
            )}
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
          <EstadoDitado transcricao={ditadoDescricao} />
          {anexos.length > 0 && <ListaDocumentos documentos={anexos} onRemover={remover} />}
          {erroArquivo && <p className="text-[13.5px] text-perigo">{erroArquivo}</p>}
        </Linha>

        <Linha n="03" titulo="Contexto" opcional dica="O que não está na descrição: empresa, time, momento da contratação.">
          <div className={moldura}>
            <textarea
              ref={campoContexto}
              value={contexto}
              readOnly={ditadoContexto.ativa}
              onChange={(e) => setContexto(e.target.value)}
              placeholder="Ex.: time de 5 pessoas, primeira contratação sênior, precisa de autonomia"
              rows={3}
              className={`${campo} block resize-y leading-relaxed`}
            />
            <div className="flex justify-end border-t border-borda p-1.5">
              <BotaoDitado transcricao={ditadoContexto} campo={campoContexto} disabled={lendo > 0 || ditadoDescricao.ativa} />
            </div>
          </div>
          <EstadoDitado transcricao={ditadoContexto} />
        </Linha>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-padrao border-t border-borda bg-fundo/40 px-6 py-4">
          <span className="flex items-center gap-1.5 text-[12.5px] text-texto-suave">
            <Lock size={12} strokeWidth={1.75} />
            Nada é publicado antes da sua revisão.
          </span>
          <button
            type="submit"
            disabled={!pronto}
            title={falta ?? undefined}
            className="flex items-center gap-1.5 rounded-controle bg-marca px-4 py-2 text-[14px] font-medium text-sobre-marca transition-[filter,transform,opacity] duration-150 hover:opacity-85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Começar com o Totti
            <ArrowRight size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {erro && <p className="text-[14px] text-perigo">{erro}</p>}
    </motion.form>
  );
}
