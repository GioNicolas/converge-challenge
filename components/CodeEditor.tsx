"use client";

import Editor, { loader } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";

// Monaco servido de /public (copiado por scripts/copy-vendor.mjs): funciona sem internet.
loader.config({ paths: { vs: "/monaco/vs" } });

type Monaco = typeof import("monaco-editor");

type Props = {
  value: string;
  language: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  /** Colagem: texto colado e a linha onde começou. */
  onPaste: (text: string, startLine: number) => void;
  onReady: (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => void;
};

/** Monaco; a linguagem vem por prop (python, cpp ou c). `glyphMargin` fica ligado para os ícones do agente. */
export default function CodeEditor({ value, language, readOnly, onChange, onPaste, onReady }: Props) {
  return (
    <Editor
      height="100%"
      language={language}
      theme="converge-dark"
      beforeMount={(monaco) => {
        const css = getComputedStyle(document.documentElement);
        const superficie = css.getPropertyValue("--superficie").trim();
        // Contraste: código claro, comentários verdes legíveis, números das linhas visíveis.
        monaco.editor.defineTheme("converge-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "", foreground: "F5F5F7" },
            { token: "comment", foreground: "8FD694", fontStyle: "italic" },
            { token: "keyword", foreground: "5EB0FF" },
            { token: "string", foreground: "FFB27A" },
            { token: "number", foreground: "C4E88A" },
            { token: "type", foreground: "7DE0E6" },
            { token: "delimiter", foreground: "C7C7CC" },
          ],
          colors: {
            "editor.background": superficie,
            "editor.foreground": "#F5F5F7",
            "editorGutter.background": superficie,
            "editor.lineHighlightBackground": superficie,
            "editorLineNumber.foreground": "#9A9AA0",
            "editorLineNumber.activeForeground": "#F5F5F7",
          },
        });
      }}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor, monaco) => {
        editor.onDidPaste((e) => {
          const text = editor.getModel()?.getValueInRange(e.range) ?? "";
          onPaste(text, e.range.startLineNumber);
        });
        onReady(editor, monaco as unknown as Monaco);
      }}
      loading={<span className="label-pequena p-6">Carregando editor…</span>}
      options={{
        readOnly,
        glyphMargin: true,
        fontSize: 14,
        lineHeight: 24,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 24, bottom: 24 },
        renderLineHighlight: "none",
        overviewRulerLanes: 0,
        automaticLayout: true,
        tabSize: 4,
        wordWrap: "on",
        scrollbar: { horizontal: "hidden", useShadows: false },
      }}
    />
  );
}
