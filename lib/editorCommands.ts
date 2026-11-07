import type { editor as MonacoEditor } from "monaco-editor";
import type { EditorCommand } from "@/lib/contracts";

type Monaco = typeof import("monaco-editor");

export type CommandExecutor = (cmd: EditorCommand) => void;

/**
 * Executa comandos do agente. Usa decorations (não setSelection) para não
 * roubar o cursor do candidato. As decorations acompanham edições sozinhas.
 */
export function createExecutor(
  editor: MonacoEditor.IStandaloneCodeEditor,
  monaco: Monaco,
): CommandExecutor {
  const collection = editor.createDecorationsCollection();

  return (cmd) => {
    const lineCount = editor.getModel()?.getLineCount() ?? 1;
    const clamp = (n: number) => Math.min(Math.max(1, Math.round(n)), lineCount);

    switch (cmd.type) {
      case "highlight_range": {
        const start = clamp(Math.min(cmd.startLine, cmd.endLine));
        const end = clamp(Math.max(cmd.startLine, cmd.endLine));
        collection.append([
          {
            range: new monaco.Range(start, 1, end, 1),
            options: {
              isWholeLine: true,
              className: "agent-highlight",
              linesDecorationsClassName: "agent-highlight-bar",
              hoverMessage: cmd.note ? { value: cmd.note } : undefined,
              glyphMarginClassName: cmd.note ? "agent-glyph" : undefined,
            },
          },
        ]);
        editor.revealLinesInCenterIfOutsideViewport(start, end);
        break;
      }
      case "add_inline_note": {
        const line = clamp(cmd.line);
        const col = editor.getModel()?.getLineMaxColumn(line) ?? 1;
        collection.append([
          {
            range: new monaco.Range(line, col, line, col),
            options: {
              showIfCollapsed: true, // sem isso o Monaco esconde decorações de intervalo vazio
              glyphMarginClassName: "agent-glyph",
              hoverMessage: { value: cmd.text },
              after: { content: `  ◂ ${cmd.text}`, inlineClassName: "agent-inline-note" },
            },
          },
        ]);
        editor.revealLineInCenterIfOutsideViewport(line);
        break;
      }
      case "clear_highlights":
        collection.clear();
        break;
    }
  };
}
