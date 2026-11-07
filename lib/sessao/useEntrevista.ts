"use client";

// Liga a máquina de estados, o gatilho, o quadro e o servidor (por enquanto, de mentira).
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Quadro } from "@/components/Canvas";
import {
  analisar,
  calar,
  criarSessao,
  falar,
  type FalaRecente,
  type PedidoAnalise,
  type Sessao,
} from "@/lib/sessao/cliente";
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
import type { ExcalidrawElement } from "@/lib/excalidraw/tipos";

type Acao = { evento: EventoEntrevista; agora: number };

function redutor(estado: EstadoEntrevista, acao: Acao) {
  return transicionar(estado, acao.evento, acao.agora);
}

/** Onde o agente escreve a nota: à direita do elemento citado ou, sem alvo, à direita do desenho. */
function posicaoDaNota(cena: readonly ExcalidrawElement[], idAlvo: string | undefined) {
  const alvo = idAlvo ? cena.find((e) => e.id === idAlvo && !e.isDeleted) : undefined;
  if (alvo) return { x: alvo.x + alvo.width + 48, y: alvo.y - 24 };
  const doCandidato = cena.filter((e) => !e.isDeleted && e.customData?.autor !== "agente");
  if (doCandidato.length === 0) return { x: 40, y: 260 };
  const direita = Math.max(...doCandidato.map((e) => e.x + e.width));
  const topo = Math.min(...doCandidato.map((e) => e.y));
  return { x: direita + 48, y: topo };
}

export function useEntrevista(quadro: Quadro | null) {
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

  const conversor = useRef(criarConversor());
  const ultimoInstantaneo = useRef<Instantaneo | null>(null);
  const conversa = useRef<FalaRecente[]>([]);
  const gatilho = useRef<Gatilho | null>(null);

  useEffect(() => {
    criarSessao().then(setSessao);
  }, []);

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
        return pedido;
      },
      analisar,
      aoResultado: (resposta) => {
        console.log("[análise] resposta", resposta);
        enviar({ tipo: "ANALISE_RECEBIDA", resposta });
      },
      aoErro: (erro) => console.warn("[análise] ignorada:", erro),
    });
    gatilho.current = g;
    return () => g.parar();
  }, [quadro, sessao, enviar]);

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
      const fala = falar(`${titulo}. ${enunciado}`);
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
  }, [estado.fase, quadro, sessao, enviar]);

  // Pergunta ativa: o agente fala e escreve a nota; quando a resposta termina, apaga a nota.
  const numeroPergunta = estado.perguntaAtiva?.numero ?? null;
  useEffect(() => {
    const p = estadoAtual.current.perguntaAtiva;
    if (numeroPergunta === null || !p || !quadro) return;
    const grupo = `pergunta:${numeroPergunta}`;
    const idAlvo = p.elementos[0] ? conversor.current.idReal(p.elementos[0]) : undefined;
    const { x, y } = posicaoDaNota(quadro.api.getSceneElementsIncludingDeleted(), idAlvo);

    if (p.pergunta) {
      conversa.current.push({ quem: "agente", texto: p.pergunta });
      void falar(p.pergunta);
    }
    void quadro.agente.escrever({
      id: `agente-${grupo}-nota`,
      grupo,
      texto: p.nota ?? p.pergunta ?? "?",
      x,
      y,
      largura: 28,
    });

    return () => {
      calar();
      void quadro.agente.apagarGrupo(grupo);
    };
  }, [numeroPergunta, quadro]);

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
    enviar({ tipo: "RESPOSTA_TERMINOU" });
    // A resposta pode mudar a avaliação: analisa de novo logo depois.
    setTimeout(() => gatilho.current?.dispararAgora(), 0);
  }, [enviar]);
  const encerrar = useCallback(() => {
    calar();
    enviar({ tipo: "ENCERRAR" });
  }, [enviar]);

  return {
    sessao,
    estado,
    iniciadaEm,
    desenhoMudou,
    comecar,
    clicarPlin,
    terminarResposta,
    encerrar,
  };
}
