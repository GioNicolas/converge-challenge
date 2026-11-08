import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O runner de Python (lib/execution/pyodide-node.ts) carrega o Pyodide por caminho em tempo de execução; sem isto
  // a Vercel não inclui os arquivos dele (WebAssembly e biblioteca padrão) no pacote do deploy.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pyodide/**/*"],
  },
};

export default nextConfig;
