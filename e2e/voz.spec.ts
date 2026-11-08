import { expect, test, type Page } from "@playwright/test";
import { estadoInicialDemo, responderDemo } from "../lib/pre-entrevista/tela/demo";
import { VAGAS } from "../fixtures/pre-entrevista/vagas";

type ControleVozTeste = {
  falas: string[];
  ouvindo: boolean;
  falando: boolean;
  autoTerminar: boolean;
  midias: MediaStream[];
  emitir: (texto: string) => void;
  terminar: () => void;
};
type JanelaTeste = Window & { vozTeste: ControleVozTeste };

async function preparar(page: Page) {
  await page.addInitScript(() => {
    let atual: SpeechSynthesisUtterance | null = null;
    const reconhecimentos: ReconhecimentoFalso[] = [];
    const controle: ControleVozTeste = {
      falas: [], ouvindo: false, falando: false, autoTerminar: true, midias: [],
      emitir: (texto) => reconhecimentos.findLast((r) => r.ativa)?.emitir(texto),
      terminar: () => {
        const fala = atual;
        atual = null;
        controle.falando = false;
        fala?.dispatchEvent(new Event("end"));
      },
    };
    const pedirMidia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (restricoes) => {
      const stream = await pedirMidia(restricoes);
      controle.midias.push(stream);
      return stream;
    };
    class ReconhecimentoFalso {
      lang = ""; continuous = false; interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
      resultados: unknown[] = []; ativa = false;
      start() { reconhecimentos.push(this); this.ativa = true; controle.ouvindo = true; this.onstart?.(); }
      abort() { this.ativa = false; controle.ouvindo = false; this.onend?.(); }
      stop() { this.abort(); }
      emitir(texto: string) {
        const indice = this.resultados.length;
        this.resultados.push({ isFinal: true, 0: { transcript: texto } });
        this.onresult?.({ resultIndex: indice, results: this.resultados });
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: ReconhecimentoFalso });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: ReconhecimentoFalso });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [],
      speak: (fala: SpeechSynthesisUtterance) => {
        atual = fala; controle.falando = true; controle.falas.push(fala.text);
        queueMicrotask(() => fala.dispatchEvent(new Event("start")));
        if (controle.autoTerminar) setTimeout(controle.terminar, 100);
      },
      cancel: () => { atual = null; controle.falando = false; },
    } });
    (window as unknown as JanelaTeste).vozTeste = controle;
  });
  await page.route("**/api/falar", (rota) => rota.fulfill({ status: 501, json: { erro: "fallback do teste" } }));
  await page.route("**/api/transcricao/sessao", (rota) => rota.fulfill({ json: { provedor: "navegador" } }));
  await page.route("**/api/stt-token?**", (rota) => rota.fulfill({ status: 503, json: { erro: "fallback do teste" } }));
}

const ouvindo = (page: Page) => page.evaluate(() => (window as unknown as JanelaTeste).vozTeste.ouvindo);
const falas = (page: Page) => page.evaluate(() => (window as unknown as JanelaTeste).vozTeste.falas);
const emitir = (page: Page, texto: string) => page.evaluate((t) => (window as unknown as JanelaTeste).vozTeste.emitir(t), texto);

test("recrutadora dita a vaga e conversa com Totti sem repetir voz no polling", async ({ page }) => {
  await preparar(page);
  let estado = estadoInicialDemo(VAGAS[0]);
  await page.route("**/api/pre-entrevista/sessoes**", async (rota) => {
    if (rota.request().method() === "POST" && rota.request().url().endsWith("/mensagem")) {
      estado = responderDemo(estado, rota.request().postDataJSON().text);
    }
    await rota.fulfill({ json: estado });
  });
  await page.goto("/pre-entrevista/nova");
  await page.getByRole("button", { name: "Usar um exemplo" }).click();
  await page.getByRole("button", { name: "Ditar por voz" }).first().click();
  await expect.poll(() => ouvindo(page)).toBe(true);
  await emitir(page, "Precisamos de experiência com Python.");
  await expect(page.getByPlaceholder("Responsabilidades, requisitos, ferramentas do dia a dia…")).toHaveValue(/Precisamos de experiência com Python\./);
  await page.getByRole("button", { name: "Parar ditado" }).click();
  await page.getByRole("button", { name: "Começar com o Totti" }).click();
  await expect(page.getByRole("button", { name: "Silenciar respostas por voz" })).toBeVisible({ timeout: 25000 });
  await expect.poll(async () => (await falas(page)).length).toBe(1);
  await page.getByRole("button", { name: "Ditar por voz" }).click();
  await expect.poll(() => ouvindo(page)).toBe(true);
  await emitir(page, "Prefiro perguntas sobre autonomia e Python.");
  await page.getByRole("button", { name: "Parar ditado" }).click();
  await expect(page.getByRole("textbox", { name: "Mensagem para o Totti" })).toHaveValue("Prefiro perguntas sobre autonomia e Python.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect.poll(async () => (await falas(page)).length).toBe(2);
  const quantidade = (await falas(page)).length;
  await page.waitForTimeout(1800);
  expect((await falas(page)).length).toBe(quantidade);
});

test("candidato responde por voz e despedida não fecha a barra antes do áudio", async ({ page }) => {
  await preparar(page);
  const blip = { id: "voz-e2e", preview: "Pergunta de teste", priority: 1, createdAt: 0 };
  let abriu = false;
  const pedidos: string[] = [];
  await page.route("**/api/events", async (rota) => {
    const e = rota.request().postDataJSON();
    if (e.type === "blip_opened") abriu = true;
    await rota.fulfill({ json: !abriu && e.type === "session_started" ? { blip } : {} });
  });
  await page.route("**/api/blip/pending?**", (rota) => rota.fulfill({ json: {} }));
  await page.route("**/api/chat", async (rota) => {
    const historico = rota.request().postDataJSON().messages as { role: string; text: string }[];
    const resposta = historico.findLast((m) => m.role === "candidate")?.text;
    if (resposta) pedidos.push(resposta);
    await rota.fulfill({ json: { reply: resposta ? "Obrigado, pode continuar." : "Como você vai começar?", commands: [], end: !!resposta } });
  });
  await page.goto("/entrevista");
  await page.evaluate(() => { (window as unknown as JanelaTeste).vozTeste.autoTerminar = false; });
  // O balão flutua continuamente: usa a interação de teclado acessível.
  await page.getByRole("button", { name: "Abrir a pergunta do entrevistador: Pergunta de teste" }).press("Enter");
  const painel = page.getByRole("complementary", { name: "Conversa com o entrevistador" });
  await expect(painel).toBeVisible();
  await expect.poll(async () => (await falas(page)).length).toBe(1);
  await expect.poll(() => ouvindo(page)).toBe(false);
  await page.evaluate(() => (window as unknown as JanelaTeste).vozTeste.terminar());
  await expect.poll(() => ouvindo(page)).toBe(true);
  await emitir(page, "Sim, vou começar pelo caso mais simples.");
  await expect.poll(() => pedidos).toEqual(["Sim, vou começar pelo caso mais simples."]);
  await expect.poll(async () => (await falas(page)).length).toBe(2);
  await page.waitForTimeout(2800);
  await expect(painel).toBeVisible();
  await page.evaluate(() => (window as unknown as JanelaTeste).vozTeste.terminar());
  await expect(painel).toBeHidden({ timeout: 6000 });
});

test("quadro encaminha transcrição para a conversa da sessão", async ({ page }) => {
  await preparar(page);
  await page.goto("/entrevista/system-design");
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page.getByText("Requisitos", { exact: true })).toBeVisible({ timeout: 45000 });
  await expect.poll(() => ouvindo(page)).toBe(true);
  const pedido = page.waitForRequest((req) => req.method() === "POST" && req.url().includes("/perguntar"));
  await emitir(page, "O sistema precisa receber mil acessos por minuto.");
  const req = await pedido;
  expect(req.postDataJSON().texto).toBe("O sistema precisa receber mil acessos por minuto.");
  await page.getByRole("button", { name: "Abrir conversa", exact: true }).click();
  await expect(page.getByText("O sistema precisa receber mil acessos por minuto.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar conversa" }).click();
  await page.getByRole("button", { name: "Encerrar entrevista", exact: true }).click();
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Entrevista encerrada" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as JanelaTeste).vozTeste.midias
    .flatMap((stream) => stream.getTracks()).every((trilha) => trilha.readyState === "ended"))).toBe(true);
});
