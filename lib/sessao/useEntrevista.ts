"use client";

// Liga a máquina de estados, o gatilho, o quadro e o servidor (por enquanto, de mentira).
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Quadro } from "@/components/Canvas";
import type { ControleCursor } from "@/components/CursorAgente";
import {
  analisar,
  calar,
  criarSessao,
  enviarEventos,
  falar,
  type FalaRecente,
  type PedidoAnalise,
  type Sessao,
} from "@/lib/sessao/cliente";
import { criarLinhaDoTempo } from "@/lib/sessao/eventos";
import { apontarEAnotar } from "@/lib/presenca/coreografia";
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

function redutor(estado: EstadoEntrevista, acao: Acao) {
  return transicionar(estado, acao.evento, acao.agora);
}

export function useEntrevista(quadro: Quadro | null, cursor: React.RefObject<ControleCursor | null>) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
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
  const [falaAtual, setFalaAtual] = useState<FalaRecente | null>(null);
  const [agenteFalando, setAgenteFalando] = useState(false);
  const fimDaLegenda = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dizer = useCallback(async (texto: string) => {
    if (fimDaLegenda.current) clearTimeout(fimDaLegenda.current);
    setFalaAtual({ quem: "agente", texto });
    setAgenteFalando(true);
    linhaDoTempo.current?.registrar("fala", { quem: "agente", texto });
    await falar(texto);
    setAgenteFalando(false);
    // A legenda fica um pouco depois da voz, para dar tempo de terminar de ler.
    fimDaLegenda.current = setTimeout(() => setFalaAtual(null), 1800);
  }, []);

  const silenciar = useCallback(() => {
    calar();
    setAgenteFalando(false);
  }, []);

  const conversor = useRef(criarConversor());
  const ultimoInstantaneo = useRef<Instantaneo | null>(null);
  const conversa = useRef<FalaRecente[]>([]);
  const gatilho = useRef<Gatilho | null>(null);
  const linhaDoTempo = useRef<ReturnType<typeof criarLinhaDoTempo> | null>(null);
  const registrar = useCallback(
    (...args: Parameters<ReturnType<typeof criarLinhaDoTempo>["registrar"]>) =>
      linhaDoTempo.current?.registrar(...args),
    [],
  );

  useEffect(() => {
    criarSessao().then(setSessao);
  }, []);

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
    if (estado.fase === "ENCERRADA") void linhaDoTempo.current?.descarregar().catch(() => {});
  }, [estado.fase, registrar]);

  // Gatilho da análise.
  useEffect(() => {
    if (!quadro || !sessao) return;
    const g = criarGatilho({
      podeAnalisar: () => podeAnalisar(estadoAtual.current),
      montarPedido: (forcar) => {
        const r = conversor.current.converter(quadro.api.getSceneElements());
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
        };
        console.log("[análise] pedido", pedido);
        if (mudancas) registrar("desenho", { grafo: r.texto, mudancas });
        return pedido;
      },
      analisar,
      aoResultado: (resposta) => {
        console.log("[análise] resposta", resposta);
        registrar("analise", resposta);
        enviar({ tipo: "ANALISE_RECEBIDA", resposta });
      },
      aoErro: (erro) => console.warn("[análise] ignorada:", erro),
    });
    gatilho.current = g;
    return () => g.parar();
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
      const fala = dizer(`${titulo}. ${enunciado}`);
      await quadro.agente.escrever({
        id: "agente-enunciado-titulo",
        grupo: "enunciado",
        texto: titulo,
        x: 40,
        y: 110,
        tamanho: 32,
      });
      await quadro.agente.escrever({
        id: "agente-enunciado-texto",
        grupo: "enunciado",
        texto: enunciado,
        x: 40,
        y: 160,
      });
      await fala;
      conversa.current.push({ quem: "agente", texto: enunciado });
      if (!cancelado) enviar({ tipo: "APRESENTACAO_TERMINOU" });
    })();
    return () => {
      cancelado = true;
    };
  }, [estado.fase, quadro, sessao, enviar, dizer]);

  // Pergunta ativa: ao mesmo tempo, a voz fala e a mão do agente circula o elemento e escreve a nota.
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
    if (p.pergunta) {
      conversa.current.push({ quem: "agente", texto: p.pergunta });
      void dizer(p.pergunta);
    }
    const controle = new AbortController();
    const coreografia = apontarEAnotar({
      quadro,
      cursor: cursor.current,
      grupo,
      alvos,
      nota: p.nota ?? p.pergunta ?? "?",
      semente: numeroPergunta * 7919,
      sinal: controle.signal,
    }).catch((erro) => console.warn("[mão do agente]", erro));

    return () => {
      silenciar();
      controle.abort();
      void coreografia.then(() => quadro.agente.apagarGrupo(grupo));
    };
  }, [numeroPergunta, quadro, cursor, dizer, silenciar, registrar]);

  /** Chamar quando o desenho do candidato mudar. */
  const desenhoMudou = useCallback(() => {
    enviar({ tipo: "CANDIDATO_DESENHOU" });
    gatilho.current?.mudou();
  }, [enviar]);

  const [iniciadaEm, setIniciadaEm] = useState<number | null>(null);
  const comecar = useCallback(() => {
    setIniciadaEm(Date.now());
    enviar({ tipo: "COMECAR" });
  }, [enviar]);
  const clicarPlin = useCallback(() => enviar({ tipo: "PLIN_CLICADO" }), [enviar]);
  const terminarResposta = useCallback(() => {
    registrar("resposta", { numero: estadoAtual.current.perguntaAtiva?.numero });
    enviar({ tipo: "RESPOSTA_TERMINOU" });
    // A resposta pode mudar a avaliação: analisa de novo logo depois.
    setTimeout(() => gatilho.current?.dispararAgora(), 0);
  }, [enviar, registrar]);
  const encerrar = useCallback(() => {
    silenciar();
    enviar({ tipo: "ENCERRAR" });
  }, [enviar, silenciar]);

  return {
    sessao,
    estado,
    iniciadaEm,
    falaAtual,
    agenteFalando,
    desenhoMudou,
    comecar,
    clicarPlin,
    terminarResposta,
    encerrar,
  };
}
