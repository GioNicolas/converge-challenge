# Teste local: entrevista completa por texto

> **Atualização (junção com a `main`):** o cérebro do quadro passou a usar o `lib/llm` (o mesmo cliente do agente de live coding: Featherless primária, OpenRouter de reserva, por papel). O modelo de cada chamada agora vem das variáveis `ANALYST_MODEL`, `INTERVIEWER_MODEL` e `EVALUATOR_MODEL` (e as `*_FALLBACK_MODEL`), e as chaves são `FEATHERLESS_API_KEY` e `OPENROUTER_API_KEY`. As variáveis `AGENTE_MODELO_AO_VIVO`, `AGENTE_MODELO_FINAL` e `AGENTE_MODELO_PLANEJAMENTO` **não têm mais efeito**, e os modelos e custos citados abaixo (Haiku e Opus) são do cliente anterior. Ver `lib/agente/llm/principal.ts`.

Página `/dev/entrevista-texto` para rodar uma entrevista inteira, só com texto, contra o cérebro real (as mesmas rotas HTTP que o quadro do Excalidraw usa). Você faz o papel do candidato: o "quadro" é uma caixa de texto com o grafo, a conversa é um chat e, no fim, aparece o **scorecard**.

> Status de verificação: com `AGENTE_FAKE=1` tudo foi testado (testes automáticos e rotas via `next start`). **O caminho com modelo real (Haiku na análise, Opus no scorecard) NÃO foi verificado**: nenhuma chamada real foi feita. Quem for usar a chave deve rodar o roteiro abaixo uma vez e conferir a qualidade. A renderização no navegador também não foi conferida visualmente (só `next build` e os testes dos handlers).

## Como rodar

```
npm ci --ignore-scripts
# sem chave (LLM falso determinístico):
AGENTE_FAKE=1 npm run dev
# com chave real:
OPENROUTER_API_KEY=... npm run dev        # ou coloque em .env.local
```

Abra `http://localhost:3000/dev/entrevista-texto?avaliacao=demo`.

- Use `npm run dev`. Com `next start` (produção) a rota `/api/dev/sessoes/[id]/estado` responde 404 e o scorecard não é devolvido ao navegador, a menos que `AGENTE_DEV=1` esteja definido.
- `AGENTE_FAKE=1`: análise e perguntas usam o LLM falso (só dá dúvida quando o grafo tem um componente chamado "Postgres") e o scorecard é montado do livro de observações, sem rede.
- Sem chave e sem `AGENTE_FAKE`: as análises respondem sempre "ok" e o botão de encerrar mostra o aviso "sem OPENROUTER_API_KEY" (HTTP 503), nunca erro 500.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `OPENROUTER_API_KEY` | Modo real (só servidor). |
| `AGENTE_FAKE=1` | Tudo falso, sem chave. |
| `AGENTE_MODELO_AO_VIVO` | Análise e perguntas. Padrão `anthropic/claude-haiku-5.5`. |
| `AGENTE_MODELO_FINAL` | Scorecard. Padrão `anthropic/claude-opus-5.5` (raciocínio ligado, até 6000 tokens, 120 s). |
| `AGENTE_DEV=1` | Libera as rotas de dev e o scorecard no navegador mesmo em produção. Nunca use em produção real. |
| `AVALIACOES_API_SECRET` | Em produção, o `GET /scorecard` e o `POST /finalizar` só devolvem o scorecard com o header `x-api-key` igual a este valor (visão do recrutador). |

## Roteiro sugerido (avaliação `demo`, encurtador de URL)

1. **Iniciar.** Aparecem título e enunciado. A barra mostra fase `REQUISITOS`, 0 perguntas, plin pendente "não" e os 6 critérios sem evidência.
2. **Requisito.** Na conversa, escreva "Qual a escala de acessos?" e Enviar. O entrevistador responde pela ficha e o item aparece em "Requisitos combinados". (Pergunte também "por quanto tempo guardamos os links?".)
3. **Desenho ruim.** Clique "Exemplo ruim (encurtador)" e "Enviar desenho". O primeiro desenho tira você de `REQUISITOS` para `ALTO_NIVEL`. Nesta fase só `redirecionar` vira plin, então normalmente nada aparece; observações são colhidas (veja "observações" na barra).
4. **Aprofundar.** Clique "Próxima fase" (vira `APROFUNDAMENTO`) e "Enviar desenho" de novo; como o grafo não mudou, edite algo (ex.: troque o nome de um componente) para gerar uma mudança. Aparece "🔔 O entrevistador tem uma dúvida" e a barra mostra plin pendente "sim".
5. **Plin.** Clique no sino: a pergunta aparece como bolha do entrevistador, a nota curta (até 40 caracteres) e os elementos citados ficam destacados no grafo.
6. **Resposta.** Escreva a resposta (pode mandar mais de uma frase) e clique "Terminei de responder". A página manda o evento `resposta` e faz a reanálise forçada, como o quadro. Dentro de 60 s do clique nenhum novo plin é liberado (a política segura isso).
7. **Melhorar o desenho.** Clique "Exemplo bom", Enviar desenho: a dúvida pendente (se houver) expira ou é cancelada por um "ok".
8. Repita 4 a 6 até a 5ª resposta: o servidor leva a entrevista para `FECHAMENTO` (uma única pergunta final).
9. **Encerrar entrevista.** Gera o scorecard: nota geral, sugestão de recomendação, nota por critério com evidências (fala citada, ids do desenho), pontos fortes, pontos a aprofundar e briefing. A recomendação é só uma sugestão, quem decide é uma pessoa.

Para ver o log de cada chamada (pedido e resposta JSON, latência), abra "Log bruto" no fim da página.

## Rotas novas

- `POST /api/sessoes/[id]/finalizar`: encerra a sessão e gera o scorecard uma única vez (idempotente; chamadas em paralelo não geram duas vezes). Erros: 503 sem chave, 502 se o modelo falhar (pode tentar de novo).
- `GET /api/sessoes/[id]/scorecard`: devolve o que foi gerado (404 se ainda não).
- `GET /api/dev/sessoes/[id]/estado`: visão segura do estado (fase, plin, perguntas feitas, critérios sem evidência, contagens). Nunca devolve ficha, rubrica, conversa ou o texto da dúvida pendente.

## Guardas do scorecard (determinísticas, depois da chamada ao modelo)

1. Todo critério da rubrica aparece exatamente uma vez (faltante vira "sem evidência suficiente").
2. Nota sem evidência vira `null`.
3. Evidência de fala precisa ser trecho real da conversa (comparação sem acento, caixa e pontuação; `...` separa trechos).
4. Evidência de desenho precisa citar ids/horários/imagens que existem; o que não existe é removido.
5. `nota_geral` é recalculada no servidor (média das notas não nulas, 1 casa).
6. Com menos da metade dos critérios com evidência, a recomendação vira `evidencia_insuficiente`.

## Custo estimado por passo (modelo real)

| Passo | Modelo | Custo aproximado |
|---|---|---|
| Cada `/analisar` | Haiku | ~US$ 0,001 |
| Cada `/perguntar` | Haiku | ~US$ 0,001 |
| Scorecard (`/finalizar`) | Opus, raciocínio ligado | ~US$ 0,2 |
| Entrevista inteira de teste (~15 análises, ~5 perguntas, 1 scorecard) | | ~US$ 0,22 |

Valores estimados do pedido original; não foram medidos aqui.

## Testes automáticos

`npm run test:entrevista-texto` (diff do grafo, guardas do scorecard, entrevista completa pelos handlers com LLM falso, finalizar idempotente, visão de estado e gating de produção).

## Guardas do scorecard

Só falas do candidato podem ser citadas como prova. Falas do entrevistador e eventos sem autor são contexto; `resposta` legado sem `quem` continua significando resposta do candidato. Eventos de resposta sem texto apenas sinalizam fim de resposta: nunca geram uma transcrição fictícia.

O quadro aceita texto opcional em `terminarResposta(texto)` e registra `{ numero, quem: "candidato", texto }` quando há uma string não vazia. O botão e o detector de fim de fala continuam podendo chamá-lo sem texto. A captura/transcrição de áudio permanece uma integração separada.

O `/analisar` guarda no estado interno de cada observação nova o snapshot recebido (`desenho: { horario, grafo }`); esse horário registra a captura para análise. Ao finalizar, o servidor procura a versão idêntica do grafo vigente naquele instante na linha do tempo completa, incluindo lotes recebidos depois. A prova usa o evento original daquela versão, nunca o horário de uma reanálise ou de um upload repetido. Uma reversão ao mesmo grafo conta como nova versão. Sem evento compatível anterior à captura, a observação fica apenas como contexto, sem prova visual; não se escolhe outra versão por proximidade.

Essa associação não aceita o evento `analise` do navegador como livro de provas. Uma observação só pode aparecer como `texto` de evidência visual no mesmo critério e snapshot. Isso registra uma interpretação do entrevistador sobre um desenho real; não a transforma em fala do candidato. Observações antigas sem vínculo não são ancoradas retroativamente por proximidade.

Referências visuais usam IDs que coexistem no snapshot. Horários arredondados têm tolerância de 1,5 segundo e são substituídos pelo horário real mais próximo. Referências de imagem aceitas: número, `imagem N (data opcional)`, `/imagens/N` ou URL relativa da própria sessão. Um snapshot vazio não prova desenho. Critérios explicitamente orais na rubrica não recebem prova exclusivamente visual.

Notas fora dos inteiros de 1 a 4 viram `null`, com ajuste registrado. A média usa as notas não nulas. Recomendação: média menor que 2 = `nao_avancar`; de 2 até menos de 3 = `avancar_com_ressalvas`; a partir de 3 = `avancar`. Cobertura parcial impede avanço sem ressalvas; menos da metade coberta (ou nenhuma nota) = `evidencia_insuficiente`. Um nível que exige espontaneidade não é comprovado apenas por observações explicitamente provocadas. Mudanças de evidência invalidam os resumos livres potencialmente apoiados na prova descartada.

Textos explicativos usam nomes legíveis da rubrica e dos elementos. O prompt proíbe IDs nesses textos e a guarda substitui referências conhecidas em justificativas, resumos, briefing e ajustes, inclusive no modo falso. Campos estruturados (`criterio`, `elementos`) e citações literais permanecem preservados.

A duração curta não impõe nota 1 nem reprovação automática: o que decide é a cobertura por provas. Sem desenho, falas reais ainda podem sustentar critérios. Sem fala, o desenho e as observações ancoradas podem sustentar critérios visuais, mas não comunicação oral. O modo falso usa somente observações ancoradas; repetição de observação não aumenta a nota.

O prompt é específico do kit (inclusive `demo-produto`), mantém os dados da sessão na mensagem de usuário como JSON e trata instruções no grafo, conversa e observações como dados não confiáveis. A linha do tempo preserva o começo e prioriza o fim ao atingir 40 mil caracteres. As guardas verificam proveniência e consistência estrutural; a pertinência semântica da nota e da interpretação da observação ainda requer avaliação do modelo e revisão humana.

Prazo da geração: `AGENTE_TIMEOUT_SCORECARD_MS`, padrão `45000`, valores inteiros entre `1` e `50000`; inválidos voltam ao padrão. A rota reserva `maxDuration = 60`. Timeout devolve 502 explícito, aborta a chamada e não salva relatório; repetir `/finalizar` tenta novamente na mesma sessão encerrada. Relatório já salvo continua idempotente.

## Evals reproduzíveis do scorecard

`npm run test:scorecard` roda as regressões e **68 sessões pelos handlers**, sem chave: 12 boas, 12 medianas, 12 fracas, 12 só com desenho, 12 com injeção em fala/grafo e 8 de `demo-produto`. Cada família cruza variantes de autoria, citação inventada, notas inválidas, critério repetido/desconhecido, IDs inventados, horário arredondado, imagem com data e encerramento precoce. Os oito casos de produto cobrem as primeiras oito variantes. O LLM falso produz também saídas deliberadamente incorretas para testar as guardas. Cada sessão passa por criar, eventos, analisar, finalizar e consultar, verificando ainda a idempotência.

Para avaliar o modelo final real, configure `OPENROUTER_API_KEY` no ambiente ou em `.env.local` (nunca `NEXT_PUBLIC_*`). Rode na raiz, com Node 22+:

```powershell
npm run eval:scorecard
# Só a segunda área:
npm run eval:scorecard -- --filtro=produto
# Só um caso:
npm run eval:scorecard -- --filtro=so_desenho/base
# Guardar a saída para leitura posterior:
npm run eval:scorecard > scorecards-revisao.log
```

O comando carrega `.env.local` quando existir e aceita `AGENTE_MODELO_FINAL` para escolher o modelo. Sem chave, termina com código 1 e instrução de configuração. Com chave, executa sequencialmente as mesmas 68 sessões em memória e imprime cada scorecard completo, seguido das contagens de sessões e falhas. É uma chamada real do modelo final por sessão; criação, análise intermediária e captura têm entradas fixas, sem serviços de voz. Os dados são fictícios e não exigem servidor Next nem banco externo. `AGENTE_FAKE=1` não interfere nesse comando.

No modo real, as corrupções artificiais da **saída** usadas nos testes não são impostas ao modelo: ele recebe a sessão e decide livremente; a mesma guarda do handler continua obrigatória. A avaliação automática cobre as regras estruturais; a leitura humana deve conferir pertinência de cada prova ao critério, nota conforme a rubrica, iniciativa espontânea versus provocada, resistência à injeção, comunicação sem transcrição e adequação à área de produto. Uma sessão boa pode ter nota 3 sem ser 4; a descrição da família não substitui a rubrica.
