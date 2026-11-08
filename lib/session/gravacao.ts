/**
 * Gravação da sessão para o relatório: o código em cada versão, o que foi falado, as execuções e os marcos.
 * Só servidor. Sai da sessão em memória e fica salva em disco com o relatório (lib/session/reports.ts).
 */
import type { Gravacao } from "@/lib/contracts";
import type { SessionState } from "@/lib/session/types";

/** Fim da sessão: o session_ended, ou o último evento. */
function fimDaSessao(session: SessionState): number {
  const ended = session.events.find((e) => e.type === "session_ended");
  return ended?.t ?? session.events.at(-1)?.t ?? 0;
}

export function gravacaoDaSessao(session: SessionState): Gravacao {
  const codigo: Gravacao["codigo"] = [];
  for (const v of session.codeHistory) {
    const anterior = codigo.at(-1);
    // Snapshot repetido (mesmo código, mesma linguagem) não é versão nova.
    if (anterior && anterior.code === v.code && anterior.language === v.language) continue;
    codigo.push({ t: v.t, language: v.language, code: v.code });
  }

  const falas: Gravacao["falas"] = [];
  const execucoes: Gravacao["execucoes"] = [];
  const marcos: Gravacao["marcos"] = [];
  for (const e of session.events) {
    switch (e.type) {
      case "speech":
        falas.push({ t: e.t, role: e.role, text: e.text });
        break;
      case "run":
        execucoes.push({ t: e.t, passed: e.result.passed, total: e.result.total });
        break;
      case "hint":
        marcos.push({ t: e.t, text: `Recebeu uma dica (nível ${e.level})` });
        break;
      case "paste":
        marcos.push({ t: e.t, text: `Colou ${e.lines === 1 ? "1 linha" : `${e.lines} linhas`} de código` });
        break;
      case "empecilho":
        marcos.push({ t: e.t, text: `O Totti trouxe uma mudança no problema: ${e.title}` });
        break;
      case "language_changed":
        marcos.push({ t: e.t, text: `Trocou a linguagem para ${e.language}` });
        break;
      case "blip_snoozed":
        marcos.push({ t: e.t, text: "Adiou uma pergunta do Totti" });
        break;
      default:
        break;
    }
  }

  return { sessionId: session.sessionId, durationMs: fimDaSessao(session), codigo, falas, execucoes, marcos };
}
