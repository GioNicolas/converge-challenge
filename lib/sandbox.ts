// Isolamento para rodar o código do candidato (C/C++) no servidor.
// macOS: sandbox-exec (sem rede, sem fork, sem escrita fora do tmp, sem leitura do HOME).
// Linux: bubblewrap (bwrap) com namespaces novos (sem rede, FS somente leitura, só o tmp gravável).
// Nos dois: limites de CPU, tamanho de arquivo, processos e memória (onde o SO respeita) via ulimit.
// Sem sandbox disponível, falha fechado — a menos que ALLOW_UNSANDBOXED_RUN=1 (só para dev).
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Sandbox = { kind: "seatbelt" | "bwrap" | "none"; available: boolean };

let cached: Promise<Sandbox> | null = null;

export function detectSandbox(): Promise<Sandbox> {
  cached ??= (async (): Promise<Sandbox> => {
    try {
      if (process.platform === "darwin") {
        await run("/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"]);
        return { kind: "seatbelt", available: true };
      }
      if (process.platform === "linux") {
        await run("bwrap", ["--ro-bind", "/", "/", "true"]);
        return { kind: "bwrap", available: true };
      }
    } catch {
      /* cai no abaixo */
    }
    return { kind: "none", available: process.env.ALLOW_UNSANDBOXED_RUN === "1" };
  })();
  return cached;
}

const LIMITS = [
  "ulimit -c 0", // sem core dump
  "ulimit -t 2", // CPU (s)
  "ulimit -f 1024", // arquivos gravados (blocos de 1 KB)
  "ulimit -n 32", // descritores abertos
  "ulimit -v 524288 2>/dev/null", // memória virtual 512 MB (Linux; o macOS ignora)
].join("; ");

function seatbeltProfile(dir: string, allowFork: boolean) {
  const q = (p: string) => JSON.stringify(p);
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    allowFork ? "" : "(deny process-fork)",
    "(deny file-write*)",
    `(allow file-write* (subpath ${q(dir)}) (literal "/dev/null"))`,
    `(deny file-read* (subpath ${q(homedir())}))`,
    `(allow file-read* (subpath ${q(dir)}))`,
  ].join("\n");
}

/** Monta [comando, args] que executa `argv` isolado, com `dir` como único lugar gravável. */
export function wrap(sb: Sandbox, dir: string, argv: string[], opts: { compile?: boolean } = {}): [string, string[]] {
  const script = `${LIMITS}; exec "$@"`;
  const inner = ["/bin/sh", "-c", script, "sh", ...argv];
  // O compilador precisa criar processos (cc1, ld); o binário do candidato não.
  if (sb.kind === "seatbelt") {
    return ["/usr/bin/sandbox-exec", ["-p", seatbeltProfile(dir, !!opts.compile), ...inner]];
  }
  if (sb.kind === "bwrap") {
    return [
      "bwrap",
      [
        "--unshare-all", "--die-with-parent", "--new-session",
        "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc",
        "--tmpfs", "/home", "--tmpfs", "/root",
        "--bind", dir, dir, "--chdir", dir,
        ...inner,
      ],
    ];
  }
  return [inner[0], inner.slice(1)];
}
