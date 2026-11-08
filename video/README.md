# Vídeo de demonstração (2 min, 4 partes de 30 s)

Cada parte é um HTML autocontido, palco 1920×1080, exatamente 30 s.

| Parte | Trecho | Arquivo |
|---|---|---|
| 3 | 1:00–1:30 | `parte-3.html` (pendente) |
| 4 | 1:30–2:00 · retorno ao candidato e fecho | `parte-4.html` |

## Como ver
- Prévia em tempo real: abrir `parte-4.html?play` no navegador (clique recomeça).
- Ir direto a um instante: `parte-4.html?t=13.4`.

## Como renderizar quadro a quadro (30 fps)
Cada arquivo expõe `window.ready` (fontes carregadas) e `window.seek(t)`, com t de 0 a 30, determinístico.
Com um navegador headless em 1920×1080: aguardar `window.ready`, e para cada quadro `i` de 0 a 899 chamar `seek(i/30)` e tirar o screenshot.
