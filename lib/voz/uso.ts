// Fora de app/api/falar/route.ts: um arquivo de rota do Next só pode exportar os handlers e a config da rota.
import { contexto as contextoAgente } from "@/lib/agente/rotas/contexto";
import { guardarSessao, sessaoViva } from "@/lib/session/persistencia";
import { appendEvent, sessionNow } from "@/lib/session/store";
import { getSessao as obterPreSessao } from "@/lib/pre-entrevista/sessoes";
import { registrarEvento } from "@/lib/pre-entrevista/log";

/** Grava os caracteres de voz sintetizados na sessão de onde a fala veio (quadro, live coding ou pré-entrevista). */
export async function registrarUsoVoz(metadados: { sessao_id: string; contexto: "quadro" | "coding" | "pre"; fala_id?: string }, texto: string): Promise<void> {
  const dadosUso = { contexto: metadados.contexto, caracteres: texto.length, ...(metadados.fala_id ? { fala_id: metadados.fala_id } : {}) };
  if (metadados.contexto === "quadro") {
    await contextoAgente().repositorio.anexarEventos(metadados.sessao_id, [{ horario: new Date().toISOString(), tipo: "voz_uso", dados: dadosUso }]);
  } else if (metadados.contexto === "coding") {
    const sessao = await sessaoViva(metadados.sessao_id);
    if (sessao) {
      appendEvent(sessao, { sessionId: sessao.sessionId, t: sessionNow(sessao), type: "voz_uso", contexto: metadados.contexto, caracteres: texto.length, ...(metadados.fala_id ? { fala_id: metadados.fala_id } : {}) });
      await guardarSessao(sessao);
    }
  } else {
    const sessao = obterPreSessao(metadados.sessao_id);
    if (sessao) registrarEvento(sessao, { tipo: "aviso", resumo: "voz_uso", dados: { tipo: "voz_uso", ...dadosUso } });
  }
}
