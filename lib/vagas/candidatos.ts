// Os candidatos de uma vaga, gerados a partir do funil (dados de demonstração em escala real:
// uma vaga de júnior pode ter dezenas de milhares de inscritos). A geração é determinística e fica
// em memória; o que o recrutador faz (convidar em lote) fica salvo no navegador, por índice.
import { useCallback, useEffect, useState } from "react";
import { entre, escolher, semente, sorteador } from "./aleatorio";
import { EVENTO_TESTADOR, lerTestador, type Testador } from "./testador";

export type Situacao = "inscrito" | "convidado" | "em_andamento" | "concluiu";

export type CandidatoVaga = {
  /** Posição na lista gerada (estável). */
  i: number;
  nome: string;
  email: string;
  cidade: string;
  situacao: Situacao;
  /** Há quantos dias foi a última mudança (inscrição, convite, entrevista). */
  haDias: number;
  /** Relatório chegou nas últimas 24–48h. */
  novo: boolean;
  /** Só de quem concluiu: a nota geral (0–4, a mesma escala do relatório) e a recomendação que sai dela. */
  escore?: number;
  recomendacao?: RecomendacaoDemo;
  /** É quem está usando o site (deixou o próprio e-mail): o convite e a decisão chegam de verdade. */
  testador?: boolean;
};

/** As recomendações do relatório que uma nota de demonstração pode receber. */
export type RecomendacaoDemo = "avancar" | "avancar_com_ressalvas" | "talvez" | "nao_avancar";

/**
 * A nota de quem concluiu: sorteio próprio por candidato (não mexe no sorteio de nomes e e-mails),
 * concentrado no meio da escala, como num funil de verdade: poucos muito bons, poucos muito fracos.
 */
function escoreDemo(vagaId: string, i: number): { escore: number; recomendacao: RecomendacaoDemo } {
  const r = sorteador(semente(`${vagaId}:escore:${i}`));
  const base = (r() + r() + r()) / 3; // forma de sino em [0, 1)
  const escore = Math.round((1.1 + base * 2.9) * 10) / 10; // 1,1 a 4,0
  const recomendacao: RecomendacaoDemo =
    escore >= 3.3 ? "avancar" : escore >= 2.8 ? "avancar_com_ressalvas" : escore >= 2.2 ? "talvez" : "nao_avancar";
  return { escore, recomendacao };
}

/** Contagens do funil. `convidados` inclui quem já está fazendo ou concluiu. */
export type Funil = {
  inscritos: number;
  convidados: number;
  emAndamento: number;
  concluiram: number;
  /** Dos que concluíram, quantos relatórios chegaram agora. */
  novos: number;
};

export const FUNIL_VAZIO: Funil = { inscritos: 0, convidados: 0, emAndamento: 0, concluiram: 0, novos: 0 };

export const NOME_SITUACAO: Record<Situacao, string> = {
  inscrito: "Inscrito",
  convidado: "Convidado",
  em_andamento: "Fazendo agora",
  concluiu: "Relatório pronto",
};

const NOMES = [
  "Ana", "Beatriz", "Bruna", "Camila", "Carolina", "Clara", "Daniela", "Eduarda", "Fernanda", "Gabriela",
  "Helena", "Isabela", "Júlia", "Larissa", "Laura", "Letícia", "Luana", "Manuela", "Mariana", "Natália",
  "Paula", "Rafaela", "Renata", "Sofia", "Thaís", "Vitória", "Yasmin", "Alice", "Lívia", "Giovanna",
  "André", "Arthur", "Bruno", "Caio", "Daniel", "Diego", "Eduardo", "Felipe", "Gabriel", "Guilherme",
  "Gustavo", "Heitor", "Henrique", "Igor", "João", "José", "Leonardo", "Lucas", "Marcelo", "Mateus",
  "Miguel", "Murilo", "Nicolas", "Otávio", "Pedro", "Rafael", "Rodrigo", "Samuel", "Thiago", "Vinícius",
];
const SOBRENOMES = [
  "Almeida", "Alves", "Andrade", "Araújo", "Barbosa", "Barros", "Batista", "Cardoso", "Carvalho", "Castro",
  "Costa", "Cunha", "Dias", "Duarte", "Fernandes", "Ferreira", "Freitas", "Gomes", "Gonçalves", "Lima",
  "Lopes", "Machado", "Marques", "Martins", "Melo", "Mendes", "Monteiro", "Moraes", "Moreira", "Nascimento",
  "Nogueira", "Nunes", "Oliveira", "Pereira", "Pinto", "Prado", "Ramos", "Reis", "Ribeiro", "Rocha",
  "Rodrigues", "Santana", "Santos", "Silva", "Soares", "Souza", "Teixeira", "Vieira", "Okada", "Tanaka",
];
export const CIDADES = [
  "São Paulo", "Campinas", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre", "Recife",
  "Salvador", "Fortaleza", "Florianópolis", "Brasília", "Goiânia", "Manaus", "Belém", "Ribeirão Preto",
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Índices dos candidatos de teste começam aqui, longe dos demo, para não deslocar os convites salvos. */
const INDICE_TESTE = 1_000_000;
/** Índice do testador: acima dos de teste e preso ao e-mail, para um e-mail novo não herdar o convite do anterior. */
const INDICE_TESTADOR = 2_000_000;
/** Candidato de teste (time ou o testador): pode receber e-mail de verdade. */
export const ehCandidatoTeste = (c: CandidatoVaga) => c.i >= INDICE_TESTE;

type CandidatoTeste = { nome: string; email: string };

let testesPromessa: Promise<CandidatoTeste[]> | null = null;
/** Os candidatos de teste, buscados uma vez por carregamento da página. Falha vira lista vazia. */
function buscarTestes(): Promise<CandidatoTeste[]> {
  testesPromessa ??= fetch("/api/convites/teste")
    .then((r) => (r.ok ? (r.json() as Promise<{ candidatos?: CandidatoTeste[] }>) : { candidatos: [] }))
    .then((j) => j.candidatos ?? [])
    .catch(() => []);
  return testesPromessa;
}

const cache = new Map<string, CandidatoVaga[]>();

/** A lista base (sem os convites feitos aqui). Memorizada por vaga. */
function gerar(vagaId: string, funil: Funil): CandidatoVaga[] {
  const chave = `${vagaId}:${funil.inscritos}:${funil.convidados}:${funil.emAndamento}:${funil.concluiram}:${funil.novos}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;
  const r = sorteador(semente(vagaId));
  const lista: CandidatoVaga[] = new Array(funil.inscritos);
  const limConcluiu = funil.concluiram;
  const limAndamento = limConcluiu + funil.emAndamento;
  const limConvidado = funil.convidados;
  for (let i = 0; i < funil.inscritos; i++) {
    const nome = `${escolher(r, NOMES)} ${escolher(r, SOBRENOMES)}${r() < 0.4 ? ` ${escolher(r, SOBRENOMES)}` : ""}`;
    const partes = semAcento(nome).split(" ");
    const situacao: Situacao =
      i < limConcluiu ? "concluiu" : i < limAndamento ? "em_andamento" : i < limConvidado ? "convidado" : "inscrito";
    const novo = situacao === "concluiu" && i < funil.novos;
    const haDias = novo ? entre(r, 0, 1) : situacao === "em_andamento" ? 0 : situacao === "concluiu" ? entre(r, 2, 30) : entre(r, 0, 45);
    lista[i] = {
      i,
      nome,
      email: `${partes[0]}.${partes[partes.length - 1]}${entre(r, 1, 99)}@${escolher(r, ["gmail.com", "outlook.com", "hotmail.com", "icloud.com"])}`,
      cidade: escolher(r, CIDADES),
      situacao,
      haDias,
      novo,
      ...(situacao === "concluiu" ? escoreDemo(vagaId, i) : {}),
    };
  }
  cache.set(chave, lista);
  return lista;
}

// ---------------------------------------------------------------------------
// Convites feitos aqui (em lote): índices por vaga, salvos no navegador.
// ---------------------------------------------------------------------------

const CHAVE = "converge.convites.v1";

function lerConvites(): Record<string, number[]> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Record<string, number[]>;
  } catch {
    return {};
  }
}

export function convidar(vagaId: string, indices: number[]) {
  const todos = lerConvites();
  todos[vagaId] = [...new Set([...(todos[vagaId] ?? []), ...indices])];
  try {
    localStorage.setItem(CHAVE, JSON.stringify(todos));
  } catch {
    // Sem espaço: segue só na memória desta visita.
  }
  window.dispatchEvent(new Event(CHAVE));
}

/** Quantos convites foram feitos aqui em cada vaga (para somar no funil da lista de vagas). */
export function useConvitesFeitos() {
  const [convites, setConvites] = useState<Record<string, number>>({});
  useEffect(() => {
    const ler = () => setConvites(Object.fromEntries(Object.entries(lerConvites()).map(([k, v]) => [k, v.length])));
    ler();
    window.addEventListener(CHAVE, ler);
    return () => window.removeEventListener(CHAVE, ler);
  }, []);
  return convites;
}

/** O testador como inscrito da vaga. */
export function candidatoTestador(t: Testador): CandidatoVaga {
  return {
    i: INDICE_TESTADOR + (semente(t.email) % 1_000_000),
    nome: t.nome,
    email: t.email,
    cidade: CIDADES[0],
    situacao: "inscrito",
    haDias: 0,
    novo: false,
    testador: true,
  };
}

/**
 * O testador (se deixou o e-mail) e os testes primeiro, como inscritos comuns; depois os demonstrativos,
 * com os convites já feitos aplicados.
 */
function montarLista(vagaId: string, funil: Funil, testes: CandidatoTeste[]): CandidatoVaga[] {
  const testador = lerTestador();
  if (testador) testes = testes.filter((t) => t.email.toLowerCase() !== testador.email);
  const deTeste: CandidatoVaga[] = testes.map((t, k) => ({
    i: INDICE_TESTE + k,
    nome: t.nome,
    email: t.email,
    cidade: CIDADES[k % CIDADES.length],
    situacao: "inscrito",
    haDias: 0,
    novo: false,
  }));
  const todos = [...(testador ? [candidatoTestador(testador)] : []), ...deTeste, ...gerar(vagaId, funil)];
  const convidados = new Set(lerConvites()[vagaId] ?? []);
  if (convidados.size === 0) return todos;
  return todos.map((c) => (c.situacao === "inscrito" && convidados.has(c.i) ? { ...c, situacao: "convidado", haDias: 0 } : c));
}

/** Quem ainda espera convite numa vaga: é a lista que o envio automático, ao publicar, percorre. */
export async function aguardandoConvite(vagaId: string, funil: Funil): Promise<CandidatoVaga[]> {
  return montarLista(vagaId, funil, await buscarTestes()).filter((c) => c.situacao === "inscrito");
}

/** Os candidatos de uma vaga com os convites aplicados, e o funil recontado. `null` antes de montar. */
export function useCandidatos(vagaId: string, funil: Funil) {
  const [lista, setLista] = useState<CandidatoVaga[] | null>(null);
  // `null` até a busca dos testes terminar: senão a lista vazia piscaria "Ninguém se inscreveu ainda."
  const [testes, setTestes] = useState<CandidatoTeste[] | null>(null);

  useEffect(() => {
    let vivo = true;
    buscarTestes().then((t) => {
      if (vivo) setTestes(t);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const { inscritos, convidados: nConvidados, emAndamento, concluiram, novos } = funil;
  const montar = useCallback(() => {
    if (testes === null) return;
    setLista(montarLista(vagaId, { inscritos, convidados: nConvidados, emAndamento, concluiram, novos }, testes));
  }, [testes, vagaId, inscritos, nConvidados, emAndamento, concluiram, novos]);

  useEffect(() => {
    montar();
    window.addEventListener(CHAVE, montar);
    window.addEventListener(EVENTO_TESTADOR, montar);
    return () => {
      window.removeEventListener(CHAVE, montar);
      window.removeEventListener(EVENTO_TESTADOR, montar);
    };
  }, [montar]);

  return lista;
}

/** O funil com os convites feitos aqui somados. */
export const comConvites = (f: Funil, feitos = 0): Funil => ({ ...f, convidados: Math.min(f.inscritos, f.convidados + feitos) });

export const buscaNormalizada = semAcento;
