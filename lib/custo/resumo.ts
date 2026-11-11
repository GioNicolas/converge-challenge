export type EventoUso = {
  tipo?: string;
  dados?: Record<string, unknown>;
  type?: string;
  t?: number;
  [key: string]: unknown;
};

export type PapelResumo = {
  custo_usd: number;
  custo_por_provedor: Record<string, number>;
  chamadas: number;
  modelos: string[];
  provedores: string[];
  reserva: number;
};

export type ResumoUso = {
  papeis: Record<string, PapelResumo>;
  custoOpenRouter: number;
  reservas: number;
  taxaCache: number | null;
  caracteresVoz: number;
  caracteresDescartados: number;
  percentualDescartado: number | null;
  audioEnviadoS: number;
  sessaoS: number;
  proporcaoAudio: number | null;
};

type PapelAcumulado = {
  custo: number;
  porProvedor: Record<string, number>;
  chamadas: number;
  modelos: Set<string>;
  provedores: Set<string>;
  reserva: number;
};

const papeisLlm: Record<string, string> = {
  fala: "perguntar/fala",
  filtro: "filtro",
  analise: "análise",
  relatorio: "scorecard/relatório",
};

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function dadosDoEvento(evento: EventoUso): Record<string, unknown> {
  return evento.dados ?? evento;
}

export function resumirUso(eventos: EventoUso[]): ResumoUso {
  const papeis = new Map<string, PapelAcumulado>();
  const escutas = new Map<string, { sessao: number; audio: number }>();
  let tokensEntrada = 0;
  let tokensCache = 0;
  let caracteresVoz = 0;
  let caracteresDescartados = 0;

  for (const evento of eventos) {
    const tipo = evento.tipo ?? evento.type ?? "";
    const dados = dadosDoEvento(evento);
    let papel = "";

    if (tipo === "perguntar_uso") papel = "perguntar/fala";
    if (tipo === "analise_uso") papel = "análise";
    if (tipo === "scorecard_uso") papel = "scorecard/relatório";
    if (tipo === "llm_uso") papel = papeisLlm[String(dados.papel)] ?? String(dados.papel ?? "LLM");

    if (["perguntar/fala", "análise", "scorecard/relatório", "filtro"].includes(papel)) {
      const acumulado = papeis.get(papel) ?? {
        custo: 0,
        porProvedor: {},
        chamadas: 0,
        modelos: new Set<string>(),
        provedores: new Set<string>(),
        reserva: 0,
      };
      const custo = numero(dados.custo_usd);
      acumulado.custo += custo;
      acumulado.chamadas += 1;
      if (typeof dados.modelo === "string") acumulado.modelos.add(dados.modelo);
      if (typeof dados.provedor === "string") {
        acumulado.provedores.add(dados.provedor);
        acumulado.porProvedor[dados.provedor] = (acumulado.porProvedor[dados.provedor] ?? 0) + custo;
      }
      if (dados.reserva_disparada === true) acumulado.reserva += 1;
      papeis.set(papel, acumulado);
      tokensEntrada += numero(dados.tokens_entrada);
      tokensCache += numero(dados.tokens_cache);
    }

    if (tipo === "voz_uso") caracteresVoz += numero(dados.caracteres);
    if (tipo === "voz_descartada") caracteresDescartados += numero(dados.caracteres);

    if (tipo === "transcricao_uso" && typeof dados.escuta_id === "string") {
      const anterior = escutas.get(dados.escuta_id) ?? { sessao: 0, audio: 0 };
      escutas.set(dados.escuta_id, {
        sessao: Math.max(anterior.sessao, numero(dados.sessaoS)),
        audio: Math.max(anterior.audio, numero(dados.audioEnviadoS)),
      });
    }
  }

  const papeisResumo = Object.fromEntries(
    [...papeis].map(([papel, acumulado]) => [papel, {
      custo_usd: acumulado.custo,
      custo_por_provedor: acumulado.porProvedor,
      chamadas: acumulado.chamadas,
      modelos: [...acumulado.modelos],
      provedores: [...acumulado.provedores],
      reserva: acumulado.reserva,
    }]),
  );
  const escutasUnicas = [...escutas.values()];
  const audioEnviadoS = escutasUnicas.reduce((total, escuta) => total + escuta.audio, 0);
  const sessaoS = escutasUnicas.reduce((total, escuta) => total + escuta.sessao, 0);
  const custoOpenRouter = [...papeis.values()].reduce((total, papel) => total + (papel.porProvedor.openrouter ?? 0), 0);
  const reservas = [...papeis.values()].reduce((total, papel) => total + papel.reserva, 0);

  return {
    papeis: papeisResumo,
    custoOpenRouter,
    reservas,
    taxaCache: tokensEntrada ? tokensCache / tokensEntrada : null,
    caracteresVoz,
    caracteresDescartados,
    percentualDescartado: caracteresVoz ? caracteresDescartados / caracteresVoz : null,
    audioEnviadoS,
    sessaoS,
    proporcaoAudio: sessaoS ? audioEnviadoS / sessaoS : null,
  };
}
