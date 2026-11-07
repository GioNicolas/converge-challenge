// Grafos de quadro escritos à mão, DELIBERADAMENTE FALHOS, um por área, para provar que o prompt do
// avaliador funciona com kits gerados de áreas diferentes. Formato igual ao que o leitor do quadro produz.
export type GrafoDeExemplo = { grafo: string; mudancas: string; fala: string };

export const GRAFOS_VAGAS: Record<string, GrafoDeExemplo> = {
  "backend-pleno": {
    grafo: `COMPONENTES
- [r1] App do cliente (retângulo)
- [r2] API de pagamentos (retângulo)
- [e1] Postgres (elipse)
- [r3] Gateway do banco parceiro (retângulo)
CONEXÕES
- [s1] App do cliente → API de pagamentos
- [s2] API de pagamentos → Postgres
- [s3] API de pagamentos → Gateway do banco parceiro
ANOTAÇÕES SOLTAS
- [t1] "se der erro, tenta de novo"`,
    mudancas: "+ adicionou [r3] Gateway do banco parceiro e [s3]\n+ adicionou [t1] anotação sobre tentar de novo",
    fala: "Cada pagamento chama o gateway direto e, se falhar, a API tenta de novo.",
  },
  "coordenador-obras": {
    grafo: `COMPONENTES
- [r1] Fundação (retângulo)
- [r2] Estrutura (retângulo)
- [r3] Alvenaria (retângulo)
- [r4] Instalações (retângulo)
- [r5] Acabamento (retângulo)
- [r6] Entrega (retângulo)
- [e1] Grua única (elipse)
CONEXÕES
- [s1] Fundação → Estrutura
- [s2] Estrutura → Alvenaria
- [s3] Alvenaria → Instalações
- [s4] Instalações → Acabamento
- [s5] Acabamento → Entrega
- [s6] Grua única — Estrutura
ANOTAÇÕES SOLTAS
- [t1] "empreiteiros entram todos juntos na alvenaria"`,
    mudancas: "+ adicionou [e1] Grua única e [s6]\n+ adicionou [t1] sobre empreiteiros",
    fala: "Fiz a sequência normal da obra, uma etapa depois da outra, e a grua atende a estrutura.",
  },
  "pm-senior": {
    grafo: `COMPONENTES
- [r1] Busca (retângulo)
- [r2] Página do prestador (retângulo)
- [r3] Pedir orçamento (retângulo)
- [r4] Pagamento (retângulo)
- [r5] Avaliação (retângulo)
- [t1] "meta: aumentar conversão"
CONEXÕES
- [s1] Busca → Página do prestador
- [s2] Página do prestador → Pedir orçamento
- [s3] Pedir orçamento → Pagamento
- [s4] Pagamento → Avaliação
ANOTAÇÕES SOLTAS
- [t2] "lançar tudo de uma vez em todas as cidades"`,
    mudancas: "+ adicionou [r5] Avaliação e [s4]\n+ adicionou [t2] sobre lançar tudo de uma vez",
    fala: "Eu melhoraria o funil inteiro de uma vez e lançaria em todas as cidades para ganhar tempo.",
  },
  "arquiteto-comercial": {
    grafo: `COMPONENTES
- [m1] Pavimento térreo (moldura)
- [r1] Entrada principal (retângulo) — dentro de [m1]
- [r2] Lojas (retângulo) — dentro de [m1]
- [r3] Praça de alimentação (retângulo) — dentro de [m1]
- [r4] Doca de carga e descarga (retângulo) — dentro de [m1]
- [r5] Circulação de clientes (retângulo) — dentro de [m1]
CONEXÕES
- [s1] Entrada principal → Circulação de clientes
- [s2] Circulação de clientes → Lojas
- [s3] Circulação de clientes → Praça de alimentação
- [s4] Doca de carga e descarga → Circulação de clientes
ANOTAÇÕES SOLTAS
- [t1] "caminhão entra pela mesma porta do cliente"`,
    mudancas: "+ adicionou [r4] Doca e [s4]\n+ adicionou [t1] sobre o caminhão",
    fala: "Coloquei a doca ligada à circulação para o abastecimento chegar rápido às lojas.",
  },
};

export const GRAFO_GENERICO: GrafoDeExemplo = {
  grafo: `COMPONENTES
- [r1] Início (retângulo)
- [r2] Etapa principal (retângulo)
- [r3] Entrega (retângulo)
CONEXÕES
- [s1] Início → Etapa principal
- [s2] Etapa principal → Entrega`,
  mudancas: "+ adicionou [r3] Entrega e [s2]",
  fala: "Fiz um fluxo simples do começo ao fim.",
};
