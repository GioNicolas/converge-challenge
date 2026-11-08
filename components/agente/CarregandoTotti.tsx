"use client";

// Carregando do Totti: o mesmo anel imperfeito da chamada, com o arco do "pensando" dando a volta.
// Substitui o spinner redondo (Loader2/LoaderCircle + animate-spin) em qualquer tela, para tudo que
// "pensa" ou "carrega" ter a cara do Totti.
//
//   <CarregandoTotti />                         → md (32px), cor do texto em volta, anuncia "Carregando"
//   <CarregandoTotti tamanho="xs" rotulo={false} /> → dentro de um botão que já tem texto
//   <CarregandoTotti tamanho="lg" rotulo="Lendo a vaga" />
//
// A cor vem do `color` do CSS (currentColor): use as classes de texto de sempre (text-texto, text-white…).
// Tamanhos: xs 16 · sm 24 · md 32 · lg 72 · xl 124 (ver TAMANHOS_TOTTI em lib/presenca/anel.ts).
import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useLacoDeEnergia } from "@/lib/presenca/energia";
import { emPixels, ondulacao, tracarAnel, type TamanhoTotti } from "@/lib/presenca/anel";

/** Espaço de desenho; escalado para o tamanho pedido. */
const LADO = 48;
const CENTRO = LADO / 2;
const RAIO = 17;
/** Quanto o anel sai do círculo, em fração do raio (a mesma ordem de grandeza da chamada no "pensando"). */
const TORTO = 0.075;
/** Arco que dá a volta: velocidade (rad/s) e comprimento (rad), iguais aos do "pensando" da chamada. */
const GIRO = 3;
const ARCO = 1.1;

export default function CarregandoTotti({
  tamanho: tamanhoPedido = "md",
  rotulo = "Carregando",
  brilho = false,
  className,
}: {
  /** Nome de TAMANHOS_TOTTI ("xs" a "xl") ou px. */
  tamanho?: TamanhoTotti | number;
  /** Texto para leitor de tela. `false` quando o lugar já diz o que está acontecendo (ex.: botão "Enviando…"). */
  rotulo?: string | false;
  /** Brilho suave em volta, na mesma cor. Fica bom em fundo escuro e nos tamanhos grandes. */
  brilho?: boolean;
  className?: string;
}) {
  const tamanho = emPixels(tamanhoPedido);
  const reduzido = useReducedMotion() ?? false;
  const tela = useRef<HTMLCanvasElement>(null);
  const tempo = useRef({ fase: 0, giro: 0 });

  // Espessura na tela: fina no pequeno, mais presente no grande (1,7px no xs até 3,5px no xl).
  const espessura = Math.min(3.5, 1.2 + tamanho * 0.03);

  useLacoDeEnergia(
    "pensando",
    0,
    (energia, _t, dt) => {
      const canvas = tela.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const k = tamanho / LADO;
      const px = Math.round(tamanho * dpr);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, LADO, LADO);

      // Com movimento reduzido, a forma para de ondular, mas o arco continua andando (devagar):
      // sem isso, não daria para saber que algo está carregando.
      const tm = tempo.current;
      if (!reduzido) tm.fase += dt * 0.7;
      tm.giro += dt * (reduzido ? 1 : GIRO);

      const raio = (a: number) => RAIO * (1 + ondulacao(a, tm.fase) * TORTO * (0.85 + energia));
      const cor = getComputedStyle(canvas).color || "rgb(0,0,0)";
      ctx.strokeStyle = cor;
      ctx.lineCap = "round";
      if (brilho) {
        ctx.shadowColor = cor;
        ctx.shadowBlur = 6;
      }

      // Trilho: o anel inteiro, bem apagado.
      tracarAnel(ctx, CENTRO, raio);
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = espessura / k;
      ctx.stroke();

      // O arco que dá a volta, por cima do mesmo caminho.
      tracarAnel(ctx, CENTRO, raio, tm.giro, tm.giro + ARCO);
      ctx.globalAlpha = 1;
      ctx.lineWidth = (espessura * 1.25) / k;
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
    reduzido,
  );

  const canvas = (
    <canvas ref={tela} aria-hidden className="block" style={{ width: tamanho, height: tamanho }} />
  );
  return (
    <span
      role={rotulo ? "status" : undefined}
      aria-label={rotulo || undefined}
      aria-hidden={rotulo ? undefined : true}
      className={`inline-flex shrink-0 align-middle ${className ?? ""}`}
      style={{ width: tamanho, height: tamanho }}
    >
      {canvas}
    </span>
  );
}
