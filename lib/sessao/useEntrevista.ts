"use client";

// Liga a máquina de estados, o gatilho, o quadro e o modo de servidor escolhido.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Quadro } from "@/components/Canvas";
import type { ControleCursor } from "@/components/CursorAgente";
import type { MensagemConversa } from "@/components/PainelConversa";
import { perguntar } from "@/lib/sessao/servidor";
import { limparTextoDigitado } from "@/lib/sessao/textoDigitado";
import {
  analisar,
  calar,
  criarSessao,
  duvidaDeDemonstracao,
  enviarEventos,
  falar,
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

/** Silêncio total (sem desenhar nem falar) que dispara uma análise para o agente poder quebrá-lo. Provisório. Igual a LIMITE_SILENCIO_S no servidor. */
const SILENCIO_MS = 8_000;
/** Idem no começo (fase REQUISITOS), contado a partir do fim da apresentação. Provisório. Igual a LIMITE_SILENCIO_INICIAL_S no servidor. */
const SILENCIO_INICIAL_MS = 15_000;
/** Se o silêncio continua depois de uma análise, volta a perguntar ao modelo a cada tanto. */
const REPETIR_SILENCIO_MS = 30_000;
/** O enunciado vai em preto (a cor padrão do traço no Excalidraw); as anotações de pergunta, na cor do agente. */
const COR_ENUNCIADO = "#1e1e1e";

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

export function useEntrevista(quadro: Quadro | null, cursor: React.RefObject<ControleCursor | null>) {
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
  const fimDaLegenda = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versaoDaFala = useRef(0);

  const dizer = useCallback(async (texto: string, marcas?: MarcaDeFala[]) => {
    const versao = ++versaoDaFala.current;
    if (fimDaLegenda.current) clearTimeout(fimDaLegenda.current);
    setFalaAtual({ quem: "agente", texto, ate: 0 });
    setAgenteFalando(true);
    linhaDoTempo.current?.registrar("fala", { quem: "agente", texto });
    const aoProgresso = (ate: number) => {
      if (versao !== versaoDaFala.current) return;
      setFalaAtual((atual) => (versao === versaoDaFala.current && atual && atual.texto === texto && atual.ate !== ate ? { ...atual, ate } : atual));
    };
    if (marcas) await falarComMarcas(texto, marcas, aoProgresso);
    else await falar(texto, aoProgresso);
    if (versao !== versaoDaFala.current) return;
    setAgenteFalando(false);
    // A legenda fica um pouco depois da voz, para dar tempo de terminar de ler.
    fimDaLegenda.current = setTimeout(() => setFalaAtual(null), 1800);
  }, []);

  const silenciar = useCallback(() => {
    versaoDaFala.current++;
    if (fimDaLegenda.current) clearTimeout(fimDaLegenda.current);
    calar();
    setAgenteFalando(false);
    setFalaAtual(null);
  }, []);

  useEffect(() => () => {
    versaoDaFala.current++;
    if (fimDaLegenda.current) clearTimeout(fimDaLegenda.current);
    calar();
  }, []);

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

  useEffect(() => {
    let cancelado = false;
    criacaoDaSessao.current ??= criarSessao();
    criacaoDaSessao.current.then((nova) => {
      if (!cancelado) setSessao(nova);
    }).catch((erro) => console.warn("[sessão] não foi possível iniciar:", erro));
    return () => { cancelado = true; };
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
    let ativo = true;
    const imagens = new WeakMap<PedidoAnalise, Promise<string | null>>();
    const g = criarGatilho({
      podeAnalisar: () => podeAnalisar(estadoAtual.current),
      montarPedido: (forcar) => {
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
      // O agente se apresenta antes de passar o desafio (a fala vem do cérebro; sem ela, vai direto ao desafio).
      if (sessao.apresentacao) {
        conversa.current.push({ quem: "agente", texto: sessao.apresentacao });
        await dizer(sessao.apresentacao);
        if (cancelado) return;
      }
      const fala = dizer(`${titulo}. ${enunciado}`);
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
      conversa.current.push({ quem: "agente", texto: enunciado });
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
    const controle = new AbortController();
    let coreografia: Promise<void> | null = null;
    const desenhar = () => {
      if (controle.signal.aborted || coreografia) return;
      coreografia = apontarEAnotar({
        quadro,
        cursor: cursor.current,
        grupo,
        alvos,
        nota: p.nota ?? p.pergunta ?? "?",
        semente: numeroPergunta * 7919,
        sinal: controle.signal,
      }).catch((erro) => console.warn("[mão do agente]", erro));
    };
    if (p.pergunta) {
      conversa.current.push({ quem: "agente", texto: p.pergunta });
      const alvo = ultimoInstantaneo.current?.componentes.find((c) => c.id === p.elementos[0]);
      void dizer(p.pergunta, [{ trecho: alvo?.nome ?? "", aoChegar: desenhar }]);
    } else desenhar();

    return () => {
      silenciar();
      controle.abort();
      void (coreografia ?? Promise.resolve()).then(() => quadro.agente.apagarGrupo(grupo));
    };
  }, [numeroPergunta, quadro, cursor, dizer, silenciar, registrar]);

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
  const terminarResposta = useCallback(() => {
    registrar("resposta", { numero: estadoAtual.current.perguntaAtiva?.numero });
    enviar({ tipo: "RESPOSTA_TERMINOU" });
    // A resposta pode mudar a avaliação: analisa de novo logo depois.
    setTimeout(() => gatilho.current?.dispararAgora(), 0);
  }, [enviar, registrar]);

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
      const registrarFalaDoCandidato = () => {
        conversa.current.push({ quem: "candidato", texto });
        registrar("fala", { quem: "candidato", texto });
        return nova("candidato", texto);
      };

      if (atual.plin === "PERGUNTA_ATIVA") {
        setMensagens((m) => [...m, registrarFalaDoCandidato()]);
        terminarResposta();
        return { requisito: null };
      }

      const r = await perguntar(sessao.sessao_id, atual.fase, texto);
      const novas = [registrarFalaDoCandidato()];
      if (r.responder && r.texto) {
        conversa.current.push({ quem: "agente", texto: r.texto });
        novas.push(nova("agente", r.texto));
        void dizer(r.texto); // registra a fala do agente na linha do tempo
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
    [sessao, registrar, dizer, terminarResposta, enviar],
  );
  const encerrar = useCallback(() => {
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
    desenhoMudou,
    comecar,
    clicarPlin,
    perguntaDemo,
    terminarResposta,
    mensagens,
    enviarTexto,
    encerrar,
  };
}
