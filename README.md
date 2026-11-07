# Converge Challenge — Entrevistador técnico com IA

Agente que acompanha o candidato resolvendo um problema numa IDE web, faz perguntas por voz, grifa o código e entrega um relatório para a recrutadora. A entrevista é personalizada por uma pré-entrevista com a recrutadora (`InterviewConfig`).

## Rodar

```bash
npm install
npm run dev
```

## Organização

- `lib/contracts.ts` — contratos compartilhados por todos os times. Mudou? Avisa todo mundo.
- `lib/config/default.ts` — configuração padrão até a pré-entrevista ficar pronta.
- `docs/` — contexto do projeto.

## Branches

| Branch | Uso |
|---|---|
| `main` | Base integrada |
| `pre-entrevista` | Conversa com a recrutadora que gera o `InterviewConfig` |
| `time/sofia-todaro` | Integração do time Sofia + Todaro |
| `sofia-todaro/sofia`, `sofia-todaro/todaro` | Trabalho individual |
| `time/henrique-giorgio` | Integração do time Henrique + Giorgio |
| `henrique-giorgio/henrique`, `henrique-giorgio/giorgio` | Trabalho individual |

Fluxo: branch individual → PR para a branch do time → PR para `main`.
