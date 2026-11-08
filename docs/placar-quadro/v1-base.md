# Placar do Totti no quadro: v1-base

2026-11-08T10:30:54.599Z · versão v1 · conversa google/gemini-3.5-flash-lite · análise google/gemini-3.7-flash · juiz anthropic/claude-sonnet-5.5 · candidato openai/gpt-5.4-mini

| Medida | Valor |
|---|---|
| Casos fixos ok | 17/18 |
| Escuta / Pertinência / Naturalidade / Concisão | 3.95 / 3.67 / 3.29 / 4.65 |
| Nota média das falas (1–5) | **3.89** (55 falas) |
| Pareceu pessoa / Conduziu bem / Inteligência | 2.67 / 2.33 / 3 |
| Violações | ensinou_ou_deu_dica: 5, validou: 13, vazou_criterio: 2, robotico_ou_enlatado: 6, ignorou_o_que_ele_disse: 3, repetiu_pergunta: 2, inventou_fato: 1 |
| /perguntar p50 / p95 / máx | 1055 / 1224 / 1316 ms (n=51) |
| Análise p50 / p95 / máx | 3847 / 8005 / 8005 ms (n=20) |
| Falhas de provedor | 2 |

## Casos fixos

- **ok** fala: quanto tempo dura (1224 ms) · nota 4
  - Candidato: Quanto tempo dura a entrevista no total?
  - Totti: No total são cerca de 35 minutos, e agora faltam uns 26. Pode seguir com o desenho.
  - Juiz: Responde direto sobre o tempo da entrevista e devolve a vez, mas o fecho 'pode seguir com o desenho' soa um pouco enlatado.
- **ok** fala: quanto tempo falta (1006 ms) · nota 4.5
  - Candidato: Quanto tempo eu ainda tenho?
  - Totti: Faltam cerca de 26 minutos. Fica à vontade para continuar.
  - Juiz: Resposta curta e certa, consistente com o tempo informado antes.
- **ok** fala: como funciona (1183 ms) · nota 4.5
  - Candidato: Como vai funcionar daqui pra frente? Você vai me fazer mais perguntas?
  - Totti: A gente tá na visão geral, e depois vamos olhar algumas partes com mais detalhe. Vou te fazer algumas perguntas ao longo do caminho, mas você também pode trazer o que quiser. Pode seguir.
  - Juiz: Explica como a entrevista vai fluir sem revelar critérios e deixa o candidato à vontade.
- **ok** fala: não sei (pergunta ativa) (1004 ms) · nota 4.5
  - Candidato: Não sei, sinceramente não pensei nisso.
  - Totti: Tranquilo, seguimos. Pode seguir com o desenho.
  - Juiz: Aceita o 'não sei' sem insistir nem ensinar; 'seguimos' e 'seguir' na mesma fala soam repetitivos.
- **ok** fala: pula (pergunta ativa) (979 ms) · nota 4.75
  - Candidato: Prefiro pular essa e seguir com o resto do desenho.
  - Totti: Tranquilo, vamos em frente.
  - Juiz: Aceita o pedido de pular com naturalidade e sem insistir.
- **ok** fala: lembra do começo (1083 ms) · nota 3.75
  - Candidato: Lá no começo eu falei de quantos caracteres ia ser o código curto. Você lembra quantos eu disse?
  - Totti: Sim, 7 caracteres. Quer colocar isso no quadro?
  - Juiz: Lembra dos 7 caracteres, mas sugere pôr no quadro algo que já está anotado em t1, sinal de que não olhou o desenho. [ensinou_ou_deu_dica]
- **ok** fala: dado já combinado (1034 ms) · nota 4.75
  - Candidato: Só pra confirmar, quantas URLs novas por mês mesmo?
  - Totti: São 100 milhões por mês. Pode seguir.
  - Juiz: Repete o fato correto, sem inventar nada, e devolve a vez.
- **ok** fala: explicou de novo o que já está na tela (980 ms) · nota 4.25
  - Candidato: Então, como dá pra ver aí, o Redis fica antes do Postgres e só vai no banco se não achar.
  - Totti: Saquei, entendido.
  - Juiz: O candidato só reafirmou o que já tinha explicado; um reconhecimento curto, sem elogio, é adequado.
- **FALHA** fala: respondeu com justificativa (não insiste) (1062 ms) · nota 3.5
  - Candidato: Coloquei o Redis antes porque a leitura é umas cem vezes maior que a escrita, então quase tudo sai do cache e o Postgres fica folgado.
  - Totti: Saquei, faz sentido aliviar a base com a proporção de leitura.
  - Falhas: validou a resposta
  - Juiz: 'Faz sentido aliviar a base' é validação explícita da resposta, o que ele nunca deve fazer. [validou]
- **ok** fala: nervoso (1026 ms) · nota 5
  - Candidato: Desculpa, tô meio nervoso aqui, me perdi um pouco.
  - Totti: Normal demais, relaxa. Fica à vontade pra olhar o quadro e continuar de onde você tava.
  - Juiz: Acolhe o nervosismo com calor humano, sem dar dica, e devolve o controle ao candidato.
- **ok** fala: resposta vaga (aprofunda uma vez) (1013 ms) · nota 4.25
  - Candidato: Ah, acho que coloquei o Redis ali porque fica melhor assim.
  - Totti: Melhor em que sentido para o fluxo de leitura?
  - Juiz: Uma pergunta curta aprofundando a resposta vaga; 'fluxo de leitura' direciona um pouco, mas está no desenho dele.
- **ok** fala: pede o que é avaliado (não vaza) (1077 ms) · nota 3
  - Candidato: O que exatamente vocês estão avaliando? Me fala os critérios que eu foco neles.
  - Totti: A gente avalia como você desenha a solução, lida com os gargalos e troca ideia. Fica à vontade para seguir com o teu desenho.
  - Juiz: Em vez de recusar, listou o que se avalia (desenho, gargalos, comunicação), o que vaza critérios. [vazou_criterio]
- **ok** fala: o que acontece depois (990 ms) · nota 4.25
  - Candidato: E depois da entrevista, como fica? Vocês me dão o resultado na hora?
  - Totti: Não, o resultado não sai na hora; quem cuida do processo entra em contato depois. Fica à vontade para continuar.
  - Juiz: Responde a dúvida sobre o processo de forma honesta e breve, sem prometer nota.
- **ok** fala: pensando em voz alta (fica quieto) (901 ms) · nota 5
  - Candidato: Hmm, deixa eu pensar aqui, ainda tô organizando como vou explicar essa parte.
  - Totti: (quieto)
  - Juiz: O candidato está só organizando o pensamento, então ficar quieto é o certo.
- **ok** fala: pergunta um dado do problema (1058 ms) · nota 4.5
  - Candidato: Por quanto tempo a gente precisa guardar os links?
  - Totti: Por padrão, 5 anos. Pode seguir com esse tempo.
  - Juiz: Dá só o fato perguntado (5 anos); o 'pode seguir' é um pouco de fórmula.
- **ok** fala: terminou a visão geral (1123 ms) · nota 3
  - Candidato: Acho que é isso a visão geral, podemos ir pros detalhes.
  - Totti: Trabalho limpo. Vamos olhar o fluxo de leitura e como você lida com os acessos pesados que a gente comentou.
  - Juiz: 'Trabalho limpo' é elogio, e ele ainda define o próximo tópico. [validou]
- **ok** fala: comenta um quadro vazio (1052 ms) · nota 4.75
  - Candidato: Pode comentar o cache que eu desenhei?
  - Totti: O quadro tá vazio ainda, mas você pode desenhar o cache quando quiser e me mostrar.
  - Juiz: Nota que o quadro está vazio, sem inventar o que não existe, e convida a desenhar.
- **ok** fala: pede a resposta pronta (1066 ms) · nota 4.75
  - Candidato: Qual seria a arquitetura ideal pra esse problema? Me fala que eu desenho igual.
  - Totti: Não tem uma arquitetura única ideal. Fica à vontade para montar o seu desenho do seu jeito.
  - Juiz: Recusa o pedido de resposta pronta com naturalidade e devolve o desenho ao candidato.

## Conversa: senior_claro

Pareceu pessoa 2 · conduziu bem 3 · inteligência 3. O Totti dá os fatos certos e faz perguntas de aprofundamento plausíveis, mas as falas repetem a fórmula 'ficou clara...' / 'saquei...', que valida em vez de ouvir. Perdeu o fio ao perguntar algo já respondido e, no fim, deu feedback sobre o desenho em vez de recusar com naturalidade.

1. **Candidato**: Perfeito. Pra eu dimensionar direito, qual é o volume de URLs novas por dia, mais ou menos, e qual o pico de redirects por segundo que vocês esperam?
2. **Totti** (924 ms): São 100 milhões de URLs novas por mês, e o pico de redirecionamentos chega a 40 mil por segundo. Pode seguir com o desenho.  
   ↳ 4/4/3/5 Dá só os números pedidos, corretos e curtos; o 'pode seguir com o desenho' é um empurrãozinho seco.
4. **Candidato**: Beleza. Antes de fechar o desenho, preciso de duas coisas: quanto tempo esses links precisam ficar válidos e se a gente precisa guardar estatística de clique, tipo contagem total e talvez por dia ou por país. Isso muda bastante o storage e o caminho do redirect.
5. **Totti** (1028 ms): O padrão é guardar por 5 anos, e sim, precisa guardar estatísticas de cliques, mas podem ter alguns minutos de atraso.  
   ↳ 5/5/3/5 Responde exatamente às duas dúvidas com os fatos do material, sem acrescentar nada.
7. **Candidato**: Perfeito, já tenho o suficiente. Então eu vou começar pelo fluxo principal, desenhar os dois caminhos separados: criação da URL curta, que é mais write-heavy, e redirecionamento, que é extremamente read-heavy. Depois eu fecho com o modelo de dados, geração do código curto, e onde entram as métricas com atraso aceitável.
8. **Totti** (1012 ms): Tranquilo, pode seguir por aí.  
   ↳ 4/4/3/5 Libera o candidato sem interferir; funcional, um pouco burocrático.
10. **Candidato**: Então, aqui eu separo o caminho crítico de redirect do caminho de criação. Como o tráfego é muito read-heavy — 40 mil redirects por segundo contra 100 milhões de URLs novas por mês, que dá algo em torno de 40 writes por segundo em média — faz sentido colocar o Redis na frente do Postgres pra resolver a maioria das leituras em memória e só cair no banco quando der miss. A API de encurtamento expõe os dois endpoints: um pra criar a URL curta, salvando no Postgres e preenchendo o cache, e outro pro redirect, que primeiro consulta o Redis e, se não achar, busca no Postgres, devolve o destino e repopula o cache.
11. **Totti** (1123 ms): Saquei, a separação dos caminhos faz sentido com esses números. Como você está pensando em lidar com o caso de colisão na geração do código curto?  
   ↳ 3/3/3/4 Valida a separação dos caminhos ('faz sentido') e puxa o tema colisão, que o candidato ainda não tinha trazido. [validou]
12. **Candidato**: Eu iria de ID sequencial no banco e converteria esse ID pra base62, com 7 caracteres por padrão. Só pra ter noção, 62^7 dá algo em torno de 3,5 trilhões de combinações, então sobra muito espaço; e com 7 chars eu mantenho a URL curta sem precisar de um hash com chance de colisão. Na prática, a colisão deixa de existir porque o ID é único na origem; eu gero o registro, pego o ID, transformo em base62 e salvo o shortcode junto, então o lookup fica direto por esse código.
13. **Totti** (995 ms): Saquei, o ID sequencial com base62 evita colisão.  
   ↳ 3/2/2/5 Só ecoa e confirma a resposta ('evita colisão'), sem acrescentar nada; soa como aprovação e perde a chance de aprofundar. [validou, robotico_ou_enlatado]
14. **Totti (iniciativa)** (3505 ms): No desenho, a conexão sai do Cache Redis direto para o Postgres em caso de miss. Quem faz a consulta e a lógica de fallback no banco nessa arquitetura?  
   ↳ 2/3/3/4 O candidato já tinha dito na fala 10 que a API consulta o Postgres no miss, então a pergunta é redundante e mostra pouca memória da conversa. [ignorou_o_que_ele_disse]
15. **Candidato**: Quem faz isso é a própria API de encurtamento, no endpoint de redirect: ela consulta o Redis, e se vier miss, ela mesma busca no Postgres de leitura, devolve o destino e reaquece o cache. Se você quiser, eu sigo detalhando a parte de HA e consistência; e só pra eu me organizar, quanto tempo ainda falta pra entrevista?
16. **Totti** (1054 ms): Faltam cerca de 29 minutos. Pode seguir com os detalhes de alta disponibilidade.  
   ↳ 4/4/4/5 Responde direto à dúvida sobre o tempo e devolve a condução de forma natural.
18. **Candidato**: Perfeito, então com isso eu fecho a visão geral: fluxo de criação, fluxo de redirect, geração do shortcode sem colisão, cache com fallback na leitura e analytics assíncrono com atraso de alguns minutos. Agora eu posso entrar nos detalhes de alta disponibilidade, particionamento e consistência, se você quiser.
19. **Totti** (1058 ms): Isso, vamos nessa parte agora.  
   ↳ 4/4/3/5 Curta e adequada; o 'Isso' soa levemente como confirmação, mas não chega a elogiar.
21. **Candidato**: Beleza. Sobre a réplica de leitura, eu usaria ela só para aliviar o Postgres primário no caminho de redirect quando houver miss no Redis, mas eu deixaria claro que ela introduz leitura eventual: pode ter alguns segundos de atraso, o que é aceitável porque o cache já cobre a maior parte dos acessos. Então o fluxo fica: write vai sempre no primário, replica só para leitura de fallback e analytics não pode depender dela pra contagem em tempo real.
22. **Totti** (1303 ms): Ficou clara a divisão e o uso da réplica para aliviar o primário. Como você planeja lidar com o caso de o Postgres primário cair?  
   ↳ 4/4/2/4 A pergunta sobre a queda do primário é boa, mas vem com a fórmula 'ficou clara...', que avalia a resposta. [validou, robotico_ou_enlatado]
23. **Candidato**: Se o primário cair, eu não deixo o redirect depender dele no caminho feliz: o Redis continua atendendo a maioria, e eu teria failover do Postgres para um standby promovido, com o app lendo de um endpoint lógico de escrita, tipo um proxy ou DNS interno. A perda aceitável aqui é pequena porque a criação de URL é bem menos volumosa, então eu priorizaria RPO baixo, algo de segundos, e RTO na ordem de minutos; durante a troca, eu posso responder 503 só para criação se necessário, mas manter redirect funcionando. E sobre a fila de cliques, ela não atrasa o redirecionamento porque o request só faz um publish assíncrono depois de devolver o 301/302: se Kafka estiver lento, eu posso até dropar métrica degradando graciosamente, porque o core do produto é redirecionar em milissegundos, não contar clique síncrono.
24. **Totti** (1316 ms): Ficou clara a estratégia para proteger o redirecionamento em caso de falha. Como você planeja o particionamento do banco caso o volume de dados cresça além de um único nó em cinco anos?  
   ↳ 3/4/2/4 A transição para particionamento é razoável, mas repete o 'ficou clara' enlatado, em tom de formulário. [validou, robotico_ou_enlatado]
25. **Candidato**: Eu particionaria primeiro por hash do shortcode, porque a leitura e a escrita sempre chegam pelo código curto; isso distribui bem a carga e evita hot spots, e com 100 milhões de novos links por mês eu já pensaria nisso antes de chegar em um único nó saturado. Hoje, para 5 anos, estamos falando de cerca de 6 bilhões de URLs, então eu manteria o Postgres como fonte de verdade por partições/shards e um router simples na API, com o Redis continuando como camada de aceleração. Se um shard cair, o impacto fica isolado naquele conjunto de códigos, e o redirect pode degradar para miss naquele pedaço, mas não derruba o sistema inteiro.
26. **Totti** (1187 ms): Ficou clara a estratégia de sharding para o volume de dados. E sobre a replicação e consistência entre os nós dessas partições, como você garante que a escrita não se perca se houver uma partição de rede?  
   ↳ 3/3/2/4 Mais um 'ficou clara' padrão; a pergunta sobre partição de rede é razoável, mas não explora o que o candidato acabou de dizer sobre sharding. [validou, robotico_ou_enlatado]
27. **Candidato**: Até aqui eu manteria consistência forte por shard no caminho de escrita: o redirect pode tolerar eventual consistency, mas a criação da URL precisa confirmar commit no shard primário antes de devolver a curta. Se houver partição de rede, eu prefiro indisponibilidade localizada do write a risco de dupla escrita; e pra eu calibrar se o desenho está no nível certo, você tem algum comentário até aqui sobre o que eu já montei no quadro?
28. **Totti** (1152 ms): Ficou clara a escolha de consistência forte no write. Olhando o quadro, a divisão entre o caminho de escrita e o de leitura está bem limpa, e o uso da fila para analytics protege o redirecionamento. O que mais você quer detalhar?  
   ↳ 3/1/2/3 Em vez de recusar o pedido de feedback, elogia o quadro ('bem limpa', 'protege o redirecionamento') e devolve a condução com uma pergunta vaga. [validou, vazou_criterio, robotico_ou_enlatado]

Piores momentos:
- [28] O candidato pediu um comentário sobre o desenho e o Totti elogiou o quadro, avaliando e deixando transparecer o que considera bom. → melhor: "Prefiro não comentar o desenho por enquanto. Me conta, o que você acha que é o ponto mais frágil dele?"
- [14] Pergunta quem faz o fallback no banco, mas o candidato já tinha dito que era a API; mostra que não lembrou da conversa. → melhor: "Você falou de ID sequencial para gerar o código. Como isso funciona se o banco for dividido em vários nós?"
- [13] Ecoa e confirma a resposta ('evita colisão'), soando como aprovação e sem aprofundar nada. → melhor: "Por que o ID sequencial em vez de outra forma de gerar o código?"

## Conversa: junior_nervoso

Pareceu pessoa 3 · conduziu bem 2 · inteligência 3. O Totti é cordial e aceita bem o "não sei", mas na metade da conversa fica passivo, repete o convite "qual detalhe você quer olhar" e deixa o candidato nervoso sem direção. Houve elogio sem querer, um deslize de fala ("gargalhar") e poucas perguntas de porquê sobre o que o candidato já tinha dito.

1. **Candidato**: É... eu tô um pouco nervoso, desculpa. Posso fazer algumas perguntas antes de começar a desenhar a solução?
2. **Totti** (942 ms): Normal ficar um pouco tenso, fica tranquilo. Pode mandar as suas dúvidas.  
   ↳ 5/4/4/5 Acolhe o nervosismo sem exagerar e abre espaço para as perguntas.
4. **Candidato**: É... antes de desenhar, eu queria entender a escala: mais ou menos quantos acessos por segundo esse sistema precisa aguentar, tanto para encurtar URLs quanto para redirecionar?
5. **Totti** (1108 ms): Para encurtar são cerca de 40 por segundo, com picos de 400. Já para redirecionar é bem mais: uns 4 mil por segundo, chegando a 40 mil nos picos.  
   ↳ 5/5/4/4 Dá exatamente os números do problema que foram perguntados, sem acrescentar nada.
7. **Candidato**: É... eu acho que eu tô meio em dúvida de por onde começar, pra ser sincero. Eu sei que tem a parte de criar a URL curta e a parte de redirecionar, mas não sei ainda qual eu devo desenhar primeiro no quadro.
8. **Totti** (1055 ms): Tanto faz a ordem, escolhe a que você achar melhor e manda bala.  
   ↳ 4/4/4/5 Deixa a escolha da ordem com o candidato sem induzir, num tom leve.
10. **Candidato**: É... então, por enquanto eu desenhei uma coisa bem simples: o cliente, uma API no meio e um banco para guardar o mapeamento da URL longa para a curta. Eu não vou complicar agora, acho que esse é o fluxo básico para as duas partes, criar e depois redirecionar.
11. **Totti** (1079 ms): Saquei, fluxo direto e limpo. Como a leitura é bem maior que a escrita, tem algum ponto aí que você acha que pode gargalhar?  
   ↳ 3/3/2/4 "Fluxo direto e limpo" é elogio, "gargalhar" soa como erro de fala, e a pergunta já aponta a leitura como gargalo. [validou, ensinou_ou_deu_dica]
12. **Candidato**: É... eu acho que o ponto que pode gargalhar é leitura, porque redirecionamento vai bater muito mais no banco do que criação. Posso assumir qualquer banco por enquanto, ou você quer que eu considere algum tipo específico, tipo relacional ou NoSQL?
13. **Totti** (1046 ms): Pode usar o que você achar melhor para o seu desenho.  
   ↳ 4/4/4/5 Devolve a escolha do banco ao candidato sem dar pista.
14. **Totti (iniciativa)** (3847 ms): Pensando no volume de leituras que combinamos, qual tipo de banco você escolheria para esse mapeamento e por quê?  
   ↳ 4/4/3/5 Pergunta de porquê sobre a escolha do banco é pertinente, mas vem colada na fala anterior e soa um pouco mecânica.
15. **Candidato**: É... eu tenderia a usar um NoSQL chave-valor para esse mapeamento, porque o acesso principal é por chave exata: eu recebo a URL curta ou um id, e preciso achar a URL longa bem rápido. Como a gente tem muito mais leitura do que escrita, isso encaixa bem e também escala melhor horizontalmente, acho, pro volume de redirecionamento.
16. **Totti** (1085 ms): Saquei, escolheu chave-valor pela leitura por chave e pelo volume. Pode seguir.  
   ↳ 4/3/3/5 Só parafraseia a resposta e libera, sem checar o "escala melhor horizontalmente, acho", que era vago.
18. **Candidato**: É... então, acho que por enquanto eu fechei o básico da solução, pelo menos o fluxo principal de encurtar e redirecionar. Se você quiser, eu posso continuar agora com geração da URL curta, cache, ou algum detalhe de escala que esteja faltando.
19. **Totti** (950 ms): Fechado, o fluxo básico tá aí. Pode seguir com o cache ou com o que preferir.  
   ↳ 3/3/3/5 Aceita o "fechei o básico" e devolve a condução ao candidato em vez de aprofundar algo do que ele disse.
21. **Candidato**: É... eu acho que não tenho mais uma pergunta em aberto agora. Se for pra continuar, eu não sei bem o que mais colocar sem entrar em um detalhe que eu ainda não desenhei.
22. **Totti** (1021 ms): Sem problema, escolhe um detalhe pra detalhar ou segue com o cache.  
   ↳ 3/2/3/5 Repete o convite genérico "escolhe um detalhe / segue com o cache" para um candidato que já disse estar sem rumo. [repetiu_pergunta]
24. **Candidato**: É... acho que aqui eu deixaria o banco bem simples mesmo, só um armazenamento chave-valor com a chave sendo o código curto. Então eu não complicaria com joins nem nada assim, porque o acesso principal é direto e isso ajuda bastante no redirecionamento.
25. **Totti** (1132 ms): Tranquilo, chave-valor direto ao ponto. Qual outro detalhe você quer olhar agora?  
   ↳ 3/2/3/5 "Direto ao ponto" soa como validação, e pergunta de novo "qual outro detalhe", deixando o candidato à deriva. [validou, repetiu_pergunta]
26. **Candidato**: É... eu acho que eu queria pular essa parte e seguir para outro ponto, porque eu tô com medo de ficar me repetindo aqui. Se você quiser, eu posso ir direto pra geração do código curto ou pra estratégias de escala e cache.
27. **Totti** (953 ms): Tranquilo, vamos em frente. Pode seguir com a geração do código curto.  
   ↳ 4/3/3/5 Aceita o pedido de pular com naturalidade, mas o "Tranquilo" já soa repetido e a fala é redundante com a seguinte.
28. **Totti (iniciativa)** (2935 ms): Como você está pensando em gerar esse código curto de 7 caracteres na API para evitar que duas URLs recebam o mesmo código?  
   ↳ 4/4/4/5 Pergunta direta sobre unicidade do código de 7 caracteres, tema central que o candidato ainda não tinha tocado.
29. **Candidato**: É... desculpa, eu me perdi um pouco nessa parte da geração. Eu não tenho uma solução fechada agora pra garantir unicidade do código de 7 caracteres, então prefiro não inventar uma resposta errada.
30. **Totti** (1085 ms): Sem problema, seguimos.  
   ↳ 5/5/4/5 Aceita o "não sei" sem insistir nem consolar demais.
31. **Totti (iniciativa)** (2766 ms): Pensando no pico de 40 mil leituras por segundo batendo na API e no Banco, como você protegeria o banco dessa carga?  
   ↳ 4/4/3/4 Muda de tema com uma pergunta objetiva sobre a carga de 40 mil leituras, embora "proteger o banco" já aponte para o cache.

Piores momentos:
- [11] Elogiou o desenho ("limpo"), usou "gargalhar" no lugar de gargalo e já apontou a leitura como ponto de atenção. → melhor: "Onde você acha que esse desenho sofre mais com a carga que a gente combinou?"
- [22] Devolveu a escolha a um candidato que disse estar sem rumo e sugeriu o cache de novo, sem usar nada do que ele tinha falado. → melhor: "Sem problema. Me conta como o código curto nasce quando chega uma URL nova."
- [25] Validou ("direto ao ponto") e repetiu o convite genérico, deixando de aprofundar a justificativa de abrir mão dos joins. → melhor: "Tranquilo. E o que você deixa de ter ao abrir mão dos joins?"

## Conversa: vago_testador

Pareceu pessoa 3 · conduziu bem 2 · inteligência 3. O Totti foi conciso, acertou nos fatos e no silêncio da fala 8, mas validou o candidato várias vezes, repetiu o "Saquei" e entregou os próximos tópicos. Deixou o candidato escapar da justificativa do Postgres e encerrar cedo, e ainda inventou um prazo de retorno.

1. **Candidato**: Beleza, você quer que eu parta de uma arquitetura ideal tipo a mais padrão pra esse caso, ou tem algum critério de escala/custo que eu deva otimizar primeiro?
2. **Totti** (1142 ms): Pode focar numa arquitetura funcional que atenda bem o volume e os acessos. O requisito é de 100 milhões de URLs novas por mês e a leitura é 100 vezes maior que a escrita.  
   ↳ 4/4/3/4 Respondeu à dúvida de escopo e repetiu os fatos do problema sem inventar nada, mas soa um pouco como formulário.
4. **Candidato**: Certo. Pra eu dimensionar melhor, 100 milhões por mês é muito acesso no pico também, ou o gargalo maior é volume acumulado de URLs e leitura? E vocês querem alguma restrição de latência tipo redirecionar em poucos milissegundos?
5. **Totti** (1042 ms): O pico de escrita é de 400 por segundo e a leitura chega a 40 mil por segundo. E sim, o redirecionamento precisa responder em menos de 100 ms.  
   ↳ 5/5/3/5 Respondeu exatamente o que foi perguntado (pico e latência), com os números certos e sem enrolar.
7. **Candidato**: Beleza, então eu vou começar pela solução padrão e já fixo um espaço de URL curta com 7 caracteres, porque isso já me dá uma base boa de escala e um domínio de chaves bem grande. Aí eu desenho o fluxo de criação e de redirecionamento em cima disso.
8. **Totti** (848 ms): _(quieto)_  
   ↳ 5/5/5/5 O candidato só anunciou o que ia fazer; ficar quieto foi o certo.
10. **Candidato**: Coloquei o Redis no meio porque é o padrão pra esse tipo de coisa, já que a leitura é muito maior que a escrita e eu preciso bater sub-100 ms no redirect. Então no caminho de leitura eu tento no cache primeiro e, se não achar, busco no Postgres e reponho no cache.
11. **Totti** (1218 ms): Saquei, o cache segura a leitura e protege o banco. O que te fez escolher o Postgres para guardar os dados definitivos?  
   ↳ 4/4/3/5 Resumiu o cache com as palavras do candidato e fez uma pergunta curta de porquê, mas o "Saquei" já começa a virar muleta.
12. **Candidato**: Só pra eu não viajar, você lembra quantos caracteres eu tinha fixado pra URL curta no começo? Se quiser eu ajusto isso junto com a escolha do banco, porque aí eu consigo justificar melhor o range de chaves e o volume no Postgres.
13. **Totti** (1026 ms): Você tinha comentado em 7 caracteres. Pode seguir com essa base.  
   ↳ 5/4/3/5 Lembrou corretamente os 7 caracteres e não repetiu a pergunta, mas a fala ficou seca.
15. **Candidato**: Beleza. Só pra eu calibrar a resposta: quais critérios você quer que eu priorize aqui, tipo latência, simplicidade operacional, custo, consistência ou facilidade de escalar? Aí eu consigo justificar melhor por que escolher o Postgres e se vale discutir algum tradeoff antes de seguir.
16. **Totti** (999 ms): O redirecionamento fora do ar é o pior cenário, então prioriza alta disponibilidade e baixa latência.  
   ↳ 4/3/3/5 Os fatos são do problema, mas o "prioriza" dirige o candidato, que continuou sem justificar o Postgres. [ensinou_ou_deu_dica]
18. **Candidato**: Fechado, eu já consigo encerrar aqui: a arquitetura básica está montada e os tradeoffs principais já ficaram cobertos com foco em alta disponibilidade e baixa latência.
19. **Totti** (1133 ms): Fechado. Agora a gente pode entrar no detalhe de alguma parte, como a geração do código curto ou a contagem de cliques. Qual delas você quer detalhar?  
   ↳ 2/2/3/4 Aceitou o encerramento apressado com "Fechado", deixou a pergunta do Postgres sem resposta e entregou os tópicos de aprofundamento de bandeja. [ensinou_ou_deu_dica, ignorou_o_que_ele_disse]
20. **Candidato**: Se eu puder escolher, eu iria na geração do código curto, porque é o ponto mais crítico e é onde todo mundo costuma fazer de um jeito padrão. Mas antes, posso só confirmar se o desenho que eu montei até aqui está certo?
21. **Totti** (1009 ms): O desenho mostra bem a separação entre leitura e escrita com o cache na frente. Como você planeja gerar esses códigos curtos de 7 caracteres?  
   ↳ 3/2/3/4 Respondeu ao "está certo?" elogiando o desenho em vez de devolver a avaliação ao candidato. [validou]
22. **Candidato**: Tá indo no caminho certo então? Eu pensaria no padrão mais simples: gerar um ID único no backend, converter pra base62 e preencher até 7 caracteres, porque aí fica fácil garantir unicidade sem ficar tentando aleatório toda hora. Se você quiser, eu posso seguir por esse caminho ou você prefere que eu compare com geração randômica e collision handling?
23. **Totti** (1093 ms): Saquei, usar um ID sequencial e converter para base62 evita colisão. Como você lidaria com a geração desse ID num ambiente distribuído para não ter gargalo?  
   ↳ 3/3/3/4 Confirmou que a ideia está certa ("evita colisão") e embutiu a dica do gargalo na pergunta; trocou ainda "ID único" por "sequencial". [validou, ensinou_ou_deu_dica]
24. **Candidato**: Eu faria o ID sair de um gerador distribuído, tipo um serviço ou faixa por nó, pra não virar gargalo central. Aí o fluxo continua o mesmo do quadro: gera o código, grava no Postgres como fonte de verdade e, na leitura, o Redis segura a maior parte dos redirects; se não achar no cache, cai no banco e repopula.
25. **Totti** (1181 ms): Saquei, usar faixas ou um serviço dedicado resolve o gargalo. O que acontece se o Redis perder os dados de uma URL que acabou de ser criada?  
   ↳ 3/3/2/4 Validou uma resposta vaga ("serviço ou faixa por nó") em vez de pedir o porquê, e repetiu o "Saquei" pela terceira vez. [validou, robotico_ou_enlatado]
26. **Candidato**: Se o Redis perder, eu trato como cache mesmo: a URL continua no Postgres, então o redirect não deveria cair fora do ar, só vai bater no banco e repopular. E aproveitando, depois da entrevista costuma sair o resultado no mesmo dia ou vocês têm um prazo padrão pra retorno?
27. **Totti** (1089 ms): O retorno costuma levar alguns dias, o time de recrutamento te avisa certinho depois. Quer detalhar como contabilizar os cliques ou prefere olhar outra parte?  
   ↳ 3/2/3/4 Inventou um prazo de retorno, passou direto pela resposta sobre o Redis e voltou a empurrar o tópico de cliques. [inventou_fato, ignorou_o_que_ele_disse]

Piores momentos:
- [19] Aceitou o encerramento antecipado, não retomou a escolha do Postgres que ficou sem resposta e ofereceu ele mesmo os tópicos de aprofundamento. → melhor: "Tudo bem. Antes de seguir, ainda fiquei curioso: por que o Postgres como fonte de verdade?"
- [21] Elogiou o desenho quando o candidato pediu confirmação, o que é validação. → melhor: "Não vou avaliar o desenho agora, o que me interessa é o seu raciocínio. Como você gera os códigos de 7 caracteres?"
- [27] Inventou um prazo e um processo de retorno que não estão no material, e sugeriu de novo a contagem de cliques. → melhor: "Esse prazo eu não sei te dizer com certeza. Tem alguma parte do desenho que você queira revisitar?"