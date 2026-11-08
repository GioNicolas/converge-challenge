# Integração de voz

Branch: `henrique-giorgio/voz-integrada`, baseada em `origin/sofia/coding-transcricao` (`fd9ff33`), que já contém a main usada nesta revisão. Preserva a IDE atual, convites, histórico da conversa, fila de falas da Sofia e limites do token.

| Fluxo | Transcrição | Resposta por voz |
| --- | --- | --- |
| Criação da vaga | Descrição e contexto; revisar antes de enviar | Não lê os campos da pessoa |
| Conversa com Totti | Ditado revisável, junto dos anexos/texto existentes | Últimas falas novas; polling não repete áudio |
| Entrevista de código | Contínua: na conversa envia respostas; fora dela registra o raciocínio | Respostas e despedida com legenda; a barra espera o áudio terminar |
| Entrevista no quadro | Contínua, encaminhada à conversa da sessão | Mantém voz, legenda e movimentos; permite silenciar/interromper |
| Páginas de desenvolvimento | Mesmos componentes de entrada | Mesma saída de voz |

Na IDE a captura pausa enquanto o agente prepara/reproduz a voz. No quadro, a síntese prepara o áudio com a escuta ativa e confere o turno novamente antes de reproduzir; a captura pausa durante a reprodução. Nos formulários, iniciar o microfone interrompe a reprodução. Ocultar a aba pausa a escuta; desmontar/encerrar cancela filas e invalida respostas atrasadas. No quadro, falhas de envio conservam a fala e as seguintes para tentar novamente em ordem.

## Conversa no quadro

A abertura explica que o candidato pode avisar quando concluir uma etapa ou pedir um comentário sobre o desenho. Todas as falas, inclusive respostas às perguntas do agente, usam o loop rápido com o grafo atual, os requisitos combinados e a pergunta ativa. Pedidos de feedback recebem observações neutras e, quando pertinente, uma pergunta sobre o que está visível; notas, critérios internos e solução pronta continuam reservados ao processo de avaliação.

Uma pergunta escolhida pela análise pode ser falada numa pausa de pelo menos 900 ms, sem clique obrigatório. Transcrição parcial, som de fala, resposta em andamento e áudio sendo preparado/reproduzido adiam a intervenção. A análise que ficou desatualizada por uma nova fala não inicia uma pergunta. O botão de demonstração continua manual. O Scribe finaliza os trechos após 0,9 s de silêncio, em vez de 1,5 s, conforme o parâmetro [VAD da ElevenLabs](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies). Esse valor controla a detecção de pausa; não garante o tempo total de resposta do LLM e TTS.

O teste adicional `npx tsx --env-file-if-exists=.env.local scripts/validar-conversa.ts` usa o LLM real com seis situações sintéticas. Usa créditos, imprime somente respostas e tempos e verifica intenção de resposta/conclusão da etapa. O teste de navegador cobre intervenção automática, contexto da pergunta ativa e uma continuação parcial que impede a reprodução da resposta pronta.

## Mão e desenhos do agente

O campo opcional `visual` aceita composições de até cinco ações: apontar, sublinhar, circular, enquadrar, colchetes, percorrer, comparar, anotar e traço livre. O modelo escolhe as ações em `/analisar` e também nas respostas de `/perguntar`, na mesma chamada que prepara a fala. Os traços livres usam pontos relativos à região de um elemento; o navegador resolve as coordenadas reais. `visual: []` permite conversar sem acrescentar tinta.

O histórico da sala evita repetir a mesma marca no mesmo alvo e informa os gestos recentes ao modelo. Respostas antigas sem esse campo usam gestos variados de apoio; um quadro sem alvo não recebe círculos ou caixas decorativas. Notas procuram espaço livre, e percorrer um fluxo só move o cursor, sem criar conexões técnicas. Ações com IDs inexistentes e planos inválidos são descartados sem perder a resposta falada. As marcas ficam em grupos temporários do agente e não alteram os elementos do candidato.

O teste de navegador verifica colchetes com nota, um traço definido pelo modelo, uma resposta sem desenho e a preservação do desenho original. O smoke test real também exige um plano válido quando o candidato pede explicitamente um destaque.

Ao encerrar o quadro, câmera, microfone e conexão de transcrição são liberados imediatamente. O teste de navegador confirma que as trilhas de mídia terminam.

O merge preserva a revisão atual do plano e o fluxo atual do quadro; não restaura a IDE antiga.

## Configuração após o merge

```dotenv
# Somente no servidor; mesma chave para entrada e saída.
ELEVENLABS_API_KEY=
# Opcionais; padrão Fernando - Casual e eleven_multilingual_v2.
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=
# Fluxos reais da pré-entrevista e do quadro.
NEXT_PUBLIC_USAR_SERVIDOR=1
```

A chave local está em `.env.local`, ignorado pelo Git. Merge/push não transporta credenciais: configure a variável também na hospedagem. Os agentes continuam exigindo as chaves de LLM já usadas pelo projeto; ElevenLabs não as substitui.

O token da captura contínua exige sessão real e aceita `contexto=coding` (padrão) ou `contexto=quadro`. Sessões encerradas são recusadas. As rotas de voz/transcrição de formulário têm limites por IP e globais e não armazenam áudio no servidor.

Sem chave, o ditado revisável usa reconhecimento do navegador quando disponível; a escuta contínua recorre a ele quando o Scribe fica indisponível. A síntese também pode usar o navegador. Permissão do microfone, reprodução automática e vozes disponíveis dependem do navegador.

## Verificação

```sh
npm run test:voz
npm run test:transcricao
npm run test:rotas
npx tsx --test lib/presenca/tests/vozSincronizada.test.ts lib/sessao/__testes__/*.test.ts
npm run test:e2e:voz
npm run build
```

O teste de navegador usa provedores falsos e áudio fictício. Cobre ditado da vaga/Totti, resposta contínua do candidato, espera pela despedida e encaminhamento da fala no quadro. Não grava nem transmite o microfone real de quem executa o teste.

O smoke test externo é separado e explícito:

```sh
npm run voz:validar
```

Exige FFmpeg e chave válida, gera uma frase sintética pelo TTS e a envia ao Scribe Realtime pelo adaptador do ditado. Usa créditos e não imprime chaves/tokens. No teste real, a frase ‘Olá. Vamos conversar sobre a solução em português.’ voltou como ‘Olá, vamos conversar sobre a solução em português.’. A duração inclui envio do áudio e silêncio de finalização; não mede a latência isolada do modelo.

Ainda cabe uma passagem com microfone/fone reais para avaliar sotaque, termos técnicos, ruído e conforto. A entrada da recrutadora continua revisável; envio automático está aplicado às entrevistas do candidato.
