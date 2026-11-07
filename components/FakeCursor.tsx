"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { animate } from "motion/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { curvaSaida, curvaSuave, duracao, duracaoLenta, duracaoRapida } from "@/lib/design/motion";

/** Retângulo em px, relativo ao container do cursor. */
export type CursorRect = { left: number; top: number; width: number; height: number };

export type FakeCursorHandle = {
  /**
   * Move o mouse até o trecho, "arrasta" selecionando linha por linha e solta.
   * `onSelected` roda no momento do clique solto (é aí que o grifo real entra).
   * A promessa resolve quando o mouse some.
   */
  select: (rects: CursorRect[], onSelected?: () => void) => Promise<void>;
  /** Move o mouse até um ponto e dá um clique (usado nas notas). */
  click: (rect: CursorRect, onClicked?: () => void) => Promise<void>;
};

const reduzMovimento = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const esperar = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));
const quadro = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const suave = (t: number) => t * t * t * (t * (6 * t - 15) + 10); // smootherstep: acelera e freia como uma mão
const mistura = (a: number, b: number, t: number) => a + (b - a) * t;

/** Anima `fn(t)` de 0 a 1 em `seg` segundos, a cada quadro. */
function tween(seg: number, fn: (t: number) => void) {
  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - t0) / (seg * 1000));
      fn(t);
      if (t < 1) requestAnimationFrame(passo);
      else resolve();
    };
    requestAnimationFrame(passo);
  });
}

/**
 * Mouse falso do entrevistador (#6). Só desenha: o agente manda o comando
 * (highlight_range) e a IDE anima o ponteiro até o trecho antes de grifar.
 * O movimento é por quadro: trajetória em arco, ultrapassa o alvo e corrige,
 * e a seleção acompanha o ponteiro como num arrasto de verdade.
 */
const FakeCursor = forwardRef<FakeCursorHandle, { label?: string }>(function FakeCursor(
  { label = "Entrevistador" },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<HTMLDivElement>(null);
  const selRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pos = useRef<{ x: number; y: number } | null>(null);
  const lado = useRef(1); // alterna o lado do arco a cada movimento
  const [sel, setSel] = useState<CursorRect[]>([]);

  function colocar(x: number, y: number) {
    pos.current = { x, y };
    cursorRef.current!.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  /** Primeira aparição: sai do canto do orb (inferior direito). */
  async function aparecer() {
    if (!pos.current) {
      const r = rootRef.current!.getBoundingClientRect();
      colocar(r.width - 40, r.height - 40);
    }
    await animate(cursorRef.current!, { opacity: 1 }, { duration: duracaoRapida, ease: curvaSaida }).finished;
  }

  async function sumir() {
    await esperar(duracaoLenta * 2);
    await animate(cursorRef.current!, { opacity: 0 }, { duration: duracao, ease: curvaSuave }).finished;
  }

  /** Viagem em arco até (x, y): ultrapassa um pouco o alvo e volta. */
  async function irPara(x: number, y: number) {
    const a = pos.current!;
    const dx = x - a.x;
    const dy = y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return colocar(x, y);
    const ux = dx / d;
    const uy = dy / d;
    const sobra = Math.min(10, d * 0.04);
    const tx = x + ux * sobra;
    const ty = y + uy * sobra;
    // ponto de controle: meio do caminho empurrado para o lado
    lado.current *= -1;
    const curva = Math.min(90, d * 0.18) * lado.current;
    const cx = (a.x + tx) / 2 - uy * curva;
    const cy = (a.y + ty) / 2 + ux * curva;
    await tween(duracao + Math.min(d / 1400, 0.65), (t) => {
      const e = suave(t);
      const u = 1 - e;
      const tremor = Math.sin(t * 38) * 0.6 * Math.sin(t * Math.PI); // mão nunca fica perfeitamente firme
      colocar(u * u * a.x + 2 * u * e * cx + e * e * tx + tremor, u * u * a.y + 2 * u * e * cy + e * e * ty - tremor);
    });
    await tween(duracaoRapida, (t) => colocar(mistura(tx, x, suave(t)), mistura(ty, y, suave(t))));
  }

  const apertar = (down: boolean) =>
    animate(pressRef.current!, { scale: down ? 0.82 : 1 }, { duration: duracaoRapida, ease: curvaSaida }).finished;

  useImperativeHandle(ref, () => ({
    async select(rects, onSelected) {
      if (!rects.length || !rootRef.current || reduzMovimento()) return void onSelected?.();

      const meio = (r: CursorRect) => r.top + r.height / 2;
      setSel(rects);
      await quadro(); // espera os retângulos de seleção montarem com largura 0

      await aparecer();
      const ini = { x: rects[0].left, y: meio(rects[0]) };
      const ultimo = rects[rects.length - 1];
      const fim = { x: ultimo.left + ultimo.width, y: meio(ultimo) };

      await irPara(ini.x, ini.y);
      await esperar(duracaoRapida * 1.2); // a mão hesita antes de clicar
      await apertar(true);
      await esperar(duracaoRapida * 0.6);

      // Arrasto: o ponteiro vai do início ao fim e cada linha enche conforme ele passa.
      const largura = rects.reduce((n, r) => n + r.width, 0);
      const seg = duracao + largura / 650 + (rects.length - 1) * duracao * 0.5;
      await tween(seg, (t) => {
        const e = 0.65 * t + 0.35 * suave(t); // quase constante, com partida e freada leves
        const x = mistura(ini.x, fim.x, e);
        const y = mistura(ini.y, fim.y, e) + Math.sin(t * Math.PI) * 1.5; // tremor leve
        colocar(x, y);
        rects.forEach((r, i) => {
          const caixa = selRefs.current[i];
          if (!caixa) return;
          const topo = r.top;
          const base = r.top + r.height;
          const w = y >= base ? r.width : y < topo ? 0 : Math.min(r.width, Math.max(0, x - r.left));
          caixa.style.width = `${i === rects.length - 1 && t === 1 ? r.width : w}px`;
        });
      });
      await esperar(duracaoRapida);

      await apertar(false);
      onSelected?.();
      await esperar(duracao);
      await Promise.all(
        selRefs.current.filter(Boolean).map((el) => animate(el!, { opacity: 0 }, { duration: duracao, ease: curvaSuave }).finished),
      );
      setSel([]);
      await sumir();
    },

    async click(rect, onClicked) {
      if (!rootRef.current || reduzMovimento()) return void onClicked?.();
      await aparecer();
      await irPara(rect.left + rect.width, rect.top + rect.height / 2);
      await esperar(duracaoRapida);
      await apertar(true);
      await apertar(false);
      onClicked?.();
      await sumir();
    },
  }));

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {sel.map((r, i) => (
        <div
          key={i}
          ref={(el) => {
            selRefs.current[i] = el;
          }}
          className="absolute bg-marca-suave"
          style={{ left: r.left, top: r.top, width: 0, height: r.height }}
        />
      ))}

      <div ref={cursorRef} className="absolute left-0 top-0 opacity-0" style={{ willChange: "transform" }}>
        <div ref={pressRef} style={{ transformOrigin: "0 0" }}>
          <svg width="20" height="24" viewBox="0 0 20 24" className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)]">
            <path
              d="M1.5 1.5 L1.5 19 L6.2 14.8 L9.6 22 L12.8 20.6 L9.5 13.6 L15.8 13.4 Z"
              className="fill-texto-claro stroke-fundo"
              strokeWidth="1.2"
              strokeLinejoin="miter"
            />
          </svg>
          <span className="vidro-escuro text-mini absolute left-4 top-5 whitespace-nowrap px-1.5 py-0.5 shadow-cartao">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
});

export default FakeCursor;

/**
 * Mede, em px relativos ao container do cursor, um retângulo por linha do
 * trecho (do primeiro caractere visível ao fim da linha).
 */
export function measureLines(
  editor: MonacoEditor.IStandaloneCodeEditor,
  container: HTMLElement,
  startLine: number,
  endLine: number,
): CursorRect[] {
  const model = editor.getModel();
  const dom = editor.getDomNode();
  if (!model || !dom) return [];
  const base = dom.getBoundingClientRect();
  const root = container.getBoundingClientRect();
  const dx = base.left - root.left;
  const dy = base.top - root.top;
  const out: CursorRect[] = [];
  for (let l = startLine; l <= endLine; l++) {
    const first = Math.max(1, model.getLineFirstNonWhitespaceColumn(l));
    const last = model.getLineMaxColumn(l);
    const a = editor.getScrolledVisiblePosition({ lineNumber: l, column: first });
    const b = editor.getScrolledVisiblePosition({ lineNumber: l, column: last });
    if (!a || !b) continue;
    out.push({ left: dx + a.left, top: dy + a.top, width: Math.max(8, b.left - a.left), height: a.height });
  }
  return out;
}
