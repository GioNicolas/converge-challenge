# Supabase: o que guarda e como configurar

O servidor guarda dados no Supabase quando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidas. Sem elas, tudo continua como antes (memória e a pasta `data/`), então o desenvolvimento local não muda.

## O que vai para o Supabase

| Dado | Onde | Observação |
|---|---|---|
| Planos de entrevista (`InterviewConfig`) | tabela `kv`, namespace `config` | lido por `findConfig` |
| Convites e agendamentos, vínculo convite→sessão | `kv`, `convite` | |
| Relatórios do Live Coding | `kv`, `relatorio` | o painel da vaga lê daqui |
| Sessões do System Design (cérebro) | `kv`, `sessao`, `estado`, `analises`, `evento:<id>`, `imagem:<id>`, `scorecard` | |
| Avaliações (kits) geradas e aprovação | `kv`, `avaliacao` | |
| Desenhos do candidato (PNG) | Storage, bucket privado `desenhos` | `<sessao>/<n>.png` |

## O que AINDA fica só em memória (vale por instância do servidor)

- A conversa da pré-entrevista com o Totti (`lib/pre-entrevista/sessoes.ts`). O **plano final** vai para o Supabase; só a conversa em andamento fica em memória.
- As sessões do Live Coding em andamento (`lib/session/store.ts`, analista, política, avaliação em curso). O **relatório pronto** vai para o Supabase.
- O painel de vagas da recrutadora (vagas, etapas, decisões) fica no `localStorage` do navegador de cada pessoa.

Em hospedagem serverless essas partes funcionam enquanto as chamadas caírem na mesma instância (comum com poucos usuários), sem garantia.

## Criar o projeto

1. Crie um projeto no Supabase (região **South America (São Paulo)**).
2. Rode no **SQL Editor**:

```sql
create table if not exists public.kv (
  namespace text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (namespace, key)
);
create index if not exists kv_namespace_updated_idx on public.kv (namespace, updated_at desc);
alter table public.kv enable row level security;
insert into storage.buckets (id, name, public) values ('desenhos', 'desenhos', false) on conflict do nothing;
```

Não crie políticas: só o servidor acessa, pela chave secreta, e o RLS ligado bloqueia o acesso público.

3. Em *Project Settings → API*, copie a **Project URL** e a chave **secret** (`sb_secret_...`) ou a `service_role` legada. **Nunca** use a publishable/anon, e nunca em variável `NEXT_PUBLIC_*`.
4. Defina no `.env` (local) e nas variáveis da Vercel:

```
SUPABASE_URL=https://<id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

## Desempenho

Cada operação é uma chamada HTTP (~300 ms daqui, de longe). Na Vercel, ponha a **região das funções em São Paulo (gru1)** (*Settings → Functions → Function Region*), junto do Supabase: cai para poucos milissegundos. Sem isso, o padrão (Washington) soma ~120 ms por chamada, e o `/analisar` faz cerca de 5 por análise.

## Desenvolver sem mexer nos dados reais

`ARMAZENAMENTO=memoria` no `.env` faz o servidor ignorar o Supabase (memória e `data/`).

## Testes

- `npm run test:armazenamento`: kv e repositório, em memória.
- `npm run test:supabase`: integração com o Supabase **de verdade** (carrega o `.env`). Grava e apaga linhas e arquivos de teste, todos com prefixo próprio. Só roda por esse comando.

## Pausa do plano gratuito

Projetos gratuitos pausam após cerca de 7 dias sem uso: reative no painel se a aplicação passar a dar erro de conexão.
