# Design: direção visual (Sofia + Giorgio)

> Proposta para o time de design discutir. Nada aqui é código ainda.
> Quando fecharmos, os valores viram tokens em `app/globals.css` e todo componente usa só esses tokens.

## 1. A ideia em uma frase

**Clean, no estilo Apple:** muito espaço em branco, poucas cores, tipografia do sistema, vidro fosco nas camadas flutuantes e animações fluidas em tudo que tem movimento. O quadro (Excalidraw) é o protagonista; o resto fica discreto, nos cantos.

## 2. Princípios

1. **O conteúdo manda.** O quadro ocupa a tela. Painéis, janela de chamada e legenda flutuam por cima, pequenos e recolhíveis.
2. **Uma cor de destaque só.** O azul é do agente e das ações principais. O resto é cinza e branco.
3. **Hierarquia por peso e tamanho**, não por cor: títulos semibold com tracking negativo, texto secundário em cinza médio.
4. **Vidro, não caixa.** Camadas flutuantes com fundo translúcido e desfoque (`backdrop-blur`), borda finíssima e sombra suave e longa.
5. **Movimento com propósito.** Toda transição tem curva suave e duração curta. Nada pisca nem pula sem motivo. Respeitar `prefers-reduced-motion`.
6. **Consistência entre nós dois:** nenhuma cor, raio, sombra ou duração solta nos componentes. Tudo sai dos tokens (seção 7).

## 3. Paleta (proposta)

| Token | Valor | Uso |
|---|---|---|
| `fundo` | `#F5F5F7` | Fundo da página |
| `superficie` | `#FFFFFF` | Cards e o quadro |
| `superficie-2` | `#F0F0F2` | Fundos sutis, skeletons, itens inativos |
| `vidro` | `rgb(255 255 255 / 0.72)` + blur | Painéis claros flutuantes |
| `vidro-escuro` | `rgb(28 28 30 / 0.72)` + blur | Janela de chamada e pílula minimizada |
| `borda` | `rgb(0 0 0 / 0.08)` | Bordas finas |
| `texto` | `#1D1D1F` | Texto principal |
| `texto-suave` | `#6E6E73` | Texto secundário |
| `texto-claro` | `#F5F5F7` | Texto sobre o vidro escuro |
| `marca` / `agente` | `#0071E3` | Ações principais, orb, cursor e anotações do agente |
| `marca-suave` | `#E8F1FC` | Chips e fundos do agente |
| `sucesso` | `#34C759` | Microfone ativo, requisito confirmado |
| `alerta` | `#FF9F0A` | Avisos ("reconectando microfone") |
| `perigo` | `#FF3B30` | "Encerrar" e erros |

**Ponto para decidir:** modo escuro. Proposta: só modo claro no hackathon. O quadro já é claro, e a janela de chamada escura dá o contraste.

## 4. Tipografia

- **Fonte:** a do sistema (`-apple-system`, SF Pro no Mac), com **Inter** de reserva no Windows e no Linux.
- **Títulos:** semibold (600), tracking `-0.02em`.
- **Corpo:** 15–16px, line-height 1.5.
- **Labels pequenas:** 12px, medium, cinza (`texto-suave`).
- **Números** (tempo, contadores): `tabular-nums`, para não "dançar".

## 5. Forma

- **Raios:** 18px (cards e janela de chamada), 10px (botões e inputs) e pílula (`rounded-full`) para chips, status e a janela minimizada.
- **Sombras:** suaves e longas, nunca duras. Uma para cards e outra mais forte para o que flutua.
- **Ícones:** traço fino, estilo SF Symbols. Sugestão: Lucide, com `strokeWidth` 1.75.

## 6. Movimento

| Token | Valor | Uso |
|---|---|---|
| `curva-suave` | `cubic-bezier(0.32, 0.72, 0, 1)` | Padrão de entrada, abrir e fechar (a curva das folhas do iOS) |
| `curva-saida` | `cubic-bezier(0.22, 1, 0.36, 1)` | Saídas e esmaecer |
| `duracao-rapida` | 160ms | Hover, toque em botão |
| `duracao` | 280ms | Abrir, fechar e trocar estado |
| `duracao-lenta` | 480ms | Grandes movimentos (minimizar a janela, a tela deslizando) |
| Mola | `stiffness 400, damping 32` | Arrastar e soltar a janela, encaixar no canto |

- **Biblioteca sugerida:** `motion` (o antigo Framer Motion), para arrastar, molas e as animações de layout (janela → pílula).
- **Entradas:** fade + subida curta (8–12px) e leve escala (0.98 → 1).
- **Nunca** animar largura ou altura direto: usar `transform` e `opacity`, para manter 60 fps por cima do quadro.

## 7. Como os tokens ficam no código

- Variáveis CSS em `:root` (`app/globals.css`), expostas no tema do Tailwind v4 (`@theme inline`).
- Nos componentes, só classes de token: `bg-superficie`, `text-texto-suave`, `rounded-padrao`, `shadow-flutuante`, `ease-suave`...
- Mudou a identidade? Muda **só** o `globals.css`.

## 8. As peças da sala de entrevista

### 8.1 Layout geral
- O quadro em tela cheia, dentro de um card branco com 12px de margem e raio de 18px.
- **Painel do problema:** card de vidro no canto superior esquerdo, com título, enunciado, fase (chip) e tempo. Recolhe para uma pílula.
- **Janela de chamada:** canto inferior direito.
- **Legenda:** centralizada embaixo, em vidro escuro, com no máximo 2 linhas.
- **Quadro de requisitos:** canto superior direito, entrando item a item.

### 8.2 Janela de chamada (o "quadradinho do Meet")
O objetivo é que a pessoa entenda na hora que está numa chamada.
- **Tamanho:** ~300×200, em vidro escuro, raio de 18px e sombra flutuante.
- **Dois quadros lado a lado** (ou o do agente grande e o do candidato pequeno no canto, como no FaceTime):
  - o **agente**, com o orb no centro e o nome embaixo;
  - o **candidato**, com a câmera dele espelhada. A câmera **só aparece na tela dele**: não é enviada, gravada nem analisada.
- **Barra de cima:** ponto verde "ao vivo" e o tempo da entrevista.
- **Barra de baixo:** botões redondos para microfone, câmera, minimizar e **Encerrar** (vermelho, em pílula).
- **Arrastar:** a janela se solta e encaixa no canto mais próximo, com mola.
- **Minimizar:** encolhe para uma **pílula** (orb + tempo + indicador do microfone), com animação de layout. Clicar na pílula devolve a janela.

### 8.3 O orb (o agente)
Esfera com gradiente suave em azul, viva e discreta.

| Estado | Como aparece |
|---|---|
| Ocioso | Respira devagar (escala 1 → 1.03, em 4s) |
| Ouvindo | Anel fino reagindo ao volume do microfone |
| Pensando | Brilho girando devagar por dentro |
| Falando | Pulsa no ritmo da voz |
| Com dúvida (o plin) | Pulso mais forte e um halo azul crescendo, até o candidato clicar |

#### Onda de voz e carregando: o mesmo anel em todo lugar
O Totti aparece como um anel "desenhado à mão", com as mesmas imperfeições em qualquer tamanho. A forma mora em
`lib/presenca/anel.ts` (`ondulacao`, `tracarAnel`); mudou ali, muda em todos.

- **Na chamada / avatar:** `<OndaDeVoz estado={...} tamanho="md" />` (`components/agente/OndaDeVoz.tsx`). No "pensando",
  o arco claro percorre o anel em cima das ondas, não num círculo perfeito. `fundo="claro"` no papel.
- **Qualquer carregamento:** `<CarregandoTotti />` (`components/agente/CarregandoTotti.tsx`), no lugar de
  `Loader2`/`LoaderCircle` + `animate-spin`. A cor vem do texto em volta (`currentColor`); `rotulo={false}` quando o lugar
  já diz o que está acontecendo (botão "Enviando…"); `brilho` no fundo escuro.

| Tamanho | px | Onde |
|---|---|---|
| `xs` | 16 | dentro de texto ou de botão |
| `sm` | 24 | ao lado de um rótulo, linha de lista, chip |
| `md` | 32 | avatar: pílula minimizada da chamada, bolha de conversa |
| `lg` | 72 | destaque numa página ou cartão vazio ("lendo a vaga…") |
| `xl` | 124 | quadro principal da chamada |

Vitrine com todos os tamanhos, no papel e no escuro: `/dev/agente`.

### 8.4 A mão do agente (anotações no quadro)
- **Cursor do agente:** seta azul com uma etiqueta pequena com o nome do agente, como um colaborador do Figma. Anda em curva, com aceleração e desaceleração.
- **Desenhos e nota:** em azul `marca`, traço "à mão" (o próprio estilo do Excalidraw):
  - o círculo é desenhado aos poucos;
  - a seta cresce;
  - a nota aparece letra a letra.
- **Depois que o candidato responde,** a anotação esmaece para 35% de opacidade e fica no quadro como histórico.

### 8.5 Legenda e conversa
- **Legenda ao vivo:** o texto do agente em branco; o do candidato em cinza claro, com a parte ainda parcial mais fraca.
- **Painel de conversa** (abre ao clicar no orb): lista simples, sem balões coloridos. Nome pequeno em cima e texto embaixo.

## 9. Para combinar entre nós

1. **A paleta acima (azul como cor do agente), ou outra cor?**
2. **A janela de chamada:** dois quadros lado a lado, ou estilo FaceTime (o agente grande e o candidato pequeno)?
3. **Quem faz qual peça.** Sugestão:
   - **Giorgio:** a janela de chamada, a pílula e a mão do agente (que já se ligam à lógica do quadro);
   - **Sofia:** o painel do problema, o quadro de requisitos, a legenda, o painel de conversa e o refinamento visual do orb.
4. **Modo escuro:** fica fora do hackathon?
