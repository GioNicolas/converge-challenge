import { CheckCircle2 } from "lucide-react";

/** Fim da entrevista para o candidato. O relatório vai só para a recrutadora (/report). */
export default function Obrigado() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <section className="vidro w-full max-w-md space-y-3 rounded-padrao p-8 text-center shadow-flutuante">
        <CheckCircle2 size={40} strokeWidth={1.75} className="mx-auto text-sucesso" />
        <h1 className="titulo text-2xl">Entrevista concluída</h1>
        <p className="text-texto-suave">
          Obrigado pelo seu tempo. Suas respostas foram enviadas para a equipe de recrutamento, que vai entrar em
          contato com os próximos passos.
        </p>
      </section>
    </main>
  );
}
