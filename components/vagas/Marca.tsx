import Link from "next/link";

// A marca: a pérola respirando e o nome em Bricolage 700. Sem cor, sem brilho além do movimento.
export default function Marca({ href = "/vagas" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-2 py-1 text-texto">
      <span aria-hidden className="perola size-[22px] rounded-full anim-respirar" />
      <span className="font-display text-[20px] leading-none font-bold tracking-[-0.02em]">totti</span>
    </Link>
  );
}
