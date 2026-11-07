# Plano de issues — Converge Challenge, só as minhas (Pessoa A, IDE) — RASCUNHO LOCAL, nada publicado

Fontes (branch `origin/time/sofia-giorgio`):
- Plano de execução: `docs/contexto-pessoa-a-ide.md` (seção 6, "Ordem de construção")
- Design: `docs/design.md`

**Escopo:** só o que é meu na IDE (Pessoa A). A janela de chamada, a pílula e a mão do agente ficam com o Giorgio e não têm issue aqui. O quadro Excalidraw, o quadro de requisitos e a "mão do agente" no quadro **não** fazem parte do meu escopo e não têm issue. No lugar do quadro, o protagonista é o editor Monaco.

**Regra de design:** toda issue marcada 🎨 aplica o `docs/design.md` à construção da IDE: só tokens (nada de cor, raio, sombra ou duração solta), vidro nas camadas flutuantes, movimento com `transform`/`opacity`, respeitar `prefers-reduced-motion`. O PR é conferido contra o doc.

**Regra de ouro do plano:** a IDE não tem inteligência. Ela mostra, captura e obedece. Versão feia que funciona ponta a ponta vale mais que IDE linda sem agente.

Estado atual do repo: scaffold Next.js + `lib/` (contratos, runner Pyodide, executor de comandos, Two Sum, fixtures). `app/page.tsx` importa `components/IdeApp`, que não existe.

Marcos: **Integração 1** (texto ponta a ponta) até o almoço do dia 1 · **Integração 2** (voz) fim do dia 1 · relatório e polimento no dia 2.

---

## #1 🎨 Tokens de design (`globals.css`)
**Labels:** design, setup · **Depende de:** —
- Variáveis CSS em `:root` expostas no Tailwind v4 (`@theme inline`): paleta (§3), raios 18/10/pílula, 2 sombras (card e flutuante), curvas e durações (§6).
- Fonte do sistema com Inter de reserva; `tabular-nums` para números.
- Instalar `motion` e `lucide-react` (strokeWidth 1.75).
- **Pronto quando:** existem classes como `bg-superficie`, `text-texto-suave`, `rounded-padrao`, `shadow-flutuante`, `ease-suave` e nenhum componente usa valor solto.

## #2 🎨 Esqueleto da tela (`components/IdeApp`)
**Labels:** frontend · **Depende de:** #1
- Card branco com 12px de margem e raio 18px ocupando a tela, com o editor como protagonista; camadas flutuantes (problema, chamada, legenda) por cima (§8.1).
- Estado central: `sessionId`, `startedAt`, `timeline`, `code`; timer da sessão.
- **Pronto quando:** `npm run dev` abre sem erro com o layout do design.

## #3 🎨 Painel do problema
**Labels:** frontend · **Depende de:** #1, #2
- Card de vidro no canto superior esquerdo: título, enunciado, exemplos, restrições, chip de fase e tempo; recolhe para pílula (§8.1).
- Só a parte pública do problema (nada de testes escondidos).
- **Pronto quando:** Two Sum aparece completo e recolhe/expande com animação suave.

## #4 🎨 Monaco + botão Rodar + resultados (Pyodide)
**Labels:** frontend, runner · **Depende de:** #2
- `@monaco-editor/react` com Python e `glyphMargin`; código inicial do problema.
- `warmUp()` ao montar; `runCode` no clique; mostrar passou/falhou por caso, saída, erro, tempo e estados carregando/timeout.
- **Pronto quando:** solução correta passa 3/3; loop infinito dá timeout em 10 s e a próxima execução funciona.

## #5 Captura de eventos + linha do tempo + export JSON
**Labels:** frontend, contrato · **Depende de:** #4
- `onDidChangeModelContent`/`onDidChangeCursorPosition` → `edit` em lotes (~300 ms), `snapshot` com `lineCount`, `pause` após 8 s, `run`, `paste` grande, `speech`.
- Timeline em memória e botão para baixar `SessionExport` em JSON.
- Gravar uma **sessão real** em `fixtures/session.json` e **entregar à Pessoa B o quanto antes**.
- **Pronto quando:** a timeline exportada bate com o formato de `fixtures/session.json`.

## #6 🎨 Executor de comandos do agente (grifos)
**Labels:** frontend · **Depende de:** #4
- Ligar `createExecutor` ao editor; decorations (não `setSelection`), rolar até o trecho.
- Estilos `agent-highlight`, `agent-highlight-bar`, `agent-glyph`, `agent-inline-note` em azul `marca`/`marca-suave`.
- Botão de debug com comandos falsos.
- **Pronto quando:** `highlight_range`, `add_inline_note` e `clear_highlights` funcionam sem roubar o cursor.

## #7 Rotas `/api/*` mock + chat por texto (Integração 1)
**Labels:** backend, integração · **Depende de:** #5, #6
- `app/api/events|chat|report` devolvendo respostas fixas (`fixtures/report.json`), que a Pessoa B substitui.
- Chat por texto simples ligado a `sendChat`; eventos via `sendEvent`; executar `commands` devolvidos; falha de rede não quebra a IDE.
- **Pronto quando:** ponta a ponta por texto, com grifo vindo do endpoint, **até o almoço do dia 1**.

## #8 🎨 Orb do agente
**Labels:** frontend · **Depende de:** #1
- Esfera azul, usada como indicador de status da voz na IDE, com 5 estados: ocioso, ouvindo, pensando, falando, com dúvida (§8.3).
- **Pronto quando:** cada estado pode ser forçado por uma prop e anima só com `transform`/`opacity`.

## #9 Voz com ElevenLabs + client tools (Integração 2)
**Labels:** integração · **Depende de:** #6, #7, #8
- SDK ElevenLabs Agents no navegador; client tools `highlight_range`, `add_inline_note`, `clear_highlights`, `get_current_code`.
- Transcrições do candidato e do agente entram na timeline como `speech`.
- Plano B: chat por texto continua funcionando se a voz falhar.
- **Pronto quando:** o agente fala e grifa junto, **até o fim do dia 1**.

## #10 🎨 Legenda ao vivo + painel de conversa
**Labels:** frontend · **Depende de:** #7, #9
- Legenda centralizada embaixo em vidro escuro, até 2 linhas, parcial mais fraca (§8.5).
- Painel de conversa abre ao clicar no orb: lista simples, sem balões.
- **Pronto quando:** legenda acompanha a fala e o painel mostra o histórico.

## #11 🎨 Finalizar sessão + tela do relatório
**Labels:** frontend · **Depende de:** #5, #7
- "Finalizar" monta `SessionExport`, chama `requestReport` e leva ao relatório.
- Nota geral, nota por critério, evidência com timestamp ("aos 12:30 você…"), idealmente replay simples da timeline.
- **Pronto quando:** fluxo completo funciona com `fixtures/report.json`.

## #12 Polimento, testes e demo
**Labels:** qa, docs · **Depende de:** todas
- Testes do runner (sintaxe, função ausente, exceção, timeout, `compare: "sorted"`), `prefers-reduced-motion` em todas as animações.
- README, roteiro de demo (começar com força bruta de propósito), deploy na Vercel **e** plano B local.
- **Pronto quando:** demo ponta a ponta roda do zero seguindo o README.

---
## Pontos para decidir com você
1. **Onde fica o `design.md`:** só existe na branch `time/sofia-giorgio` (`docs/design.md`), não na `main`. Precisa entrar na sua branch de trabalho.
2. **Orb (#8):** deixei como indicador de status da voz, só o orb em si. Se ele vier dentro da janela de chamada do Giorgio, ajusto a issue para só refinar o visual.
3. `GUIA-DO-TIME.md` descreve outro projeto (agente de desligamento). Ignorei.
