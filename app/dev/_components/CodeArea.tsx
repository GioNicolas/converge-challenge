import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Highlight, InlineNote } from "../_lib/editorState";

export const LINE_HEIGHT = 20;

interface CodeAreaProps {
  value: string;
  disabled: boolean;
  highlights: Highlight[];
  notes: InlineNote[];
  scrollTo: { line: number; nonce: number } | null;
  onChange: (next: string) => void;
  onPaste: (text: string, startLine: number) => void;
}

/**
 * Textarea com gutter (números + notas) e camada de grifos atrás. Tudo com altura de linha fixa.
 */
export function CodeArea({
  value,
  disabled,
  highlights,
  notes,
  scrollTo,
  onChange,
  onPaste,
}: CodeAreaProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const lineCount = useMemo(() => value.split("\n").length, [value]);
  const lineNumbers = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1), [lineCount]);

  const highlighted = useMemo(() => {
    const set = new Set<number>();
    for (const h of highlights) {
      for (let line = h.startLine; line <= h.endLine; line++) set.add(line);
    }
    return set;
  }, [highlights]);

  const notesByLine = useMemo(() => {
    const map = new Map<number, string[]>();
    const add = (line: number, text: string) => {
      const list = map.get(line) ?? [];
      list.push(text);
      map.set(line, list);
    };
    for (const h of highlights) {
      if (h.note) add(h.startLine, h.note);
    }
    for (const n of notes) add(n.line, n.text);
    return map;
  }, [highlights, notes]);

  const syncScroll = useCallback((top: number) => {
    if (gutterRef.current) gutterRef.current.scrollTop = top;
    if (layerRef.current) layerRef.current.scrollTop = top;
  }, []);

  // Rola pra linha pedida pelo agente (startLine do highlight), deixando-a um terço abaixo do topo.
  useEffect(() => {
    const ta = taRef.current;
    if (scrollTo === null || ta === null) return;
    ta.scrollTop = Math.max(0, (scrollTo.line - 1) * LINE_HEIGHT - ta.clientHeight / 3);
    syncScroll(ta.scrollTop);
  }, [scrollTo, syncScroll]);

  return (
    <div className="flex h-[420px] overflow-hidden border border-neutral-700 bg-neutral-950">
      <div
        ref={gutterRef}
        className="h-full w-12 shrink-0 select-none overflow-hidden border-r border-neutral-700 bg-neutral-900"
      >
        <div style={{ height: lineCount * LINE_HEIGHT }}>
          {lineNumbers.map((n) => (
            <div
              key={n}
              className={`pr-2 text-right ${highlighted.has(n) ? "bg-yellow-400/25 text-yellow-100" : "text-neutral-500"}`}
              style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
            >
              {n}
            </div>
          ))}
        </div>
      </div>

      <div className="relative min-w-0 flex-1">
        <div ref={layerRef} className="absolute inset-0 overflow-hidden">
          <div className="relative" style={{ height: lineCount * LINE_HEIGHT }}>
            {highlights.map((h) => (
              <div
                key={h.id}
                className="absolute left-0 right-0 border-l-2 border-yellow-400 bg-yellow-400/15"
                style={{
                  top: (h.startLine - 1) * LINE_HEIGHT,
                  height: (h.endLine - h.startLine + 1) * LINE_HEIGHT,
                }}
              />
            ))}
            {/* Notas ficam alinhadas à direita da linha, por cima do código. */}
            {[...notesByLine].map(([line, texts]) => (
              <div
                key={`note-${line}`}
                className="absolute right-2 max-w-[50%] truncate rounded bg-amber-900/80 px-1 text-xs text-amber-200"
                style={{ top: (line - 1) * LINE_HEIGHT + 2, lineHeight: `${LINE_HEIGHT - 4}px` }}
                title={texts.join(" | ")}
              >
                {texts.join(" | ")}
              </div>
            ))}
          </div>
        </div>
        <textarea
          ref={taRef}
          value={value}
          disabled={disabled}
          spellCheck={false}
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => syncScroll(e.currentTarget.scrollTop)}
          onKeyDown={(e) => {
            if (e.key !== "Tab" || e.shiftKey) return;
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            onChange(value.slice(0, start) + "    " + value.slice(end));
            requestAnimationFrame(() => {
              ta.selectionStart = start + 4;
              ta.selectionEnd = start + 4;
            });
          }}
          onPaste={(e) => {
            const ta = e.currentTarget;
            const text = e.clipboardData.getData("text");
            const startLine = ta.value.slice(0, ta.selectionStart).split("\n").length;
            onPaste(text, startLine);
          }}
          className="relative block h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-2 py-0 text-neutral-100 caret-white outline-none disabled:opacity-60"
          style={{ lineHeight: `${LINE_HEIGHT}px`, tabSize: 4 }}
        />
      </div>
    </div>
  );
}
