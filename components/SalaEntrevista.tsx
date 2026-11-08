"use client";

// Sala da entrevista no quadro: o quadro em tela cheia, a janela de chamada no canto e a legenda embaixo.
// O enunciado não fica num painel: o agente escreve no próprio quadro.
import { esperaDoFimDaFala } from "@/lib/audio/fimDaFala";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import JanelaChamada from "@/components/quadro/JanelaChamada";
import Legenda from "@/components/quadro/Legenda";
import type { MensagemConversa } from "@/components/quadro/PainelConversa";
import CursorAgente, { type ControleCursor } from "@/components/CursorAgente";
import ConfirmarEncerrar from "@/components/quadro/ConfirmarEncerrar";
import type { Quadro } from "@/components/Canvas";
import { useEntrevista } from "@/lib/sessao/useEntrevista";
import { usarServidor, type Fase } from "@/lib/sessao/cliente";
import { useMidiaLocal } from "@/lib/presenca/useMidiaLocalQuadro";
import { useFimPorSilencio } from "@/lib/presenca/useFimPorSilencio";
import { useTranscricao } from "@/lib/presenca/useTranscricao";
import { useLiberarAudio } from "@/lib/presenca/useLiberarAudio";
import { FilaFalas } from "@/lib/audio/filaFalas";
import type { NonDeletedExcalidrawElement } from "@/lib/excalidraw/tipos";
import { adicionar, type Requisito } from "@/lib/sessao/requisitos";
import { anotarRequisito } from "@/lib/presenca/coreografia";

/** Demonstração: o que o agente pergunta, o que o candidato responde e o requisito que fica combinado. */
const ROTEIRO_DEMO = [
  {
    pergunta: "Quantas URLs novas vocês esperam por mês?",
    resposta: "Acho que umas 100 milhões por mês.",
    requisito: "100 milhões de URLs novas por mês",
  },
  {
    pergunta: "E a proporção entre leitura e escrita?",
    resposta: "A leitura é bem maior, umas 100 vezes. Dá uns 4 mil por segundo.",
    requisito: "Leitura 100x maior que escrita (~4 mil/s)",
  },
  {
    pergunta: "Por quanto tempo os links precisam continuar funcionando?",
    resposta: "Vamos guardar por 5 anos.",
    requisito: "Guardar por 5 anos",
  },
  {
    pergunta: "Qual o tamanho do código curto?",
    resposta: "7 caracteres devem bastar.",
    requisito: "Código curto de 7 caracteres",
  },
];

/** Simula a conversa e os requisitos até virem do servidor: cada clique encena um passo do roteiro. */
function useDemoRequisitos() {
  const [requisitos, setRequisitos] = useState<Requisito[]>([]);
  const [mensagens, setMensagens] = useState<MensagemConversa[]>([]);
  const [passo, setPasso] = useState(0);
  const [encenando, setEncenando] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const depois = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  function encenar() {
    const item = ROTEIRO_DEMO[passo];
    if (!item || encenando) return;
    setEncenando(true);
    setPasso((p) => p + 1);
    const idPergunta = `demo-${passo}-agente`;
    const idResposta = `demo-${passo}-candidato`;
    setMensagens((m) => [...m, { id: idPergunta, quem: "agente", texto: item.pergunta, horario: Date.now(), requisito: item.requisito }]);

    // A resposta chega aos poucos (parcial), como a transcrição da voz, e depois fica final.
    const palavras = item.resposta.split(" ");
    const inicio = 900;
    palavras.forEach((_, i) => {
      depois(inicio + i * 140, () => {
        const texto = palavras.slice(0, i + 1).join(" ");
        setMensagens((m) =>
          m.some((x) => x.id === idResposta)
            ? m.map((x) => (x.id === idResposta ? { ...x, texto } : x))
            : [...m, { id: idResposta, quem: "candidato", texto, parcial: true, horario: Date.now() }],
        );
      });
    });
    const fim = inicio + palavras.length * 140 + 300;
    depois(fim, () => {
      setMensagens((m) => m.map((x) => (x.id === idResposta ? { ...x, parcial: false } : x)));
      setRequisitos((r) => adicionar(r, item.requisito));
      setEncenando(false);
    });
  }

  /** Requisito combinado fora do roteiro (ex.: vindo do /perguntar): entra na lista e é escrito no quadro. */
  const combinar = useCallback((texto: string) => setRequisitos((r) => adicionar(r, texto)), []);

  return { requisitos, mensagens, encenar, combinar, encenando, acabou: passo >= ROTEIRO_DEMO.length };
}

const NOME_DA_FASE: Record<Fase, string> = {
  AGUARDANDO: "Aguardando",
  APRESENTACAO: "Apresentação",
  REQUISITOS: "Requisitos",
  ALTO_NIVEL: "Visão geral",
  APROFUNDAMENTO: "Aprofundamento",
  FECHAMENTO: "Fechamento",
  ENCERRADA: "Encerrada",
};

const Canvas = dynamic(() => import("@/components/Canvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-superficie-2" />,
});

/** `configId`: plano de entrevista da vaga; `convite`: id do link do e-mail (liga a sessão ao candidato no painel). */
export default function SalaEntrevista({ configId, convite }: { configId?: string; convite?: string } = {}) {
  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const cursor = useRef<ControleCursor | null>(null);
  const entrevista = useEntrevista(quadro, cursor, { configId, convite });
  const midia = useMidiaLocal();
  // A voz do agente chega depois de uma chamada assíncrona: libera o áudio no primeiro gesto (ex.: "Começar").
  useLiberarAudio();
  const { estado, sessao } = entrevista;
  const liberarMidia = midia.liberar;
  useEffect(() => {
    if (estado.fase === "ENCERRADA") liberarMidia();
  }, [estado.fase, liberarMidia]);
  const demo = useDemoRequisitos();
  // `?debug=1` mostra os botões de demonstração; `?iniciar=1` pula o modal (o lobby já foi feito na pré-entrevista).
  const [debug, setDebug] = useState(false);
  const [iniciarAuto, setIniciarAuto] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setDebug(p.get("debug") === "1");
    setIniciarAuto(p.get("iniciar") === "1");
  }, []);

  // Cada requisito combinado é escrito pelo agente no próprio quadro, abaixo do enunciado.
  const requisitosEscritos = useRef(0);
  useEffect(() => {
    if (!quadro) return;
    while (requisitosEscritos.current < demo.requisitos.length) {
      const indice = requisitosEscritos.current++;
      void anotarRequisito({ quadro, cursor: cursor.current, texto: demo.requisitos[indice].texto, indice }).catch((erro) =>
        console.warn("[requisitos]", erro),
      );
    }
  }, [demo.requisitos, quadro]);
  // A mudança no problema (empecilho) entra como um requisito novo, escrito do mesmo jeito que os outros.
  const { combinar: combinarRequisito } = demo;
  const requisitoDaMudanca = entrevista.empecilho?.requisito;
  useEffect(() => {
    if (requisitoDaMudanca) combinarRequisito(requisitoDaMudanca);
  }, [requisitoDaMudanca, combinarRequisito]);
  const [confirmandoFim, setConfirmandoFim] = useState(false);
  const cancelarFim = useCallback(() => setConfirmandoFim(false), []);

  // A resposta a um plin termina sozinha quando o candidato fala e depois fica em silêncio.
  useFimPorSilencio({
    ativo: estado.plin === "PERGUNTA_ATIVA" && !usarServidor(),
    agenteFalando: entrevista.agenteFalando,
    volume: midia.volume,
    aoTerminar: entrevista.terminarResposta,
  });

  function aoMudarDesenho(elementos: NonDeletedExcalidrawElement[]) {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[quadro] ${elementos.length} elemento(s)`, elementos);
    }
    entrevista.desenhoMudou();
  }

  function aoQuadroPronto(q: Quadro) {
    setQuadro(q);
    // Só para depurar no console do navegador durante o desenvolvimento.
    if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_E2E === "1") {
      (window as unknown as { quadro: Quadro }).quadro = q;
    }
  }

  async function comecar() {
    await midia.pedir();
    entrevista.comecar();
  }
  // Vindo do lobby da pré-entrevista: começa sozinho, uma vez. Sem gesto prévio do usuário (áudio bloqueado),
  // o modal normal continua à espera do clique.
  const iniciouSozinho = useRef(false);

  const { enviarTexto } = entrevista;
  const { combinar } = demo;
  const enviarFala = useCallback(
    async (texto: string, opcoes?: { sinal?: AbortSignal; substitui?: boolean }) => {
      const { requisito } = await enviarTexto(texto, opcoes);
      if (requisito) combinar(requisito);
    },
    [enviarTexto, combinar],
  );

  const [parcialVoz, setParcialVoz] = useState("");
  const { registrarSom, registrarFalaParcial } = entrevista;
  useEffect(() => {
    if (midia.microfoneLigado && midia.volume > 0.08) registrarSom();
  }, [midia.microfoneLigado, midia.volume, registrarSom]);
  const [falaPendente, setFalaPendente] = useState<string | null>(null);
  const enviarVozRef = useRef(enviarFala);
  enviarVozRef.current = enviarFala;
  const pedirParaRepetirRef = useRef(entrevista.pedirParaRepetir);
  pedirParaRepetirRef.current = entrevista.pedirParaRepetir;
  const filaVoz = useRef<FilaFalas | null>(null);
  const respostaRef = useRef({ naoOuvida: entrevista.respostaNaoOuvida, descartar: entrevista.descartarRespostaNaoOuvida });
  respostaRef.current = { naoOuvida: entrevista.respostaNaoOuvida, descartar: entrevista.descartarRespostaNaoOuvida };
  if (!filaVoz.current) filaVoz.current = new FilaFalas(
    async (texto, sinal, { substitui }) => { await enviarVozRef.current(texto, { sinal, substitui }); setFalaPendente(null); },
    // Falhou mesmo com a nova tentativa: o agente pede para repetir (a conversa segue) e o texto fica para reenviar.
    (texto) => { setFalaPendente(texto); pedirParaRepetirRef.current(); },
    // Ele continuou falando antes de ouvir a resposta: a resposta sai e as duas partes vão juntas.
    { respostaNaoOuvida: () => respostaRef.current.naoOuvida(), descartarResposta: () => respostaRef.current.descartar() },
  );
  useEffect(() => {
    if (estado.fase === "ENCERRADA") filaVoz.current?.limpar();
  }, [estado.fase]);
  useEffect(() => () => filaVoz.current?.limpar(), []);
  // Turn-taking: os trechos finais do STT se acumulam e só seguem após o silêncio de `esperaDoFimDaFala`
  // (1,5 s com a frase fechada; até 2,6 s quando ela termina pendurada, "e aí eu colocaria...").
  // Fala parcial ou voz no microfone nesse intervalo adia o envio (não corta a frase no meio).
  // Teto: barulho constante da sala não pode segurar a fala para sempre (2,5 s depois do primeiro trecho, só o
  // silêncio em curso decide).
  const bufferVoz = useRef("");
  const timerVoz = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicioBufferVoz = useRef(0);
  const agendarEnvioVoz = useCallback((porVolume = false) => {
    if (porVolume && Date.now() - inicioBufferVoz.current > 2500) return;
    if (timerVoz.current) clearTimeout(timerVoz.current);
    timerVoz.current = setTimeout(() => {
      timerVoz.current = null;
      const texto = bufferVoz.current.trim();
      bufferVoz.current = "";
      if (texto) filaVoz.current?.adicionar(texto);
    }, esperaDoFimDaFala(bufferVoz.current));
  }, []);
  const receberVoz = useCallback((texto: string) => {
    if (!texto.trim()) return;
    if (!bufferVoz.current) inicioBufferVoz.current = Date.now();
    bufferVoz.current = bufferVoz.current ? `${bufferVoz.current} ${texto.trim()}` : texto.trim();
    agendarEnvioVoz();
  }, [agendarEnvioVoz]);
  useEffect(() => {
    if (timerVoz.current && midia.volume > 0.08) agendarEnvioVoz(true);
  }, [midia.volume, agendarEnvioVoz]);
  useEffect(() => () => { if (timerVoz.current) clearTimeout(timerVoz.current); }, []);
  useEffect(() => {
    if (estado.fase !== "ENCERRADA") return;
    if (timerVoz.current) clearTimeout(timerVoz.current);
    timerVoz.current = null;
    bufferVoz.current = "";
  }, [estado.fase]);

  const receberParcial = useCallback((texto: string) => {
    setParcialVoz(texto);
    registrarFalaParcial(texto);
    if (texto && timerVoz.current) agendarEnvioVoz();
  }, [registrarFalaParcial, agendarEnvioVoz]);

  // Sem barge-in: ninguém fala por cima de ninguém. O Totti termina a frase dele e só toma a vez numa pausa do
  // candidato (lib/conversa/turnos.ts); o botão "Interromper voz" continua para quem quiser calar de propósito.
  const escuta = useTranscricao({
    stream: midia.stream,
    ativo: midia.microfoneLigado && estado.fase !== "AGUARDANDO" && estado.fase !== "ENCERRADA" && !entrevista.agenteFalando,
    sessaoId: sessao?.sessao_id ?? null,
    contexto: "quadro",
    servidor: usarServidor(),
    aoParcial: receberParcial,
    aoFinal: receberVoz,
  });

  const pronto = quadro !== null && sessao !== null;
  useEffect(() => {
    if (!iniciarAuto || iniciouSozinho.current || !pronto || estado.fase !== "AGUARDANDO") return;
    if (!(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) return;
    iniciouSozinho.current = true;
    void comecar().catch((erro) => {
      console.warn("[sala] início automático falhou:", erro);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iniciarAuto, pronto, estado.fase]);
  const mostrarCartao = estado.fase === "AGUARDANDO" || estado.fase === "ENCERRADA";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-superficie">
      <Canvas onDesenhoMudou={aoMudarDesenho} onPronto={aoQuadroPronto} />

      {estado.fase !== "AGUARDANDO" && (
        <JanelaChamada
          fase={NOME_DA_FASE[estado.fase]}
          respondendo={estado.plin === "PERGUNTA_ATIVA"}
          encerrada={estado.fase === "ENCERRADA"}
          marcadores={{ fase: estado.fase, plin: estado.plin }}
          iniciadaEm={entrevista.iniciadaEm}
          midia={midia}
          agenteFalando={entrevista.agenteFalando}
          agentePensando={entrevista.aguardandoResposta}
          onTerminarResposta={entrevista.terminarResposta}
          onEncerrar={() => setConfirmandoFim(true)}
        />
      )}

      <Legenda fala={entrevista.falaAtual} />
      {estado.fase !== "ENCERRADA" && (parcialVoz || escuta.erro || falaPendente || entrevista.aguardandoResposta) && (
        <div role="status" className="absolute bottom-20 left-4 z-10 max-w-md rounded-padrao bg-superficie p-3 text-sm shadow-padrao">
          {parcialVoz && <p>{parcialVoz}</p>}
          {entrevista.aguardandoResposta && !parcialVoz && <p>O agente está preparando a resposta…</p>}
          {escuta.erro && <p>{escuta.erro}</p>}
          {falaPendente && (
            <div>
              <p>Não consegui enviar sua fala: “{falaPendente}”</p>
              <button type="button" onClick={() => filaVoz.current?.tentarNovamente()} className="mt-2 underline">Tentar enviar novamente</button>
            </div>
          )}
        </div>
      )}

      {/* Só para demonstração: dispara a pergunta do agente e encena a conversa dos requisitos. */}
      {debug && estado.fase !== "AGUARDANDO" && estado.fase !== "ENCERRADA" && (
        <div className="absolute top-[72px] left-4 z-10 flex gap-2">
          <button
            onClick={entrevista.perguntaDemo}
            disabled={estado.plin !== "LIVRE"}
            className="rounded-full border border-borda bg-vidro px-3.5 py-1.5 text-xs font-medium text-texto-suave shadow-padrao backdrop-blur-xl transition-[opacity,transform] duration-150 ease-suave hover:text-texto active:scale-95 disabled:opacity-40"
          >
            Demo: fazer pergunta
          </button>
          <button
            onClick={demo.encenar}
            disabled={demo.encenando || demo.acabou}
            aria-label="Demonstração: combinar o próximo requisito"
            className="rounded-full border border-borda bg-vidro px-3.5 py-1.5 text-xs font-medium text-texto-suave shadow-padrao backdrop-blur-xl transition-[opacity,transform] duration-150 ease-suave outline-none hover:text-texto focus-visible:ring-2 focus-visible:ring-marca active:scale-95 disabled:opacity-40"
          >
            Demo: combinar requisito
          </button>
          {/* Só fora de produção (o servidor também recusa): solta a mudança no problema na hora. */}
          {(process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E === "1") && usarServidor() && (
            <button
              type="button"
              onClick={entrevista.forcarEmpecilho}
              disabled={entrevista.empecilho !== null || entrevista.forcandoEmpecilho}
              className="rounded-full border border-borda bg-vidro px-3.5 py-1.5 text-xs font-medium text-texto-suave shadow-padrao backdrop-blur-xl transition-[opacity,transform] duration-150 ease-suave outline-none hover:text-texto focus-visible:ring-2 focus-visible:ring-marca active:scale-95 disabled:opacity-40"
            >
              Forçar empecilho
            </button>
          )}
        </div>
      )}

      {estado.fase !== "AGUARDANDO" && (
        <div data-painel-direito className="absolute top-[72px] right-4 z-10 flex items-start gap-2">
          <button type="button" onClick={entrevista.alternarVoz}
            aria-label={entrevista.vozHabilitada ? "Silenciar respostas por voz" : "Ativar respostas por voz"}
            aria-pressed={entrevista.vozHabilitada}
            className="rounded-full border border-borda bg-vidro px-3 py-2 text-xs shadow-padrao">
            {entrevista.vozHabilitada ? "Silenciar voz" : "Ativar voz"}
          </button>
          {entrevista.agenteFalando && (
            <button type="button" onClick={entrevista.silenciar} className="rounded-full border border-borda bg-vidro px-3 py-2 text-xs shadow-padrao">
              Interromper voz
            </button>
          )}
        </div>
      )}

      <ConfirmarEncerrar
        aberto={confirmandoFim}
        onCancelar={cancelarFim}
        onConfirmar={() => {
          setConfirmandoFim(false);
          entrevista.encerrar();
        }}
      />

      <CursorAgente
        onPronto={(c) => {
          cursor.current = c;
        }}
      />

      <AnimatePresence>
        {mostrarCartao && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-fundo/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.36, ease: [0.32, 0.72, 0, 1] }}
              className="flex w-[380px] flex-col gap-4 rounded-padrao bg-superficie p-8 shadow-flutuante"
            >
              {estado.fase === "AGUARDANDO" ? (
                <>
                  <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">
                    {sessao ? `Entrevista de ${sessao.area}` : "Entrevista"}
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight">Pronto para começar?</h1>
                  <p className="leading-relaxed text-texto-suave">
                    O entrevistador vai apresentar o problema no quadro e acompanhar o seu desenho. Fale com
                    ele sempre que quiser. Quando terminar uma etapa ou quiser um comentário sobre o desenho,
                    é só avisar. O agente também pode fazer perguntas nas pausas da conversa.
                  </p>
                  <p className="text-sm leading-relaxed text-texto-suave">
                    Vamos pedir a câmera e o microfone. A sua câmera aparece só para você: não é gravada nem
                    analisada.
                  </p>
                  <button
                    onClick={comecar}
                    disabled={!pronto}
                    className="mt-2 rounded-full bg-marca px-5 py-2.5 font-medium text-sobre-marca transition-[opacity,transform] duration-150 ease-suave hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                  >
                    {pronto ? "Começar" : "Preparando o desafio…"}
                  </button>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight">Entrevista encerrada</h1>
                  <p className="leading-relaxed text-texto-suave">
                    Obrigado pelo seu tempo. A equipe de recrutamento recebe o resultado e entra em contato com
                    você.
                  </p>
                  {/* Só para demonstração: em produção, a recrutadora recebe o link pelo painel dela. */}
                  {debug && sessao && usarServidor() && (
                    <a
                      href={`/relatorio/${encodeURIComponent(sessao.sessao_id)}`}
                      target="_blank"
                      rel="noopener"
                      className="mt-1 w-fit rounded-full border border-borda px-3.5 py-1.5 text-xs font-medium text-texto-suave outline-none transition-[color,transform] duration-150 ease-suave hover:text-texto focus-visible:ring-2 focus-visible:ring-marca active:scale-95"
                    >
                      Demo: ver o relatório da recrutadora
                    </a>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
