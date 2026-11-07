import Link from "next/link";

// A marca no topo do menu: só o nome, em semibold, sem cor nem brilho.
export default function Marca() {
  return (
    <Link href="/vagas" className="px-2 py-1 text-[17px] font-semibold tracking-[-0.025em] text-texto">
      Converge
    </Link>
  );
}
