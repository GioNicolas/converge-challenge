// LLM de mentira DETERMINÍSTICO para o modo AGENTE_FAKE=1 (o Giorgio integra o quadro sem chave).
//
// Análise: responde `ok`, exceto quando o grafo tem um componente chamado "Postgres": aí devolve uma
// `duvida` sobre o primeiro elemento com esse nome. (A política ainda rebaixa para `ok` fora de
// APROFUNDAMENTO, ou antes do intervalo entre perguntas, igual ao LLM real.)
// Perguntar: se a fala tem "?", responde com um texto genérico e um requisito fixo; senão fica quieto.
// Nada daqui lê a ficha do problema.
import { ErroLlm, type LlmArgs, type LlmCliente, type LlmResultado } from "../llm/cliente";
import { NOME_SCHEMA_ABERTURA } from "../prompts/abertura";
import { NOME_SCHEMA_ANALISE } from "../prompts/avaliador";
import { NOME_SCHEMA_PERGUNTAR } from "../prompts/entrevistador";
import { NOME_SCHEMA_PERGUNTAR_V2 } from "../prompts/entrevistador-v2";
import { respostaFalsaDeKit } from "../kits/falso";
import { respostaFalsaDePlanejador } from "../planejamento/falso";

function textoDe(args: LlmArgs<unknown>): string {
  return args.mensagens.map((m) => m.content).join("\n") + "\n" + (args.sistema.dinamico ?? "");
}

export function criarLlmFalsoDeterministico(): LlmCliente {
  return {
    async completarJson<T>(args: LlmArgs<T>): Promise<LlmResultado<T>> {
      const texto = textoDe(args as LlmArgs<unknown>);
      let saida: unknown;
      if (args.nomeSchema === NOME_SCHEMA_ANALISE) {
        const m = texto.match(/^- \[([^\]]+)\]\s+Postgres/im);
        // Prontidão de mentira: em ALTO_NIVEL, com 3+ componentes e alguma conexão no desenho.
        const componentes = (texto.match(/^- \[[rel]\d+\]/gim) ?? []).length;
        const avancar_fase = /^Fase: ALTO_NIVEL/m.test(texto) && componentes >= 3 && /^- \[s\d+\]/im.test(texto);
        saida = m
          ? {
              status: "duvida",
              pergunta: "Com leitura bem maior que escrita, esse banco aguenta sozinho?",
              nota: "Banco único: gargalo?",
              elementos: [m[1]],
              degrau: null,
              observacoes: [
                { criterio: "escalabilidade", sinal: "negativo", espontaneo: false, evidencia: "banco único sem cache" },
              ],
              avancar_fase,
            }
          : { status: "ok", pergunta: null, nota: null, elementos: [], degrau: null, observacoes: [], avancar_fase };
      } else if (args.nomeSchema === NOME_SCHEMA_ABERTURA) {
        saida = {
          apresentacao: "Olá, tudo bem? Vamos já iniciar a sua entrevista.",
          despedida: "Obrigado pela conversa. A pessoa responsável vai analisar o que você fez e dar retorno.",
        };
      } else if (args.nomeSchema === NOME_SCHEMA_PERGUNTAR || args.nomeSchema === NOME_SCHEMA_PERGUNTAR_V2) {
        const fala = args.mensagens[args.mensagens.length - 1]?.content ?? "";
        saida = fala.includes("?")
          ? { responder: true, texto: "Considere uns 4 mil acessos por segundo.", requisito: "Leitura: ~4 mil/s" }
          : { responder: false, texto: "", requisito: null };
      } else if ((saida = respostaFalsaDeKit(args.nomeSchema, args.mensagens)) !== undefined) {
        // geração de kit (fake)
      } else if ((saida = respostaFalsaDePlanejador(args.nomeSchema, args.mensagens)) !== undefined) {
        // planejamento (fake)
      } else {
        throw new ErroLlm("invalido", "schema desconhecido no LLM falso");
      }
      const v = args.schema.safeParse(saida);
      if (!v.success) throw new ErroLlm("invalido", "saída do LLM falso fora do schema");
      return { dados: v.data, ms: 1 };
    },
  };
}
