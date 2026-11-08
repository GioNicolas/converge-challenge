"use client";

// Relatório da entrevista para a recrutadora: nota, sugestão e, para cada critério, a prova
// (o que o candidato disse ou desenhou, e quando). A decisão é sempre de uma pessoa.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Icone from "@/components/quadro/Icone";
import { useContar } from "@/components/totti/useContar";
import VoltarLink from "@/components/VoltarLink";
import AprendidoComOTime from "@/components/squad/AprendidoComOTime";
import type { AdaptacaoVista, CriterioVisto, ProvaVista, RelatorioVisto } from "@/lib/agente/relatorio";
import type { Recomendacao } from "@/lib/agente/scorecard";

const CURVA = [0.32, 0.72, 0, 1] as const;
const CURVA_SAIDA = [0.16, 1, 0.3, 1] as const;

// Sem verde nem vermelho: cada recomendação tem forma própria (cheio, contorno, areia, tracejado)
// e o texto sempre diz o que é.
const RECOMENDACAO: Record<Recomendacao, { rotulo: string; classe: string; ponto: string }> = {
  avancar: { rotulo: "Totti recomenda avançar", classe: "bg-texto text-texto-claro", ponto: "bg-texto-claro" },
  avancar_com_ressalvas: {
    rotulo: "Avançar com ressalvas",
    classe: "bg-superficie text-texto shadow-[inset_0_0_0_1.5px_var(--pedra)]",
    ponto: "bg-texto",
  },
  nao_avancar: { rotulo: "Não avançar", classe: "bg-[#e4ddd1] text-texto-suave", ponto: "bg-texto-suave" },
  evidencia_insuficiente: {
    rotulo: "Evidência insuficiente",
    classe: "bg-superficie text-texto-suave shadow-[inset_0_0_0_1.5px_rgb(28_24_18/0.22)]",
    ponto: "border-[1.5px] border-dashed border-texto-suave box-border",
  },
};

const nota1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Entra subindo um pouco, em sequência. Sem animação para quem pediu menos movimento. */
function Surgir({ ordem = 0, children, className }: { ordem?: number; children: React.ReactNode; className?: string }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduzir ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, ease: CURVA, delay: Math.min(ordem, 10) * 0.06 }}
    >
      {children}
    </motion.div>
  );
}

/** A nota geral num anel que se fecha e conta do zero (1,4s e 900ms: "chegar"). */
function AnelDeNota({ nota, fraca }: { nota: number | null; fraca: boolean }) {
  const reduzir = useReducedMotion();
  const contada = useContar(nota ?? 0, 1200);
  const volta = 452.4;
  const alvo = nota === null ? volta : volta * (1 - nota / 4);
  return (
    <div className="relative size-[168px] shrink-0" role="img" aria-label={nota === null ? "Sem nota geral" : `Nota geral ${nota1(nota)} de 4`}>
      <svg width="168" height="168" viewBox="0 0 168 168" aria-hidden>
        <circle cx="84" cy="84" r="72" fill="none" stroke="var(--superficie-2)" strokeWidth="12" />
        <motion.circle
          cx="84"
          cy="84"
          r="72"
          fill="none"
          stroke={fraca ? "var(--pedra)" : "var(--texto)"}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={volta}
          initial={{ strokeDashoffset: reduzir ? alvo : volta }}
          animate={{ strokeDashoffset: alvo }}
          transition={{ duration: 1.4, ease: CURVA_SAIDA }}
          transform="rotate(-90 84 84)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`titulo-display text-[52px] leading-none tracking-[-0.04em] ${fraca ? "text-texto-suave" : ""}`}>
          {nota === null ? "—" : nota1(contada)}
        </span>
        <span className="text-[13px] text-texto-suave">de 4</span>
      </div>
    </div>
  );
}

/** Quatro segmentos: a escala da rubrica é de 1 a 4. */
function Escala({ nota, grande = false }: { nota: number | null; grande?: boolean }) {
  const reduzir = useReducedMotion();
  return (
    <div
      className={`flex ${grande ? "gap-1.5" : "gap-1"}`}
      role="img"
      aria-label={nota === null ? "Sem nota" : `Nota ${nota1(nota)} de 4`}
    >
      {[1, 2, 3, 4].map((i) => {
        const preenchido = nota === null ? 0 : Math.max(0, Math.min(1, nota - (i - 1)));
        return (
          <span
            key={i}
            className={`relative overflow-hidden rounded-full bg-superficie-2 ${grande ? "h-2 w-12" : "h-1.5 w-6"}`}
          >
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-marca"
              initial={reduzir ? false : { width: 0 }}
              animate={{ width: `${preenchido * 100}%` }}
              transition={{ duration: 0.6, ease: CURVA, delay: 0.25 + i * 0.08 }}
            />
          </span>
        );
      })}
    </div>
  );
}

function Momento({ momento }: { momento: string | null }) {
  if (!momento) return null;
  return <span className="shrink-0 font-mono text-xs text-texto-suave tabular-nums">min {momento}</span>;
}

function Prova({ prova, aoAbrirImagem }: { prova: ProvaVista; aoAbrirImagem: (url: string) => void }) {
  if (prova.tipo === "fala") {
    return (
      <li className="flex items-start gap-3">
        <span className="mt-0.5 text-texto-suave">
          <Icone nome="fala" tamanho={15} />
        </span>
        <p className="flex-1 leading-relaxed text-texto">“<span className="marca-texto">{prova.texto}</span>”</p>
        <Momento momento={prova.momento} />
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-texto-suave">
        <Icone nome="desenho" tamanho={15} />
      </span>
      <div className="flex flex-1 flex-col gap-2.5">
        {prova.observacao && <p className="leading-relaxed text-texto">{prova.observacao}</p>}
        {prova.elementos.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {prova.elementos.map((nome, i) => (
              <span key={`${nome}-${i}`} className="rounded-full bg-marca-suave px-2.5 py-0.5 text-sm text-marca">
                {nome}
              </span>
            ))}
          </div>
        ) : (
          !prova.observacao && <p className="text-texto-suave">No desenho</p>
        )}
        {prova.imagem && (
          <button
            onClick={() => aoAbrirImagem(prova.imagem!)}
            aria-label="Ver o quadro neste momento"
            className="group w-fit overflow-hidden rounded-pequeno border border-borda bg-superficie outline-none transition-transform duration-150 ease-suave focus-visible:ring-2 focus-visible:ring-marca active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- PNG servido pela sessão, sem otimização */}
            <img
              src={prova.imagem}
              alt="O quadro do candidato neste momento"
              className="h-28 w-auto max-w-56 object-contain transition-transform duration-300 ease-suave group-hover:scale-[1.03]"
            />
          </button>
        )}
      </div>
      <Momento momento={prova.momento} />
    </li>
  );
}

function Criterio({ c, ordem, aoAbrirImagem }: { c: CriterioVisto; ordem: number; aoAbrirImagem: (url: string) => void }) {
  return (
    <Surgir ordem={ordem}>
      <article className="flex flex-col gap-4 rounded-padrao bg-superficie p-6 shadow-padrao">
        <header className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-[20px] font-semibold tracking-[-0.02em]">{c.nome}</h3>
            {c.significado && <p className="text-sm text-texto-suave">{c.significado}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1">
            {c.nota === null ? (
              <span className="text-sm text-texto-suave">Sem nota</span>
            ) : (
              <span className="text-sm font-medium tabular-nums">{c.nota} de 4</span>
            )}
            <Escala nota={c.nota} />
          </div>
        </header>
        <p className="leading-relaxed text-texto">{c.justificativa}</p>
        <AprendidoComOTime regras={c.aprendidoComOTime} />
        {c.provas.length > 0 && (
          <ul className="flex flex-col gap-3.5 border-t border-borda pt-4">
            {c.provas.map((p, i) => (
              <Prova key={i} prova={p} aoAbrirImagem={aoAbrirImagem} />
            ))}
          </ul>
        )}
      </article>
    </Surgir>
  );
}

const vezes = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/** A mudança que o Totti trouxe no meio da entrevista e como o candidato reagiu. Nota à parte da geral. */
function Adaptacao({ a, ordem, aoAbrirImagem }: { a: AdaptacaoVista; ordem: number; aoAbrirImagem: (url: string) => void }) {
  return (
    <Surgir ordem={ordem}>
      <section className="flex flex-col gap-4 rounded-padrao bg-superficie p-6 shadow-padrao">
        <header className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-texto-suave">
              Mudança no problema{a.momento ? `, aos ${a.momento}` : ""}
            </p>
            <h3 className="text-lg font-semibold tracking-tight">Como se adaptou</h3>
            {a.significado && <p className="text-sm text-texto-suave">{a.significado}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1">
            {a.nota === null ? (
              <span className="text-sm text-texto-suave">Sem nota</span>
            ) : (
              <span className="text-sm font-medium tabular-nums">{a.nota} de 4</span>
            )}
            <Escala nota={a.nota} />
          </div>
        </header>
        <p className="w-fit rounded-pequeno bg-superficie-2 px-3 py-1.5 text-sm">{a.mudanca}</p>
        <p className="leading-relaxed text-texto">{a.justificativa}</p>
        <p className="text-sm text-texto-suave">
          Depois da mudança: {vezes(a.falasDepois, "fala", "falas")} e {vezes(a.desenhosDepois, "versão nova do desenho", "versões novas do desenho")}. Esta nota fica fora da nota geral.
        </p>
        {a.provas.length > 0 && (
          <ul className="flex flex-col gap-3.5 border-t border-borda pt-4">
            {a.provas.map((p, i) => (
              <Prova key={i} prova={p} aoAbrirImagem={aoAbrirImagem} />
            ))}
          </ul>
        )}
      </section>
    </Surgir>
  );
}

function Lista({ titulo, icone, itens, vazio }: { titulo: string; icone: "check" | "aprofundar"; itens: string[]; vazio: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-padrao bg-superficie p-6 shadow-padrao">
      <h2 className="text-sm font-medium text-texto-suave">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="text-texto-suave">{vazio}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((t, i) => (
            <li key={i} className="flex items-start gap-3 leading-relaxed">
              <span className={`mt-1 ${icone === "check" ? "text-sucesso" : "text-marca"}`}>
                <Icone nome={icone} tamanho={15} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ImagemAmpliada({ url, aoFechar }: { url: string | null; aoFechar: () => void }) {
  useEffect(() => {
    if (!url) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    addEventListener("keydown", aoTeclar);
    return () => removeEventListener("keydown", aoTeclar);
  }, [url, aoFechar]);
  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={aoFechar}
          role="dialog"
          aria-modal="true"
          aria-label="Quadro do candidato"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-8 backdrop-blur-md print:hidden"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.36, ease: CURVA }}
            className="relative max-h-full max-w-5xl overflow-hidden rounded-padrao bg-superficie shadow-flutuante"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- PNG servido pela sessão */}
            <img src={url} alt="O quadro do candidato" className="max-h-[85dvh] w-auto object-contain" />
            <button
              onClick={aoFechar}
              aria-label="Fechar"
              className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-vidro text-texto-suave shadow-padrao backdrop-blur-xl outline-none hover:text-texto focus-visible:ring-2 focus-visible:ring-marca"
            >
              <Icone nome="fechar" tamanho={16} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Relatorio({ r }: { r: RelatorioVisto }) {
  const [imagem, setImagem] = useState<string | null>(null);
  const rec = RECOMENDACAO[r.recomendacao];
  const avaliados = r.criterios.filter((c) => c.nota !== null);
  const semProva = r.criterios.filter((c) => c.nota === null);
  const comNota = avaliados.length;
  // Nota baseada em poucos critérios não deve chamar mais atenção do que o aviso.
  const fraca = r.recomendacao === "evidencia_insuficiente";

  return (
    <main className="min-h-dvh w-full bg-fundo">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 pt-10 pb-24 print:max-w-none print:pt-0">
        <Surgir className="flex items-center justify-between">
          <div className="flex items-center gap-4 print:hidden">
            <VoltarLink texto="Voltar aos resultados" />
          </div>
          <span className="flex items-center gap-2" aria-hidden>
            <span className="perola size-[20px] rounded-full anim-respirar" />
            <span className="font-display text-[18px] leading-none font-bold tracking-[-0.02em]">totti</span>
          </span>
          <div className="flex items-center gap-2">
            {r.demonstracao && (
              <span className="rounded-full bg-superficie-2 px-2.5 py-1 text-xs text-texto-suave">
                Dados de demonstração
              </span>
            )}
            <button
              onClick={() => print()}
              className="flex items-center gap-1.5 rounded-full border border-borda bg-superficie px-3.5 py-1.5 text-xs font-medium text-texto-suave shadow-padrao outline-none transition-[color,transform] duration-150 ease-suave hover:text-texto focus-visible:ring-2 focus-visible:ring-marca active:scale-95 print:hidden"
            >
              <Icone nome="imprimir" tamanho={14} />
              Salvar em PDF
            </button>
          </div>
        </Surgir>

        <Surgir ordem={1} className="flex flex-col gap-3">
          <p className="font-mono text-[12.5px] text-texto-suave">relatório da entrevista de {r.area}</p>
          <h1 className="titulo-display text-[40px] text-balance">{r.problema}</h1>
          <p className="flex flex-wrap gap-x-2 text-texto-suave">
            <span>Candidato {r.candidatoId}</span>
            <span aria-hidden>·</span>
            <span>{r.realizadaEm}</span>
            {r.duracao && (
              <>
                <span aria-hidden>·</span>
                <span>{r.duracao}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>
              {r.perguntas === 1 ? "1 pergunta do entrevistador" : `${r.perguntas} perguntas do entrevistador`}
            </span>
          </p>
        </Surgir>

        <Surgir ordem={2}>
          <section className="grid gap-8 rounded-[28px] bg-superficie p-8 shadow-padrao sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <AnelDeNota nota={r.notaGeral} fraca={fraca} />
              <p className={`text-[13px] ${fraca ? "font-medium text-alerta-texto" : "text-texto-suave"}`}>
                {fraca ? "Só " : ""}
                {comNota} de {r.criterios.length} critérios com prova
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-start gap-2">
                <span className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold ${rec.classe}`}>
                  <span aria-hidden className={`size-[7px] rounded-full ${rec.ponto}`} />
                  {rec.rotulo}
                </span>
                <p className="text-[13px] text-texto-suave">Sugestão do entrevistador. Quem decide é você.</p>
              </div>
              <Escala nota={r.notaGeral} grande />
              {r.briefing && (
                <div className="flex flex-col gap-1.5">
                  <p className="font-mono text-[12.5px] text-texto-suave">para a próxima conversa</p>
                  <p className="text-[17px] leading-[1.6] text-pretty">{r.briefing}</p>
                </div>
              )}
            </div>
          </section>
        </Surgir>

        {r.desenhoFinal && (
          <Surgir ordem={3}>
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-texto-suave">Desenho final</h2>
              <button
                onClick={() => setImagem(r.desenhoFinal)}
                aria-label="Ampliar o desenho final"
                className="group overflow-hidden rounded-padrao bg-superficie shadow-padrao outline-none focus-visible:ring-2 focus-visible:ring-marca"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- PNG servido pela sessão */}
                <img
                  src={r.desenhoFinal}
                  alt="Desenho final do candidato"
                  className="max-h-[420px] w-full object-contain p-4 transition-transform duration-500 ease-suave group-hover:scale-[1.01]"
                />
              </button>
            </section>
          </Surgir>
        )}

        <section className="flex flex-col gap-4">
          <Surgir ordem={4}>
            <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em]">Por critério</h2>
          </Surgir>
          {avaliados.map((c, i) => (
            <Criterio key={c.id} c={c} ordem={5 + i} aoAbrirImagem={setImagem} />
          ))}
          {semProva.length > 0 && (
            <Surgir ordem={5 + avaliados.length}>
              <article className="flex flex-col gap-3 rounded-padrao border border-dashed border-borda p-6">
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold tracking-tight">
                    {semProva.length === 1 ? "Sem prova nesta entrevista" : `${semProva.length} critérios sem prova nesta entrevista`}
                  </h3>
                  <p className="text-sm leading-relaxed text-texto-suave">
                    Não apareceu fala nem desenho que permitisse avaliar. Ficam sem nota, em vez de um chute, e
                    viram pauta para a próxima conversa.
                  </p>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {semProva.map((c) => (
                    <li key={c.id} className="rounded-full bg-superficie-2 px-3 py-1 text-sm text-texto-suave">
                      {c.nome}
                    </li>
                  ))}
                </ul>
              </article>
            </Surgir>
          )}
        </section>

        {r.adaptacao && <Adaptacao a={r.adaptacao} ordem={6 + r.criterios.length} aoAbrirImagem={setImagem} />}

        <Surgir ordem={6 + r.criterios.length} className="grid gap-4 sm:grid-cols-2">
          <Lista titulo="Pontos fortes" icone="check" itens={r.pontosFortes} vazio="Nada que se destacou." />
          <Lista
            titulo="Onde aprofundar"
            icone="aprofundar"
            itens={r.pontosAAprofundar}
            vazio="Nenhum ponto em aberto."
          />
        </Surgir>

        <Surgir ordem={7 + r.criterios.length}>
          <footer className="flex flex-col gap-3 rounded-padrao border border-borda p-6 text-sm text-texto-suave">
            <p className="flex items-center gap-2 font-medium text-texto">
              <span className="text-sucesso">
                <Icone nome="escudo" tamanho={16} />
              </span>
              Como estas notas foram conferidas
            </p>
            <p className="leading-relaxed">
              {r.provasConferidas === 1 ? "1 prova conferida" : `${r.provasConferidas} provas conferidas`} na
              gravação da sessão. Toda nota aponta para uma fala real do candidato ou para algo que ele desenhou;
              critério sem prova fica sem nota, em vez de receber um chute.
            </p>
            {r.ajustes.length > 0 && (
              <details className="group">
                <summary className="w-fit cursor-pointer list-none text-marca outline-none focus-visible:underline">
                  {r.ajustes.length === 1 ? "1 ajuste automático" : `${r.ajustes.length} ajustes automáticos`}
                </summary>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                  {r.ajustes.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            )}
          </footer>
        </Surgir>
      </div>

      <ImagemAmpliada url={imagem} aoFechar={() => setImagem(null)} />
    </main>
  );
}
