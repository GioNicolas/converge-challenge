"use client";

// Liga a máquina de estados, o gatilho, o quadro e o modo de servidor escolhido.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Quadro } from "@/components/Canvas";
import type { ControleCursor } from "@/components/CursorAgente";
import type { MensagemConversa } from "@/components/quadro/PainelConversa";
import { pedirEmpecilho, perguntar } from "@/lib/sessao/servidor";
import { contarComponentes, esperaDoEmpecilho } from "@/lib/sessao/empecilho";
import { limparTextoDigitado } from "@/lib/sessao/textoDigitado";
import { montarFalaDoDesafio } from "@/lib/sessao/falaDoDesafio";
import { comoFuncionaQuadro } from "@/lib/conversa/instrucoes";
import { deveAguardarParaFalar, podeTomarTurno } from "@/lib/conversa/turnos";
import { alvosDaAcao, criarMemoriaVisual, mapearAcoesVisuais, resumirGestosRecentes } from "@/lib/presenca/acoesVisuais";
import { SILENCIO_INICIAL_S, SILENCIO_REPETIR_S, SILENCIO_S } from "@/lib/contracts";
import {
  analisar,
  calar,
  criarSessao,
  duvidaDeDemonstracao,
  enviarEventos,
  falar,
  finalizarSessao,
  falarComMarcas,
  usarServidor,
  type FalaNaTela,
  type FalaRecente,
  type PedidoAnalise,
  type Sessao,
} from "@/lib/sessao/cliente";
import { criarLinhaDoTempo } from "@/lib/sessao/eventos";
import { apontarEAnotar } from "@/lib/presenca/coreografia";
import type { MarcaDeFala } from "@/lib/presenca/vozSincronizada";
import {
  estadoInicial,
  podeAnalisar,
  transicionar,
  type EstadoEntrevista,
  type EventoEntrevista,
} from "@/lib/sessao/estados";
import { criarGatilho, type Gatilho } from "@/lib/sessao/gatilho";
import { criarConversor, type Instantaneo } from "@/lib/excalidraw/conversor";
import { descreverMudancas, houveMudancaRelevante } from "@/lib/excalidraw/diff";

type Acao = { evento: EventoEntrevista; agora: number };

/** Silêncios que disparam uma análise para o agente poder quebrá-los (valores compartilhados com o cérebro em lib/contracts.ts). */
const SILENCIO_MS = SILENCIO_S * 1000;
const SILENCIO_INICIAL_MS = SILENCIO_INICIAL_S * 1000;
const REPETIR_SILENCIO_MS = SILENCIO_REPETIR_S * 1000;
/** O enunciado vai em preto (a cor padrão do traço no Excalidraw); as anotações de pergunta, na cor do agente. */
const COR_ENUNCIADO = "#1e1e1e";
/** Silêncio depois de uma fala sem resposta do agente que encerra a resposta à pergunta ativa. */
const SILENCIO_FIM_DA_RESPOSTA_MS = 7_000;
/** Quando o pedido falha de vez: curtas, neutras e variadas. */
const FALAS_DE_REPETICAO = [
  "Desculpa, me perdi aqui. Pode repetir?",
  "Não peguei essa última parte. Pode falar de novo?",
  "Perdi o fio por um instante. Pode repetir o que disse?",
];
/** Entre um pedido de mudança recusado pelo servidor e o próximo. */
const INTERVALO_PEDIDO_EMPECILHO_MS = 15_000;
/** Respostas do servidor que encerram as tentativas nesta sessão. */
const MOTIVOS_DEFINITIVOS_EMPECILHO = ["problema sem mudança prevista", "já anunciado"];

function redutor(estado: EstadoEntrevista, acao: Acao) {
  return transicionar(estado, acao.evento, acao.agora);
}

/** Aguarda a prova por até 300 ms; a tarefa original continua para registrar a URL tardia. */
export async function pedidoComImagem(
  pedido: PedidoAnalise,
  imagem: Promise<string | null>,
  sinal: AbortSignal,
): Promise<PedidoAnalise> {
  sinal.throwIfAborted();
  let prazo: ReturnType<typeof setTimeout> | undefined;
  let cancelar: (() => void) | undefined;
  try {
    const url = await Promise.race([
      imagem.catch(() => null),
      new Promise<null>((resolver) => { prazo = setTimeout(() => resolver(null), 300); }),
      new Promise<never>((_, rejeitar) => {
        cancelar = () => rejeitar(sinal.reason);
        sinal.addEventListener("abort", cancelar, { once: true });
      }),
    ]);
    sinal.throwIfAborted();
    return url ? { ...pedido, imagem_url: url } : pedido;
  } finally {
    if (prazo !== undefined) clearTimeout(prazo);
    if (cancelar) sinal.removeEventListener("abort", cancelar);
  }
}

/**
 * `configId`: plano de entrevista da vaga (o servidor escolhe o kit e calibra o agente por ele).
 * `convite`: id do link do e-mail; liga esta sessão ao candidato no painel da vaga.
 */
export function useEntrevista(
  quadro: Quadro | null,
  cursor: React.RefObject<ControleCursor | null>,
  opcoes: { configId?: string; convite?: string } = {},
) {
  const { configId, convite } = opcoes;
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const criacaoDaSessao = useRef<Promise<Sessao> | null>(null);
  const [estado, despachar] = useReducer(redutor, undefined, estadoInicial);
  const enviar = useCallback(
    (evento: EventoEntrevista) => despachar({ evento, agora: Date.now() }),
    [],
  );

  const estadoAtual = useRef(estado);
  useEffect(() => {
    estadoAtual.current = estado;
  }, [estado]);

  // O que o agente está falando agora (para o orb e a legenda).
  const [falaAtual, setFalaAtual] = useState<FalaNaTela | null>(null);
  const [agenteFalando, setAgenteFalando] = useState(false);
  const [vozHabilitada, setVozHabilitada] = useState(true);
  const vozHabilitadaRef = useRef(true);
  const fimDaLegenda = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versaoDaFala = useRef(0);
  const cicloDaSala = useRef(0);
  const ultimaFalaEm = useRef(0);
  /** Última vez que o agente começou ou terminou de falar (o empecilho espera um respiro). */
  const ultimaFalaDoAgenteEm = useRef<number | null>(null);
  const falaParcial = useRef(false);
  const agenteFalandoRef = useRef(false);
  const pedidosEmAndamento = useRef(0);
  const revisaoDaConversa = useRef(0);
  const [aguardandoResposta, setAguardandoResposta] = useState(false);
  const [preparandoVoz, setPreparandoVoz] = useState(false);
  const preparandoVozRef = useRef(false);
  const memoriaVisual = useRef(criarMemoriaVisual());
  const visualDaConversa = useRef<{ quadro: Quadro; grupo: string; controle: AbortController; tarefa?: Promise<void> } | null>(null);
  const limparVisualDaConversa = useCallback(() => {
    const atual = visualDaConversa.current;
    visualDaConversa.current = null;
    if (!atual) return;
    atual.controle.abort();
    void (atual.tarefa ?? Promise.resolve()).then(() => atual.quadro.agente.apagarGrupo(atual.grupo));
  }, []);

  const dizer = useCallback(async (texto: string, marcas?: MarcaDeFala[]) => {
    const versao = ++versaoDaFala.current;
    ultimaFalaDoAgenteEm.current = Date.now();
    if (fimDaLegenda.current) clearTimeout(fimDaLegenda.current);
    setFalaAtual({ quem: "agente", texto, ate: 0 });
    setAgenteFalando(false);
    agenteFalandoRef.current = false;
    linhaDoTempo.current?.registrar("fala", { quem: "agente", texto });
    if (!vozHabilitadaRef.current) {
      setPreparandoVoz(false);
      preparandoVozRef.current = false;
      marcas?.forEach((marca) => marca.aoChegar());
      setAgenteFalando(false);
      agenteFalandoRef.current = false;
      setFalaAtual({ quem: "agente", texto, ate: texto.length });
      fimDaLegenda.current = setTimeout(() => setFalaAtual(null), 8000);
      return;
    }
    setPreparandoVoz(true);
    preparandoVozRef.current = true;
    // Sintetize enquanto a escuta segue ativa; confira o turno só antes de reproduzir.
    const antesDeTocar = async () => {
      const esperandoDesde = Date.now();
      while (estadoAtual.current.fase !== "APRESENTACAO" && estadoAtual.current.fase !== "ENCERRADA"
        && deveAguardarParaFalar({ agora: Date.now(), esperandoDesde, ultimaFalaEm: ultimaFalaEm.current, falaParcial: falaParcial.current })) {
        await new Promise<void>((resolver) => setTimeout(resolver, 100));
        if (versao !== versaoDaFala.current) return false;
      }
      if (versao !== versaoDaFala.current) return false;
      setPreparandoVoz(false);
      preparandoVozRef.current = false;
      setAgenteFalando(true);
      agenteFalandoRef.current = true;
      return true;
    };
    const aoProgresso = (ate: number) => {
      if (versao !== versaoDaFala.current) return;
      setFalaAtual((atual) => (versao === versaoDaFala.current && atual && atual.texto === texto && atual.ate !== ate ? { ...atual, ate } : atual));
    };
    if (marcas) await falarComMarcas(texto, marcas, aoProgresso, antesDeTocar);
    else await falar(texto, aoProgresso, antesDeTocar);
    if (versao !== versaoDaFala.current) return;
    ultimaFalaDoAgenteEm.current = Date.now();
    setAgenteFalando(false);
    setPreparandoVoz(false);
    preparandoVozRef.current = false;
    agenteFalandoRef.current = false;
    // A legenda fica um pouco depois da voz, para dar tempo de terminar de ler.
    fimDaLegenda.current = setTimeout(() => setFalaAtual(null), 1800);
  }, []);

  const silenciar = useCallback(() => {
    limparVisualDaConversa();
    versaoDaFala.current++;
    if (fimDaLegenda.current) clearTimeout(fimDaLegenda.current);
    calar();
    setAgenteFalando(false);
    setPreparandoVoz(false);
    preparandoVozRef.current = false;
    agenteFalandoRef.current = false;
    setFalaAtual(null);
  }, [limparVisualDaConversa]);
  const alternarVoz = useCallback(() => {
    vozHabilitadaRef.current = !vozHabilitadaRef.current;
    setVozHabilitada(vozHabilitadaRef.current);
    if (!vozHabilitadaRef.current) silenciar();
  }, [silenciar]);
  const silenciarSeAtual = useCallback((versao: number) => {
    if (versaoDaFala.current === versao) silenciar();
  }, [silenciar]);

  useEffect(() => () => {
    cicloDaSala.current++;
    versaoDaFala.current++;
    if (fimDaLegenda.current) clearTimeout(fimDaLegenda.current);
    calar();
    limparVisualDaConversa();
  }, [limparVisualDaConversa]);

  const conversor = useRef(criarConversor());
  const ultimoInstantaneo = useRef<Instantaneo | null>(null);
  const conversa = useRef<FalaRecente[]>([]);
  /** Última vez que o candidato mexeu no desenho ou falou (vai ao /analisar como `parado_ha_s`). */
  const ultimaAtividade = useRef(Date.now());
  /** Requisitos já combinados (vão ao /analisar para a análise não inventar contexto). */
  const requisitosCombinados = useRef<string[]>([]);
  const gatilho = useRef<Gatilho | null>(null);
  const linhaDoTempo = useRef<ReturnType<typeof criarLinhaDoTempo> | null>(null);
  const registrar = useCallback(
    (...args: Parameters<ReturnType<typeof criarLinhaDoTempo>["registrar"]>) =>
      linhaDoTempo.current?.registrar(...args),
    [],
  );
  /**
   * Manda já o que está na fila (sem esperar o lote de 5s). Pergunta e resposta mudam o estado
   * do servidor, e a análise seguinte precisa chegar depois delas. O prazo evita travar a análise.
   */
  const descarregarJa = useCallback((prazoMs = 1500) => {
    const linha = linhaDoTempo.current;
    if (!linha) return Promise.resolve();
    return Promise.race([
      linha.descarregar().catch(() => {}),
      new Promise<void>((resolver) => setTimeout(resolver, prazoMs)),
    ]);
  }, []);

  useEffect(() => {
    let cancelado = false;
    criacaoDaSessao.current ??= criarSessao({ configId });
    criacaoDaSessao.current.then((nova) => {
      if (!cancelado) setSessao(nova);
      // Liga a sessão ao convite (painel da vaga). Falhar não atrapalha a entrevista.
      if (convite && usarServidor()) {
        void fetch("/api/convites/sessao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ convite, sessionId: nova.sessao_id }),
        }).catch(() => {});
      }
    }).catch((erro) => console.warn("[sessão] não foi possível iniciar:", erro));
    return () => { cancelado = true; };
  }, [configId, convite]);

  // Linha do tempo da entrevista: vai ao servidor em lotes.
  useEffect(() => {
    if (!sessao) return;
    const linha = criarLinhaDoTempo({ enviar: (lote) => enviarEventos(sessao.sessao_id, lote) });
    linhaDoTempo.current = linha;
    return () => {
      linha.parar();
      void linha.descarregar().catch(() => {});
    };
  }, [sessao]);

  useEffect(() => {
    if (estado.fase !== "AGUARDANDO") registrar("fase", { fase: estado.fase });
    if (estado.fase !== "ENCERRADA" || !sessao) return;
    // Primeiro a linha do tempo inteira chega ao servidor; só depois ele gera o scorecard com ela.
    const linha = linhaDoTempo.current;
    void (linha ? linha.descarregar().catch(() => {}) : Promise.resolve())
      .then(() => finalizarSessao(sessao.sessao_id))
      .catch((erro) => console.warn("[fim] não foi possível gerar o relatório:", erro));
  }, [estado.fase, registrar, sessao]);

  // Gatilho da análise.
  useEffect(() => {
    if (!quadro || !sessao) return;
    let ativo = true;
    const imagens = new WeakMap<PedidoAnalise, Promise<string | null>>();
    let falaAoAnalisar = 0;
    let conversaAoAnalisar = 0;
    const g = criarGatilho({
      podeAnalisar: () => podeAnalisar(estadoAtual.current) && !falaParcial.current
        && !agenteFalandoRef.current && !preparandoVozRef.current && pedidosEmAndamento.current === 0,
      montarPedido: (forcar) => {
        falaAoAnalisar = ultimaFalaEm.current;
        conversaAoAnalisar = revisaoDaConversa.current;
        const elementos = quadro.api.getSceneElements();
        const r = conversor.current.converter(elementos);
        if (!forcar && !houveMudancaRelevante(ultimoInstantaneo.current, r.instantaneo)) return null;
        const mudancas = descreverMudancas(ultimoInstantaneo.current, r.instantaneo);
        ultimoInstantaneo.current = r.instantaneo;
        const pedido: PedidoAnalise = {
          sessao_id: sessao.sessao_id,
          fase: estadoAtual.current.fase,
          grafo: r.texto,
          mudancas,
          conversa_recente: conversa.current.slice(-6),
          perguntas_feitas: estadoAtual.current.perguntasFeitas,
          imagem_url: null,
          parado_ha_s: Math.round((Date.now() - ultimaAtividade.current) / 1000),
          requisitos: requisitosCombinados.current.slice(-30),
          gestos_recentes: resumirGestosRecentes(memoriaVisual.current),
        };
        console.log("[análise] pedido", pedido);
        if (mudancas) {
          registrar("desenho", { grafo: r.texto, mudancas });
          const horario = new Date().toISOString();
          const linha = linhaDoTempo.current;
          const imagem = (async () => {
            const estadoDaCaptura = quadro.api.getAppState();
            const arquivosDaCaptura = quadro.api.getFiles();
            const apiDaCaptura = {
              ...quadro.api,
              getSceneElements: () => elementos,
              getAppState: () => estadoDaCaptura,
              getFiles: () => arquivosDaCaptura,
            };
            const { imagemDoCandidato } = await import("@/lib/excalidraw/imagem");
            const png = await imagemDoCandidato(apiDaCaptura);
            if (!png) return null;
            if (!usarServidor()) {
              console.log("[desenho] PNG do candidato:", png.size, "bytes");
              return null;
            }
            const { enviarImagem } = await import("@/lib/sessao/servidor");
            const url = await enviarImagem(sessao.sessao_id, png, horario);
            const dados = { grafo: r.texto, mudancas, imagem_url: url, horario };
            if (ativo && linha) {
              linha.registrar("desenho", dados);
              if (estadoAtual.current.fase === "ENCERRADA") void linha.descarregar().catch(() => {});
            } else {
              await enviarEventos(sessao.sessao_id, [{ horario, tipo: "desenho", dados }]);
            }
            return url;
          })().catch((erro) => {
            console.warn("[desenho] imagem indisponível:", erro);
            return null;
          });
          imagens.set(pedido, imagem);
        }
        return pedido;
      },
      analisar: async (pedido, sinal) => {
        const imagem = imagens.get(pedido);
        const comImagem = usarServidor() && imagem ? await pedidoComImagem(pedido, imagem, sinal) : pedido;
        return analisar(comImagem, sinal);
      },
      aoResultado: (bruta) => {
        // IDs que não existem no quadro (o modelo inventou ou o candidato apagou) são ignorados.
        const resposta = { ...bruta, elementos: bruta.elementos.filter((c) => conversor.current.idReal(c)) };
        console.log("[análise] resposta", resposta);
        registrar("analise", resposta);
        // A pessoa continuou a explicação: uma intervenção calculada antes disso ficou velha.
        if (ultimaFalaEm.current > falaAoAnalisar || revisaoDaConversa.current !== conversaAoAnalisar
          || pedidosEmAndamento.current > 0) return;
        enviar({ tipo: "ANALISE_RECEBIDA", resposta });
      },
      aoErro: (erro) => console.warn("[análise] ignorada:", erro),
    });
    gatilho.current = g;
    return () => {
      ativo = false;
      g.parar();
    };
  }, [quadro, sessao, enviar, registrar]);

  // Tempo de cada fase.
  useEffect(() => {
    const segundos = sessao?.tempos[estado.fase];
    if (!segundos) return;
    const t = setTimeout(() => enviar({ tipo: "TEMPO_DA_FASE_ACABOU" }), segundos * 1000);
    return () => clearTimeout(t);
  }, [estado.fase, sessao, enviar]);

  // Apresentação: o agente fala e escreve o enunciado no quadro.
  useEffect(() => {
    if (estado.fase !== "APRESENTACAO" || !quadro || !sessao) return;
    let cancelado = false;
    (async () => {
      const { titulo, enunciado } = sessao.problema;
      // O que se ESCREVE no quadro é o enunciado; o que se FALA é a fala natural do desafio (ver falaDoDesafio.ts).
      const falaDoDesafio = `${montarFalaDoDesafio(sessao.problema)} Quando terminar uma etapa ou quiser um comentário sobre o desenho, é só me avisar.`;
      // O agente se apresenta antes de passar o desafio (a fala vem do cérebro; sem ela, vai direto ao desafio).
      // Logo depois do cumprimento: quanto tempo dura, como funciona e que "não sei" é uma resposta aceita.
      const comoFunciona = comoFuncionaQuadro(sessao.tempos);
      const abertura = sessao.apresentacao ? `${sessao.apresentacao} ${comoFunciona}` : comoFunciona;
      conversa.current.push({ quem: "agente", texto: abertura });
      await dizer(abertura);
      if (cancelado) return;
      conversa.current.push({ quem: "agente", texto: falaDoDesafio });
      const fala = dizer(falaDoDesafio);
      await quadro.agente.escrever({
        id: "agente-enunciado-titulo",
        grupo: "enunciado",
        texto: titulo,
        x: 40,
        y: 110,
        tamanho: 32,
        cor: COR_ENUNCIADO,
      });
      await quadro.agente.escrever({
        id: "agente-enunciado-texto",
        grupo: "enunciado",
        texto: enunciado,
        x: 40,
        y: 160,
        cor: COR_ENUNCIADO,
      });
      await fala;
      if (!cancelado) enviar({ tipo: "APRESENTACAO_TERMINOU" });
    })();
    return () => {
      cancelado = true;
    };
  }, [estado.fase, quadro, sessao, enviar, dizer]);

  // Pergunta ativa: a mão acompanha a palavra do primeiro alvo quando houver alinhamento.
  // Quando a resposta termina, o agente para (se ainda estiver desenhando) e apaga o que desenhou.
  const numeroPergunta = estado.perguntaAtiva?.numero ?? null;
  useEffect(() => {
    const p = estadoAtual.current.perguntaAtiva;
    if (numeroPergunta === null || !p || !quadro) return;
    const grupo = `pergunta:${numeroPergunta}`;
    const alvos = p.elementos
      .map((curto) => conversor.current.idReal(curto))
      .filter((id): id is string => !!id);

    registrar("pergunta", { numero: numeroPergunta, pergunta: p.pergunta, nota: p.nota, elementos: p.elementos });
    void descarregarJa();
    const controle = new AbortController();
    let coreografia: Promise<void> | null = null;
    let versaoDestaPergunta = versaoDaFala.current;
    const desenhar = () => {
      if (controle.signal.aborted || coreografia) return;
      coreografia = apontarEAnotar({
        quadro,
        cursor: cursor.current,
        grupo,
        alvos,
        nota: p.nota ?? p.pergunta ?? "?",
        visual: mapearAcoesVisuais(p.visual, (id) => conversor.current.idReal(id)),
        memoria: memoriaVisual.current,
        semente: numeroPergunta * 7919,
        sinal: controle.signal,
      }).catch((erro) => console.warn("[mão do agente]", erro));
    };
    if (p.pergunta) {
      conversa.current.push({ quem: "agente", texto: p.pergunta });
      const alvo = ultimoInstantaneo.current?.componentes.find((c) => c.id === p.elementos[0]);
      void dizer(p.pergunta, [{ trecho: alvo?.nome ?? "", aoChegar: desenhar }]);
      versaoDestaPergunta = versaoDaFala.current;
    } else desenhar();

    return () => {
      silenciarSeAtual(versaoDestaPergunta);
      controle.abort();
      void (coreografia ?? Promise.resolve()).then(() => quadro.agente.apagarGrupo(grupo));
    };
  }, [numeroPergunta, quadro, cursor, dizer, silenciarSeAtual, registrar, descarregarJa]);

  // Uma pergunta pertinente pode entrar numa pausa, sem exigir autorização por clique.
  // O plin continua disponível se a pessoa preferir chamá-la manualmente.
  useEffect(() => {
    if (estado.plin !== "PLIN_PENDENTE" || estado.pendenteDeDemo) return;
    const id = setInterval(() => {
      if (podeTomarTurno({ agora: Date.now(), ultimaFalaEm: ultimaFalaEm.current,
        falaParcial: falaParcial.current, agenteFalando: agenteFalandoRef.current,
        aguardandoResposta: pedidosEmAndamento.current > 0 || preparandoVozRef.current })) enviar({ tipo: "PLIN_CLICADO" });
    }, 150);
    return () => clearInterval(id);
  }, [estado.plin, estado.perguntaPendente, estado.pendenteDeDemo, enviar]);

  // Mudança no problema (empecilho): no meio da entrevista, numa pausa do candidato, o agente traz UMA mudança
  // pronta do kit, fala e escreve no quadro como requisito novo. O servidor confere a hora e registra na linha do tempo.
  const [empecilho, setEmpecilho] = useState<{ requisito: string } | null>(null);
  const empecilhoEmAndamento = useRef(false);
  const empecilhoEncerrado = useRef(false);
  const ultimoPedidoEmpecilho = useRef(0);
  const [forcandoEmpecilho, setForcandoEmpecilho] = useState(false);
  const pedirMudanca = useCallback(async (forcar: boolean) => {
    if (!sessao || !quadro || empecilhoEmAndamento.current || empecilhoEncerrado.current) return;
    const fase = estadoAtual.current.fase;
    if (fase === "AGUARDANDO" || fase === "ENCERRADA") return;
    empecilhoEmAndamento.current = true;
    ultimoPedidoEmpecilho.current = Date.now();
    if (forcar) setForcandoEmpecilho(true);
    try {
      const grafo = conversor.current.converter(quadro.api.getSceneElements()).texto.slice(0, 60_000);
      const r = await pedirEmpecilho(sessao.sessao_id, { fase, grafo, ...(forcar ? { forcar: true } : {}) });
      if (!r.empecilho) {
        if (r.motivo && MOTIVOS_DEFINITIVOS_EMPECILHO.includes(r.motivo)) empecilhoEncerrado.current = true;
        console.log("[empecilho] ainda não:", r.motivo);
        return;
      }
      empecilhoEncerrado.current = true;
      if (estadoAtual.current.fase === "ENCERRADA") return;
      const { fala, requisito } = r.empecilho;
      ultimaAtividade.current = Date.now();
      revisaoDaConversa.current++;
      conversa.current.push({ quem: "agente", texto: fala });
      if (!requisitosCombinados.current.includes(requisito)) requisitosCombinados.current.push(requisito);
      setMensagens((m) => [...m, { id: `empecilho-${++contadorDeMensagens.current}`, quem: "agente", texto: fala, horario: Date.now(), requisito }]);
      setEmpecilho({ requisito });
      void dizer(fala);
    } catch (erro) {
      console.warn("[empecilho] não foi possível pedir a mudança:", erro);
    } finally {
      empecilhoEmAndamento.current = false;
      if (forcar) setForcandoEmpecilho(false);
    }
  }, [sessao, quadro, dizer]);
  /** Demonstração (fora de produção): traz a mudança agora, sem esperar a hora certa. */
  const forcarEmpecilho = useCallback(() => { void pedirMudanca(true); }, [pedirMudanca]);
  useEffect(() => {
    if (!usarServidor() || !sessao || !quadro) return;
    const id = setInterval(() => {
      if (empecilhoEncerrado.current || empecilhoEmAndamento.current) return;
      if (Date.now() - ultimoPedidoEmpecilho.current < INTERVALO_PEDIDO_EMPECILHO_MS) return;
      const e = estadoAtual.current;
      const agora = Date.now();
      // Sem cortar ninguém: pausa do candidato, agente quieto, nada pendente, nenhuma pergunta no ar.
      if (e.plin !== "LIVRE" || preparandoVozRef.current || !podeTomarTurno({ agora, ultimaFalaEm: ultimaFalaEm.current,
        falaParcial: falaParcial.current, agenteFalando: agenteFalandoRef.current,
        aguardandoResposta: pedidosEmAndamento.current > 0 })) return;
      const base = { agora, fase: e.fase, faseIniciadaEm: e.faseIniciadaEm, duracaoDaFaseS: sessao.tempos[e.fase],
        jaAnunciado: false, respondendoPergunta: false, ultimaFalaDoAgenteEm: ultimaFalaDoAgenteEm.current };
      // O grafo só é montado quando o resto já permite (é a parte cara da conta).
      if (esperaDoEmpecilho({ ...base, componentes: Number.MAX_SAFE_INTEGER })) return;
      const componentes = contarComponentes(conversor.current.converter(quadro.api.getSceneElements()).texto);
      if (esperaDoEmpecilho({ ...base, componentes })) return;
      void pedirMudanca(false);
    }, 1000);
    return () => clearInterval(id);
  }, [sessao, quadro, pedirMudanca]);

  // Despedida: ao encerrar (botão ou fim do tempo) o agente se despede, uma vez.
  const despedidaDita = useRef(false);
  useEffect(() => {
    if (estado.fase !== "ENCERRADA" || despedidaDita.current || !sessao?.despedida) return;
    despedidaDita.current = true;
    conversa.current.push({ quem: "agente", texto: sessao.despedida });
    void dizer(sessao.despedida);
  }, [estado.fase, sessao, dizer]);

  // Ao entrar no aprofundamento (por prontidão ou pelo tempo), analisa de novo na hora: é aqui que o plin é liberado.
  useEffect(() => {
    if (estado.fase !== "APROFUNDAMENTO") return;
    const t = setTimeout(() => gatilho.current?.dispararAgora(), 500);
    return () => clearTimeout(t);
  }, [estado.fase]);

  // O silêncio inicial conta a partir do começo de REQUISITOS (depois de o agente se apresentar e passar o desafio).
  useEffect(() => {
    if (estado.fase !== "REQUISITOS") return;
    ultimaAtividade.current = Date.now();
    ultimoDisparoParado.current = 0;
  }, [estado.fase]);

  // Silêncio total do candidato (sem desenhar nem falar): força uma análise, e o modelo decide se quebra o silêncio.
  const ultimoDisparoParado = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const e = estadoAtual.current;
      const fasesComSilencio = e.fase === "REQUISITOS" || e.fase === "ALTO_NIVEL" || e.fase === "APROFUNDAMENTO";
      const referencia = Math.max(ultimaAtividade.current, ultimoDisparoParado.current);
      // Primeira vez: SILENCIO_MS depois da última atividade. Se o silêncio continua, só volta a cada REPETIR_SILENCIO_MS.
      const primeiro = e.fase === "REQUISITOS" ? SILENCIO_INICIAL_MS : SILENCIO_MS;
      const limite = ultimoDisparoParado.current > ultimaAtividade.current ? REPETIR_SILENCIO_MS : primeiro;
      if (fasesComSilencio && e.plin === "LIVRE" && Date.now() - referencia > limite) {
        ultimoDisparoParado.current = Date.now();
        gatilho.current?.dispararAgora();
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // O desenho do candidato fica salvo no navegador: se a página recarregar, ele volta.
  const chaveDoDesenho = sessao ? `quadro:${sessao.sessao_id}` : null;
  useEffect(() => {
    if (!quadro || !chaveDoDesenho) return;
    try {
      const salvo = localStorage.getItem(chaveDoDesenho);
      const elementos = salvo ? JSON.parse(salvo) : null;
      if (Array.isArray(elementos) && elementos.length > 0 && quadro.api.getSceneElements().length === 0) {
        quadro.api.updateScene({ elements: elementos, captureUpdate: "NEVER" });
        quadro.api.scrollToContent(undefined, { fitToContent: false, animate: true });
      }
    } catch {
      // Desenho salvo inválido ou armazenamento bloqueado: segue com o quadro vazio.
    }
  }, [quadro, chaveDoDesenho]);

  const salvar = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Chamar quando o desenho do candidato mudar. */
  const desenhoMudou = useCallback(() => {
    ultimaAtividade.current = Date.now();
    enviar({ tipo: "CANDIDATO_DESENHOU" });
    gatilho.current?.mudou();
    if (salvar.current) clearTimeout(salvar.current);
    salvar.current = setTimeout(() => {
      if (!quadro || !chaveDoDesenho) return;
      try {
        const doCandidato = quadro.api.getSceneElements().filter((e) => e.customData?.autor !== "agente");
        localStorage.setItem(chaveDoDesenho, JSON.stringify(doCandidato));
      } catch {
        // Sem espaço ou armazenamento bloqueado: não salvar não atrapalha a entrevista.
      }
    }, 800);
  }, [enviar, quadro, chaveDoDesenho]);

  const [iniciadaEm, setIniciadaEm] = useState<number | null>(null);
  const comecar = useCallback(() => {
    setIniciadaEm(Date.now());
    enviar({ tipo: "COMECAR" });
  }, [enviar]);
  const clicarPlin = useCallback(() => enviar({ tipo: "PLIN_CLICADO" }), [enviar]);
  /** Demonstração: faz o agente ter uma dúvida agora, sobre o último componente desenhado. */
  const perguntaDemo = useCallback(() => {
    if (!quadro) return;
    const { texto } = conversor.current.converter(quadro.api.getSceneElements());
    enviar({ tipo: "PLIN_DEMO", resposta: duvidaDeDemonstracao(texto) });
  }, [enviar, quadro]);
  const terminarResposta = useCallback((texto?: unknown, reanalisar = true) => {
    registrar("resposta", { numero: estadoAtual.current.perguntaAtiva?.numero, quem: "candidato", ...(typeof texto === "string" && texto.trim() ? { texto: texto.trim() } : {}) });
    enviar({ tipo: "RESPOSTA_TERMINOU" });
    // A resposta pode mudar a avaliação: analisa de novo logo depois que o servidor souber dela.
    if (reanalisar) void descarregarJa().then(() => gatilho.current?.dispararAgora());
  }, [descarregarJa, enviar, registrar]);

  /**
   * O modelo escolheu escutar (`responder:false`) no meio da resposta a uma pergunta: se o candidato ficar
   * quieto por um tempo, a resposta acabou. Sem isso a pergunta ficava ativa para sempre e a análise e o
   * quebra-silêncio, bloqueados.
   */
  const fimDaRespostaCalada = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarFimDaResposta = useCallback((texto: string) => {
    if (fimDaRespostaCalada.current) clearTimeout(fimDaRespostaCalada.current);
    const conferir = () => {
      fimDaRespostaCalada.current = null;
      if (estadoAtual.current.plin !== "PERGUNTA_ATIVA") return;
      const quieto = Date.now() - ultimaFalaEm.current >= SILENCIO_FIM_DA_RESPOSTA_MS;
      if (!quieto || falaParcial.current || pedidosEmAndamento.current > 0 || agenteFalandoRef.current) {
        fimDaRespostaCalada.current = setTimeout(conferir, 1000);
        return;
      }
      terminarResposta(texto);
    };
    fimDaRespostaCalada.current = setTimeout(conferir, SILENCIO_FIM_DA_RESPOSTA_MS);
  }, [terminarResposta]);
  useEffect(() => () => { if (fimDaRespostaCalada.current) clearTimeout(fimDaRespostaCalada.current); }, []);

  /** O pedido falhou mesmo depois de tentar de novo: o agente pede para repetir, em vez de ficar calado. */
  const pedidosDeRepeticao = useRef(0);
  const pedirParaRepetir = useCallback(() => {
    const fase = estadoAtual.current.fase;
    if (fase === "AGUARDANDO" || fase === "ENCERRADA") return;
    const texto = FALAS_DE_REPETICAO[pedidosDeRepeticao.current++ % FALAS_DE_REPETICAO.length];
    conversa.current.push({ quem: "agente", texto });
    void dizer(texto);
  }, [dizer]);

  // Conversa por texto (enquanto não há voz do candidato): as falas digitadas e as respostas do /perguntar.
  const [mensagens, setMensagens] = useState<MensagemConversa[]>([]);
  const contadorDeMensagens = useRef(0);
  /**
   * Fala do candidato por texto. Com uma pergunta (plin) ativa, conta como a resposta a ela;
   * senão vai para o /perguntar e a resposta do agente é mostrada e falada.
   * Lança erro se o servidor falhar (nada é registrado, para o texto poder ser reenviado).
   * Devolve o requisito combinado, se houver, para quem escreve no quadro.
   */
  const enviarTexto = useCallback(
    async (bruto: string): Promise<{ requisito: string | null }> => {
      const ciclo = cicloDaSala.current;
      const texto = limparTextoDigitado(bruto);
      const atual = estadoAtual.current;
      if (!texto || !sessao || atual.fase === "AGUARDANDO" || atual.fase === "ENCERRADA") return { requisito: null };
      const nova = (quem: MensagemConversa["quem"], t: string): MensagemConversa => ({
        id: `texto-${++contadorDeMensagens.current}-${quem}`,
        quem,
        texto: t,
        horario: Date.now(),
      });
      ultimaAtividade.current = Date.now();
      revisaoDaConversa.current++;
      limparVisualDaConversa();
      enviar({ tipo: "CANDIDATO_CONTINUOU" });
      // A fala já entra na conversa que as análises recebem (uma análise pode rodar enquanto o /perguntar espera).
      const falaDoCandidato: FalaRecente = { quem: "candidato", texto };
      conversa.current.push(falaDoCandidato);
      const registrarFalaDoCandidato = () => {
        registrar("fala", { quem: "candidato", texto });
        return nova("candidato", texto);
      };

      let r: Awaited<ReturnType<typeof perguntar>>;
      pedidosEmAndamento.current++;
      setAguardandoResposta(true);
      try {
        const grafo = quadro ? conversor.current.converter(quadro.api.getSceneElements()).texto.slice(0, 24000) : undefined;
        r = await perguntar(sessao.sessao_id, atual.fase, texto, {
          grafo, pergunta_ativa: atual.perguntaAtiva?.pergunta ?? undefined,
          requisitos: requisitosCombinados.current.slice(-30),
          gestos_recentes: resumirGestosRecentes(memoriaVisual.current),
        });
      } catch (erro) {
        // Não foi enviada: sai da conversa para o texto poder ser reenviado sem duplicar.
        const i = conversa.current.indexOf(falaDoCandidato);
        if (i >= 0) conversa.current.splice(i, 1);
        throw erro;
      } finally {
        pedidosEmAndamento.current--;
        setAguardandoResposta(pedidosEmAndamento.current > 0);
      }
      if (ciclo !== cicloDaSala.current || estadoAtual.current.fase === "ENCERRADA") return { requisito: null };
      const novas = [registrarFalaDoCandidato()];
      // A devolutiva vem do loop rápido, sem flush + nova análise antes de responder.
      if (atual.plin === "PERGUNTA_ATIVA" && (r.responder || r.concluiu)) terminarResposta(texto, false);
      else if (atual.plin === "PERGUNTA_ATIVA") agendarFimDaResposta(texto);
      if (r.responder && r.texto) {
        conversa.current.push({ quem: "agente", texto: r.texto });
        const alvos = [...new Set((mapearAcoesVisuais(r.visual, (id) => conversor.current.idReal(id)) ?? []).flatMap(alvosDaAcao))];
        novas.push({ ...nova("agente", r.texto), ...(alvos.length ? { alvos } : {}), ...(r.requisito ? { requisito: r.requisito } : {}) });
        if (quadro && r.visual?.length) {
          const atual = { quadro, grupo: `conversa:${contadorDeMensagens.current}`, controle: new AbortController(), tarefa: undefined as Promise<void> | undefined };
          visualDaConversa.current = atual;
          const desenhar = () => {
            if (atual.controle.signal.aborted || atual.tarefa) return;
            atual.tarefa = apontarEAnotar({ quadro, cursor: cursor.current, grupo: atual.grupo, alvos: [], nota: "",
              visual: mapearAcoesVisuais(r.visual, (id) => conversor.current.idReal(id)), memoria: memoriaVisual.current,
              semente: contadorDeMensagens.current * 7919, sinal: atual.controle.signal,
            }).catch((erro) => console.warn("[gesto da conversa]", erro));
          };
          void dizer(r.texto, [{ trecho: "", aoChegar: desenhar }]);
        } else void dizer(r.texto);
      }
      setMensagens((m) => [...m, ...novas]);
      if (r.responder && r.requisito && !requisitosCombinados.current.includes(r.requisito)) {
        requisitosCombinados.current.push(r.requisito);
      }
      if (r.concluiu) {
        // "Pronto": no alto nível segue para o aprofundamento (que já reanalisa); nas outras fases só reanalisa.
        if (atual.fase === "ALTO_NIVEL") enviar({ tipo: "CANDIDATO_CONCLUIU" });
        else if (atual.fase === "APROFUNDAMENTO" || atual.fase === "FECHAMENTO") {
          setTimeout(() => gatilho.current?.dispararAgora(), 0);
        }
      }
      return { requisito: r.responder ? r.requisito : null };
    },
    [sessao, quadro, cursor, registrar, dizer, terminarResposta, agendarFimDaResposta, enviar, limparVisualDaConversa],
  );
  const registrarFalaParcial = useCallback((texto: string) => {
    falaParcial.current = !!texto.trim();
    if (texto.trim()) {
      limparVisualDaConversa();
      enviar({ tipo: "CANDIDATO_CONTINUOU" });
      ultimaFalaEm.current = Date.now();
      ultimaAtividade.current = Date.now();
    }
  }, [enviar, limparVisualDaConversa]);
  const registrarSom = useCallback(() => {
    if (agenteFalandoRef.current) return;
    ultimaFalaEm.current = Date.now();
    ultimaAtividade.current = Date.now();
  }, []);
  /** Digitar na Conversa é atividade: o silêncio só conta depois que o candidato para de escrever. */
  const registrarAtividade = useCallback(() => {
    ultimaAtividade.current = Date.now();
    ultimaFalaEm.current = Date.now();
  }, []);
  const encerrar = useCallback(() => {
    cicloDaSala.current++;
    silenciar();
    enviar({ tipo: "ENCERRAR" });
    // Entrevista encerrada: o desenho salvo localmente não é mais necessário (a prova fica no servidor).
    try {
      if (chaveDoDesenho) localStorage.removeItem(chaveDoDesenho);
    } catch {}
  }, [enviar, silenciar, chaveDoDesenho]);

  return {
    sessao,
    estado,
    iniciadaEm,
    falaAtual,
    agenteFalando,
    aguardandoResposta: aguardandoResposta || preparandoVoz,
    registrarFalaParcial,
    registrarSom,
    vozHabilitada,
    alternarVoz,
    silenciar,
    desenhoMudou,
    comecar,
    clicarPlin,
    perguntaDemo,
    terminarResposta,
    mensagens,
    enviarTexto,
    pedirParaRepetir,
    registrarAtividade,
    encerrar,
    empecilho,
    forcarEmpecilho,
    forcandoEmpecilho,
  };
}
