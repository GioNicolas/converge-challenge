import type { EditorCommand } from "@/lib/contracts";

export interface Highlight {
  id: string;
  startLine: number;
  endLine: number;
  note?: string;
}

export interface InlineNote {
  id: string;
  line: number;
  text: string;
}

export interface EditorDecor {
  highlights: Highlight[];
  notes: InlineNote[];
  seq: number;
}

export const EMPTY_DECOR: EditorDecor = { highlights: [], notes: [], seq: 0 };

/** Aplica comandos do agente (ordem preservada). clear_highlights limpa grifos e notas. */
export function applyEditorCommands(prev: EditorDecor, commands: EditorCommand[]): EditorDecor {
  let state = prev;
  for (const cmd of commands) {
    switch (cmd.type) {
      case "highlight_range": {
        const seq = state.seq + 1;
        state = {
          ...state,
          seq,
          highlights: [
            ...state.highlights,
            { id: `h${seq}`, startLine: cmd.startLine, endLine: cmd.endLine, note: cmd.note },
          ],
        };
        break;
      }
      case "add_inline_note": {
        const seq = state.seq + 1;
        state = {
          ...state,
          seq,
          notes: [...state.notes, { id: `n${seq}`, line: cmd.line, text: cmd.text }],
        };
        break;
      }
      case "clear_highlights":
        state = { ...state, highlights: [], notes: [] };
        break;
    }
  }
  return state;
}
