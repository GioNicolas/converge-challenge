// O workspace do recrutador: as vagas da empresa e o que já aconteceu em cada uma.
//   Rascunho (com o Totti) → Vaga publicada: Plano · Entrevistas · Escores
// Uma vaga só existe (e só aparece no menu) depois que o plano da entrevista é confirmado com o Totti.
// Antes disso ela é um rascunho, que dá para retomar. As vagas e rascunhos de partida vêm das vagas de
// exemplo (fixtures) mais duas fora de tecnologia; o que o recrutador faz fica salvo no navegador (localStorage).
import { useCallback, useEffect, useState } from "react";
import type { InterviewConfig } from "@/lib/contracts";
import type { Vaga } from "@/lib/pre-entrevista/classificador";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import { entre, escolher, semente, sorteador } from "./aleatorio";
import { FUNIL_VAZIO, type Funil } from "./candidatos";

export type Area = "engenharia" | "dados" | "produto" | "marketing";
export type Senioridade = InterviewConfig["seniority"] | "estagio";
export type Etapa = "entrevistas" | "encerrada";

/** O que ficou combinado na pré-entrevista (o essencial para mostrar na vaga). */
export type Resumo = {
  configId: string;
  formato: InterviewConfig["mode"];
  duracaoMin: number;
  foco: { area: InterviewConfig["focus"][number]["area"]; peso: number }[];
  criterios?: number;
};

/** Uma vaga publicada: o plano está combinado e o link já pode ir para os candidatos. */
export type VagaEmpresa = {
  id: string;
  cargo: string;
  area: Area;
  senioridade: Senioridade;
  time: string;
  local: string;
  descricao: string;
  contexto?: string;
  /** Há quantos dias a vaga foi aberta (relativo, para a demonstração não envelhecer). */
  abertaHaDias: number;
  etapa: Etapa;
  resumo?: Resumo;
  /** Quantos se inscreveram, foram convidados, estão fazendo e concluíram a entrevista. */
  funil: Funil;
  /** Recrutador(a) responsável pela vaga. */
  responsavel: string;
  encerradaHaDias?: number;
  /** Quantas pessoas foram contratadas por esta vaga. Com valor, a vaga ganha a aba Contratações (ciclo dos 90 dias). */
  contratados?: number;
};

/** Uma vaga ainda sendo combinada com o Totti. Não aparece no menu até ser publicada. */
export type RascunhoVaga = {
  id: string;
  cargo: string;
  descricao: string;
  contexto?: string;
  sessaoId?: string;
  combinados?: { feitos: number; total: number };
  /** Quando mexeu por último (ms). Os rascunhos de partida usam `haDias`. */
  atualizadoEm?: number;
  haDias?: number;
};

export const NOME_AREA_VAGA: Record<Area, string> = {
  engenharia: "Engenharia",
  dados: "Dados",
  produto: "Produto",
  marketing: "Marketing",
};

/** Formato em palavras neutras (o quadro serve para qualquer área, não só system design). */
export const NOME_FORMATO_VAGA: Record<InterviewConfig["mode"], string> = {
  system_design: "Desenho no quadro",
  live_coding: "Código ao vivo",
};

export const NOME_SENIORIDADE_VAGA: Record<Senioridade, string> = {
  estagio: "Estágio",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
};

const descricaoDe = (id: string) => VAGAS.find((v) => v.id === id)?.jobDescription ?? "";
const contextoDe = (id: string) => VAGAS.find((v) => v.id === id)?.context;
const cargoDe = (id: string) => VAGAS.find((v) => v.id === id)?.roleTitle ?? id;

const deExemplo = (id: string, haDias: number): RascunhoVaga => ({
  id,
  cargo: cargoDe(id),
  descricao: descricaoDe(id),
  contexto: contextoDe(id),
  haDias,
});

/** Os rascunhos no primeiro acesso: vagas abertas que ainda não têm o plano da entrevista. */
const RASCUNHOS_INICIAIS: RascunhoVaga[] = [
  deExemplo("estagio-dados", 0),
  deExemplo("backend-senior-pagamentos", 1),
  {
    id: "pm-growth",
    cargo: "Product Manager Pleno — Growth",
    descricao: `Buscamos uma pessoa de produto para o time de Growth, responsável pela ativação e retenção de novos clientes.

Responsabilidades:
- Definir e priorizar o roadmap de ativação a partir de dados de funil e entrevistas com clientes
- Desenhar experimentos (A/B) e decidir com base nos resultados
- Trabalhar junto com design, engenharia e marketing do problema até a entrega

Requisitos:
- 3+ anos como PM em produto digital
- Conforto com métricas de funil, coortes e SQL básico
- Boa escrita e clareza para alinhar várias áreas`,
    haDias: 3,
  },
  deExemplo("tech-lead-mobile", 4),
];

/** As vagas publicadas no primeiro acesso. */
const INICIAIS: VagaEmpresa[] = [
  {
    id: "marketing-performance",
    cargo: "Analista de Marketing de Performance Pleno",
    area: "marketing",
    senioridade: "pleno",
    time: "Aquisição",
    local: "Híbrido · São Paulo",
    descricao: `Procuramos alguém para planejar e otimizar nossas campanhas pagas (Google, Meta e LinkedIn).

Responsabilidades:
- Montar o plano de mídia e o funil de aquisição de cada campanha
- Acompanhar CAC, ROAS e conversão por canal e ajustar investimento
- Propor testes de criativos e de público junto com o time de conteúdo`,
    abertaHaDias: 12,
    etapa: "entrevistas",
    resumo: {
      configId: "config-marketing-performance",
      formato: "system_design",
      duracaoMin: 40,
      foco: [
        { area: "escala_produto", peso: 0.5 },
        { area: "pressao", peso: 0.3 },
        { area: "uso_ia", peso: 0.2 },
      ],
    },
    funil: { inscritos: 3_820, convidados: 1_140, emAndamento: 36, concluiram: 410, novos: 52 },
    responsavel: "Marina Azevedo",
  },
  {
    id: "frontend-junior",
    cargo: cargoDe("frontend-junior"),
    area: "engenharia",
    senioridade: "junior",
    time: "Web",
    local: "Remoto",
    descricao: descricaoDe("frontend-junior"),
    contexto: contextoDe("frontend-junior"),
    abertaHaDias: 15,
    etapa: "entrevistas",
    resumo: {
      configId: "config-frontend-junior",
      formato: "live_coding",
      duracaoMin: 45,
      foco: [
        { area: "tecnico", peso: 0.6 },
        { area: "pressao", peso: 0.25 },
        { area: "uso_ia", peso: 0.15 },
      ],
    },
    funil: { inscritos: 70_412, convidados: 12_380, emAndamento: 214, concluiram: 4_906, novos: 312 },
    responsavel: "Paulo Henrique",
  },
  {
    id: "ia-pleno",
    cargo: cargoDe("ia-pleno"),
    area: "engenharia",
    senioridade: "pleno",
    time: "Plataforma de IA",
    local: "Remoto",
    descricao: descricaoDe("ia-pleno"),
    contexto: contextoDe("ia-pleno"),
    abertaHaDias: 9,
    etapa: "entrevistas",
    resumo: {
      configId: "config-ia-pleno",
      formato: "live_coding",
      duracaoMin: 50,
      foco: [
        { area: "uso_ia", peso: 0.5 },
        { area: "tecnico", peso: 0.35 },
        { area: "escala_produto", peso: 0.15 },
      ],
    },
    funil: { inscritos: 2_904, convidados: 860, emAndamento: 18, concluiram: 233, novos: 21 },
    responsavel: "Renata Siqueira",
  },
  {
    id: "fullstack-startup",
    cargo: cargoDe("fullstack-startup"),
    area: "engenharia",
    senioridade: "pleno",
    time: "Produto",
    local: "Remoto",
    descricao: descricaoDe("fullstack-startup"),
    contexto: contextoDe("fullstack-startup"),
    abertaHaDias: 2,
    etapa: "entrevistas",
    resumo: {
      configId: "config-fullstack-startup",
      formato: "live_coding",
      duracaoMin: 45,
      foco: [
        { area: "pressao", peso: 0.45 },
        { area: "tecnico", peso: 0.4 },
        { area: "uso_ia", peso: 0.15 },
      ],
    },
    funil: FUNIL_VAZIO,
    responsavel: "Paulo Henrique",
  },
  {
    id: "staff-plataforma",
    cargo: cargoDe("staff-plataforma"),
    area: "engenharia",
    senioridade: "senior",
    time: "Plataforma",
    local: "Remoto",
    descricao: descricaoDe("staff-plataforma"),
    contexto: contextoDe("staff-plataforma"),
    abertaHaDias: 40,
    etapa: "encerrada",
    encerradaHaDias: 6,
    resumo: {
      configId: "config-staff-plataforma",
      formato: "system_design",
      duracaoMin: 60,
      foco: [
        { area: "escala_produto", peso: 0.6 },
        { area: "tecnico", peso: 0.4 },
      ],
    },
    funil: { inscritos: 640, convidados: 120, emAndamento: 0, concluiram: 96, novos: 0 },
    responsavel: "Renata Siqueira",
  },
  {
    // Encerrada há 3 meses: as 3 contratações passaram dos 90 dias (ou estão passando). É a demo do ciclo dos 90 dias.
    id: "backend-pagamentos",
    cargo: "Backend Pleno · Pagamentos",
    area: "engenharia",
    senioridade: "pleno",
    time: "Pagamentos",
    local: "Híbrido · São Paulo",
    descricao: `Buscamos uma pessoa desenvolvedora backend para o time de Pagamentos, que processa o checkout e os repasses.

Responsabilidades:
- Evoluir os serviços de cobrança e conciliação (Node.js e PostgreSQL)
- Tratar falhas de gateway, estornos e pagamentos duplicados sem perder dinheiro
- Escrever testes para os casos que quebram em produção

Requisitos:
- 3+ anos com backend em produção
- Experiência com filas, idempotência e bancos relacionais`,
    abertaHaDias: 128,
    etapa: "encerrada",
    encerradaHaDias: 93,
    resumo: {
      configId: "config-backend-pagamentos",
      formato: "live_coding",
      duracaoMin: 45,
      foco: [
        { area: "tecnico", peso: 0.55 },
        { area: "pressao", peso: 0.3 },
        { area: "uso_ia", peso: 0.15 },
      ],
    },
    funil: { inscritos: 1_870, convidados: 410, emAndamento: 0, concluiram: 212, novos: 0 },
    responsavel: "Diego Fontes",
    contratados: 3,
  },
];

// ---------------------------------------------------------------------------
// O resto do quadro de uma empresa grande: vagas geradas de forma determinística, para a lista
// mostrar como fica com dezenas de vagas, times e responsáveis (e números de verdade de escala).
// ---------------------------------------------------------------------------

const MODELOS: { cargo: string; area: Area; time: string }[] = [
  { cargo: "Desenvolvedor(a) Backend", area: "engenharia", time: "Logística" },
  { cargo: "Desenvolvedor(a) Android", area: "engenharia", time: "App do Cliente" },
  { cargo: "Desenvolvedor(a) iOS", area: "engenharia", time: "App do Entregador" },
  { cargo: "Engenheiro(a) de Dados", area: "dados", time: "Plataforma de Dados" },
  { cargo: "Cientista de Dados", area: "dados", time: "Preços" },
  { cargo: "Analista de Dados", area: "dados", time: "Marketplace" },
  { cargo: "Engenheiro(a) de Machine Learning", area: "dados", time: "Recomendação" },
  { cargo: "Product Manager", area: "produto", time: "Pagamentos" },
  { cargo: "Product Designer", area: "produto", time: "Restaurantes" },
  { cargo: "Product Manager", area: "produto", time: "Fidelidade" },
  { cargo: "Analista de CRM", area: "marketing", time: "Retenção" },
  { cargo: "Analista de Growth", area: "marketing", time: "Aquisição" },
  { cargo: "Analista de Conteúdo", area: "marketing", time: "Marca" },
  { cargo: "Engenheiro(a) de SRE", area: "engenharia", time: "Infraestrutura" },
  { cargo: "Engenheiro(a) de Segurança", area: "engenharia", time: "Segurança" },
  { cargo: "Desenvolvedor(a) Frontend", area: "engenharia", time: "Portal do Parceiro" },
];
const RESPONSAVEIS = ["Marina Azevedo", "Paulo Henrique", "Renata Siqueira", "Diego Fontes", "Aline Castro", "Bruno Tavares"];
const LOCAIS = ["Remoto", "Híbrido · São Paulo", "Híbrido · Campinas", "Presencial · Osasco"];
const SENIORIDADES: Senioridade[] = ["estagio", "junior", "junior", "pleno", "pleno", "pleno", "senior", "senior"];
const FOCOS: Resumo["foco"][] = [
  [{ area: "tecnico", peso: 0.5 }, { area: "escala_produto", peso: 0.3 }, { area: "pressao", peso: 0.2 }],
  [{ area: "escala_produto", peso: 0.55 }, { area: "pressao", peso: 0.25 }, { area: "uso_ia", peso: 0.2 }],
  [{ area: "tecnico", peso: 0.6 }, { area: "uso_ia", peso: 0.25 }, { area: "pressao", peso: 0.15 }],
];

function gerarSinteticas(): VagaEmpresa[] {
  const r = sorteador(semente("quadro-da-empresa"));
  return Array.from({ length: 34 }, (_, i) => {
    const m = MODELOS[i % MODELOS.length];
    const senioridade = escolher(r, SENIORIDADES);
    // Júnior e estágio atraem muito mais gente: a escala muda de ordem de grandeza.
    const teto = senioridade === "estagio" || senioridade === "junior" ? 48_000 : senioridade === "pleno" ? 6_000 : 1_800;
    const semCandidatos = r() < 0.12;
    const inscritos = semCandidatos ? 0 : Math.round(Math.exp(Math.log(60) + r() * (Math.log(teto) - Math.log(60))));
    const convidados = Math.round(inscritos * (0.08 + r() * 0.3));
    const concluiram = Math.round(convidados * (0.15 + r() * 0.5));
    const emAndamento = Math.min(convidados - concluiram, Math.round(convidados * r() * 0.03));
    const encerrada = !semCandidatos && r() < 0.12;
    const novos = encerrada ? 0 : Math.round(concluiram * r() * 0.12);
    const formato = m.area === "engenharia" && r() < 0.5 ? "live_coding" : "system_design";
    return {
      id: `vaga-${i + 1}-${m.time.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "-")}`,
      cargo: `${m.cargo} ${NOME_SENIORIDADE_VAGA[senioridade]}`,
      area: m.area,
      senioridade,
      time: m.time,
      local: escolher(r, LOCAIS),
      descricao: "",
      abertaHaDias: entre(r, 1, 70),
      etapa: encerrada ? "encerrada" : "entrevistas",
      encerradaHaDias: encerrada ? entre(r, 1, 20) : undefined,
      resumo: {
        configId: `config-vaga-${i + 1}`,
        formato,
        duracaoMin: escolher(r, [30, 40, 45, 60]),
        foco: escolher(r, FOCOS),
        criterios: entre(r, 4, 7),
      },
      funil: { inscritos, convidados, emAndamento, concluiram, novos },
      responsavel: escolher(r, RESPONSAVEIS),
    } satisfies VagaEmpresa;
  });
}

const SINTETICAS = gerarSinteticas();

// ---------------------------------------------------------------------------
// Persistência no navegador: as mudanças por vaga, as vagas publicadas aqui e os rascunhos.
// ---------------------------------------------------------------------------

const CHAVE = "converge.workspace.v2";
type Salvo = { mudancas: Record<string, Partial<VagaEmpresa>>; novas: VagaEmpresa[]; rascunhos: RascunhoVaga[] };

function ler(): Salvo {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) return JSON.parse(bruto) as Salvo;
  } catch {
    // localStorage indisponível ou corrompido: começa do zero.
  }
  return { mudancas: {}, novas: [], rascunhos: RASCUNHOS_INICIAIS };
}

function gravar(s: Salvo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    // Sem espaço ou sem permissão: segue só na memória.
  }
  window.dispatchEvent(new Event(CHAVE));
}

function todas(s: Salvo): VagaEmpresa[] {
  return [...s.novas, ...INICIAIS, ...SINTETICAS].map((v) => ({ ...v, ...s.mudancas[v.id] }));
}

/** As vagas e os rascunhos. `null` enquanto ainda não leu o navegador (evita piscar o estado de partida). */
export function useVagas() {
  const [estado, setEstado] = useState<{ vagas: VagaEmpresa[]; rascunhos: RascunhoVaga[] } | null>(null);
  useEffect(() => {
    const atualizar = () => {
      const s = ler();
      setEstado({ vagas: todas(s), rascunhos: s.rascunhos });
    };
    atualizar();
    window.addEventListener(CHAVE, atualizar);
    window.addEventListener("storage", atualizar);
    return () => {
      window.removeEventListener(CHAVE, atualizar);
      window.removeEventListener("storage", atualizar);
    };
  }, []);

  const atualizar = useCallback((id: string, mudanca: Partial<VagaEmpresa>) => {
    const s = ler();
    s.mudancas[id] = { ...s.mudancas[id], ...mudanca };
    gravar(s);
  }, []);

  return { vagas: estado?.vagas ?? null, rascunhos: estado?.rascunhos ?? null, atualizar };
}

/** Lê um rascunho direto do navegador (para abrir o Totti já na conversa salva). */
export function lerRascunho(id: string): RascunhoVaga | undefined {
  return ler().rascunhos.find((r) => r.id === id);
}

function idPara(cargo: string) {
  const base = cargo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "vaga"}-${Date.now().toString(36)}`;
}

/** Guarda a vaga como rascunho quando a conversa com o Totti começa. Devolve o id. */
export function criarRascunho(vaga: Vaga): string {
  const id = idPara(vaga.roleTitle);
  const s = ler();
  s.rascunhos.unshift({
    id,
    cargo: vaga.roleTitle,
    descricao: vaga.jobDescription,
    contexto: vaga.context,
    atualizadoEm: Date.now(),
  });
  gravar(s);
  return id;
}

export function atualizarRascunho(id: string, mudanca: Partial<RascunhoVaga>) {
  const s = ler();
  s.rascunhos = s.rascunhos.map((r) => (r.id === id ? { ...r, ...mudanca, atualizadoEm: Date.now(), haDias: undefined } : r));
  gravar(s);
}

export function descartarRascunho(id: string) {
  const s = ler();
  s.rascunhos = s.rascunhos.filter((r) => r.id !== id);
  gravar(s);
}

/** Palavras que indicam a área de uma vaga nova (dá para ajustar depois). */
function areaProvavel(texto: string): Area {
  const t = texto.toLowerCase();
  if (/marketing|campanha|mídia|midia|seo|conteúdo|brand/.test(t)) return "marketing";
  if (/product manager|\bpm\b|produto|product owner|roadmap/.test(t)) return "produto";
  if (/dados|data|analytics|bi\b|etl/.test(t)) return "dados";
  return "engenharia";
}

function senioridadeProvavel(cargo: string, config: InterviewConfig): Senioridade {
  if (/estágio|estagio|estagiári/.test(cargo.toLowerCase())) return "estagio";
  return config.seniority;
}

/**
 * O plano foi confirmado: a vaga nasce (com o resumo do que foi combinado) e o rascunho sai.
 * Se o rascunho não existir mais, a vaga é criada a partir do próprio config. Devolve o id da vaga.
 */
/** Inscritos (de demonstração) que uma vaga recém-publicada já traz, para o envio automático de convites ter quem chamar. */
const INSCRITOS_NOVA_VAGA = 6;

/** Publica o rascunho como vaga e devolve a vaga criada (o estúdio dispara os convites logo em seguida). */
export function publicarVaga(rascunhoId: string | null, config: InterviewConfig): VagaEmpresa {
  const s = ler();
  const r = rascunhoId ? s.rascunhos.find((x) => x.id === rascunhoId) : undefined;
  const cargo = config.roleTitle || r?.cargo || "Vaga";
  const descricao = r?.descricao ?? "";
  const id = idPara(cargo);
  const vaga: VagaEmpresa = {
    id,
    cargo,
    area: areaProvavel(`${cargo}\n${descricao}`),
    senioridade: senioridadeProvavel(cargo, config),
    time: "—",
    local: "—",
    descricao,
    contexto: r?.contexto,
    abertaHaDias: 0,
    etapa: "entrevistas",
    resumo: {
      configId: config.id,
      formato: config.mode,
      duracaoMin: config.durationMin,
      foco: config.focus.map((f) => ({ area: f.area, peso: f.weight })),
      criterios: config.criteria.length,
    },
    funil: { ...FUNIL_VAZIO, inscritos: INSCRITOS_NOVA_VAGA },
    responsavel: "Você",
  };
  s.novas.unshift(vaga);
  s.rascunhos = s.rascunhos.filter((x) => x.id !== rascunhoId);
  gravar(s);
  return vaga;
}

// ---------------------------------------------------------------------------
// Vagas abertas por último (o menu lateral mostra só estas: com centenas de vagas, a lista
// completa fica na tela inicial, com busca e filtros).
// ---------------------------------------------------------------------------

const CHAVE_RECENTES = "converge.recentes.v1";

export function marcarRecente(id: string) {
  try {
    const atual = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]") as string[];
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([id, ...atual.filter((x) => x !== id)].slice(0, 6)));
    window.dispatchEvent(new Event(CHAVE_RECENTES));
  } catch {
    // Sem localStorage: o menu só não lembra.
  }
}

export function useRecentes(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const ler = () => {
      try {
        setIds(JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]") as string[]);
      } catch {
        setIds([]);
      }
    };
    ler();
    window.addEventListener(CHAVE_RECENTES, ler);
    return () => window.removeEventListener(CHAVE_RECENTES, ler);
  }, []);
  return ids;
}

// ---------------------------------------------------------------------------
// Leitura para a tela: as etapas de uma vaga publicada e frases curtas sobre ela.
// ---------------------------------------------------------------------------

export const ETAPAS_VAGA = ["plano", "entrevistas", "escores", "contratacoes"] as const;
export type EtapaVaga = (typeof ETAPAS_VAGA)[number];

export const NOME_ETAPA: Record<EtapaVaga, string> = {
  plano: "Plano combinado",
  entrevistas: "Candidatos",
  escores: "Escores",
  contratacoes: "Contratações",
};

/** As abas desta vaga: Contratações só aparece quando a vaga contratou alguém. */
export function etapasDa(v: Pick<VagaEmpresa, "contratados">): EtapaVaga[] {
  return ETAPAS_VAGA.filter((e) => e !== "contratacoes" || !!v.contratados);
}

/** Número com separador de milhar (70.412). */
export const numero = (n: number) => n.toLocaleString("pt-BR");

/** Número curto para espaços apertados (70,4 mil). */
export const numeroCurto = (n: number) =>
  n >= 10_000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : numero(n);

/** O número ao lado de cada etapa no menu (o plano não tem número). */
export function contagemDa(v: VagaEmpresa, etapa: EtapaVaga): number | null {
  if (etapa === "entrevistas") return v.funil.inscritos;
  if (etapa === "escores") return v.funil.concluiram;
  if (etapa === "contratacoes") return v.contratados ?? null;
  return null;
}

/** Relatórios que acabaram de chegar: é o que o avaliador deve olhar primeiro. */
export const novosDa = (v: VagaEmpresa) => (v.etapa === "encerrada" ? 0 : v.funil.novos);

const dias = (n: number) => (n === 0 ? "hoje" : n === 1 ? "ontem" : `há ${n} dias`);

export function diasDoRascunho(r: RascunhoVaga): number {
  if (r.atualizadoEm) return Math.max(0, Math.floor((Date.now() - r.atualizadoEm) / 86_400_000));
  return r.haDias ?? 0;
}

/** Uma frase curta sobre a situação da vaga. */
export function situacaoDa(v: VagaEmpresa): string {
  const f = v.funil;
  if (v.etapa === "encerrada") return `Encerrada ${dias(v.encerradaHaDias ?? 0)} · ${numero(f.concluiram)} entrevistas`;
  if (f.inscritos === 0) return "Link pronto · nenhum inscrito ainda";
  return `${numero(f.inscritos)} ${f.inscritos === 1 ? "inscrito" : "inscritos"} · ${numero(f.concluiram)} ${
    f.concluiram === 1 ? "entrevista feita" : "entrevistas feitas"
  }`;
}

/** Uma frase curta sobre o rascunho. */
export function situacaoDoRascunho(r: RascunhoVaga): string {
  if (!r.sessaoId) return "Ainda não começou com o Totti";
  if (r.combinados && r.combinados.feitos > 0) return `${r.combinados.feitos} de ${r.combinados.total} pontos combinados`;
  return "Conversa com o Totti começou";
}

export { dias as quandoFoi };

// ---------------------------------------------------------------------------
// Estágio de cada vaga na tela inicial, em ordem cronológica (a pipeline):
//   Definir escopo (rascunho com o Totti) → Aguardando entrevistas → Ver resultados
// Não há estágio de "enviar convites": ao publicar, os convites saem sozinhos (EnvioConvites).
// ---------------------------------------------------------------------------

export const ESTAGIOS = ["escopo", "aguardando", "resultados"] as const;
export type Estagio = (typeof ESTAGIOS)[number];

export const NOME_ESTAGIO: Record<Estagio, string> = {
  escopo: "Definir escopo",
  aguardando: "Aguardando entrevistas",
  resultados: "Ver resultados",
};

/** O que acontece em cada estágio, numa linha. */
export const DICA_ESTAGIO: Record<Estagio, string> = {
  escopo: "Termine o plano com o Totti",
  aguardando: "Os candidatos estão fazendo",
  resultados: "Relatórios para revisar",
};

/** O estágio de uma vaga publicada (encerradas ficam fora do quadro). Funil já com convites e entrevistas reais. */
export function estagioDa(v: VagaEmpresa): Exclude<Estagio, "escopo"> | "encerrada" {
  if (v.etapa === "encerrada") return "encerrada";
  const f = v.funil;
  if (f.novos > 0) return "resultados";
  // Publicada e sem convite ainda: os convites são automáticos, então a vaga já está esperando os candidatos.
  if (f.convidados === 0) return "aguardando";
  if (f.emAndamento === 0 && f.concluiram >= f.convidados) return "resultados";
  return "aguardando";
}

// ---------------------------------------------------------------------------
// Painel executivo da tela inicial: os grandes números somados das vagas abertas,
// os recortes rápidos da lista (com contagem) e a ordenação.
// ---------------------------------------------------------------------------

/** Quanto de entrevista humana cada triagem feita pelo Totti poupa (estimativa do painel). */
export const MINUTOS_POR_TRIAGEM = 30;
/** A partir de quantos inscritos a vaga conta como de alto volume. */
export const ALTO_VOLUME = 1_000;

/** Nome curto do formato, para etiquetas e filtros (o produto é de tecnologia). */
export const NOME_FORMATO_CURTO: Record<InterviewConfig["mode"], string> = {
  system_design: "System design",
  live_coding: "Live coding",
};

export type Totais = {
  /** Vagas abertas (encerradas ficam fora da soma). */
  vagas: number;
  inscritos: number;
  convidados: number;
  /** Entrevistas concluídas com o Totti. */
  entrevistados: number;
  emAndamento: number;
  /** Relatórios prontos esperando o parecer da recrutadora. */
  pendentes: number;
  vagasComPendentes: number;
  horasPoupadas: number;
};

/** Soma o funil das vagas abertas. */
export function totaisDas(vagas: VagaEmpresa[]): Totais {
  const abertas = vagas.filter((v) => v.etapa !== "encerrada");
  const soma = (f: (v: VagaEmpresa) => number) => abertas.reduce((t, v) => t + f(v), 0);
  const entrevistados = soma((v) => v.funil.concluiram);
  return {
    vagas: abertas.length,
    inscritos: soma((v) => v.funil.inscritos),
    convidados: soma((v) => v.funil.convidados),
    entrevistados,
    emAndamento: soma((v) => v.funil.emAndamento),
    pendentes: soma(novosDa),
    vagasComPendentes: abertas.filter((v) => novosDa(v) > 0).length,
    horasPoupadas: Math.round((entrevistados * MINUTOS_POR_TRIAGEM) / 60),
  };
}

/** Porcentagem para ler de relance: uma casa abaixo de 10% ("0,4%"), inteira acima ("31%"). */
export function porcento(parte: number, todo: number): string {
  if (!todo || !parte) return "0%";
  const p = (parte / todo) * 100;
  if (p < 0.1) return "<0,1%";
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;
}

/** Os atalhos da lista, na ordem dos chips. */
export const RECORTES_RAPIDOS = ["todas", "pendentes", "em_entrevista", "alto_volume", "live_coding", "system_design", "escopo"] as const;
/** Além dos chips: "com_relatorios" vem do funil e "encerradas" do link no fim da lista. */
export type Recorte = (typeof RECORTES_RAPIDOS)[number] | "com_relatorios" | "encerradas";

export const NOME_RECORTE: Record<Recorte, string> = {
  todas: "Todas",
  pendentes: "Com decisão pendente",
  em_entrevista: "Em entrevista",
  alto_volume: `Alto volume (+${numero(ALTO_VOLUME)})`,
  live_coding: NOME_FORMATO_CURTO.live_coding,
  system_design: NOME_FORMATO_CURTO.system_design,
  escopo: "Com o Totti",
  com_relatorios: "Com entrevistas feitas",
  encerradas: "Encerradas",
};

/** Se a vaga entra no recorte. Escopos (rascunhos) não são vagas: o recorte "escopo" é tratado pela tela. */
export function noRecorte(v: VagaEmpresa, r: Recorte): boolean {
  if (r === "encerradas") return v.etapa === "encerrada";
  if (v.etapa === "encerrada") return false;
  switch (r) {
    case "todas":
      return true;
    case "pendentes":
      return novosDa(v) > 0;
    case "em_entrevista":
      return estagioDa(v) === "aguardando";
    case "com_relatorios":
      return v.funil.concluiram > 0;
    case "alto_volume":
      return v.funil.inscritos >= ALTO_VOLUME;
    case "live_coding":
    case "system_design":
      return v.resumo?.formato === r;
    case "escopo":
      return false;
  }
}

/** O estágio antigo da URL (?estagio=...) vira o recorte equivalente. */
export function recorteDaUrl(valor: string | null): Recorte {
  const antigos: Record<string, Recorte> = { escopo: "escopo", aguardando: "em_entrevista", resultados: "pendentes" };
  if (!valor) return "todas";
  if (valor in antigos) return antigos[valor];
  return valor in NOME_RECORTE ? (valor as Recorte) : "todas";
}

export const ORDENS = ["inscritos", "pendentes", "recentes", "az"] as const;
export type OrdemVagas = (typeof ORDENS)[number];

export const NOME_ORDEM: Record<OrdemVagas, string> = {
  inscritos: "Maior volume de inscritos",
  pendentes: "Mais decisões pendentes",
  recentes: "Mais recentes",
  az: "Ordem alfabética (A–Z)",
};

/** Comparador da lista; o empate cai no volume de inscritos e depois no nome. */
export function compararVagas(ordem: OrdemVagas): (a: VagaEmpresa, b: VagaEmpresa) => number {
  const porNome = (a: VagaEmpresa, b: VagaEmpresa) => a.cargo.localeCompare(b.cargo, "pt-BR");
  const porVolume = (a: VagaEmpresa, b: VagaEmpresa) => b.funil.inscritos - a.funil.inscritos || porNome(a, b);
  if (ordem === "az") return porNome;
  if (ordem === "recentes") return (a, b) => a.abertaHaDias - b.abertaHaDias || porVolume(a, b);
  if (ordem === "pendentes") return (a, b) => novosDa(b) - novosDa(a) || porVolume(a, b);
  return porVolume;
}
