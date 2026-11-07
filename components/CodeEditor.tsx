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
        monaco.editor.defineTheme("converge-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": superficie,
            "editorGutter.background": superficie,
            "editor.lineHighlightBackground": superficie,
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
