# Integração de voz

Branch: `henrique-giorgio/voz-integrada`, baseada em `origin/sofia/coding-transcricao` (`fd9ff33`), que já contém a main usada nesta revisão. Preserva a IDE atual, convites, histórico da conversa, fila de falas da Sofia e limites do token.

| Fluxo | Transcrição | Resposta por voz |
| --- | --- | --- |
| Criação da vaga | Descrição e contexto; revisar antes de enviar | Não lê os campos da pessoa |
| Conversa com Totti | Ditado revisável, junto dos anexos/texto existentes | Últimas falas novas; polling não repete áudio |
| Entrevista de código | Contínua: na conversa envia respostas; fora dela registra o raciocínio | Respostas e despedida com legenda; a barra espera o áudio terminar |
| Entrevista no quadro | Contínua, encaminhada à conversa da sessão | Mantém voz, legenda e movimentos; permite silenciar/interromper |
| Páginas de desenvolvimento | Mesmos componentes de entrada | Mesma saída de voz |

Na IDE e no quadro a captura pausa enquanto o agente prepara/reproduz a voz. Nos formulários, iniciar o microfone interrompe a reprodução. Ocultar a aba pausa a escuta; desmontar/encerrar cancela filas e invalida respostas atrasadas. No quadro, falhas de envio conservam a fala e as seguintes para tentar novamente em ordem.

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
