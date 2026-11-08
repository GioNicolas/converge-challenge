import { expect, test, type Page } from "@playwright/test";

// Ponta a ponta da entrevista no quadro, no modo de demonstração (sem servidor).
// O fluxo inteiro roda 3 vezes seguidas na mesma página, recarregando entre as rodadas,
// e qualquer erro no console ou na página reprova a rodada.

const ROTA = "/entrevista/system-design?debug=1";
const RODADAS = 3;
const TEXTO_DO_CANDIDATO = "Servidor API";
const REQUISITO = "100 milhões de URLs novas por mês";

type ElementoDaCena = {
  id: string;
  type: string;
  text?: string;
  isDeleted?: boolean;
  customData?: { autor?: string; grupo?: string };
};
type JanelaComQuadro = { quadro?: { api: { getSceneElements(): readonly ElementoDaCena[] } } };

/** Elementos do agente na cena, lidos pela API do Excalidraw exposta em desenvolvimento. */
function elementosDoAgente(page: Page) {
  return page.evaluate(() => {
    const quadro = (window as unknown as JanelaComQuadro).quadro;
    if (!quadro) return [];
    return quadro.api
      .getSceneElements()
      .filter((e) => e.customData?.autor === "agente" && !e.isDeleted)
      .map((e) => ({ id: e.id, tipo: e.type, texto: e.text ?? "", grupo: e.customData?.grupo ?? "" }));
  });
}

async function textosDoAgente(page: Page) {
  return (await elementosDoAgente(page)).map((e) => e.texto);
}

async function doGrupo(page: Page, grupo: string) {
  return (await elementosDoAgente(page)).filter((e) => e.grupo === grupo);
}

/** Erros da página e do console; cada rodada confere e zera a lista. */
function vigiarErros(page: Page) {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(`console.error: ${m.text()}`);
  });
  return erros;
}

type EventoDeAnalise = { tipo: "pedido"; grafo: string } | { tipo: "resposta" };

/** Pedidos e respostas da análise (`[análise] pedido` / `[análise] resposta`), na ordem do console. */
function vigiarAnalise(page: Page) {
  const eventos: EventoDeAnalise[] = [];
  page.on("console", async (m) => {
    if (m.type() !== "log") return;
    const texto = m.text();
    if (texto.startsWith("[análise] resposta")) eventos.push({ tipo: "resposta" });
    if (!texto.startsWith("[análise] pedido")) return;
    // Entra na lista já (para manter a ordem) e recebe o grafo quando o objeto chegar.
    const evento = { tipo: "pedido" as const, grafo: "" };
    eventos.push(evento);
    const pedido = (await m.args()[1]?.jsonValue().catch(() => null)) as { grafo?: string } | null;
    evento.grafo = pedido?.grafo ?? "";
  });
  return eventos;
}

/** Já houve um pedido com este texto no grafo, e a resposta dele chegou? */
function analiseConcluida(eventos: EventoDeAnalise[], texto: string) {
  const i = eventos.findIndex((e) => e.tipo === "pedido" && e.grafo.includes(texto));
  if (i === -1) return "sem pedido";
  return eventos.slice(i + 1).some((e) => e.tipo === "resposta") ? "respondida" : "aguardando resposta";
}

test("entrevista no quadro roda 3 vezes seguidas sem erro", async ({ page }) => {
  test.setTimeout(RODADAS * 150_000);
  const erros = vigiarErros(page);
  const analise = vigiarAnalise(page);

  const janela = {
    encerrar: page.getByRole("button", { name: "Encerrar entrevista" }),
    fase: (nome: string) => page.getByText(nome, { exact: true }),
  };

  await page.goto(ROTA);

  for (let rodada = 1; rodada <= RODADAS; rodada++) {
    await test.step(`rodada ${rodada}: página limpa`, async () => {
      // O desenho fica salvo no navegador até encerrar: limpa para cada rodada começar do zero.
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      erros.length = 0;
      analise.length = 0;
    });

    await test.step(`rodada ${rodada}: início`, async () => {
      await expect(page.getByRole("heading", { name: "Pronto para começar?" })).toBeVisible();
      const comecar = page.getByRole("button", { name: "Começar" });
      await expect(comecar).toBeEnabled();
      await comecar.click();
      await expect(page.getByRole("heading", { name: "Pronto para começar?" })).toBeHidden();
      await expect(janela.encerrar).toBeVisible();
    });

    await test.step(`rodada ${rodada}: enunciado escrito pelo agente`, async () => {
      await expect.poll(() => textosDoAgente(page), { timeout: 15_000 }).toContain("Encurtador de URL");
      // A apresentação termina quando o enunciado acaba de ser escrito (e a voz termina ou falha).
      await expect(janela.fase("Requisitos")).toBeVisible({ timeout: 45_000 });
    });

    await test.step(`rodada ${rodada}: elementos do agente protegidos`, async () => {
      const antes = await elementosDoAgente(page);
      expect(antes.length).toBeGreaterThan(0);

      // Selecionar tudo e apagar.
      await page.mouse.click(900, 650);
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Delete");
      await expect.poll(() => textosDoAgente(page)).toContain("Encurtador de URL");

      // Menu → limpar a tela.
      await page.getByTestId("main-menu-trigger").click();
      await page.getByText("Limpar o canvas e redefinir a cor de fundo").click();
      await page.getByRole("button", { name: "Confirmar" }).click();
      await expect
        .poll(async () => (await elementosDoAgente(page)).map((e) => e.id).sort(), { timeout: 5_000 })
        .toEqual(antes.map((e) => e.id).sort());
    });

    await test.step(`rodada ${rodada}: desenho muda a fase e gera análise`, async () => {
      // Retângulo com a tecla "r" e arrastando no canvas.
      await page.keyboard.press("r");
      await page.mouse.move(650, 450);
      await page.mouse.down();
      await page.mouse.move(760, 510, { steps: 6 });
      await page.mouse.move(850, 560, { steps: 6 });
      await page.mouse.up();

      // Duplo clique dentro do retângulo escreve o texto dele.
      await page.mouse.dblclick(750, 505);
      const editor = page.locator("textarea.excalidraw-wysiwyg");
      await expect(editor).toBeVisible();
      await page.keyboard.type(TEXTO_DO_CANDIDATO, { delay: 30 });
      await page.keyboard.press("Escape");
      await expect(editor).toBeHidden();

      await expect(janela.fase("Visão geral")).toBeVisible();
      // Sem mexer por ~4 s, a análise parte com o grafo do desenho.
      await expect
        .poll(() => analiseConcluida(analise, TEXTO_DO_CANDIDATO), { timeout: 12_000 })
        .not.toBe("sem pedido");
      // Espera a resposta: um "ok" que chega com a bolha aberta cancela a dúvida pendente.
      await expect.poll(() => analiseConcluida(analise, TEXTO_DO_CANDIDATO)).toBe("respondida");
    });

    await test.step(`rodada ${rodada}: plin`, async () => {
      // Sem bolha nem clique: a pergunta pendente é dita sozinha quando a vez chega.
      await page.getByRole("button", { name: "Demo: fazer pergunta" }).click();

      const terminei = page.getByRole("button", { name: "Terminei de responder" });
      await expect(terminei).toBeVisible();
      await expect.poll(async () => (await doGrupo(page, "pergunta:1")).length).toBeGreaterThan(0);
      await terminei.click();
      await expect.poll(async () => (await doGrupo(page, "pergunta:1")).length, { timeout: 3_000 }).toBe(0);
    });

    await test.step(`rodada ${rodada}: requisito escrito no quadro`, async () => {
      await page.getByRole("button", { name: "Demonstração: combinar o próximo requisito" }).click();
      await expect.poll(() => textosDoAgente(page), { timeout: 20_000 }).toContain(REQUISITO);
    });

    await test.step(`rodada ${rodada}: encerrar`, async () => {
      await janela.encerrar.click();
      const confirmar = page.getByRole("alertdialog", { name: "Encerrar a entrevista?" });
      await expect(confirmar).toBeVisible();
      await confirmar.getByRole("button", { name: "Continuar entrevista" }).click();
      await expect(confirmar).toBeHidden();

      await janela.encerrar.click();
      await expect(confirmar).toBeVisible();
      await confirmar.getByRole("button", { name: "Encerrar", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Entrevista encerrada" })).toBeVisible();
    });

    await test.step(`rodada ${rodada}: nenhum erro no console`, async () => {
      expect(erros, `erros na rodada ${rodada}`).toEqual([]);
    });
  }
});
