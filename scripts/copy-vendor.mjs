// Copia Pyodide e Monaco de node_modules para public/, para rodar 100% offline.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const PYODIDE_FILES = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
rmSync("public/pyodide", { recursive: true, force: true });
mkdirSync("public/pyodide", { recursive: true });
for (const f of PYODIDE_FILES) cpSync(`node_modules/pyodide/${f}`, `public/pyodide/${f}`);

rmSync("public/monaco", { recursive: true, force: true });
cpSync("node_modules/monaco-editor/min/vs", "public/monaco/vs", { recursive: true });
console.log("vendor: pyodide + monaco copiados para public/");
