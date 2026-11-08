# Totti — entrevistas técnicas com IA

O Totti monta e conduz a triagem técnica de uma vaga de ponta a ponta. A recrutadora cola a descrição da vaga e conversa por voz com o Totti, que propõe o formato (live coding ou system design), o nível e o que pesa na avaliação. Os candidatos recebem o convite por e-mail, escolhem um horário e fazem a entrevista com um agente que acompanha o código ou o desenho em tempo real, pergunta por voz e, no fim, entrega um relatório com escore por critério no painel da vaga.

Projeto do **Converge Challenge powered by Tako** (Porto Digital, Recife, novembro de 2026).

## Como funciona

1. **Vaga.** A recrutadora cria a vaga em `/vagas/nova` e cola a descrição.
2. **Pré-entrevista.** O Totti classifica a vaga e conversa com ela (`/pre-entrevista`): confirma formato e nível, faz uma pergunta que decide algo da avaliação e pergunta o que reprova direto. Sai um plano de entrevista (`InterviewConfig`) com os critérios e os pesos.
3. **Convites.** Publicar a vaga envia os convites. O candidato escolhe o horário em `/agendar/[token]` e recebe o link da entrevista.
4. **Entrevista.**
   - **Live coding** (`/entrevista`): IDE no navegador com testes. O agente lê o código, interrompe com perguntas no momento certo e roda testes escondidos no fim.
   - **System design** (`/entrevista/system-design`): quadro Excalidraw. O agente escreve o enunciado, pergunta por voz e anota no quadro.
5. **Relatório.** O escore e a recomendação aparecem na linha do candidato, no painel da vaga (`/vagas`). O relatório completo traz as evidências de cada critério com o minuto em que aconteceram.
6. **Aprendizado.** As decisões da recrutadora no painel e o retorno de 90 dias depois da contratação viram regras na memória da squad (`/vagas/aprendizado`). As próximas entrevistas já usam essas regras.

## Rodar localmente

Use Node 22 ou mais recente.

```bash
npm install
cp .env.example .env.local   # preencha as chaves que for usar
npm run dev                  # http://localhost:3000
```

Para ver as telas sem nenhuma chave:

```bash
NEXT_PUBLIC_USAR_SERVIDOR=0 AGENTE_FAKE=1 npm run dev
```

Nesse modo, a pré-entrevista e o quadro usam dados de demonstração, e o cérebro do system design usa um LLM falso determinístico.

### Variáveis de ambiente

O `.env.example` traz todas as variáveis, com comentários. As principais:

| Para quê | Variáveis |
|---|---|
| Agente da entrevista (LLM) | `FEATHERLESS_API_KEY` (principal), `OPENROUTER_API_KEY` (reserva) |
| Pré-entrevista (classificador e cobertura) | `TYPESAFE_API_KEY` |
| Voz e transcrição | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| E-mail dos convites | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `APP_URL` |
| Banco | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ([docs/supabase.md](docs/supabase.md)) |
| Testes e demonstração | `CANDIDATOS_TESTE`, `HORARIOS_DE_TESTE`, `AGENTE_FAKE`, `AGENTE_DEV`, `ARMAZENAMENTO` |

Sem as chaves do Supabase, os dados ficam em memória e na pasta `data/`. E-mail de verdade só sai para quem está em `CANDIDATOS_TESTE`.

## Testes

```bash
npm run lint
npx tsc --noEmit
npm run test:pre-entrevista   # planejador e falas do Totti
npm run test:agente           # cérebro do system design
npm run test:rotas            # rotas da API
npm run test:email            # templates e envio
npm run test:e2e              # Playwright (sobe o servidor sozinho)
npm run pre:simular           # pré-entrevista com recrutadoras simuladas (usa as chaves)
```

A lista completa está no `package.json` (`test:*`, `eval:*`, `pre:*`).

## Estrutura

```
app/                rotas do Next.js (App Router) e a API em app/api
components/         telas: IDE, quadro, painel de vagas, relatório
lib/
  contracts.ts      contratos compartilhados (InterviewConfig, Report…). Mudou? Avise o time.
  pre-entrevista/   Totti com a recrutadora: classificação, conversa, cobertura e plano
  agents/           agente do live coding: leitura do código, quando interromper, avaliação
  agente/           cérebro do system design: estado, perguntas, kits e scorecard
  vagas/ convites/  pipeline da vaga, candidatos, convites e agendamento
  email/            e-mails (react-email + Resend)
  squad-memory/     regras que o time ensina ao Totti
  noventa-dias/     retorno pós-contratação que ajusta as regras
  voz/ transcricao/ fala do agente e transcrição do candidato
  storage/          Supabase ou memória
problems/           banco de problemas do live coding
fixtures/           vagas e dados de exemplo para testes e simulações
scripts/            simuladores, validações e utilitários
e2e/                testes Playwright e suas configs
docs/               documentação técnica (docs/arquivo guarda o material antigo do time)
```

Na raiz ficam só os arquivos que as ferramentas procuram ali: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs` e o `.env.example`.

## Documentação

- [Supabase](docs/supabase.md): o que é guardado e como configurar
- [Integração de voz](docs/voz-integracao.md)
- [Contrato quadro ↔ cérebro](docs/contrato-quadro-cerebro.md) e [rotas do cérebro](docs/cerebro-rotas.md)
- [Geração de kits de avaliação](docs/geracao-de-kits.md)
- [Testar a entrevista por texto](docs/teste-local-entrevista-texto.md) e [testar o plano](docs/teste-local-plano.md)
- [Design](docs/design.md) e [design system da Tako](docs/tako-design.md)

## Contribuindo

Cada pessoa trabalha numa branch própria (`nome/assunto`) e abre PR para a `main`. Antes do PR, rode `npm run lint`, `npx tsc --noEmit` e os testes da área que mudou. Depois do merge, apague a branch.
