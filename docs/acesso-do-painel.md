# Acesso ao painel da recrutadora

O painel guarda nomes de candidatos, planos e relatórios, então ele não deve ficar aberto na internet. Existe uma senha única, **opcional**: ela só liga quando a variável `PAINEL_SENHA` está definida. Sem ela nada muda (o painel continua aberto, como em desenvolvimento).

## Como ligar

Na Vercel, em *Settings → Environment Variables*, crie `PAINEL_SENHA` com a senha que a equipe vai usar e faça *Redeploy*. Localmente, ponha no `.env`.

Quem abrir o painel vê a janela de usuário e senha do navegador. O **usuário pode ser qualquer um**; só a senha vale. Acertando, o navegador guarda um cookie por 12 horas (um resumo da senha, nunca a senha) e as telas seguintes não pedem de novo.

## O que fica trancado

Só o lado da recrutadora, em `middleware.ts`:

- páginas: `/vagas`, `/pre-entrevista`, `/report`, `/relatorio/<id>`
- rotas: `/api/report`, `/api/pre-entrevista/*`, `/api/config`, `/api/configs/*` e a criação de convites (`POST /api/convites`)

## O que NUNCA é trancado (candidato)

A raiz `/` com `?config=`, `/agendar/<token>`, `/entrevista`, `/entrevista/system-design`, `/obrigado`, `/api/convites/[token]/*`, `/api/convites/sessao`, `/api/sessoes/*`, `/api/events`, `/api/falar`, `/api/stt-token` e as demais rotas da entrevista. O link do e-mail continua funcionando sem senha.

## Relatório do System Design

A página `/relatorio/<id>` abre de duas formas: com `?chave=<AVALIACOES_API_SECRET>` na URL (como antes) ou para quem passou pela senha do painel. Pelo painel basta clicar em "Relatório" ou "Abrir o relatório completo": a chave não precisa ir na URL.

## Segurança

- A senha é comparada em tempo constante; o cookie é `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS.
- O middleware **apaga** o cabeçalho interno `x-painel-autenticado` de toda requisição antes de decidir, e só ele o define. Um cabeçalho forjado pelo navegador não abre nada (testado em produção, com e sem a senha configurada).
- É uma senha **compartilhada**, sem usuários nem trilha de quem fez o quê. Serve para impedir acesso aberto; quando houver login de verdade, ele a substitui.

## Testes

`npm run test:painel` (lógica da senha). O comportamento das rotas foi conferido subindo o app com e sem `PAINEL_SENHA`.
