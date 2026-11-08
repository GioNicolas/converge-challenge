"use client";

// Nova vaga: o estúdio com o Totti. Tudo acontece aqui, sem trocar de página:
//   descrever a vaga → o Totti lê → conversa e plano ao vivo → revisão → vaga publicada → convites enviados.
// Ao publicar, os convites saem sozinhos para todos os inscritos (EnvioConvites), sem o recrutador escolher ninguém.
// Enquanto o plano não é confirmado, a vaga é um rascunho (não aparece no menu).
// /vagas/nova?rascunho=<id> retoma um rascunho de onde parou.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { InterviewConfig } from "@/lib/contracts";
import type { Vaga } from "@/lib/pre-entrevista/classificador";
import PreEntrevistaTotti from "@/components/pre-entrevista/PreEntrevistaTotti";
import EnvioConvites from "@/components/vagas/EnvioConvites";
import { atualizarRascunho, criarRascunho, lerRascunho, publicarVaga, type RascunhoVaga, type VagaEmpresa } from "@/lib/vagas/workspace";

function Estudio() {
  const router = useRouter();
  const param = useSearchParams().get("rascunho");
  // O rascunho só pode ser lido no navegador: até lá, nada na tela.
  const [rascunho, setRascunho] = useState<RascunhoVaga | null | undefined>(undefined);
  useEffect(() => setRascunho(param ? (lerRascunho(param) ?? null) : null), [param]);

  const idRascunho = useRef<string | null>(null);
  useEffect(() => {
    idRascunho.current = rascunho?.id ?? null;
  }, [rascunho]);
  const [vaga, setVaga] = useState<VagaEmpresa | null>(null);

  const onComecar = useCallback((v: Vaga) => {
    idRascunho.current = criarRascunho(v);
  }, []);
  const onSessao = useCallback((sessaoId: string) => {
    if (idRascunho.current) atualizarRascunho(idRascunho.current, { sessaoId });
  }, []);
  const onProgresso = useCallback((feitos: number, total: number) => {
    if (idRascunho.current) atualizarRascunho(idRascunho.current, { combinados: { feitos, total } });
  }, []);
  const onPronta = useCallback((config: InterviewConfig) => {
    setVaga(publicarVaga(idRascunho.current, config));
    idRascunho.current = null;
  }, []);
  const onSair = useCallback(() => router.push("/vagas"), [router]);

  if (rascunho === undefined) return null;

  return (
    <PreEntrevistaTotti
      key={rascunho?.id ?? "nova"}
      vagaInicial={rascunho ? { roleTitle: rascunho.cargo, jobDescription: rascunho.descricao, context: rascunho.contexto } : undefined}
      sessaoInicial={rascunho?.sessaoId}
      onComecar={onComecar}
      onSessao={onSessao}
      onProgresso={onProgresso}
      onPronta={onPronta}
      onSair={onSair}
      posPublicacao={() =>
        vaga && (
          <EnvioConvites
            key={vaga.id}
            vaga={vaga}
            onAbrir={() => router.push(`/vagas/vaga?id=${encodeURIComponent(vaga.id)}&etapa=entrevistas`)}
          />
        )
      }
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <Estudio />
    </Suspense>
  );
}
