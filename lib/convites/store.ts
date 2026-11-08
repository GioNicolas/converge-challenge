/**
 * Convites de triagem (um por candidato). Só servidor.
 *
 * Memória + `data/convites/<token>.json`. O token é o único segredo do link de agendamento,
 * então é validado antes de tocar no filesystem: nada além de 32 hex chega ao caminho do arquivo.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { pastaDados } from "@/lib/dados";

export const CONVITE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_VALIDO = /^[a-f0-9]{32}$/;
/**
 * Id que vai no link da entrevista (`?convite=`). Separado do token: o link da entrevista pode ser
 * compartilhado ou aparecer em log sem dar acesso a remarcar o horário.
 */
export const ENTREVISTA_ID_VALIDO = /^[a-f0-9]{16}$/;
const SESSAO_ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;
/** Teto de sessões por convite: recarregar a página cria sessão nova, mas não infinitamente. */
const MAX_SESSOES = 10;

const ConviteSchema = z.object({
  token: z.string().regex(TOKEN_VALIDO),
  vagaId: z.string().min(1),
  configId: z.string().min(1),
  cargo: z.string(),
  mode: z.enum(["live_coding", "system_design"]),
  durationMin: z.number().int().positive(),
  languages: z.array(z.string()),
  candidato: z.object({ nome: z.string(), email: z.string() }),
  criadoEm: z.number(),
  status: z.enum(["enviado", "simulado", "agendado"]),
  agendadoPara: z.string().optional(),
  /** Criado ao agendar: identifica o candidato no link da entrevista. */
  entrevistaId: z.string().regex(ENTREVISTA_ID_VALIDO).optional(),
  /** Sessões de entrevista abertas por esse link (é assim que o painel sabe quem fez cada uma). */
  sessoes: z.array(z.string().regex(SESSAO_ID_VALIDO)).optional(),
});

export type Convite = z.infer<typeof ConviteSchema>;

type NovoConvite = Omit<Convite, "token" | "criadoEm" | "status" | "agendadoPara" | "entrevistaId" | "sessoes">;

const globalForConvites = globalThis as typeof globalThis & { __convergeConvites?: Map<string, Convite> };
const convites = (globalForConvites.__convergeConvites ??= new Map<string, Convite>());

const pasta = () => pastaDados("convites");

const expirado = (c: Convite, agora = Date.now()) => agora - c.criadoEm > CONVITE_VALIDADE_MS;

/** Cria o convite com token novo e status "enviado". Ainda não grava: quem chama salva com `salvarConvite`. */
export function criarConvite(dados: NovoConvite): Convite {
  return {
    ...dados,
    token: randomBytes(16).toString("hex"),
    criadoEm: Date.now(),
    status: "enviado",
  };
}

/** Grava (memória + arquivo). Token fora do formato é recusado antes de qualquer escrita. */
export async function salvarConvite(convite: Convite): Promise<void> {
  if (!TOKEN_VALIDO.test(convite.token)) throw new Error("token de convite inválido");
  convites.set(convite.token, convite);
  await mkdir(pasta(), { recursive: true });
  await writeFile(join(pasta(), `${convite.token}.json`), JSON.stringify(convite, null, 2), "utf8");
}

/** Convite pelo token. Inexistente, malformado ou com mais de 7 dias: undefined. */
export async function acharConvite(token: string): Promise<Convite | undefined> {
  if (!TOKEN_VALIDO.test(token)) return undefined;
  const emMemoria = convites.get(token);
  if (emMemoria) return expirado(emMemoria) ? undefined : emMemoria;
  try {
    const parsed = ConviteSchema.safeParse(JSON.parse(await readFile(join(pasta(), `${token}.json`), "utf8")));
    if (!parsed.success || parsed.data.token !== token) return undefined;
    if (expirado(parsed.data)) return undefined;
    convites.set(token, parsed.data);
    return parsed.data;
  } catch {
    return undefined;
  }
}

export const novoEntrevistaId = () => randomBytes(8).toString("hex");

/**
 * Todos os convites gravados (memória + disco), sem filtrar validade: o convite expira para agendar,
 * mas o painel continua precisando do nome de quem fez a entrevista.
 */
export async function listarConvites(): Promise<Convite[]> {
  let nomes: string[] = [];
  try {
    nomes = (await readdir(pasta())).filter((n) => TOKEN_VALIDO.test(n.replace(/\.json$/, "")));
  } catch {
    // Pasta ainda não existe: só o que está em memória.
  }
  const porToken = new Map(convites);
  await Promise.all(
    nomes.map(async (n) => {
      const token = n.replace(/\.json$/, "");
      if (porToken.has(token)) return;
      try {
        const parsed = ConviteSchema.safeParse(JSON.parse(await readFile(join(pasta(), n), "utf8")));
        if (parsed.success && parsed.data.token === token) porToken.set(token, parsed.data);
      } catch {
        // Arquivo ilegível: ignora.
      }
    }),
  );
  return [...porToken.values()];
}

/** Liga uma sessão de entrevista ao convite dono do `entrevistaId`. Devolve false se o id não existe. */
export async function vincularSessao(entrevistaId: string, sessionId: string): Promise<boolean> {
  if (!ENTREVISTA_ID_VALIDO.test(entrevistaId) || !SESSAO_ID_VALIDO.test(sessionId)) return false;
  const convite = (await listarConvites()).find((c) => c.entrevistaId === entrevistaId);
  if (!convite) return false;
  const sessoes = convite.sessoes ?? [];
  if (sessoes.includes(sessionId)) return true;
  await salvarConvite({ ...convite, sessoes: [...sessoes, sessionId].slice(-MAX_SESSOES) });
  return true;
}

/** sessionId → nome do candidato, para o painel da vaga. */
export async function candidatosPorSessao(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const c of await listarConvites()) for (const s of c.sessoes ?? []) mapa.set(s, c.candidato.nome);
  return mapa;
}

/** Link da entrevista: a vaga e, quando há, o id que diz quem é o candidato. */
export function linkDaEntrevista(base: string, convite: Pick<Convite, "configId" | "entrevistaId">): string {
  const url = `${base.replace(/\/$/, "")}/?config=${encodeURIComponent(convite.configId)}`;
  return convite.entrevistaId ? `${url}&convite=${convite.entrevistaId}` : url;
}
