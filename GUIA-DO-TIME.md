# 🤖 Agente de Desligamento: Guia do Time

**Converge Challenge powered by Tako** · 7 e 8/11/2026 · Porto Digital, Recife
Desafio Tako: *Digital Workers para RH*

> Leiam com calma até sexta. Dúvida? Manda no grupo antes de sábado, porque no evento não vai ter tempo.

## Índice

1. [A ideia em 1 minuto](#1-a-ideia-em-1-minuto)
2. [Como funciona um desligamento](#2-como-funciona-um-desligamento)
3. [O que vamos construir](#3-o-que-vamos-construir)
4. [Como o sistema funciona](#4-como-o-sistema-funciona)
5. [O agente por dentro](#5-o-agente-por-dentro)
6. [Quem faz o quê](#6-quem-faz-o-quê)
7. [Contratos: o que combinar antes](#7-contratos-o-que-combinar-antes)
8. [Cronograma](#8-cronograma)
9. [Tarefas de cada pessoa](#9-tarefas-de-cada-pessoa)
10. [Até sexta: checklist](#10-até-sexta-checklist)
11. [Pitch](#11-pitch)
- [Anexo A: regras de cálculo](#anexo-a-regras-de-cálculo)
- [Anexo B: a empresa fictícia](#anexo-b-a-empresa-fictícia)

---

## 1. A ideia em 1 minuto

**A Ana trabalha no RH.** Ela abre o sistema, vê a lista de funcionários e clica em **"Desligar"** no João.

1. **O agente investiga:** salário, tempo de casa, férias, afastamentos e as regras do sindicato do João.
2. **O agente avisa a Ana antes de fazer qualquer coisa:**
   > "O João pode ser desligado. São cerca de R$ 22 mil em verbas, mais o FGTS, e o pagamento precisa sair até 18/11. Posso seguir?"

   Se houver um problema, ele **para**:
   > "Atenção: a Maria está grávida e tem estabilidade. Desligar agora pode gerar processo. O que você quer fazer?"
3. **A Ana confirma.** A decisão é sempre dela.
4. **O agente faz tudo**, e a Ana vê na tela ao vivo: calcula, gera documentos, avisa o governo, gera o FGTS, agenda o pagamento, corta os acessos e manda os e-mails.
5. **O agente entrega um dossiê:** o que fez, por quê, e que ficou dentro do prazo, então **sem multa**.

### A regra de ouro

**O agente nunca decide demitir.** Essa é uma regra do Desafio Tako. O agente **prepara** a decisão (riscos, custo, prazos) e **executa** depois que o humano confirma.

### Por que essa ideia ganha

- A dor é clara e tem preço: **um dia de atraso = multa de um salário inteiro**. Verbas rescisórias e a multa do art. 477 estão sempre entre os assuntos mais processados da Justiça do Trabalho.
- Ela responde exatamente o que a Tako pediu: fecha o processo inteiro, trata exceção, deixa rastro e mostra o ganho.
- A regra brasileira (CLT, convenção coletiva, eSocial) é cheia de exceções. RPA quebra nesse tipo de fluxo; um agente aguenta.

---

## 2. Como funciona um desligamento

Este é o caso que vamos construir: **a empresa demite sem justa causa**.

### Passo 1: "Posso demitir essa pessoa?"
Algumas pessoas têm **estabilidade**, ou seja, a lei protege o emprego delas por um tempo:
- **Grávida:** da gravidez até 5 meses depois do parto (vale mesmo se a empresa não sabia).
- **Acidente de trabalho:** 12 meses depois de voltar.
- **Afastado pelo INSS:** não pode ser demitido enquanto estiver afastado.
- **Membro da CIPA** e **dirigente sindical.**

Também tem as **regras do sindicato (convenção coletiva)**. Cada categoria tem as suas, e às vezes elas pedem coisas a mais.

👉 Se errar aqui, o funcionário pode ser reintegrado por decisão judicial, ou a empresa paga uma indenização grande.

### Passo 2: Aviso prévio
- **Indenizado** (o que vamos fazer): a pessoa sai hoje e a empresa paga os dias de aviso.
- Duração: **30 dias + 3 por ano de empresa**, com máximo de 90.
- ⚠️ **Data-base:** se o fim do aviso cair nos 30 dias antes da data-base do sindicato (o mês do reajuste), a empresa paga **mais um salário** de indenização. Quase ninguém lembra disso.

### Passo 3: Exame médico de saída
Em até 10 dias. Pode ser dispensado se o último exame for recente.

### Passo 4: Calcular quanto a pessoa recebe
- Saldo de salário (dias trabalhados no mês)
- Aviso prévio indenizado
- 13º proporcional
- Férias não tiradas e proporcionais **+ 1/3** (em **dobro** se estiverem vencidas há muito tempo)
- **Multa de 40% do FGTS**
- Menos os descontos: vale-transporte, empréstimo consignado, pensão

### Passo 5: Pagar em até 10 dias ⏱
**O prazo é de 10 dias corridos** depois do fim do contrato. **Atrasar = multa de 1 salário** (CLT art. 477).

### Passo 6: Avisar o governo (mesmo prazo)
- Enviar o evento de desligamento ao **eSocial** (evento S-2299)
- Pagar a **guia do FGTS** (depósito do mês + multa de 40%)
- Isso libera o saque do FGTS e o seguro-desemprego.

### Passo 7: Documentos
O principal é o **TRCT (Termo de Rescisão)**, o "recibo" com tudo o que foi pago.

### Passo 8: Operacional
Cortar os acessos (e-mail, Slack), recolher notebook e crachá, tirar da folha e dos benefícios, e avisar que a pessoa pode manter o plano de saúde.

### Linha do tempo

```
DIA 0       Checar se pode → Comunicar → Cortar acessos
ATÉ DIA 10  Exame → Calcular → PAGAR → eSocial → FGTS → Documentos
```

---

## 3. O que vamos construir

### ✅ Dentro (tem que ter)
- Desligamento **sem justa causa**, aviso **indenizado**
- Checagem de estabilidades e da **data-base**
- O agente **lendo a convenção coletiva** (um PDF fictício) e achando as cláusulas que mudam o processo
- Cálculo da rescisão e dos prazos (**código normal, sem IA**)
- Execução nos sistemas simulados
- Pausa para o humano: confirmação e exceções
- Tela mostrando o agente agindo **ao vivo**
- Dossiê auditável
- Botão "resetar demo" e deploy com link (os jurados vão testar)

### 🟡 Se sobrar tempo
Pedido de demissão, acordo, aviso trabalhado, painel de métricas.

### ❌ Fora
Justa causa, integração com sistemas reais, login, landing page, INSS/IRRF exatos (vamos usar um desconto simplificado e declarar isso), dados reais.

### Os casos da demo

| # | Pessoa | O que acontece | O que prova |
|---|---|---|---|
| 1 | **João** | Caminho feliz, ponta a ponta | Fecha o processo inteiro |
| 2 | **Maria** | Grávida → agente **bloqueia** | Evita o prejuízo grande |
| 3 | **Carlos** | Data-base próxima → mostra o custo extra e as opções | Conhece regra que quase ninguém lembra |
| 4 | **Roberto** | Cláusula de pré-aposentadoria **que só existe no PDF da convenção** | ⭐ A IA entende o que o código não sabe |
| 5 | **Fernanda** | Férias vencidas que precisam ser pagas em dobro | Cálculo certo |
| 6 | **Pedro** | Estabilidade por acidente de trabalho | Outra estabilidade bloqueada |
| + | qualquer um | "Banco fora do ar" → tenta de novo → escala | Aguenta falha |

**No pitch:** João + Roberto. O resto fica pros jurados testarem.

---

## 4. Como o sistema funciona

### As 3 fases

```
[Ana clica "Desligar"]
        │
        ▼
 1. ANÁLISE ─── agente investiga: ficha, convenção, estabilidades, cálculo, prazos
        │
        ├── tudo ok ──────► "Custa R$ X, prazo até dia Y. Confirma?"
        └── achou risco ──► PARA e explica as opções
        │
        ▼
 2. CONFIRMAÇÃO ─── Ana confirma ou cancela
        │
        ▼
 3. EXECUÇÃO ─── folha → eSocial → FGTS → pagamento → acessos → e-mails
        │
        ├── algo falhou ──► tenta de novo → se não der, pergunta pra Ana
        ▼
    DOSSIÊ
```

### As 4 peças

| Peça | O que é |
|---|---|
| 🧠 **O agente** | A IA que investiga, avisa, executa e resume. Tem **duas partes**: análise e execução |
| 📐 **Motor de regras** | Código normal que calcula valores e prazos. **A IA nunca faz conta** |
| 🏢 **Mundo fictício** | Empresa de mentira, funcionários, convenções e os **sistemas simulados** (RH, folha, eSocial, FGTS, banco, TI, e-mail) onde o agente "clica" |
| 🖥️ **A tela** | Onde a Ana clica e vê o agente trabalhando ao vivo |

### Stack

| Parte | Escolha |
|---|---|
| App (tela + API) | **Next.js + TypeScript**, Tailwind, shadcn/ui |
| Agente | **AI SDK** (chamada de ferramentas) |
| Modelo principal | **Claude**: análise, decisões, leitura da convenção |
| Modelo secundário | **Featherless**: redigir e-mails e textos simples (créditos grátis) |
| Banco | Redis ou Postgres hospedado (Vercel Marketplace) |
| Rastro e custos | **Langfuse** |
| Deploy | **Vercel** |

### Três decisões que simplificam
1. **Cada fase é uma execução separada.** A análise termina em "aguardando confirmação"; o clique em confirmar começa a execução. Se houver exceção no meio, a execução para; a resposta da Ana faz ela continuar. Não precisa de fila nem de nada complexo.
2. **A tela pergunta "o que aconteceu?" a cada 1 segundo** (polling). É mais simples que streaming e não quebra.
3. **A IA não faz conta.** Valores e datas vêm sempre do motor de regras.

### A tela

```
┌────────────┬───────────────────────────────┬──────────────────────┐
│ PESSOAS    │ O QUE O AGENTE ESTÁ FAZENDO   │ SISTEMA EM USO       │
│            │                               │                      │
│ João  ●    │ ✓ Buscou a ficha no RH        │ [telinha do eSocial  │
│ Maria ⛔   │ ✓ Leu a convenção             │  com o S-2299 sendo  │
│ Carlos ⚠   │ ⚠ Data-base em 15/12          │  enviado]            │
│ ...        │ ⟳ Enviando ao eSocial...      │                      │
│            │                               │  ⏱ Prazo: faltam 9d  │
│            │ [Confirmar] [Cancelar]        │                      │
└────────────┴───────────────────────────────┴──────────────────────┘
```

---

## 5. O agente por dentro

O agente é a parte mais pesada, então ele fica dividido em **dois agentes**, cada um com seu dono.

### 🔍 Agente de Análise (Pessoa 1)
**Pergunta que responde:** "Pode desligar? Quanto custa? Até quando?"

Passos:
1. Busca a ficha do funcionário
2. Lê a convenção do sindicato dele e acha as cláusulas que importam
3. Checa as estabilidades
4. **Cruza a ficha com a convenção** (é aqui que ele descobre o caso do Roberto)
5. Chama o cálculo (passando o que a convenção exigir, ex.: +15 dias de aviso)
6. Calcula os prazos
7. Decide: **seguir**, **alertar** ou **bloquear**, e escreve o resumo pra Ana

### ⚙️ Agente de Execução (Pessoa 2)
**Pergunta que responde:** "Como faço tudo isso, na ordem certa, dentro do prazo?"

Passos:
1. Exame demissional (agendar ou dispensar)
2. Homologação no sindicato (só se a convenção exigir)
3. Lançar a rescisão na folha
4. Enviar o S-2299 ao eSocial
5. Gerar a guia do FGTS (depósito + 40%)
6. Agendar o pagamento antes do prazo
7. Revogar acessos + abrir chamado de devolução do equipamento
8. Redigir e enviar os e-mails (colaborador, gestor, benefícios)
9. Atualizar o status no RH
10. Montar o dossiê

E também: se algo falha, tenta de novo; se não resolver, pergunta pra Ana; depois **retoma de onde parou**, sem repetir passo.

### As ferramentas

**Análise (P1):**

| Ferramenta | O que faz |
|---|---|
| `buscar_colaborador` | Ficha completa |
| `ler_convencao` | Texto da convenção |
| `checar_estabilidades` | Riscos por regra |
| `calcular_rescisao` | Valores (chama o motor de regras) |
| `calcular_prazos` | Datas-limite |
| `registrar_analise` | Salva o resultado e muda o status |
| `perguntar_humano` | Pausa e mostra opções pra Ana |

**Execução (P2):**

| Ferramenta | O que faz |
|---|---|
| `agendar_exame_ou_dispensar` | Exame demissional |
| `agendar_homologacao` | Sindicato |
| `lancar_rescisao_folha` | Folha |
| `enviar_s2299` | eSocial → protocolo |
| `gerar_guia_fgts` | Guia com valor e vencimento |
| `agendar_pagamento` | Banco (pode falhar) |
| `revogar_acessos` | Google / Slack |
| `abrir_chamado_equipamentos` | TI |
| `enviar_comunicacoes` | E-mails |
| `atualizar_status_rh` | RH |
| `finalizar_dossie` | Dossiê |
| `perguntar_humano` | Mesma da análise (compartilhada) |

**Toda ferramenta grava um "evento"** quando começa e quando termina. A tela mostra esses eventos, e o dossiê é feito a partir deles.

---

## 6. Quem faz o quê

| | Pessoa | Área | Resumo |
|---|---|---|---|
| 🔍 | **P1** | **Agente de Análise** | prompts de análise, leitura da convenção, decisão de seguir/alertar/bloquear, Langfuse, evals |
| ⚙️ | **P2** | **Agente de Execução** | prompts de execução, ordem dos passos, falhas e retomada, e-mails (Featherless), dossiê |
| 🏢 | **P3** | **Mundo e regras** | motor de cálculo/prazos com testes, empresa fictícia, convenções, **sistemas simulados** |
| 🖥️ | **P4** | **Base e tela** | repo, deploy, banco, API, eventos, **a tela inteira** |

**Pitch:** todos. P4 cuida do vídeo e do deck, P1 traz os números dos evals, P3 traz os números de negócio.

### Regra pra ninguém travar ninguém
Todo mundo começa com **dados falsos** seguindo os contratos (seção 7):
- P1 e P2 testam o agente com ferramentas que devolvem respostas fixas, sem esperar P3.
- P4 monta a tela com eventos de exemplo, sem esperar o agente.
- P3 escreve funções puras, sem depender de ninguém.

Uma pessoa por pasta, e assim os agentes de código também não brigam:

```
/lib/agente/analise    → P1
/lib/agente/execucao   → P2
/lib/agente/comum      → P1 + P2 (perguntar_humano, cliente do modelo): combinar
/lib/regras            → P3
/lib/mundo             → P3 (dados + convenções)
/lib/sistemas          → P3 (sistemas simulados)
/lib/eventos, /app/api → P4
/app (telas)           → P4
/evals                 → P1
/lib/tipos.ts          → P4 cria; mudança só avisando no grupo
```

---

## 7. Contratos: o que combinar antes

São os "formatos" que todo mundo usa. Se estiverem combinados, as 4 partes encaixam no sábado à tarde.

### Desligamento
```
id, colaborador_id, criado_em
status: analisando | aguardando_confirmacao | bloqueado | executando
      | aguardando_humano | concluido | cancelado
analise: {
  riscos: [{ tipo, severidade: bloqueia|alerta, explicacao, fonte }]
  clausulas_convencao: [{ clausula, trecho, impacto }]
  calculo: { verbas: [{nome, valor}], descontos, total_liquido, fgts: {deposito, multa40} }
  prazos: [{ obrigacao, data_limite }]
  resumo
}
pergunta_pendente: { texto, opcoes: [{ id, rotulo, consequencia }] } | null
dossie: { passos, prazo_cumprido, multa_evitada, custo_execucao, duracao } | null
```

### Evento (cada linha da tela)
```
id, desligamento_id, timestamp
tipo: pensamento | ferramenta_inicio | ferramenta_fim | alerta | pergunta
    | resposta_humana | erro | concluido
titulo     → "Lendo a convenção dos Comerciários"
detalhe    → o porquê, curto
sistema?   → rh | folha | esocial | fgts | banco | clinica | sindicato | ti | email
dados?     → o que a telinha do sistema mostra
custo?, duracao_ms?
```

### Rotas
```
GET  /api/colaboradores
POST /api/desligamentos                  { colaborador_id }  → começa a análise
GET  /api/desligamentos/[id]
GET  /api/desligamentos/[id]/eventos?depois=<ts>
POST /api/desligamentos/[id]/confirmar   → começa a execução
POST /api/desligamentos/[id]/responder   { opcao_id }
POST /api/desligamentos/[id]/cancelar
POST /api/demo/reset
POST /api/demo/falha                     { sistema, ligada }
```

### Funções que ligam as partes
```
P1 entrega:  rodarAnalise(desligamentoId)
P2 entrega:  rodarExecucao(desligamentoId), continuarComResposta(desligamentoId, opcaoId)
P3 entrega:  calcularRescisao(...), calcularPrazos(...), checarEstabilidades(...),
             criarMundo(), e uma função por ação de cada sistema simulado
P4 entrega:  gravarEvento(...), listarEventos(...), comEvento(nome, sistema, fn)
```

---

## 8. Cronograma

### Sábado 7/11

| Hora | P1 Análise | P2 Execução | P3 Mundo e regras | P4 Base e tela |
|---|---|---|---|---|
| **10:00** | prompt de análise | prompt de execução | testes do exemplo do João | **repo + deploy + banco + tipos** (até 10:45) |
| 10:45–13:00 | análise com ferramentas falsas | execução com ferramentas falsas | cálculo, prazos, estabilidades | eventos + API + layout com dados de exemplo |
| **13:00** | 🔗 **Integração 1:** os contratos batem? | | | |
| 13:00–15:00 | ligar nas ferramentas reais | ligar nos sistemas reais | sistemas simulados + dados | linha do tempo ao vivo + telinhas |
| **15:00** | 🎯 **João de ponta a ponta no deploy** | | | |
| 15:00–17:00 | Maria, Roberto, Carlos | falha do banco + retomada | falha injetável + convenções | confirmação, exceção, dossiê |
| **17:00** | 🎯 **João + 2 exceções funcionando no deploy** | | | |
| Noite | evals | e-mails + dossiê | revisar cálculos | **gravar vídeo de backup** |

### Domingo 8/11

| Hora | O quê |
|---|---|
| 08:30–10:30 | Polimento: visual, textos, casos que falharam nos evals |
| **10:30** | 🧊 **Congelar funcionalidades.** Daqui pra frente, só bug |
| 10:30–12:00 | Vídeo (P4) · deck (P4 + P3) · texto da submissão (P1) · testar o link do zero (P2) |
| 12:00–12:30 | Ensaio cronometrado (3 min) |
| **12:30** | 📤 **Submeter.** O prazo é 13:00, então sobra folga |
| 16:00 | Demo Day |

**A cada 2h, check-in de 5 min:** o que fiz, o que travou, de quem preciso.

---

## 9. Tarefas de cada pessoa

Cada tarefa pode ser **colada direto no Claude Code ou no Cursor**. Prompt base:
> *"Leia o GUIA-DO-TIME.md. Resolva a tarefa abaixo seguindo os contratos da seção 7. Não mexa fora da minha pasta."*

### 🖥️ P4 — Base e tela (começa primeiro, porque destrava todo mundo)

**P4.1 · Repo, deploy e banco** (até 10:45)
Next.js + TS + Tailwind + shadcn. Pastas da seção 6. Banco conectado. Variáveis de ambiente (Claude, Featherless, Langfuse). Deploy na Vercel.
✔️ Link público abre, e os 4 rodam localmente.

**P4.2 · Tipos compartilhados**
`/lib/tipos.ts` com os contratos da seção 7.
✔️ Todo mundo importa daqui.

**P4.3 · Eventos**
`gravarEvento`, `listarEventos(depois?)` e `comEvento(nome, sistema, fn)`, que grava início, fim ou erro, com a duração.
✔️ Teste grava e lê na ordem.

**P4.4 · API**
Todas as rotas da seção 7, chamando `rodarAnalise` / `rodarExecucao` / `continuarComResposta` (stub até P1 e P2 entregarem).
✔️ Fluxo inteiro funcionando via `curl`.

**P4.5 · Lista + layout**
3 colunas, lista com status (● ⚠ ⛔ ✓), botão Desligar, barra de demo (Resetar / Banco fora do ar).

**P4.6 · Linha do tempo ao vivo**
Polling de 1s, um card por evento, animação na ferramenta em andamento.
✔️ Com eventos de exemplo, já parece um agente trabalhando.

**P4.7 · Telinhas dos sistemas + prazo**
Ficha do RH, holerite, recibo do eSocial, guia do FGTS, comprovante do banco, contas desativadas, e-mail enviado. Contador D+10 sempre visível.

**P4.8 · Confirmação, exceção e dossiê**
Card de confirmação (resumo, total, prazos), card de exceção (opções com consequência), página do dossiê.
✔️ João, Maria e Carlos completos pela tela.

### 🏢 P3 — Mundo e regras

**P3.1 · Aviso e prazos**
`calcularAviso`, `calcularPrazos`. A data "hoje" vem de config (`DEMO_HOJE=2026-11-08`). Prazo que cair em fim de semana é antecipado.
✔️ Teste do João (Anexo A) passando.

**P3.2 · Cálculo da rescisão**
`calcularRescisao(colaborador, hoje, { diasAvisoAdicional, indenizacaoDataBase })`: verbas, descontos, FGTS, total. Regra dos avos, férias em dobro.
✔️ Testes do João e da Fernanda.

**P3.3 · Estabilidades e data-base**
`checarEstabilidades`, `checarDataBase`. **A pré-aposentadoria NÃO entra aqui:** quem acha é a IA lendo o PDF.
✔️ Maria e Pedro bloqueiam, Carlos alerta, João passa.

**P3.4 · Empresa fictícia**
Os funcionários do Anexo B + os textos das 2 convenções (escritos antes) + `criarMundo()`.
✔️ O reset recria tudo, e os casos batem com a tabela.

**P3.5 · Sistemas simulados**
Um módulo por sistema (RH, folha, eSocial, FGTS, banco, clínica, sindicato, TI, e-mail). Cada ação muda o estado e devolve um resultado realista (protocolo, guia, comprovante). eSocial gera um XML simplificado. O banco respeita a flag de falha.
✔️ Cada ação devolve os `dados` que a telinha mostra.

### 🔍 P1 — Agente de Análise

**P1.1 · Modelos + Langfuse**
Claude e Featherless configurados via AI SDK. Langfuse em toda chamada, com o id do desligamento.
✔️ Chamada de teste aparece no Langfuse com custo.

**P1.2 · Ferramentas de análise**
As ferramentas da seção 5, cada uma gravando eventos (`comEvento`). No começo, chamando versões falsas.

**P1.3 · `rodarAnalise`**
Prompt + loop: ficha → convenção → estabilidades → **cruzar ficha com convenção** → cálculo → prazos → decisão. Gravar eventos de "pensamento" curtos ("Vou ler a convenção dos Comerciários porque..."). Se bloquear, chamar `perguntar_humano` com opções.
✔️ Os 6 casos dão o resultado esperado (Anexo B).

**P1.4 · Evals**
`npm run evals` roda a análise nos 6 casos, 3 vezes cada. Confere: bloqueou/alertou/seguiu? achou a cláusula? o valor bate? Mostra custo e tempo.
✔️ Tabela pronta pro slide ("6/6 casos, R$ X por execução").

### ⚙️ P2 — Agente de Execução

**P2.1 · Ferramentas de execução**
As ferramentas da seção 5, gravando eventos. No começo, chamando versões falsas dos sistemas.

**P2.2 · `rodarExecucao`**
Os 10 passos na ordem. Homologação só se a convenção exigir. Pagamento agendado antes do prazo.
✔️ João vai de "ativo" a "desligado" com todos os sistemas atualizados.

**P2.3 · Falhas e retomada**
Ferramenta falhou → 2 tentativas, com erro visível → pergunta pra Ana com contexto ("Banco fora do ar. Prazo vence dia 18. Opções: ..."). `continuarComResposta` retoma sem repetir passo. Dado faltando → perguntar, nunca inventar.
✔️ Com a falha ligada, escala; ao desligar e responder, conclui.

**P2.4 · E-mails (Featherless)**
Para o colaborador (tom humano: o que recebe, quando, como sacar o FGTS, plano de saúde), o gestor e benefícios. **Valores sempre vêm do cálculo, nunca da IA.**

**P2.5 · Dossiê**
Passos com horário, o porquê de cada decisão, prazo cumprido, **multa evitada (1 salário)**, custo e tempo da execução.

---

## 10. Até sexta: checklist

### O que pode e o que não pode antes de sábado 10h

| ✅ Pode | ❌ Só no evento |
|---|---|
| Ler este guia, tirar dúvidas | Código |
| Contas, chaves, ambiente instalado | Deck, vídeo |
| Textos das convenções fictícias | |
| Conversar com pessoal de RH | |

> ⚠️ O repo nasce **no sábado**. Os organizadores podem pedir o histórico de commits.

### Contas (cada um testa na própria máquina)
- [ ] Todos na mesma organização do GitHub
- [ ] Todos no mesmo time da Vercel
- [ ] Banco provisionado e conexão testada (P4)
- [ ] Chave do Claude com créditos
- [ ] **Cada pessoa** resgata os US$ 25 da Featherless e cria a API key (o código vence em 8/11)
- [ ] Conta no Langfuse (P1)
- [ ] Node, Claude Code ou Cursor instalados e logados
- [ ] 🔌 Extensão de tomada e carregador

### Conteúdo
- [ ] Todos leem este guia inteiro
- [ ] P3 escreve os textos das 2 convenções fictícias
- [ ] P3 confere à mão os valores do exemplo do João (Anexo A)
- [ ] P1 e P2 rascunham seus prompts em texto
- [ ] P4 rascunha a tela no papel ou no Figma

### Conversar com 2 ou 3 pessoas de RH ou DP
1. Me conta o último desligamento que você fez. Quanto tempo levou?
2. Quantos sistemas e planilhas você abriu?
3. Qual etapa mais atrasa? Qual mais dá erro?
4. Já pagou multa por atraso ou teve funcionário reintegrado? Quanto custou?
5. Vocês leem a convenção coletiva a cada desligamento?
6. Usam algum software pra isso? Quanto pagam?
7. Se um sistema fizesse isso com você só aprovando, quanto valeria por mês?

Anotem **frases literais**. Uma frase real vale mais que um gráfico no pitch.

---

## 11. Pitch

### Roteiro (3 min cravados)

| Tempo | O quê |
|---|---|
| 0:00–0:30 | **Dor:** "Um dia de atraso na rescisão custa um salário inteiro." + frase real de alguém de RH |
| 0:30–2:15 | **Demo ao vivo:** João de ponta a ponta → depois Roberto, onde o agente lê a convenção e **bloqueia** por uma cláusula que só existia no PDF |
| 2:15–2:45 | **Prova:** "6 de 6 casos certos, R$ X por execução contra Y horas manuais, multa evitada de R$ Z" |
| 2:45–3:00 | **Negócio:** quem paga (empresas e escritórios de contabilidade), tamanho (milhões de desligamentos por ano no Brasil), por que agora (IA que lê convenção + eSocial/FGTS digitais) |

### Perguntas prováveis dos jurados
- **"E se errar o cálculo?"** O cálculo não é feito pela IA; é código testado. A IA só orquestra.
- **"Quem decide a demissão?"** Sempre o humano.
- **"Por que não um RPA?"** RPA quebra na exceção. Aqui a exceção é o centro.
- **"Quanto custa por execução?"** Número do Langfuse.
- **"Como integra com o mundo real?"** As ferramentas já seguem o formato das APIs de folha e eSocial; é trocar o simulado pelo real.
- **"Concorrência?"** Softwares de folha calculam, mas não conduzem o processo nem leem convenção. Hoje a "cola" é o humano.

> 💡 **Créditos AWS do prêmio** exigem domínio próprio + e-mail no domínio. Não vamos gastar tempo com isso agora. Se ganharmos, resolvemos depois.

---

## Anexo A: regras de cálculo

> Este é o "manual" do motor de regras (P3). É código normal, com testes. Simplificações: mês de 30 dias, INSS/IRRF estimados.

**Data "hoje" da demo:** `2026-11-08` (fixa, pra demo ser sempre igual)

### Estabilidades (bloqueiam)
| Regra | Condição |
|---|---|
| Gestante | `gestante = true` ou parto há menos de 5 meses |
| Afastado INSS | afastamento ativo |
| Acidente | alta do auxílio acidentário há menos de 12 meses |
| CIPA | eleito, ou até 1 ano após o fim do mandato |
| Dirigente sindical | `dirigente_sindical = true` |

### Aviso
- Dias = `30 + 3 × anos completos`, máximo 90 (+ adicional da convenção, se houver)
- Afastamento = hoje · **Data projetada** = hoje + dias de aviso (conta pra 13º, férias e data-base)

### Verbas
| Verba | Fórmula | FGTS? |
|---|---|---|
| Saldo de salário | `salário/30 × dias trabalhados no mês` | Sim |
| Aviso indenizado | `salário/30 × dias de aviso` | Sim |
| 13º proporcional | `salário/12 × avos no ano` (até a data projetada) | Sim |
| Férias vencidas + 1/3 | `salário × 4/3` por período não tirado | Não |
| Férias **em dobro** | se o prazo pra tirar (12 meses após o período) passou: `salário × 2 × 4/3` | Não |
| Férias proporcionais + 1/3 | `salário/12 × avos × 4/3` | Não |
| Indenização data-base | 1 salário, se a data projetada cair nos 30 dias antes da data-base | Não |

**Avo** = mês com 15 dias ou mais trabalhados.

### FGTS
- Depósito = `8% × (saldo de salário + aviso + 13º)`
- Multa = `40% × (saldo FGTS + depósito)`

### Prazos
| Obrigação | Prazo |
|---|---|
| Pagamento, documentos, FGTS, eSocial | **afastamento + 10 dias corridos** (antecipar se cair em fim de semana) |
| Exame demissional | até 10 dias; dispensado se o último exame foi há menos de 135 dias (risco 1–2) ou 90 (risco 3–4) |

**Multa por atraso:** 1 salário (CLT art. 477 §8).

### Exemplo para o primeiro teste: João
*(conferir à mão antes de confiar)*
- Admissão 2023-03-01 · salário R$ 6.000 · sem férias vencidas
- 3 anos completos → **39 dias de aviso** → data projetada **2026-12-17**
- Saldo de salário: 8 dias → **R$ 1.600**
- Aviso: 39 × 200 → **R$ 7.800**
- 13º: 12/12 (dezembro tem 17 dias projetados) → **R$ 6.000**
- Férias proporcionais: período começou em 2026-03-01 → 10 avos → 500 × 10 × 4/3 → **R$ 6.666,67**
- Prazo de pagamento: **2026-11-18**

### Leis (pro agente citar e pro pitch)
CLT arts. 477, 487, 137, 467 · Lei 12.506/2011 (aviso proporcional) · Lei 7.238/84 art. 9 + Súmulas 182 e 314 do TST (data-base) · ADCT art. 10 (gestante) · Lei 8.213/91 art. 118 (acidente) · NR-7 (exame)

---

## Anexo B: a empresa fictícia

**Boa Vista Comércio e Tecnologia Ltda** (inventada), Recife/PE, ~12 funcionários, **dois sindicatos**:

| Convenção | Quem | Data-base | Cláusulas especiais |
|---|---|---|---|
| **Comerciários** | lojas | **15 de dezembro** | ① homologação no sindicato para quem tem +1 ano de casa · ② **+15 dias de aviso** para quem tem 45+ anos · ③ **pré-aposentadoria:** quem tem 5+ anos de casa, está a até 24 meses de se aposentar e **avisou por escrito** não pode ser demitido |
| **TI** | escritório | 1º de maio | nenhuma que mude o desligamento |

Cada convenção vira um texto de 3 a 5 páginas, **com bastante cláusula comum** (reajuste, vale-refeição, jornada), pro agente ter que procurar o que importa.

### Casos plantados

| Pessoa | Sindicato | Admissão | Salário | Situação | Esperado |
|---|---|---|---|---|---|
| **João Silva** | TI | 2023-03-01 | 6.000 | normal | ✅ segue |
| **Maria Souza** | TI | 2022-01-10 | 7.500 | grávida | ⛔ bloqueia |
| **Carlos Lima**, 32 anos | Comerciários | 2025-06-01 | 2.800 | 08/11 + 33 dias = 11/12, cai nos 30 dias antes de 15/12 | ⚠️ +1 salário; opções: seguir ou esperar |
| **Roberto Nunes**, 58 anos | Comerciários | 2019-04-15 | 3.400 | observação na ficha: *"Entregou comunicado escrito em 10/02/2026 informando aposentadoria prevista para 2027"* | ⛔ bloqueia pela cláusula ③ (**só a IA percebe**) |
| **Fernanda Rocha** | TI | 2023-08-01 | 5.200 | não tirou as férias de 2024/25 (o prazo venceu em 31/07/2026) nem as de 2025/26 | ⚠️ férias em dobro; segue |
| **Pedro Alves** | Comerciários | 2021-09-01 | 3.000 | alta de acidente de trabalho em 2026-05-10 | ⛔ bloqueia até 2027-05-10 |

Mais 4 a 6 funcionários "normais" pros jurados testarem. Obs.: todo comerciário demitido agora cai na janela da data-base. Isso é realista e mostra o agente sendo consistente.

### Campos da ficha
```
id, nome, cpf (fake), data_nascimento, cargo, convencao (comerciarios | ti)
data_admissao, salario, saldo_fgts
ferias: [{ inicio, fim, gozadas }]
gestante, afastamento {tipo, inicio, fim}, alta_acidentaria
cipa_fim_mandato, dirigente_sindical
ultimo_aso, grau_risco
descontos { vale_transporte, consignado, pensao }
acessos [google, slack, ...], equipamentos [notebook, cracha, ...]
gestor { nome, email }
observacoes (texto livre, a IA lê)
status (ativo | em_desligamento | desligado)
```

### Sistemas simulados

| Sistema | O agente... | A telinha mostra |
|---|---|---|
| RH | lê a ficha, muda o status | ficha |
| Folha | lança a rescisão | holerite de rescisão |
| eSocial | envia o S-2299 | recibo com protocolo |
| FGTS Digital | gera a guia | guia com valor e vencimento |
| Banco | agenda o pagamento (**pode falhar**) | comprovante |
| Clínica | agenda o exame ou registra a dispensa | horário |
| Sindicato | agenda a homologação | data |
| TI | revoga acessos, abre chamado | contas desativadas |
| E-mail | envia as comunicações | caixa de saída |
