"use client";

// A conversa com o Totti. Sem balões coloridos: as falas dele em texto corrido, as do recrutador
// num bloco discreto à direita. Dá para anexar documentos (PDF, TXT, Markdown) pelo clipe:
// o texto vai para o Totti; na tela aparece só o cartão do documento.
// Depois de a pessoa enviar, o Totti "lê" por um instante e só então aparecem os três pontinhos de quem
// está digitando (ver ATRASO_DIGITANDO), como numa conversa de verdade.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, FileText, Paperclip } from "lucide-react";
import Perola, { BarrasDeVoz, type EstadoPerola } from "@/components/totti/Perola";
import type { Turno } from "@/lib/pre-entrevista/rascunho";
import { ACEITOS, lerDocumento, type Documento } from "@/lib/pre-entrevista/tela/documentos";
import { curvaSaida } from "@/lib/design/motion";
import ListaDocumentos from "./ListaDocumentos";
import { useTranscricao } from "@/lib/transcricao/useTranscricao";
import { acrescentarFala } from "@/lib/transcricao/tipos";
import { DICA_DITADO_ENTER, useEnterDoDitado } from "@/lib/transcricao/enterDoDitado";
import { BotaoDitado, EstadoDitado } from "@/components/transcricao/ControleDitado";
import { useVozAgente } from "@/lib/voz/useVozAgente";
import ControleVoz from "@/components/voz/ControleVoz";

/** Marca que separa a fala dos documentos anexados (ver `montarMensagem`). */
const MARCA = "\n\n[Documento anexado: ";

/** Quanto tempo depois do envio os três pontinhos aparecem. */
const ATRASO_DIGITANDO = 650;

export function montarMensagem(texto: string, documentos: Documento[]) {
  return texto + documentos.map((d) => `${MARCA}${d.nome}]\n${d.texto}`).join("");
}

/** Separa o que a pessoa escreveu dos documentos que ela anexou. */
function separar(mensagem: string) {
  const [texto, ...partes] = mensagem.split(MARCA);
  return { texto, documentos: partes.map((p) => p.slice(0, p.indexOf("]"))) };
}

type Props = {
  transcricao: Turno[];
  pensando: boolean;
  bloqueada?: boolean;
  pausarEntrada?: boolean;
  erro: string | null;
  onEnviar: (mensagem: string) => void;
};

export default function ConversaTotti({ transcricao, pensando, bloqueada = false, pausarEntrada = false, erro, onEnviar }: Props) {
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<Documento[]>([]);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const ditado = useTranscricao({
    bloqueada: pensando || lendo || bloqueada || pausarEntrada,
    aoTexto: (fala) => setTexto((atual) => acrescentarFala(atual, fala)),
  });
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);

  const ultima = transcricao.at(-1);
  const voz = useVozAgente({
    ultimaFala: ultima?.role === "agente" ? { id: String(transcricao.length - 1), texto: ultima.text } : null,
    bloqueada: pensando || bloqueada,
  });

  const [digitando, setDigitando] = useState(false);
  useEffect(() => {
    if (!pensando) return setDigitando(false);
    const t = setTimeout(() => setDigitando(true), ATRASO_DIGITANDO);
    return () => clearTimeout(t);
  }, [pensando]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [transcricao.length, digitando]);

  useEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 140)}px`;
  }, [texto]);

  async function anexar(arquivos: FileList) {
    setErroAnexo(null);
    setLendo(true);
    for (const a of Array.from(arquivos)) {
      try {
        const doc = await lerDocumento(a);
        setAnexos((lista) => (lista.some((d) => d.id === doc.id) ? lista : [...lista, doc]));
      } catch (e) {
        setErroAnexo(e instanceof Error ? e.message : String(e));
      }
    }
    setLendo(false);
  }

  function enviar() {
    const t = texto.trim() || (anexos.length ? "Segue o documento." : "");
    if (!t || pensando || lendo || bloqueada || pausarEntrada || ditado.ativa) return;
    voz.parar();
    onEnviar(montarMensagem(t, anexos));
    setTexto("");
    setAnexos([]);
  }

  // Enter com o microfone ligado para de ouvir; o Enter seguinte envia o que foi transcrito.
  const aoTeclar = useEnterDoDitado(ditado, enviar);

  // O palco: a pérola do Totti no centro, no estado do momento (pensando, falando, ouvindo você).
  const estadoPerola: EstadoPerola =
    digitando || voz.estado === "preparando" ? "pensando" : voz.estado === "falando" ? "falando" : ditado.ativa ? "ouvindo" : "ocioso";
  const legendaEstado =
    estadoPerola === "pensando" ? "Pensando…" : estadoPerola === "falando" ? "Totti está falando" : estadoPerola === "ouvindo" ? "Ouvindo você…" : "Conversa por voz ou texto";

  return (
    <section className="tema-noite flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-fundo text-texto">
      <header className="flex items-center justify-end px-4 pt-3">
        <ControleVoz voz={voz} texto={ultima?.role === "agente" ? ultima.text : undefined} disabled={pensando || bloqueada} />
      </header>

      <div className="flex shrink-0 flex-col items-center gap-2 px-6 pt-4 pb-2">
        <Perola estado={estadoPerola} tamanho={120} brilho />
        <BarrasDeVoz ativo={estadoPerola === "falando" || estadoPerola === "ouvindo"} n={7} altura={18} largura={3} className="mt-4" />
        <span role="status" className="text-[13px] text-texto-suave">
          {legendaEstado}
        </span>
      </div>

      <div ref={lista} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        <AnimatePresence initial={false}>
          {transcricao.map((t, i) => {
            if (t.role === "agente") {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.48, ease: curvaSaida }}
                  className="flex max-w-[92%] flex-col gap-0.5 transition-opacity duration-[480ms]"
                  style={{ opacity: i >= transcricao.length - 2 ? 1 : 0.35 }}
                >
                  <span className="text-[12.5px] font-semibold text-texto">Totti</span>
                  <p className="text-[16px] leading-[1.5] whitespace-pre-wrap text-texto">{t.text}</p>
                </motion.div>
              );
            }
            const { texto: fala, documentos } = separar(t.text);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.48, ease: curvaSaida }}
                className="flex max-w-[92%] flex-col gap-0.5 transition-opacity duration-[480ms]"
                style={{ opacity: i >= transcricao.length - 2 ? 1 : 0.35 }}
              >
                <span className="text-[12.5px] font-semibold text-texto">Você</span>
                <p className="text-[16px] leading-[1.5] whitespace-pre-wrap text-[#d9d1c4]">{fala}</p>
                {documentos.map((nome) => (
                  <span
                    key={nome}
                    className="mt-1 flex w-fit items-center gap-2 rounded-pequeno bg-superficie-2 px-2.5 py-1.5 text-[13.5px] text-texto"
                  >
                    <FileText size={14} strokeWidth={1.5} className="text-texto-suave" />
                    {nome}
                  </span>
                ))}
              </motion.div>
            );
          })}
          {digitando && (
            <motion.div
              key="digitando"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.24, ease: curvaSaida }}
              className="flex flex-col gap-1"
              aria-live="polite"
            >
              <span className="text-[12.5px] font-semibold text-texto">Totti</span>
              <Digitando />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {erro && <p className="mx-6 mb-2 text-[13.5px] text-alerta-texto">{erro}</p>}

      <div className="flex flex-col gap-2 p-4">
        {anexos.length > 0 && (
          <ListaDocumentos documentos={anexos} onRemover={(id) => setAnexos((l) => l.filter((d) => d.id !== id))} compacto />
        )}
        {erroAnexo && <p className="text-[13px] text-alerta-texto">{erroAnexo}</p>}
        <EstadoDitado transcricao={ditado} dica={DICA_DITADO_ENTER} />
        <div className="flex items-end gap-1.5 rounded-[24px] bg-superficie p-1.5 shadow-[inset_0_0_0_1px_rgb(245_240_232/0.1)] transition-shadow duration-[240ms] focus-within:shadow-[inset_0_0_0_1.5px_rgb(245_240_232/0.45)]">
          <button
            type="button"
            onClick={() => seletor.current?.click()}
            aria-label="Anexar documento"
            title="Anexar documento (PDF, TXT, Markdown)"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <Paperclip size={17} strokeWidth={1.6} />
          </button>
          <input
            ref={seletor}
            type="file"
            accept={ACEITOS}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void anexar(e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            ref={campo}
            value={texto}
            readOnly={ditado.ativa}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            rows={1}
            placeholder={lendo ? "Lendo o documento…" : "Escreva para o Totti…"}
            aria-label="Mensagem para o Totti"
            className="max-h-[140px] flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] text-texto outline-none placeholder:text-texto-suave/60"
          />
          <BotaoDitado transcricao={ditado} campo={campo} disabled={pensando || lendo || bloqueada || pausarEntrada} />
          <button
            onClick={enviar}
            disabled={(!texto.trim() && anexos.length === 0) || pensando || lendo || bloqueada || ditado.ativa}
            aria-label="Enviar"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marca text-sobre-marca transition-[opacity,transform] duration-[120ms] active:scale-90 disabled:opacity-25"
          >
            <ArrowUp size={17} strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  );
}

/** Os três pontinhos de quem está digitando. */
function Digitando() {
  return (
    <span className="flex h-9 w-fit items-center gap-1 rounded-full bg-superficie-2 px-3.5" aria-label="Totti está digitando">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-texto/70"
          animate={{ y: [0, -3.5, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
