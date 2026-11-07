# Contexto: Pessoa A — a IDE

> Documento para colar em outro chat/agente. Ele explica o projeto, o papel da Pessoa A, como construir e o que ainda precisa ser decidido.

## 1. O projeto em uma frase

Um **entrevistador técnico com IA**: o candidato resolve um problema estilo LeetCode numa IDE no navegador, e um agente acompanha o que ele escreve em tempo real, faz perguntas por voz ("por que você foi por esse caminho?", "dá pra otimizar?"), **grifa trechos do código enquanto fala** e, no final, dá uma nota sobre a qualidade do raciocínio — não só se ele acertou.

Contexto: hackathon Converge Challenge (2 dias, time de 2 pessoas). O desafio da Tako é sobre *Digital Workers para RH* — esse projeto é um "recrutador técnico digital".

## 2. A divisão do time

| Pessoa A — **a IDE** (este documento) | Pessoa B — **o agente** |
|---|---|
| Editor de código no navegador | Entende o código que a IDE manda |
| Mostra o problema e roda os testes | Decide o que perguntar e quando, sem entregar a resposta |
| Captura o que o candidato escreve e entrega pro agente | Pede pra IDE grifar o trecho certo |
| Executa os comandos de grifo que o agente manda | Gera a nota final e o relatório |
| Liga a voz no navegador (microfone/alto-falante) | Configura o agente de voz (prompt, modelo) |
| Tela do relatório final (só desenha o JSON) | Escreve a parte "secreta" dos problemas: solução boa, erros comuns, dicas |

**Regra de ouro:** a IDE não tem inteligência nenhuma. Ela só **mostra**, **captura** e **obedece**. Toda decisão fica no agente.

## 3. Stack decidida

- **Next.js** (App Router) + TypeScript
- **Monaco Editor** (o editor do VS Code) via `@monaco-editor/react`
- **Execução de código:** Pyodide (Python rodando no próprio navegador) para começar — zero servidor. Judge0 só se precisar de outras linguagens.
- **Voz:** SDK do **ElevenLabs Agents** no navegador. Os *client tools* do ElevenLabs (ex.: `highlight_range`) rodam no front — por isso a integração é da Pessoa A.
- **LLMs:** não é problema da Pessoa A. O agente usa Featherless (GLM-5.2 / Gemma) e isso fica todo com a Pessoa B.

## 4. O que construir

### 4.1 Tela principal
- **Esquerda:** enunciado do problema + exemplos.
- **Centro:** Monaco com código inicial (assinatura da função).
- **Abaixo do editor:** botão **Rodar** + resultado dos testes (passou/falhou por caso, saída, erro, tempo).
- **Direita (ou rodapé):** status da voz (ouvindo/falando), legenda do que o agente falou, e um **chat por texto** como plano B se a voz falhar.
- Timer da sessão e botão **Finalizar** (dispara a avaliação e leva para o relatório).

### 4.2 Captura do que o candidato escreve
Usar `editor.onDidChangeModelContent` e `onDidChangeCursorPosition` do Monaco e transformar tudo em **eventos de sessão** (ver contrato na seção 5):

- **Edições:** agrupar em lotes (~300 ms), não mandar tecla por tecla.
- **Snapshot:** código completo, com número de linhas — é isso que o agente lê de fato.
- **Pausa:** sem digitar por X segundos (sugestão: 8 s) → evento `pause`. A IDE detecta, o agente decide se fala.
- **Execução:** cada clique em Rodar gera `run` com o resultado.
- **Colagem:** detectar paste grande (sinal importante pra avaliação).
- **Fala:** transcrições do candidato e do agente também entram na linha do tempo.

Tudo vai para uma **linha do tempo** (array de eventos com timestamp). Guardar em memória e salvar em JSON ao final — essa linha do tempo é o que o avaliador usa para dar a nota.

### 4.3 Grifar código quando o agente pedir
A IDE expõe comandos que o agente chama:

- `highlight_range(startLine, endLine, nota?)` → usar **decorations** do Monaco (fundo colorido nas linhas + barra lateral), **não** `setSelection`. Selecionar de verdade roubaria o cursor do candidato enquanto ele digita.
- `add_inline_note(line, texto)` → comentário flutuante/glyph na linha.
- `clear_highlights()`.
- Rolar o editor até o trecho grifado (`revealLinesInCenter`).

O grifo deve acender **junto com a fala** ("essa parte aqui…"). Na prática: o agente chama o tool no início da frase.

### 4.4 Problemas
Cada problema é um arquivo/objeto com:
- **Parte pública (IDE mostra):** título, enunciado, exemplos, código inicial, testes visíveis.
- **Parte privada (só o agente/servidor):** testes escondidos, soluções, erros comuns, escada de dicas — escrita pela Pessoa B. **Nunca mandar isso pro navegador.**

Para a demo bastam **1–2 problemas** (ex.: Two Sum — tem força bruta O(n²) e solução O(n) com hashmap, ótimo pra mostrar o agente provocando otimização).

### 4.5 Tela do relatório
Recebe o JSON do `Report` e desenha: nota geral, nota por critério, evidência de cada nota com timestamp ("aos 12:30 você…"), e idealmente um replay simples da linha do tempo.

## 5. Contrato com a Pessoa B (combinar juntos ANTES de separar)

Ficar num único arquivo compartilhado (ex.: `lib/contracts.ts`). Mudou? Avisa o outro.

| Tipo | Direção | Campos principais |
|---|---|---|
| `SessionEvent` | IDE → agente | `t` (timestamp), `type` (`edit` \| `snapshot` \| `pause` \| `run` \| `paste` \| `speech`), `payload` |
| `RunResult` | IDE → agente | casos passados/falhados, saída, erro, tempo |
| `EditorCommand` | agente → IDE | `highlight_range` \| `add_inline_note` \| `clear_highlights` + parâmetros |
| `Report` | agente → IDE | nota geral, critérios `[{nome, nota 1–4, evidência, t}]`, resumo |

Junto com os tipos, criar **2 fixtures**:
- `fixtures/session.json` — uma sessão gravada de verdade (a Pessoa A resolve um problema e exporta).
- `fixtures/report.json` — um relatório de exemplo.

Com isso a Pessoa A constrói a tela de relatório e o grifo sem esperar a IA, e a Pessoa B testa o agente sem esperar a IDE.

## 6. Ordem de construção

1. Monaco na tela + problema fixo + botão Rodar com Pyodide.
2. Captura de eventos + linha do tempo + exportar JSON → **entregar a primeira sessão gravada pra Pessoa B o quanto antes**.
3. Executor de `EditorCommand` (testar com comandos falsos num botão de debug).
4. Chat por texto ligado ao agente da Pessoa B → **Integração 1: ponta a ponta por texto, até o almoço do dia 1**.
5. Voz com ElevenLabs + client tools chamando o grifo → **Integração 2: fim do dia 1**.
6. Tela de relatório + polimento visual (dia 2).

**Prioridade:** uma versão feia que funciona ponta a ponta vale mais que uma IDE linda sem agente. Voz é a última camada; se falhar, a demo por texto com grifo já mostra o valor.

## 7. Fora do escopo
Login, banco de dados, múltiplos usuários, várias linguagens, IDE completa (abas, árvore de arquivos, terminal), computer use.

## 8. Dúvidas para fechar o plano

**Produto / demo**
1. Só Python, ou precisamos de outra linguagem na demo?
2. Quais 1–2 problemas vamos usar? Quem escolhe?
3. A sessão tem tempo limite (ex.: 30 min)? O timer aparece pro candidato?
4. Na demo, quem faz o papel de candidato — e vamos ensaiar um roteiro (ex.: começar com força bruta de propósito pro agente provocar)?

**Comunicação IDE ↔ agente**
5. Como os eventos chegam no agente: WebSocket ou chamadas HTTP simples (`POST /api/events`)? *(Sugestão: HTTP pra começar, é mais simples.)*
6. Mandamos sempre o snapshot completo do código ou só diffs? *(Sugestão: snapshot completo com números de linha nos gatilhos — o código é pequeno.)*
7. Quem detecta "pausa" e "terminou um bloco": a IDE ou o agente? *(Sugestão: a IDE detecta pausa; o agente decide se fala.)*
8. Como o agente de voz (ElevenLabs) recebe o código atualizado? Via client tool `get_current_code` que a IDE responde, ou contexto injetado a cada turno?

**Grifo**
9. Grifo por linha inteira basta, ou precisa de coluna (trecho dentro da linha)?
10. Quando o grifo some: quando o candidato edita aquelas linhas, depois de X segundos, ou só no `clear`?
11. Se o candidato apagar/mexer nas linhas enquanto o agente fala, o grifo acompanha (decorations do Monaco acompanham sozinhas) — ok?

**Voz**
12. Microfone sempre aberto ou apertar pra falar? *(Sempre aberto é mais natural, mas capta ruído no evento.)*
13. Mostramos legenda do que o agente fala?
14. O chat por texto fica sempre visível ou só aparece se a voz falhar?

**Execução e avaliação**
15. Testes escondidos rodam onde? Se tudo roda no navegador (Pyodide), eles vazam no front. Rodar os escondidos só no servidor ao finalizar?
16. Detectar colagem (paste) e mostrar isso no relatório?
17. O relatório tem replay da sessão ou só as notas com evidências?

**Infra**
18. Deploy na Vercel ou roda local no notebook na hora da demo? *(Ter os dois: local como plano B se a internet do evento cair.)*
19. Onde guardar as sessões gravadas: arquivo JSON local basta?
