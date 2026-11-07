import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-16 font-sans">
      <h1 className="text-2xl font-semibold">Converge Challenge</h1>
      <p className="text-sm text-neutral-600">Protótipo da entrevista técnica.</p>
      <Link href="/pre-entrevista" className="rounded border border-neutral-300 bg-white px-4 py-3 text-neutral-900 hover:bg-neutral-100">
        Pré-entrevista: configurar a entrevista conversando com o Totti →
      </Link>
    </main>
  );
}
