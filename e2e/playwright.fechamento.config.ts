import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const porta = Number(process.env.PORTA_E2E ?? 3021);
export default defineConfig({
  ...base, testMatch: "fechamento-quadro.spec.ts", timeout: 90000,
  use: { ...base.use, baseURL: `http://localhost:${porta}` },
  webServer: {
    command: `npm run dev -- --port ${porta}`,
    url: `http://localhost:${porta}/entrevista/system-design`,
    env: { NEXT_PUBLIC_USAR_SERVIDOR: "1", AGENTE_FAKE: "1", NEXT_PUBLIC_E2E: "1" },
    reuseExistingServer: false, timeout: 180000, stdout: "ignore", stderr: "pipe",
  },
});
