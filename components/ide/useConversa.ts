/**
 * A conversa do live coding: uma só, por voz, do começo ao fim da entrevista (como no quadro).
 *
 * - O candidato fala a qualquer momento; cada fala vai ao entrevistador, que decide pela intenção se responde
 *   ou só ouve (pensando em voz alta). Falas que chegam antes de ele ouvir a resposta da anterior se juntam a ela
 *   (lib/audio/filaFalas.ts): o Totti nunca começa uma resposta e troca por outra.
 * - As perguntas do Totti (da análise do código: lib/agents/policy.ts) abrem um FIO: a pergunta é falada numa
 *   pausa e as respostas seguintes vão para ela, até o entrevistador fechar o assunto. Não há balão nem barra:
 *   o fio é só o assunto em andamento.
 * - Uma fala do Totti por vez: nenhuma corta a outra. O grifo de uma fala sai antes da próxima e quando o
 *   assunto fecha.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FilaFalas } from "@/lib/audio/filaFalas";
import { FALAS_DE_REPETICAO } from "@/lib/conversa/falasDeReserva";
import type { Blip, ChatMessage, ChatResponse, EditorCommand } from "@/lib/contracts";
import { postChat } from "./api";
import type { EventInput } from "./useSession";

/** Fala na conversa: a mensagem do contrato mais o horário em que aconteceu (Date.now()). */
export type Fala = ChatMessage & { at: number };

/** Falas fora das perguntas do Totti que vão como contexto para o entrevistador (as mais recentes). */
const MAX_FALAS_LIVRES = 12;
/** Fora de uma pergunta, frases com menos palavras que isso não entram na linha do tempo (o Totti ainda ouve). */
const MIN_PALAVRAS_FALA = 2;
/** Falhou duas vezes ao mandar a fala: o Totti pede para repetir em vez de ficar calado. */
const PEDIDOS_DE_REPETICAO = FALAS_DE_REPETICAO;

export interface ConversaDeps {
  sessionId: string | null;
  sendEvent: (input: EventInput) => Promise<void>;
  applyCommands: (commands: EditorCommand[]) => void;
  /** Sintetiza e toca a fala na vez do Totti. true se tocou até o fim. */
  falar: (texto: string) => Promise<boolean>;
  /** Cala a voz (sem efeito se não há fala). */
  parar: () => void;
  /** A voz já começou a tocar: o candidato está ouvindo a resposta. */
  vozTocando: () => boolean;
  /** Código e linguagem de agora: vão junto de cada turno para o Totti nunca comentar versão velha. */
  getLiveCode?: () => { code: string; language: string };
  /** O candidato pediu, falando, para encerrar a entrevista. */
  onFinishRequest?: () => void;
  /** Uma pergunta do Totti terminou (o assunto fechou). */
  onFioFechado?: (blip: Blip) => void;
  /** A fala não saiu em voz (desligada ou bloqueada pelo navegador): vai para a legenda. */
  onSemVoz?: (texto: string) => void;
  /** O candidato está falando agora (transcrição parcial aberta): a pergunta do Totti não fecha por silêncio. */
  falandoAgora?: () => boolean;
}

/**
 * O "uhum" do Totti assim que o candidato termina de falar, enquanto a resposta é preparada: ele sabe na hora que foi
 * ouvido (a resposta de verdade leva alguns segundos). Curtos para o áudio ficar guardado (lib/voz/cliente.ts).
 */
export const RECONHECIMENTOS = ["Uhum, entendi.", "Legal, hmm.", "Hum, certo.", "Uhum, saquei.", "Tá, entendi."];
/** Falas mais curtas que isso ("tá", "ok") já são um reconhecimento: o Totti não responde com outro. */
const MIN_PALAVRAS_RECONHECER = 4;
/** Fora de uma conversa, só falas com pelo menos isso de palavras ganham o "uhum". */
const MIN_PALAVRAS_RECONHECER_FORA_DA_CONVERSA = 8;
/** Uma conversa recente: o Totti falou há menos que isso. */
const CONVERSA_RECENTE_MS = 60_000;
/** Dois "uhum" seguidos (a fala chegou em pedaços) não: no máximo um nesse intervalo. */
const ENTRE_RECONHECIMENTOS_MS = 8_000;

/** Sem resposta à pergunta do Totti por tanto tempo (depois de ele terminar de perguntar): o assunto fecha. */
const FIO_SEM_RESPOSTA_MS = 35_000;
/** Sem resposta ao pedido de licença: ele está concentrado, a pergunta fica para depois. */
const LICENCA_SEM_RESPOSTA_MS = 10_000;
/** Pedidos de licença, variados para não soar como gravação. */
const PEDIDOS_DE_LICENCA = [
  "Ei, posso te perguntar uma coisa sobre o seu código?",
  "Tenho uma dúvida sobre o que você escreveu. Posso perguntar agora?",
  "Posso te interromper rapidinho com uma pergunta?",
];
/** "Espera", "agora não", "só um minuto": a pergunta fica para depois. */
const ESPERA = /\b(espera|espere|pera|peraí|perai|agora n[ãa]o|n[ãa]o agora|ainda n[ãa]o|s[óo] um (minuto|minutinho|segundo|segundinho|pouco|pouquinho|instante)|um (minuto|minutinho|segundo|instante)|daqui a pouco|depois|calma|aguenta)\b/i;
/** Liberou de forma explícita ("pode falar", "manda"): vale mesmo que a frase tenha um "depois" no meio. */
const PODE = /\b(pode (falar|perguntar|mandar)|manda|claro|sim|fala a[íi]|pode sim)\b/i;

/** A resposta ao pedido de licença: true pode perguntar, false é para esperar. */
export function liberouAPergunta(fala: string): boolean {
  if (PODE.test(fala)) return true;
  return !ESPERA.test(fala) && !/^\s*n[ãa]o\b/i.test(fala);
}

type Fio = { blip: Blip; falas: Fala[] };
type Licenca = { blip: Blip; desde: number };
type Pendente = { versao: number; lista: Fala[]; fala: Fala };

const palavras = (texto: string) => texto.split(/\s+/).filter(Boolean).length;

function tirarUltimaDoCandidato(lista: Fala[]): void {
  const i = lista.findLastIndex((f) => f.role === "candidate");
  if (i >= 0) lista.splice(i);
}

export function useConversa(deps: ConversaDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [fio, setFio] = useState<Blip | null>(null);
  const [pensando, setPensando] = useState(false);

  const fioRef = useRef<Fio | null>(null);
  const livresRef = useRef<Fala[]>([]);
  /** Abertura de uma pergunta em andamento: a fala do candidato espera a pergunta sair antes de ir. */
  const aberturaRef = useRef<Promise<void> | null>(null);
  /** Cada fala do Totti ganha uma versão; uma fala descartada ou trocada deixa de valer. */
  const versaoRef = useRef(0);
  const pendenteRef = useRef<Pendente | null>(null);
  const ultimaFalaDoAgenteEmRef = useRef(0);
  const pedidosEmVooRef = useRef(0);
  const repeticoesRef = useRef(0);
  /** O Totti pediu licença para perguntar e espera o "pode" ou o "espera". */
  const licencaRef = useRef<Licenca | null>(null);
  const licencasRef = useRef(0);
  /** A pergunta do fio já foi feita e ele ainda não respondeu: desde quando. */
  const semRespostaDesdeRef = useRef<number | null>(null);
  const reconheceuEmRef = useRef(0);
  const reconhecimentosRef = useRef(0);

  const listaAtual = () => fioRef.current?.falas ?? livresRef.current;
  const aparar = () => {
    if (livresRef.current.length > MAX_FALAS_LIVRES) livresRef.current.splice(0, livresRef.current.length - MAX_FALAS_LIVRES);
  };
  const comecarPedido = () => {
    pedidosEmVooRef.current++;
    setPensando(true);
  };
  const terminarPedido = () => {
    pedidosEmVooRef.current = Math.max(0, pedidosEmVooRef.current - 1);
    setPensando(pedidosEmVooRef.current > 0);
  };

  const fecharFio = useCallback((reason: "agent" | "button", porSilencio = false) => {
    const atual = fioRef.current;
    if (!atual) return;
    fioRef.current = null;
    // Fechou porque ele demorou a responder: se a resposta vier agora, como fala livre, ela ainda tem a pergunta junto.
    if (porSilencio) {
      livresRef.current.push(...atual.falas);
      aparar();
    }
    semRespostaDesdeRef.current = null;
    setFio(null);
    void depsRef.current.sendEvent({ type: "blip_closed", blipId: atual.blip.id, reason });
    depsRef.current.applyCommands([{ type: "clear_highlights" }]);
    depsRef.current.onFioFechado?.(atual.blip);
  }, []);

  /**
   * Fala do Totti, uma por vez. O grifo da fala anterior sai antes; o desta fica enquanto o assunto está aberto
   * e sai quando ele fecha. A linha do tempo só recebe a fala que foi dita (uma descartada antes de tocar não vale).
   */
  const responder = useCallback(async (res: Pick<ChatResponse, "reply" | "commands" | "end">, lista: Fala[], blip: Blip | undefined) => {
    const d = depsRef.current;
    const fala: Fala = { role: "agent", text: res.reply, at: Date.now() };
    lista.push(fala);
    if (lista === livresRef.current) aparar();
    const versao = ++versaoRef.current;
    pendenteRef.current = { versao, lista, fala };
    d.applyCommands([{ type: "clear_highlights" }, ...res.commands.filter((c) => c.type !== "clear_highlights")]);
    const tocou = await d.falar(res.reply);
    if (pendenteRef.current?.versao === versao) pendenteRef.current = null;
    if (versaoRef.current !== versao) return;
    ultimaFalaDoAgenteEmRef.current = Date.now();
    void d.sendEvent({ type: "speech", role: "agent", text: res.reply, blipId: blip?.id });
    if (!tocou) d.onSemVoz?.(res.reply);
    // Pergunta feita dentro de um assunto: se ele não responder, o assunto fecha sozinho (ver FIO_SEM_RESPOSTA_MS).
    if (!res.end && blip && fioRef.current?.blip.id === blip.id) semRespostaDesdeRef.current = Date.now();
    if (!res.end) return;
    if (blip && fioRef.current?.blip.id === blip.id) fecharFio("agent");
    else d.applyCommands([{ type: "clear_highlights" }]);
  }, [fecharFio]);

  /** Uma fala do candidato (já sem as pausas: ver PAUSA_FIM_DA_FALA_MS) indo ao entrevistador. */
  const enviar = useCallback(async (texto: string, sinal: AbortSignal, { substitui }: { substitui: boolean }) => {
    const d = depsRef.current;
    if (d.sessionId === null) return;
    if (aberturaRef.current) await aberturaRef.current;
    semRespostaDesdeRef.current = null;
    const lista = listaAtual();
    if (substitui) tirarUltimaDoCandidato(lista);
    const fala: Fala = { role: "candidate", text: texto, at: Date.now() };
    lista.push(fala);
    const blip = fioRef.current?.blip;
    let res: ChatResponse;
    comecarPedido();
    try {
      const live = d.getLiveCode?.();
      res = await postChat({
        sessionId: d.sessionId,
        ...(live ? { code: live.code, language: live.language } : {}),
        blipId: blip?.id,
        messages: lista.map(({ role, text }) => ({ role, text })),
      }, sinal);
      if (sinal.aborted) throw new DOMException("Substituída por uma fala nova.", "AbortError");
    } catch (erro) {
      const i = lista.indexOf(fala);
      if (i >= 0) lista.splice(i, 1);
      throw erro;
    } finally {
      terminarPedido();
    }
    repeticoesRef.current = 0;
    if (blip || palavras(texto) >= MIN_PALAVRAS_FALA) void d.sendEvent({ type: "speech", role: "candidate", text: texto, blipId: blip?.id });
    if (lista === livresRef.current) aparar();
    if (res.finish) {
      d.onFinishRequest?.();
      return;
    }
    if (res.listening || !res.reply.trim()) return;
    // A resposta toca sem segurar a fila: se ele voltar a falar antes de ela começar, a fila a substitui.
    void responder(res, lista, blip);
  }, [responder]);

  /** Fala que não é resposta a nada (apresentação, despedida, pedido para repetir): entra na conversa e é dita. */
  const dizer = useCallback(async (texto: string): Promise<boolean> => {
    const d = depsRef.current;
    const fala: Fala = { role: "agent", text: texto, at: Date.now() };
    listaAtual().push(fala);
    aparar();
    void d.sendEvent({ type: "speech", role: "agent", text: texto, blipId: fioRef.current?.blip.id });
    const versao = ++versaoRef.current;
    pendenteRef.current = null;
    const tocou = await d.falar(texto);
    if (versaoRef.current === versao) ultimaFalaDoAgenteEmRef.current = Date.now();
    if (!tocou && versaoRef.current === versao) d.onSemVoz?.(texto);
    return tocou;
  }, []);

  const filaRef = useRef<FilaFalas | null>(null);
  if (!filaRef.current) {
    filaRef.current = new FilaFalas(
      (texto, sinal, opcoes) => enviarRef.current(texto, sinal, opcoes),
      () => void dizerRef.current(PEDIDOS_DE_REPETICAO[repeticoesRef.current++ % PEDIDOS_DE_REPETICAO.length]),
      {
        respostaNaoOuvida: () => pendenteRef.current !== null && !depsRef.current.vozTocando(),
        descartarResposta: () => {
          const p = pendenteRef.current;
          if (!p) return;
          pendenteRef.current = null;
          versaoRef.current++;
          depsRef.current.parar();
          const i = p.lista.indexOf(p.fala);
          if (i >= 0) p.lista.splice(i, 1);
        },
      },
    );
  }
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  const dizerRef = useRef(dizer);
  dizerRef.current = dizer;

  useEffect(() => () => {
    filaRef.current?.limpar();
    versaoRef.current++;
    depsRef.current.parar();
  }, []);

  /** Fala do candidato: responde ao pedido de licença, vai para a pergunta em andamento, ou é uma fala livre. */
  const ouvir = useCallback((texto: string) => {
    const licenca = licencaRef.current;
    if (licenca) {
      licencaRef.current = null;
      if (liberouAPergunta(texto)) void abrirFioRef.current(licenca.blip);
      else adiarRef.current(licenca.blip, true);
      return;
    }
    reconhecer(texto);
    filaRef.current?.adicionar(texto);
  }, []);

  /** O "uhum" logo que ele termina de falar com o Totti (respondendo, perguntando, explicando). */
  const reconhecer = (texto: string) => {
    const n = palavras(texto);
    const agora = Date.now();
    const emConversa = fioRef.current !== null || agora - ultimaFalaDoAgenteEmRef.current < CONVERSA_RECENTE_MS;
    if (n < MIN_PALAVRAS_RECONHECER || (!emConversa && n < MIN_PALAVRAS_RECONHECER_FORA_DA_CONVERSA)) return;
    if (agora - reconheceuEmRef.current < ENTRE_RECONHECIMENTOS_MS || depsRef.current.vozTocando()) return;
    reconheceuEmRef.current = agora;
    void depsRef.current.falar(RECONHECIMENTOS[reconhecimentosRef.current++ % RECONHECIMENTOS.length]);
  };

  /** A pergunta fica para depois (o servidor a devolve à fila por um tempo). `avisar`: ele pediu, o Totti confirma. */
  const adiar = useCallback((blip: Blip, avisar: boolean) => {
    void depsRef.current.sendEvent({ type: "blip_snoozed", blipId: blip.id });
    if (avisar) void dizerRef.current("Beleza, eu volto daqui a pouco.");
  }, []);
  const adiarRef = useRef(adiar);
  adiarRef.current = adiar;

  /**
   * Antes de interromper quem está no meio do código, o Totti pede licença. "Pode" abre a pergunta; "espera"
   * (ou o silêncio) a deixa para depois.
   */
  const pedirLicenca = useCallback(async (blip: Blip): Promise<void> => {
    if (depsRef.current.sessionId === null || fioRef.current || licencaRef.current) return;
    const pedido = PEDIDOS_DE_LICENCA[licencasRef.current++ % PEDIDOS_DE_LICENCA.length];
    licencaRef.current = { blip, desde: Number.POSITIVE_INFINITY };
    await dizerRef.current(pedido);
    if (licencaRef.current?.blip.id === blip.id) licencaRef.current = { blip, desde: Date.now() };
  }, []);

  // Relógio da conversa: licença sem resposta e pergunta sem resposta não ficam penduradas para sempre.
  useEffect(() => {
    const id = setInterval(() => {
      const agora = Date.now();
      const licenca = licencaRef.current;
      if (licenca && agora - licenca.desde >= LICENCA_SEM_RESPOSTA_MS) {
        licencaRef.current = null;
        adiarRef.current(licenca.blip, false);
      }
      const desde = semRespostaDesdeRef.current;
      // Falando agora (a resposta está saindo): o relógio recomeça.
      if (desde !== null && depsRef.current.falandoAgora?.()) semRespostaDesdeRef.current = agora;
      else if (desde !== null && agora - desde >= FIO_SEM_RESPOSTA_MS && pedidosEmVooRef.current === 0 && !filaRef.current?.emAndamento) {
        semRespostaDesdeRef.current = null;
        fecharFio("agent", true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [fecharFio]);

  /** O Totti faz uma pergunta sua (da análise, uma mudança no problema, o encerramento): abre o assunto e fala. */
  const abrirFio = useCallback(async (blip: Blip): Promise<void> => {
    const d = depsRef.current;
    if (d.sessionId === null || fioRef.current) return;
    const atual: Fio = { blip, falas: [] };
    fioRef.current = atual;
    setFio(blip);
    void d.sendEvent({ type: "blip_opened", blipId: blip.id });
    const abertura = (async () => {
      comecarPedido();
      let res: ChatResponse;
      try {
        const live = d.getLiveCode?.();
        res = await postChat({ sessionId: d.sessionId!, ...(live ? { code: live.code, language: live.language } : {}), blipId: blip.id, messages: [] });
      } catch (erro) {
        console.error("POST /api/chat (abertura) falhou", erro);
        if (fioRef.current === atual) fecharFio("agent");
        return;
      } finally {
        terminarPedido();
      }
      if (fioRef.current !== atual) return;
      if (!res.reply.trim()) {
        fecharFio("agent");
        return;
      }
      void responder({ ...res, end: false }, atual.falas, blip);
    })();
    aberturaRef.current = abertura;
    try {
      await abertura;
    } finally {
      if (aberturaRef.current === abertura) aberturaRef.current = null;
    }
  }, [fecharFio, responder]);

  const abrirFioRef = useRef(abrirFio);
  abrirFioRef.current = abrirFio;

  /** Há algo em andamento na conversa: fala esperando, pedido em voo, resposta não ouvida ou licença pedida. */
  const ocupada = useCallback(
    () => pedidosEmVooRef.current > 0 || !!filaRef.current?.emAndamento || pendenteRef.current !== null || aberturaRef.current !== null || licencaRef.current !== null,
    [],
  );

  /** Encerrou a entrevista: nada mais vai ao entrevistador. */
  const parar = useCallback(() => {
    filaRef.current?.limpar();
    versaoRef.current++;
    pendenteRef.current = null;
    licencaRef.current = null;
    semRespostaDesdeRef.current = null;
  }, []);

  return { fio, pensando, ouvir, abrirFio, pedirLicenca, fecharFio, dizer, ocupada, parar, ultimaFalaDoAgenteEmRef, fioRef };
}
