// Os candidatos de uma vaga, gerados a partir do funil (dados de demonstração em escala real:
// uma vaga de júnior pode ter dezenas de milhares de inscritos). A geração é determinística e fica
// em memória; o que o recrutador faz (convidar em lote) fica salvo no navegador, por índice.
import { useCallback, useEffect, useState } from "react";
import { entre, escolher, semente, sorteador } from "./aleatorio";

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
};

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

/** Os candidatos de uma vaga com os convites aplicados, e o funil recontado. `null` antes de montar. */
export function useCandidatos(vagaId: string, funil: Funil) {
  const [lista, setLista] = useState<CandidatoVaga[] | null>(null);

  const { inscritos, convidados: nConvidados, emAndamento, concluiram, novos } = funil;
  const montar = useCallback(() => {
    const base = gerar(vagaId, { inscritos, convidados: nConvidados, emAndamento, concluiram, novos });
    const convidados = new Set(lerConvites()[vagaId] ?? []);
    setLista(
      convidados.size === 0
        ? base
        : base.map((c) => (c.situacao === "inscrito" && convidados.has(c.i) ? { ...c, situacao: "convidado", haDias: 0 } : c)),
    );
  }, [vagaId, inscritos, nConvidados, emAndamento, concluiram, novos]);

  useEffect(() => {
    montar();
    window.addEventListener(CHAVE, montar);
    return () => window.removeEventListener(CHAVE, montar);
  }, [montar]);

  return lista;
}

/** O funil com os convites feitos aqui somados. */
export const comConvites = (f: Funil, feitos = 0): Funil => ({ ...f, convidados: Math.min(f.inscritos, f.convidados + feitos) });

export const buscaNormalizada = semAcento;
