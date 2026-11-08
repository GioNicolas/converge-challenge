/**
 * Convites de triagem (um por candidato). Só servidor.
 *
 * Memória + `data/convites/<token>.json`. O token é o único segredo do link de agendamento,
 * então é validado antes de tocar no filesystem: nada além de 32 hex chega ao caminho do arquivo.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const CONVITE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_VALIDO = /^[a-f0-9]{32}$/;

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
});

export type Convite = z.infer<typeof ConviteSchema>;

type NovoConvite = Omit<Convite, "token" | "criadoEm" | "status" | "agendadoPara">;

const globalForConvites = globalThis as typeof globalThis & { __convergeConvites?: Map<string, Convite> };
const convites = (globalForConvites.__convergeConvites ??= new Map<string, Convite>());

const pasta = () => join(process.cwd(), "data", "convites");

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
