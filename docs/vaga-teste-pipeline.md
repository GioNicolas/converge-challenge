# Vaga de teste do pipeline (colar no Totti)

Para testar de ponta a ponta: `/vagas/nova` → colar → combinar com o Totti → publicar → "Ver como o candidato vê" → entrevista → relatório no painel da vaga.
O domínio (Pix, conciliação, idempotência) é bem marcado de propósito: se o agente do live coding estiver lendo a vaga, ele puxa esses assuntos nas perguntas.

## Cargo

Desenvolvedor(a) Backend Python Júnior — Conciliação Pix

## Descrição

Somos o time de Conciliação da Fluxa, uma fintech que processa cerca de 2 milhões de transações Pix por dia para lojistas de médio porte. Nosso trabalho é garantir que cada centavo que entra pelo Pix bata com o que o lojista vê no extrato — quando não bate, somos nós que descobrimos por quê.

Responsabilidades:
- Escrever e manter serviços em Python que cruzam os eventos do Pix (recebimentos, devoluções, estornos) com os registros do nosso livro-razão
- Tratar duplicidade e reprocessamento: o mesmo evento pode chegar duas vezes e não pode ser contado em dobro (idempotência)
- Investigar divergências de conciliação com dados reais e escrever testes que reproduzam o problema antes de corrigir
- Revisar código com o time e explicar suas decisões nos PRs

Requisitos:
- Python no dia a dia (listas, dicionários, funções, testes com pytest)
- Lógica sólida com estruturas de dados: saber quando um dicionário resolve em O(n) o que um laço duplo faz em O(n²)
- Noção de SQL básico
- Comunicar o raciocínio com clareza, inclusive quando trava

Diferenciais:
- Já ter lidado com pagamentos, filas ou processamento de eventos
- Usar IA no fluxo de trabalho com senso crítico (sabe revisar e explicar o que a IA gerou)

## Contexto para o Totti (falar na conversa)

- Time pequeno (4 pessoas), a pessoa precisa de autonomia e de pedir ajuda cedo quando trava
- Quero entrevista de código ao vivo, em Python, uns 40 minutos
- O que mais pesa: lógica e corretude; depois, como reage quando um teste falha
- Tom desafiador: pedir justificativa das escolhas, sem aliviar
- No máximo uma dica leve
