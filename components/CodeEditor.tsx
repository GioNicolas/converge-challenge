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
        // Duas tintas, zero cor: o código é pérola em pesos diferentes; a sintaxe se diz por tom, não por matiz.
        monaco.editor.defineTheme("converge-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "", foreground: "C9C2B6" },
            { token: "comment", foreground: "F5F0E866", fontStyle: "italic" },
            { token: "keyword", foreground: "F5F0E8" },
            { token: "string", foreground: "D9D1C4" },
            { token: "number", foreground: "E9E2D6" },
            { token: "type", foreground: "EDE8E0" },
            { token: "delimiter", foreground: "F5F0E88C" },
          ],
          colors: {
            "editor.background": superficie,
            "editor.foreground": "#C9C2B6",
            "editorGutter.background": superficie,
            "editor.lineHighlightBackground": superficie,
            "editorLineNumber.foreground": "#F5F0E84D",
            "editorLineNumber.activeForeground": "#F5F0E8",
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
