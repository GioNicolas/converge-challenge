// Relatório da entrevista (visão da recrutadora). Lido direto do armazenamento, no servidor.
// O scorecard não é do candidato: fora do ambiente de desenvolvimento, só abre com ?chave=AVALIACOES_API_SECRET
// ou para quem passou pela senha do painel (PAINEL_SENHA; o middleware põe o cabeçalho, nunca o navegador).
import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import GerandoRelatorio from "@/components/relatorio/GerandoRelatorio";
import Relatorio from "@/components/relatorio/Relatorio";
import { resolverAvaliacao } from "@/lib/agente/kits";
import { montarRelatorio } from "@/lib/agente/relatorio";
import { RELATORIO_EXEMPLO } from "@/lib/agente/relatorio-exemplo";
import { contexto } from "@/lib/agente/rotas/contexto";
import { devHabilitado } from "@/lib/agente/rotas/scorecard";
import { CABECALHO_AUTENTICADO } from "@/lib/painel/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatório da entrevista", robots: { index: false } };

function podeVer(chave: string | undefined): boolean {
  if (devHabilitado()) return true;
  // Painel aberto por design (sem senha nem chave configuradas, como na demo): o relatório abre direto.
  if (!process.env.PAINEL_SENHA && !process.env.AGENTE_RELATORIO_CHAVE) return true;
  const segredo = process.env.AVALIACOES_API_SECRET;
  if (!segredo || !chave) return false;
  const a = Buffer.from(segredo);
  const b = Buffer.from(chave);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ chave?: string }> };

// O relatório usa o tema claro (o resto do app é escuro); ver app/globals.css.
export default function Page(props: Props) {
  return (
    <div className="tema-quadro-pagina contents">
      <Conteudo {...props} />
    </div>
  );
}

async function Conteudo({ params, searchParams }: Props) {
  const [{ id }, { chave }, cabecalhos] = await Promise.all([params, searchParams, headers()]);
  const pelaSenhaDoPainel = cabecalhos.get(CABECALHO_AUTENTICADO) === "1";
  if (!(pelaSenhaDoPainel || podeVer(chave)) || id.length > 80) notFound();
  if (id === "exemplo" && devHabilitado()) return <Relatorio r={RELATORIO_EXEMPLO} />;

  const { repositorio } = contexto();
  const sessao = await repositorio.obter(id);
  if (!sessao) return <SessaoNaoEncontrada />;
  const alvo = await resolverAvaliacao(sessao.avaliacaoId);
  if (!alvo) return <SessaoNaoEncontrada />;

  const scorecard = await repositorio.obterScorecard(id);
  if (!scorecard) return <GerandoRelatorio sessaoId={id} area={alvo.kit.area} problema={alvo.problema.titulo} />;

  const [eventos, imagens] = await Promise.all([repositorio.listarEventos(id), repositorio.listarImagens(id)]);
  return (
    <Relatorio r={montarRelatorio({ sessao, scorecard, kit: alvo.kit, problema: alvo.problema, eventos, imagens })} />
  );
}

function SessaoNaoEncontrada() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-fundo px-6">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-padrao bg-superficie p-8 shadow-padrao">
        <h1 className="text-2xl font-semibold tracking-tight">Entrevista não encontrada</h1>
        <p className="leading-relaxed text-texto-suave">
          O link pode estar errado, ou o servidor foi reiniciado e as sessões em memória se perderam.
        </p>
      </div>
    </main>
  );
}
