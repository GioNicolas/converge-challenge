# Posicionamento e plano do diferencial

> Decidido em 07/11/2026, depois do feedback dos jurados ("já existe parecido lá fora": HackerRank Chakra, CodeSignal AI Interviewer, micro1 Zara).
> O produto e o pitch inteiros devem reforçar esta tese.

## 1. A tese

**A dor:** a contratação errada. É a mais cara do processo, porque inclui as outras: meses de salário de quem não entrega, onboarding perdido, a vaga reaberta e o processo refeito do zero. E ela continua acontecendo mesmo com as IAs gringas, que tornam a entrevista barata e em massa.

**A frase:**
> "A gente otimiza o custo da entrevista e, principalmente, o resultado da contratação."

**Sempre do lado da empresa:** cada funcionalidade e cada fala do pitch respondem "quanto isso economiza ou evita de prejuízo para a empresa?".

**O que nos diferencia:**
1. **Se adapta à empresa já na configuração.** A recrutadora conta o que quer, do jeito dela, e o Totti transforma isso em entrevista. A cada vaga ele aprende o jeito da empresa.
2. **Não olha só se acertou: olha como a pessoa pensa, aprende e se vira.** Dicas em níveis mostram se ela destrava com ajuda; empecilhos no meio mostram como reage quando algo muda.
3. **Prova no relatório.** Cada ponto da nota abre o momento exato do código e da conversa.
4. **Melhora com o resultado (o fosso).** Aos 90 dias (fim da experiência CLT) o gestor diz se a contratação deu certo, e o agente recalibra os critérios daquela empresa. Abre a porta para uma "garantia dos 90 dias".

**Dores de apoio** (consequências da mesma solução):
- **Vaga aberta:** entrevista no mesmo dia, sem agendar, relatório em minutos, e o tech lead só vê os finalistas.
- **Candidato bom desistindo:** processo rápido, retorno para todos e uma conversa que não atropela quem está pensando.

**Cuidados no pitch:**
- Não dizer que os gringos "só olham se acertou": eles dizem avaliar raciocínio. O contraste é que eles otimizam o custo, e a gente o custo e o resultado.
- Não focar em "não existe no Brasil".
- Números de custo são estimativas: mostrar a conta (ex.: 3 meses de salário + processo refeito + onboarding ≈ R$ 50 mil por erro numa vaga pleno) e validar com alguém de RH se der.

## 2. Roteiro do pitch (4 momentos)

1. **Dor:** a contratação errada custa R$ X, e a IA barata não resolve isso.
2. **Virada:** a gente não mede só se acertou, mede como a pessoa pensa, aprende e se vira.
3. **Demo:** o Totti adapta a entrevista à empresa → o empecilho entra no meio → o candidato reage → o relatório mostra a prova.
4. **Fosso:** aos 90 dias o gestor diz se deu certo, o agente aprende, e entra a garantia.

## 3. Frentes de trabalho

O Nícolas decide a ordem. Abaixo, uma sugestão de prioridade pelo impacto na demo.

| # | Frente | O que já existe | O que falta |
|---|---|---|---|
| F1 | **Empecilhos no meio** | Pergunta `kind: "desafio"` com retorno (`lib/agents/analystSchema.ts`, `policy.ts`, prompts do Analyst e do Interviewer). Hoje é só "dá pra otimizar?" e só depois de o código funcionar. | Um tipo novo de empecilho: o requisito muda, entra um caso novo, o tempo é cortado. Que possa acontecer antes do código funcionar, apareça na tela da IDE de forma clara e o Evaluator avalie a adaptação. |
| F2 | **Como pensa e aprende** | Dicas em níveis (`hint` em `lib/contracts.ts`, política de dicas em `policy.ts`) e `hintsUsed` no Evaluator. | Uma seção no relatório tipo "Aprendizado": precisou de qual dica, quanto tempo levou para destravar e se usou bem. Hoje isso só entra no texto do prompt. |
| F3 | **Prova clicável no relatório** | `Evidence { t, text }` no `Report`; snapshots do código com tempo na sessão. | Clicar numa evidência e ver o código naquele minuto e o que foi falado. |
| F4 | **IA que aprende com a empresa na configuração** | Totti: preferências de tom e dicas (`lib/pre-entrevista/preferencias.ts`), pesos, competências e planejador. | Memória por empresa entre vagas ("da última vez vocês pediram X, mantenho?") e mostrar isso na conversa. |
| F5 | **Ciclo dos 90 dias** | Painel da vaga com entrevistas e relatórios (`components/vagas/PaginaVaga.tsx`). | Tela "Como foi essa contratação?" e "o que o Totti ajustou com isso". Pode ser simulada na demo. |
| F6 | **Pitch** | Nada ainda. | Slides seguindo a seção 2 e a conta da contratação errada. |

Ordem sugerida: **F1 → F3 → F2 → F5 → F4 → F6**. F1 e F3 são o que os jurados vão ver na demo; F5 conta a história do fosso.

## 4. Regras que continuam valendo

- Só tecnologia (live coding e system design).
- O Totti é masculino em tudo.
- As telas da recrutadora seguem o "papel e tinta" (`app/tema-recrutador.css`, igual a `/vagas`).
- O que o Lucas Todaro sobe na `main` prevalece sobre planejamento pessoal.
