/**
 * Onde o servidor grava os arquivos (configs, convites, relatórios). Só servidor.
 *
 * Local: `data/` na raiz do projeto. Na Vercel a pasta do código é somente leitura (o `mkdir` em
 * `/var/task/data` dava ENOENT e a publicação da vaga respondia 500), então lá vai para a pasta
 * temporária da função. Ela vale enquanto a instância vive: serve para a demo, não é um banco.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

export const pastaDados = (...partes: string[]) => join(process.env.VERCEL ? tmpdir() : process.cwd(), "data", ...partes);
