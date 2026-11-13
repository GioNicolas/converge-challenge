/**
 * Kit de avaliação: o que muda de uma área para outra (dados, não código).
 * Só existe no servidor: a ficha de requisitos e a rubrica NUNCA vão ao navegador.
 */
import { z } from "zod";

/** Um critério da rubrica, com a descrição fixa de cada nota (1 a 4). */
export const Criterio = z.object({
  id: z.string(), // ex.: "escalabilidade" (é o `criterio` das observações)
  nome: z.string(),
  /** Descrição de cada nota; dá consistência ao agente e explica a nota ao recrutador. */
  niveis: z.object({ 1: z.string(), 2: z.string(), 3: z.string(), 4: z.string() }),
});
/**
 * `provaSoPorFala` fica fora do schema Zod de propósito (como o empecilho do problema): o gerador de kits roda
 * em modo estrito e não deve ser forçado a preenchê-lo. Quando true, o critério só se prova com fala do
 * candidato (desenho não vale) e não tem pergunta própria: aparece nas respostas aos outros critérios.
 */
export type Criterio = z.infer<typeof Criterio> & { provaSoPorFala?: boolean };

/** Pergunta provável do candidato e a resposta oficial (a "ficha de requisitos ocultos"). */
export const ItemFicha = z.object({ pergunta: z.string(), resposta: z.string() });

export const Problema = z.object({
  id: z.string(), // ex.: "encurtador_url"
  titulo: z.string(),
  /** Vago de propósito: perguntar antes de desenhar é o primeiro sinal avaliado. */
  enunciado: z.string(),
  /**
   * O que o entrevistador FALA ao abrir a sessão: uma apresentação natural do tema, em pt-BR falado
   * (não a leitura do enunciado). Público como o enunciado: sem números da ficha. Opcional: sem ele
   * o quadro monta uma fala simples a partir do título e do enunciado.
   */
  falaDoDesafio: z.string().optional(),
  ficha: z.array(ItemFicha),
  sinaisEsperados: z.array(z.string()),
  /** O que uma solução fraca costuma ter; vira pergunta. */
  armadilhas: z.array(z.string()),
  perguntasSugeridas: z.array(z.string()),
});
/**
 * Empecilho do quadro: no meio da entrevista o entrevistador traz UMA mudança no problema (um requisito muda,
 * entra uma restrição nova ou cai uma parte do sistema). Vem de três lugares: escrito à mão no kit (problemas
 * fixos); criado pelo gerador da questão da vaga (regras em `validar.ts`, `empecilhoGerado`); ou uma das genéricas
 * do kit de system design (`empecilhos-genericos.ts`) quando o problema não tem um. Fica fora do schema Zod de
 * propósito: o gerador de kits (modo estrito, todo campo obrigatório) não deve ser forçado a criar um. Só servidor
 * até ser anunciado.
 */
export type Empecilho = {
  id: string;
  tipo: "requisito_muda" | "restricao_nova" | "parte_cai";
  /** O que o entrevistador fala, em pt-BR falado. Termina deixando a bola com o candidato. */
  fala: string;
  /** O que ele escreve no quadro, como requisito novo (até 50 caracteres). */
  requisito: string;
  /** O que a mudança pede do desenho (para a análise e o scorecard; nunca falado). */
  exige: string;
};

export type Problema = z.infer<typeof Problema> & { empecilho?: Empecilho };

export const TipoPergunta = z.object({ nome: z.string(), exemplo: z.string(), revela: z.string() });

export const Kit = z.object({
  id: z.string(), // ex.: "system_design"
  /** Aparece no cartão de início: "Entrevista de {area}". */
  area: z.string(),
  /** Quem o entrevistador "é". */
  persona: z.string(),
  tipoEntrevista: z.string(),
  /** Como o quadro é lido (2.5.1 do planejamento). */
  modoLeitura: z.enum(["grafo", "visual", "misto"]),
  criterios: z.array(Criterio).min(1),
  tiposPergunta: z.array(TipoPergunta),
  termosTranscricao: z.array(z.string()),
  problemas: z.array(Problema).min(1),
});
export type Kit = Omit<z.infer<typeof Kit>, "problemas" | "criterios"> & { problemas: Problema[]; criterios: Criterio[] };

/** Minúsculas e sem acento ("Comunicação" -> "comunicacao"). */
export function semAcento(texto: string): string {
  let out = "";
  for (const ch of texto.normalize("NFD")) {
    const cod = ch.codePointAt(0) ?? 0;
    if (cod >= 0x300 && cod <= 0x36f) continue;
    out += ch;
  }
  return out.toLowerCase();
}

/** Palavras de um texto (sequências de letras, em minúsculas e sem acento). */
export function palavrasSemAcento(texto: string): string[] {
  const palavras: string[] = [];
  let atual = "";
  for (const ch of semAcento(texto)) {
    if (ch >= "a" && ch <= "z") atual += ch;
    else if (atual) {
      palavras.push(atual);
      atual = "";
    }
  }
  if (atual) palavras.push(atual);
  return palavras;
}

/**
 * O critério só se prova por fala? Vale o campo do critério. Sem o campo (kits já salvos), o nome antigo (com o termo interno entre
 * parênteses) continua sendo reconhecido para esses kits não mudarem de comportamento. O id não muda.
 */
export function criterioSoPorFala(c: Pick<Criterio, "id"> & Partial<Pick<Criterio, "nome" | "provaSoPorFala">>): boolean {
  if (c.provaSoPorFala !== undefined) return c.provaSoPorFala;
  const nome = semAcento(c.nome ?? "");
  const palavras = palavrasSemAcento(nome);
  if (palavras.some((p) => p === "plins" || p === "oral" || p === "verbal")) return true;
  const ini = nome.indexOf("comunicacao");
  return ini >= 0 && palavrasSemAcento(nome.slice(ini + "comunicacao".length)).includes("respostas");
}

/** Critério sem pergunta própria: fica fora da cobertura e nunca vira alvo (o id "comunicacao" sempre foi assim). */
export function criterioIndireto(c: Pick<Criterio, "id"> & Partial<Pick<Criterio, "nome" | "provaSoPorFala">>): boolean {
  return c.provaSoPorFala ?? (c.id === "comunicacao" || criterioSoPorFala(c));
}

/**
 * Kit salvo antes da renomeação (vagas já criadas): o critério de comunicação guarda o nome antigo, com o termo
 * interno. Devolve o mesmo kit com o nome legível e o campo novo, sem mudar o id (o scorecard e as configs
 * guardam só o id). Kit sem o nome antigo volta intacto (o mesmo objeto).
 */
export function kitSemTermosInternos<K extends Pick<Kit, "criterios">>(kit: K): K {
  const temPlins = (texto: string) => palavrasSemAcento(texto).some((p) => p === "plin" || p === "plins");
  const antigo = (c: Criterio) => temPlins(c.nome);
  if (!kit.criterios.some(antigo)) return kit;
  return {
    ...kit,
    criterios: kit.criterios.map((c) => {
      if (!antigo(c)) return c;
      // Tira o último parêntese do nome quando é ele que traz o termo interno.
      let nome = c.nome.trim();
      const abre = nome.lastIndexOf("(");
      if (nome.endsWith(")") && abre >= 0 && temPlins(nome.slice(abre + 1, -1))) nome = nome.slice(0, abre).trim();
      return { ...c, nome: nome || "Comunicação", ...(criterioSoPorFala(c) ? { provaSoPorFala: true } : {}) };
    }),
  };
}
