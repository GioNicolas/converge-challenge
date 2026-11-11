# Roteiro de medição da transcrição (#75)

Grave cada frase num arquivo (`01.m4a`, `02.wav`...) e crie ao lado um `.txt` com o mesmo nome:
a 1ª linha é a frase exata; a linha `termos:` lista o que precisa sair certo. Depois:

    npm run transcricao:medir -- --pago

O script transcreve cada frase sem e com vocabulário (keyterms) e mostra a WER e os termos certos.

| # | Frase | termos |
|---|---|---|
| 01 | Acho que é tudo bem ele ir direto pra solução. | solução |
| 02 | Eu usaria um dicionário de pares pra guardar o complemento. | dicionário de pares, complemento |
| 03 | Totti, terminei o código. | Totti, código |
| 04 | O que tu acha? | |
| 05 | Sim. | |
| 06 | No horário de pico a gente coloca um balanceador na frente. | horário de pico, balanceador |
| 07 | Os eventos vão pro Kafka e o consumidor grava no banco. | Kafka, consumidor |
| 08 | É um two sum com hash map, complexidade O de n. | two sum, hash map, complexidade |
| 09 | Dá pra resolver com uma pilha. | pilha |
| 10 | A vaga é de backend pleno, entrevista de system design. | backend, pleno, system design |

Grave também 5 minutos de ruído de fundo sem fala (ventilador, TV baixa, rua) para conferir
nas salas que nenhuma frase chega ao Totti.
