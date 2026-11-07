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
  "staff-engineer": {
    grafo: `COMPONENTES
- [r1] Checkout (retângulo)
- [r2] Catálogo (retângulo)
- [r3] Pedidos (retângulo)
- [r4] Pagamentos (retângulo)
- [e1] Banco único compartilhado (elipse)
CONEXÕES
- [s1] Checkout → Pedidos
- [s2] Pedidos → Pagamentos
- [s3] Checkout → Banco único compartilhado
- [s4] Catálogo → Banco único compartilhado
- [s5] Pedidos → Banco único compartilhado
- [s6] Pagamentos → Banco único compartilhado
ANOTAÇÕES SOLTAS
- [t1] "migrar tudo no fim de semana, sem plano de volta"`,
    mudancas: "+ adicionou [e1] Banco único compartilhado e [s3] a [s6]\n+ adicionou [t1] sobre migrar no fim de semana",
    fala: "Separei em quatro serviços, mas todos continuam no mesmo banco, e migro tudo de uma vez no fim de semana.",
  },
  "android-senior": {
    grafo: `COMPONENTES
- [r1] Tela de entregas (retângulo)
- [r2] Repositório (retângulo)
- [r3] API remota (retângulo)
- [e1] Cache local (elipse)
CONEXÕES
- [s1] Tela de entregas → Repositório
- [s2] Repositório → API remota
- [s3] Repositório → Cache local
ANOTAÇÕES SOLTAS
- [t1] "se a rede cair, mostra erro e tenta de novo"`,
    mudancas: "+ adicionou [e1] Cache local e [s3]\n+ adicionou [t1] sobre erro de rede",
    fala: "O cache só guarda o que veio da API; sem rede o app mostra erro e o entregador tenta de novo.",
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
