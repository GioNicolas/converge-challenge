# Tako — Design System (referência para o agente)

> Extraído de **tako.ai** em 07/11/2026, a partir do CSS de produção (Next.js + Tailwind v4 + shadcn/ui) e do HTML das páginas:
> Home, Tako Payroll (`/products/payroll`), Tako Recruiter (`/products/recruiting`), Tako Benefits (`/tako-benefits`), Sobre (`/about`) e a versão "Máquina" (`/machine`).
> Os valores abaixo são os tokens e classes que o site usa de verdade, com a contagem de uso quando ela ajuda a saber o que é dominante.
> Os valores marcados como **(renderizado)** foram conferidos com `getComputedStyle` no navegador.

---

## 1. Essência visual

- **Editorial, quente e escuro.** O site alterna seções **creme (`#EEEBE7`)** e **quase-preto (`#0D0D0D`)**. Nada de branco puro nem de preto puro como base.
- **Um único acento forte: laranja Tako (`#FF5E00`).** Ele aparece em pontos: CTA principal, cursor, bolinhas de status, ícone do agente e glows. Nunca em áreas grandes.
- **Títulos em serifa variável (PP Eiko)** com peso 400/500 e tracking apertado. O corpo do texto vai em sans geométrica (Plus Jakarta Sans).
- **Hierarquia por opacidade, não por cor.** Textos secundários são o próprio creme ou o próprio preto com alpha (`/85`, `/60`, `/45`, `/30`).
- **Bordas finíssimas em alpha** (`#EEEBE7` a 8–12%) em vez de cinzas sólidos.
- **Formas:** botões em pílula (`rounded-full`), cards com `rounded-2xl` e mockups grandes com `rounded-[28px]`.
- **Movimento discreto:** fade + subida de 20–30px, pulsos suaves e marquees lentos.
- **Heroes com gradiente líquido animado (shader WebGL com grão)**, nunca com foto. É o elemento mais marcante do site (seção 5).

---

## 2. Tipografia

| Papel | Família | Origem | Pesos | Uso |
|---|---|---|---|---|
| **Títulos** (h1–h6, `.font-title`) | **PP Eiko** (variável, com itálico) | Pangram Pangram (licença comercial) | 100–900. O site usa **400 no h1** e **500 no h2/h3** | Headlines, títulos de seção, números de destaque |
| **Corpo / UI** (`font-sans`, default) | **Plus Jakarta Sans** (variável) | Google Fonts (gratuita) | 300–700 | Parágrafos, botões, labels, UI do produto |
| Secundária (carregada) | Satoshi (variável) | Fontshare (gratuita) | 300–900 | Uso pontual |
| Mono | `ui-monospace, SFMono-Regular, Menlo…` | sistema | — | Dados, código, IDs |
| App/painel (shadcn) | Geist / Geist Mono | Vercel | 100–900 | Componentes base do painel |

**Fallbacks:** sem licença da PP Eiko, use **Fraunces**, **Newsreader** ou **Instrument Serif** (Google Fonts), com peso 400–500 e `letter-spacing: -0.025em`.

### Escala aplicada

| Elemento | Classes reais | Valor |
|---|---|---|
| H1 hero | `text-4xl sm:text-5xl lg:text-[56px]` até `xl:text-[84px]`, `leading-[1.05] font-normal tracking-tight text-balance` | 36 → 56–84px, line-height 1.05, tracking −0.025em. **(renderizado)** 56px, peso 500, letter-spacing −1.4px, line-height 58.8px |
| Nav do header | Plus Jakarta | **(renderizado)** 12px, peso **300** (light) |
| H2 seção | `text-3xl md:text-4xl font-medium tracking-tight` ou `text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05]` | 30 → 36–52px |
| Lead/parágrafo hero | `text-base sm:text-lg leading-normal text-[#0D0D0D]/70` | 16–18px, lh 1.5 |
| Eyebrow / label de seção | `text-xs font-medium tracking-wide uppercase text-orange-dark` | 12px, uppercase, +0.025em, laranja escuro |
| Métrica grande | `text-4xl font-light tracking-tight` | 36px, peso 300 |
| Botão | `text-sm font-medium` | 14px / 500 |
| UI densa (mock do agente) | `text-[12px]`, `text-[11px]`, `text-[10.5px]`, `text-[10px]`, `text-[9px] uppercase tracking-wide` | Micro-tipografia para os painéis do produto |

Tracking: `tight -0.025em` em títulos, `wide 0.025em` em labels uppercase e `0.18em` em micro-labels espaçadas.

---

## 3. Cores

### 3.1 Paleta núcleo

| Token | Hex | Papel | Uso (aprox.) |
|---|---|---|---|
| `--tako-ink` | **`#0D0D0D`** | Fundo escuro principal e texto sobre creme | ★★★★★ |
| `--tako-cream` | **`#EEEBE7`** | Fundo claro principal e texto sobre escuro (foreground) | ★★★★★ |
| `--tako-orange` | **`#FF5E00`** | Acento da marca: CTA, ring/focus, chart-1, ícone do agente | ★★★★ |
| `--tako-orange-dark` | `#E13E00` | Eyebrows, slider, hover forte | ★★ |
| `--tako-orange-hot` | `#FF4802` | Estados ativos e progresso (Home) | ★★ |
| `--tako-orange-deep` | `#C23500` / `#B33100` / `#D33A00` | Texto laranja **sobre creme** (contraste AA) | ★★ |
| `--tako-orange-soft` | `#FF7A42` / `#FFA275` | Pontas claras de gradiente | ★ |

### 3.2 Superfícies escuras (em camadas)

| Hex | Uso |
|---|---|
| `#080808` | Barra de título e sidebar de janelas/mocks |
| `#0D0D0D` | Fundo de página/seção |
| `#0F0F0F` | Corpo de janela de app (mock do agente) |
| `#141414` | Cards flutuantes e painéis secundários |
| `#1A1A1A` | `--card` / `--popover` (shadcn) |
| `#2A2A2A` | `--muted`, `--border`, `--input` sólidos |

Superfícies **quentes** usadas em gradientes de cards: `#33291F → #1E1915`, `#30271F → #1B1714`, `#2A231E → #16130F` e `#1B1613 → #121110 → #0D0D0D` (160°).

### 3.3 Superfícies claras

| Hex | Uso |
|---|---|
| `#EEEBE7` | Seção clara padrão |
| `#F7F5F2` | Cards sobre creme (Benefits) |
| `#FFFFFF` | Raro: uma seção `bg-white` e botões do menu mobile |

### 3.4 Cores de produto e apoio

| Hex | Onde | Papel |
|---|---|---|
| `#FE6DF2` (rosa) | Payroll e Recruiter | Métricas de destaque (`NPS +94`), badge "Revisar" e glow secundário a 5% |
| `#2C84FC` (azul) | Payroll, Benefits, Sobre | `--secondary` e `chart-2` |
| `#25D366` | Todas | **Somente** o botão WhatsApp (borda de 2px) |
| `#FCBB00` / `#F99C00` | Charts | `chart-4` / `chart-5` |
| `#E40014` / `#F87171` | — | Destrutivo / erro |

### 3.5 Escala de opacidade (o "cinza" da Tako)

Sobre fundo escuro, o texto é `#EEEBE7` com alpha:

| Alpha | Uso |
|---|---|
| 100% | Títulos e texto principal |
| `/90` `/85` | Corpo de leitura e mensagens do chat |
| `/80` `/70` `/65` | Texto secundário e listas |
| `/60` `/55` `/50` | Meta, legendas e chips |
| `/45` `/40` `/35` | Itens inativos, placeholders e hints |
| `/30` `/25` | Micro-labels uppercase e dots inativos |

Para bordas use `#EEEBE7` a `/8`, `/10` (padrão), `/12`, `/15`, `/20`, `/25` (botão outline) e `/30`. Para fundos sutis, `/[0.03]`, `/[0.04]`, `/[0.06]` (item ativo) e `/10`.

Sobre creme vale o espelho: `#0D0D0D` com `/80 /70 /65 /60 /55 /50 /45 /40`, bordas `/8 /10 /12 /14 /15` e ring `/8`.

---

## 4. Raio, espaçamento e layout

- `--radius: 0.625rem` (10px), base do shadcn.
- **Mapa de uso:** `rounded-full` (454×, botões, pills, dots e avatares) › `rounded-2xl` (cards e janelas) › `rounded-lg`/`rounded-md` (itens de lista e inputs) › `rounded-[28px]` (mockups e cards hero) › `rounded-xl` (composer e cards flutuantes) › `rounded-[46px]` (moldura de celular).
- **Container:** `max-w-6xl` (72rem) com `px-6 md:px-10`.
- **Ritmo vertical:** seções com `py-24`, e faixas de logos/estatísticas com `py-16`.
- **Hero:** `pt-32 md:pt-36` e grid `lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] gap-12`, com texto à esquerda e mock do produto à direita.
- **Barra de anúncio** no topo: 36px de altura, `bg #E13E00`, texto `#0D0D0D` em 11px, link com seta "→" e um "×" para fechar.
- **Header (renderizado):** `fixed h-20 px-6`, posicionado a `top: 2.25rem`, logo abaixo da barra de anúncio. Fica transparente sobre o hero.
  - Ao rolar, passa para `background: rgba(13,13,13,.95)` com `backdrop-filter: blur(8px)`.
  - Animação: `top` em 0.35s com ease `[.4,0,.2,1]` e delay de 0.1s; `background` em 0.2s easeOut.
  - Nav central (`lg:absolute lg:left-1/2 -translate-x-1/2`) com dropdowns. Abrir um menu escurece a página com `bg-black/20`.
  - À direita, em ordem: Login, botão WhatsApp e "Agendar Demo" em pílula outline.

---

## 5. Efeitos

### Sombras (sempre longas, difusas e com spread negativo)
```css
--shadow-window:   0 30px 80px -30px rgba(0,0,0,.70);
--shadow-deep:     0 40px 70px -10px rgba(0,0,0,.70);
--shadow-hero:     0 70px 120px -10px rgba(0,0,0,.85);
--shadow-card:     0 18px 30px -10px rgba(0,0,0,.70);
--shadow-on-cream: 0 30px 80px -30px rgba(13,13,13,.35);  /* mock escuro sobre creme */
--shadow-glow:     0 14px 50px -20px rgba(255,94,0,.45);  /* glow laranja sob CTA/card */
--shadow-focus:    0 0 0 4px rgba(255,72,2,.30);          /* anel de foco/ativo */
--shadow-edge:     0 0 0 1px rgba(255,122,66,.35), 0 50px 90px -20px rgba(0,0,0,.8);
--shadow-inset-hi: inset 0 1px 0 0 rgba(255,255,255,.6);  /* brilho no topo de botões claros */
```
Os elementos flutuantes usam `shadow-2xl shadow-black/40` ou `/50`.

### Gradientes
```css
--grad-orange:   linear-gradient(135deg, #FF7A42, #D33A00);           /* ícones/avatares */
--grad-orange-x: linear-gradient(90deg, #FFA275, #FF4802 60%, #D33A00); /* barras/progresso */
--grad-pink-x:   linear-gradient(90deg, #FF9CF7, #FE6DF2 55%, #D94BCF);
--grad-warm-card:linear-gradient(135deg, #33291F, #1E1915);
--grad-hero-dark:linear-gradient(160deg, #1B1613 0%, #121110 50%, #0D0D0D 100%);
--grad-glass:    linear-gradient(rgba(238,235,231,.3), rgba(238,235,231,.05));
/* barra de progresso com valor */
background: linear-gradient(90deg, #FF4802 0, #FF4802 var(--p), rgba(238,235,231,.16) var(--p));
```

### Fundos de hero animados: assinatura visual nº 1
Os heroes **não usam imagem**. São shaders WebGL animados com o `MeshGradient` do **`@paper-design/shaders-react`**, com grão de filme por cima. É isso que dá o aspecto de gradiente "líquido" com textura.

```tsx
import { MeshGradient } from "@paper-design/shaders-react";

// Home: hero claro e seção #demo (pêssego/lilás quase branco)
<MeshGradient colors={["#FFFFFF", "#FFC9A6", "#F3DCEF"]}
  distortion={0.8} swirl={0.1} grainMixer={0.04} grainOverlay={0.06} speed={0.4} />

// Recruiter: hero vibrante (rosa → laranja), texto escuro por cima
<MeshGradient colors={["#fe6cf2", "#ff5e00"]}
  distortion={0.8} swirl={0.1} grainMixer={0.02} grainOverlay={0.08} speed={1} />

// Payroll: creme neutro
<MeshGradient colors={["#ffffff", "#e7dbd0"]}
  distortion={0.8} swirl={0.1} grainMixer={0.05} grainOverlay={0.075} speed={1} />

// Benefits: creme pêssego
<MeshGradient colors={["#ffffff", "#e9dfd5", "#f3d9c6"]}
  distortion={0.8} swirl={0.1} grainMixer={0.05} grainOverlay={0.075} speed={1} />
```

- O shader fica em `absolute inset-0 z-0` dentro de `section.relative.isolate.overflow-hidden`, e o conteúdo vai em `relative z-10`.
- `speed` vira 0 com `prefers-reduced-motion`. No código deles: `speed: .4 * !reduced`.
- O mock escuro do produto fica **sobre** o gradiente claro, e esse contraste é o que chama atenção.
- Sem WebGL, faça o fallback com um `radial-gradient` das mesmas cores e um SVG de ruído (`feTurbulence`) a ~6% de opacidade.

### Vidro claro sobre o shader (card da seção Demo)
```html
<div class="rounded-3xl border border-white/60 bg-white/45 p-8 backdrop-blur-2xl
            shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">…</div>
```

### Glows ambientes (atrás de seções escuras)
```html
<div class="absolute top-1/4 -right-20 size-[420px] rounded-full bg-[#FF5E00]/12 blur-[130px]"></div>
<div class="absolute -bottom-24 -left-24 size-[340px] rounded-full bg-[#FE6DF2]/[0.05] blur-[150px]"></div>
```

### Vidro
`backdrop-blur-sm` (8px) em overlays, e `backdrop-blur-2xl` (40px) com `backdrop-saturate-150` em header e menus.

### Fade de borda em marquee
Use `bg-linear-to-r from-[#0D0D0D] to-transparent w-24` nas duas laterais.

---

## 6. Movimento

| Padrão | Spec |
|---|---|
| Entrada de bloco (scroll reveal) | `opacity 0 → 1` e `translateY(20–30px) → 0` (Framer Motion). Os valores mais usados no JS: **`{duration: .6, ease: "easeOut"}`** (35×) e a versão com `delay: .1` (23×). Elementos seguintes entram em cascata com delay de 0.1 a 0.2s |
| Micro-transições (Framer) | `.2`, `.3` e `.4`s easeOut. Loops em `2s easeInOut infinite`. Para coisas "pulando": `spring {stiffness: 200, damping: 13}` |
| Transições de UI | `duration-300` (padrão), `500` (estados do chat/accordion), `200` (botões) e `700` |
| Easing | Default `cubic-bezier(.4,0,.2,1)`. Assinatura: **`cubic-bezier(.65,0,.35,1)`** (in-out marcado) |
| Hover de botão | Só cor: `hover:bg-[cor]/85` (sólido) ou `hover:bg-[#EEEBE7]/10` (outline) |
| "Pensando" | 3 dots `size-1 bg-[#FF5E00]/70 animate-pulse` com `animation-delay` de 0/180/360ms |
| Cursor de digitação | Barra `w-[2px] h-[1.05em] bg-[#FF5E00] animate-pulse` |
| Mensagens do agente | Aparecem em sequência com `transition-opacity duration-500` |
| Marquee de logos | `23s linear infinite`, pausa no hover. Depoimentos em 68s/80s, em sentidos opostos |
| Fluxo de dados | `ats-flow-*`: 2.8s linear, ponto que desce/sobe 74px com fade |
| Acessibilidade | Animações sempre com `motion-safe:` |

---

## 7. Componentes

### Botões
```html
<!-- Primário escuro (sobre creme) -->
<a class="inline-flex h-12 items-center gap-2 rounded-full bg-zinc-900 px-8 text-sm font-medium text-white shadow-xs transition-all duration-200 hover:bg-zinc-900/85">Agendar demo</a>

<!-- Primário laranja -->
<button class="inline-flex items-center gap-2 rounded-full bg-[#FF5E00] px-5 py-2.5 text-sm font-medium text-[#0D0D0D] transition-colors hover:bg-[#FF5E00]/85">Agende uma demo</button>

<!-- Primário creme (sobre escuro) -->
<a class="inline-flex h-12 items-center gap-2 rounded-full bg-[#EEEBE7] px-7 text-sm font-medium text-[#0D0D0D] transition-colors hover:bg-[#EEEBE7]/85">Conhecer</a>

<!-- Outline (sobre escuro) -->
<a class="inline-flex h-11 items-center gap-2 rounded-full border border-[#EEEBE7]/25 px-6 text-sm font-medium text-[#EEEBE7] transition-colors hover:bg-[#EEEBE7]/10">Trust center</a>
```
O texto sobre laranja é **`#0D0D0D`**, nunca branco.

### Toggle segmentado (Humano | Máquina)
`rounded-full border-[0.5px] border-current/30 p-0.5 text-[11px] font-light`. O item ativo usa `rounded-full bg-current/15 px-2.5 py-0.5`.

### Tabs segmentadas com indicador deslizante (heroes de Payroll e Recruiter)
```html
<div class="relative inline-flex items-center rounded-full border border-zinc-200/60 bg-white/80 p-0.5 text-[11px] font-medium shadow-sm backdrop-blur-md">
  <span class="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-zinc-900" style="width:108px; transform:translateX(108px)"></span>
  <button class="relative z-10 w-[108px] rounded-full py-1 transition-colors duration-200"><span class="text-zinc-700">Folha</span></button>
  <button class="relative z-10 w-[108px] rounded-full py-1"><span class="text-white">Holerite</span></button>
  <button class="relative z-10 w-[108px] rounded-full py-1"><span class="text-zinc-700">Insight IA</span></button>
</div>
```
O indicador preto desliza por baixo com `translateX`. Use para alternar visões, por exemplo "Candidato | Recrutador".

### Faixa de métricas
- Três ou quatro colunas separadas por divisórias verticais `border-l border-[#EEEBE7]/10`.
- O número vai em **serifa (`font-title`) grande e light**, com uma cor de produto: laranja no Recruiter, rosa `#FE6DF2` no Payroll e creme na Home. A unidade fica pequena ao lado, em `/60` (ex.: "85 %", "4,6 / 5,0").
- Abaixo vêm um rótulo em creme 100%, uma explicação em `text-xs /50` e uma **nota de fonte** ("Dados de produto do Tako Recruiter, maio de 2026.").
- Variante simples: `<dt class="font-title text-3xl leading-none">40%</dt><dd class="mt-2 text-sm leading-snug /65">…</dd>`.

### Citação
`blockquote.border-l-2.border-[#FF4802].pl-5`, com texto em `italic text-base leading-relaxed text-[#0D0D0D]/80` e `cite` em `text-sm /50 not-italic`.

### Accordion de features (lista à direita de um visual)
- Títulos em `font-title` grande e creme `/60`, separados por linhas `/10`.
- O item ativo ganha fundo `bg-[#FF4802]/[0.08]`, uma barra laranja à esquerda e o título em creme 100% com o texto expandido.
- Inativos: `hover:bg-[#EEEBE7]/[0.03]`, com `duration-500`.

### Camadas isométricas (seção "Contexto / Motor de cálculo / Produtos / Otto e Nara")
- Cards escuros empilhados em perspectiva 3D, ligados por linhas verticais finas, com borda laranja `/40` na camada ativa.
- Cada camada tem um título serifado ("Contexto") e chips de dados.
- Responde ao hover ("Passe o mouse em qualquer camada.") e fica sincronizado com o accordion ao lado.

### Badge / status
`rounded-full border px-2 py-0.5 text-[10px] font-medium border-[#FE6DF2]/40 text-[#FE6DF2]`. Varie a cor por estado: laranja = ação, rosa = revisar e creme/40 = neutro.

### Card escuro
`rounded-2xl border border-[#EEEBE7]/10 bg-[#141414] p-6`. Para um card "premium", use `bg-[linear-gradient(135deg,#33291F,#1E1915)]`.

### Card claro (sobre creme)
`rounded-2xl bg-[#F7F5F2] ring-1 ring-[#0D0D0D]/8 shadow-[0_30px_80px_-30px_rgba(13,13,13,0.35)]`.

---

## 8. UI do agente (padrão do "Otto" na Home)

A Home tem um mock de chat de agente ("Otto", com o placeholder "Pergunte sobre a sua operação"). **É o padrão a seguir para o nosso agente.**

```html
<!-- Janela -->
<div class="overflow-hidden rounded-2xl border border-[#EEEBE7]/12 bg-[#0F0F0F] shadow-2xl shadow-black/40">
  <!-- Title bar -->
  <div class="flex items-center gap-3 border-b border-[#EEEBE7]/10 bg-[#080808] px-4 py-2.5">
    <div class="flex gap-1.5">
      <span class="size-[7px] rounded-full bg-[#EEEBE7]/20"></span> ×3
    </div>
    <span class="text-[11px] text-[#EEEBE7]/50">Custo de pessoas Q4</span>
  </div>

  <div class="flex">
    <!-- Sidebar -->
    <aside class="w-[148px] border-r border-[#EEEBE7]/10 bg-[#080808] p-3">
      <div class="rounded-md border border-[#EEEBE7]/10 px-2 py-1.5 text-[10px] text-[#EEEBE7]/30">Buscar análises</div>
      <p class="mt-4 px-1 text-[9px] uppercase tracking-wide text-[#EEEBE7]/25">Histórico</p>
      <li class="rounded-md bg-[#EEEBE7]/[0.06] px-2 py-1.5 text-[10px] text-[#EEEBE7]/80">ativo</li>
      <li class="rounded-md px-2 py-1.5 text-[10px] text-[#EEEBE7]/45">inativo</li>
    </aside>

    <!-- Conversa -->
    <div class="flex-1 p-4">
      <!-- Mensagem do usuário: avatar com inicial -->
      <div class="flex gap-2.5">
        <span class="flex size-5 items-center justify-center rounded-full bg-[#EEEBE7]/10 text-[9px] font-medium text-[#EEEBE7]/60">V</span>
        <p class="text-[12px] leading-relaxed text-[#EEEBE7]/85">Pergunta…</p>
      </div>

      <!-- Agente: avatar com fundo laranja translúcido -->
      <div class="mt-4 flex gap-2.5">
        <span class="flex size-5 items-center justify-center rounded-full bg-[#FF5E00]/15"><!-- ícone laranja --></span>
        <div class="flex-1">
          <!-- Chips de fontes/ferramentas consultadas -->
          <li class="flex items-center gap-2 rounded-lg border border-[#EEEBE7]/10 bg-[#EEEBE7]/[0.03] px-2.5 py-1.5">
            <span class="text-[10.5px] text-[#EEEBE7]/60">Folha consolidada · out–dez</span>
            <span class="ml-auto size-1.5 rounded-full bg-[#EEEBE7]/25"></span>
          </li>
          <!-- Estado "Analisando" + 3 dots laranja pulsando -->
          <!-- Resposta: frase-síntese em /85, subtítulo text-[11px] font-medium creme 100%,
               bullets com dot size-1 bg-[#EEEBE7]/30 e texto /65 -->
        </div>
      </div>

      <!-- Composer -->
      <div class="mt-5 rounded-xl border border-[#EEEBE7]/12 bg-[#EEEBE7]/[0.04] px-3 py-2.5">
        <div class="flex items-center gap-2">
          <p class="flex-1 text-[12px] text-[#EEEBE7]/90">
            <span class="text-[#EEEBE7]/30">Pergunte sobre a sua operação</span>
            <span class="inline-block h-[1.05em] w-[2px] bg-[#FF5E00] motion-safe:animate-pulse"></span>
          </p>
          <span class="flex size-6 items-center justify-center rounded-full bg-[#FF5E00]"><!-- seta --></span>
        </div>
      </div>
      <div class="mt-2 flex justify-between px-1 text-[10px] text-[#EEEBE7]/40"><span>Otto</span><span>Enviar ↵</span></div>
    </div>
  </div>
</div>

<!-- Card flutuante "Fontes conectadas" (sobrepõe a janela em -bottom-8 -left-8) -->
<div class="rounded-xl border border-[#EEEBE7]/12 bg-[#141414] p-3 shadow-2xl shadow-black/50">
  <p class="text-[9px] uppercase tracking-wide text-[#EEEBE7]/30">Fontes conectadas</p>
  <li class="flex items-center gap-1.5 text-[10px] text-[#EEEBE7]/60"><span class="size-1 rounded-full bg-[#FF5E00]"></span>eSocial</li>
</div>
```

### Variante com balões: Nara, a "Recrutadora IA" (Home e Recruiter)
A Tako tem **dois agentes nomeados: Otto** (analista de folha e operação) e **Nara** (recrutadora IA). Quando a conversa é agente ↔ pessoa externa, eles usam balões:

```html
<div class="overflow-hidden rounded-2xl border border-[#EEEBE7]/12 bg-[#141414]">
  <div class="flex items-center gap-3 border-b border-[#EEEBE7]/10 bg-[#080808] px-4 py-2.5">
    <div class="flex-1 truncate text-[11px] text-[#EEEBE7]/50">Entrevista por vídeo · Ao vivo</div>
    <span class="text-[10px] text-[#EEEBE7]/40">Dados de exemplo</span>
  </div>
  <div class="p-5">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-[12px] font-medium text-[#EEEBE7]">Nara · Recrutadora IA</p>
        <p class="mt-0.5 text-[10.5px] text-[#EEEBE7]/45">Analista Financeiro Pleno · CLT remoto</p>
      </div>
      <span class="mt-1 size-2 rounded-full bg-[#FF5E00]"></span>  <!-- status "ao vivo" -->
    </div>
    <ul class="mt-5 flex flex-col gap-2.5">
      <!-- Agente: balão à esquerda, tingido de laranja -->
      <li class="max-w-[88%] rounded-xl border border-[#FF5E00]/25 bg-[#FF5E00]/[0.06] px-3 py-2">
        <p class="text-[9px] uppercase tracking-wide text-[#EEEBE7]/30">Nara</p>
        <p class="mt-1 text-[12px] leading-relaxed text-[#EEEBE7]/80">Olá! Sou a Nara…</p>
      </li>
      <!-- Pessoa: balão à direita, neutro -->
      <li class="ml-auto max-w-[88%] rounded-xl border border-[#EEEBE7]/10 bg-[#EEEBE7]/[0.03] px-3 py-2">
        <p class="text-[9px] uppercase tracking-wide text-[#EEEBE7]/30">Candidato</p>
        <p class="mt-1 text-[12px] leading-relaxed text-[#EEEBE7]/80">Claro, vamos lá.</p>
      </li>
    </ul>
  </div>
</div>
```

**Quando usar cada padrão:** o **Otto** (sem balões, avatar + texto, sidebar de histórico) serve para um copiloto interno de análise. A **Nara** (balões com label uppercase) serve para conversas com terceiros, como candidatos e colaboradores. Nos títulos e cards de seção, os nomes dos agentes aparecem em `font-title`.

**Regras do chat**
1. O agente se identifica pelo laranja (avatar `bg-[#FF5E00]/15`, dots, cursor e botão enviar). O usuário fica em creme neutro.
2. Mostre as **fontes consultadas como chips** antes da resposta. É a transparência que a Tako comunica.
3. A resposta abre com **uma frase-síntese com número** ("O custo de pessoas subiu 4,1% no trimestre."). Depois vêm o detalhamento em bullets e uma frase de contexto no fim.
4. Sem balões coloridos: as mensagens são texto direto ao lado do avatar.
5. Num app em tela cheia, escale a micro-tipografia do mock: 12px → 14–15px, 10px → 12–13px.

---

## 9. Tokens prontos

### CSS
```css
:root {
  /* Marca */
  --tako-ink: #0D0D0D;
  --tako-cream: #EEEBE7;
  --tako-orange: #FF5E00;
  --tako-orange-dark: #E13E00;
  --tako-orange-hot: #FF4802;
  --tako-orange-deep: #C23500;   /* laranja legível sobre creme */
  --tako-pink: #FE6DF2;
  --tako-blue: #2C84FC;

  /* Superfícies escuras */
  --surface-0: #080808;
  --surface-1: #0D0D0D;
  --surface-2: #0F0F0F;
  --surface-3: #141414;
  --surface-4: #1A1A1A;

  /* Superfícies claras */
  --paper-1: #EEEBE7;
  --paper-2: #F7F5F2;

  /* Texto (sobre escuro) */
  --text: #EEEBE7;
  --text-2: rgb(238 235 231 / .85);
  --text-3: rgb(238 235 231 / .60);
  --text-4: rgb(238 235 231 / .45);
  --text-5: rgb(238 235 231 / .30);
  --muted-foreground: #888480;

  /* Linhas */
  --line: rgb(238 235 231 / .10);
  --line-strong: rgb(238 235 231 / .12);
  --fill-subtle: rgb(238 235 231 / .04);
  --fill-active: rgb(238 235 231 / .06);

  /* shadcn (valores do :root do site) */
  --background: #0D0D0D;  --foreground: #EEEBE7;
  --card: #1A1A1A;        --card-foreground: #EEEBE7;
  --popover: #1A1A1A;     --popover-foreground: #EEEBE7;
  --primary: #0D0D0D;     --primary-foreground: #0D0D0D;
  --secondary: #2C84FC;   --secondary-foreground: #0D0D0D;
  --muted: #2A2A2A;       --accent: #2A2A2A; --accent-foreground: #EEEBE7;
  --destructive: #E40014;
  --border: #2A2A2A;      --input: #2A2A2A;  --ring: #FF5E00;
  --chart-1: #FF5E00; --chart-2: #2C84FC; --chart-3: #104E64; --chart-4: #FCBB00; --chart-5: #F99C00;
  --radius: 0.625rem;

  /* Tipografia */
  --font-title: "PP Eiko", "Fraunces", Georgia, serif;
  --font-sans: "Plus Jakarta Sans", "Satoshi", system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Movimento */
  --ease-tako: cubic-bezier(.65, 0, .35, 1);
  --ease-default: cubic-bezier(.4, 0, .2, 1);
}

body { background: var(--tako-ink); color: var(--tako-cream); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-title); font-weight: 500; letter-spacing: -0.025em; line-height: 1.05; }
h1 { font-weight: 400; }
::selection { background: rgb(255 94 0 / .3); }
```

### Tailwind v4 (`@theme`)
```css
@theme {
  --color-ink: #0D0D0D;
  --color-cream: #EEEBE7;
  --color-paper: #F7F5F2;
  --color-tako: #FF5E00;
  --color-tako-dark: #E13E00;
  --color-tako-hot: #FF4802;
  --color-tako-deep: #C23500;
  --color-tako-pink: #FE6DF2;
  --color-tako-blue: #2C84FC;
  --color-surface-0: #080808;
  --color-surface-2: #0F0F0F;
  --color-surface-3: #141414;
  --font-title: "PP Eiko", "Fraunces", serif;
  --font-sans: "Plus Jakarta Sans", system-ui, sans-serif;
  --ease-tako: cubic-bezier(.65,0,.35,1);
}
```
Com isso dá para escrever `bg-ink text-cream`, `border-cream/10`, `bg-tako hover:bg-tako/85` e `font-title`.

---

## 10. Faça / Não faça

**Faça**
- Alterne seções creme e preto para dar ritmo.
- Use o laranja com parcimônia: um CTA por bloco e detalhes de estado.
- Mostre hierarquia com opacidade do creme/preto.
- Use títulos serifados grandes, peso normal, `text-balance` e tracking negativo.
- Mostre mocks de produto densos e realistas, com sombra longa, sobre a seção.
- Escreva o copy em PT-BR direto, com números concretos ("Folha em horas, não em dias.").

**Não faça**
- Não use branco puro como fundo principal nem cinzas frios do Tailwind (zinc/slate) em textos de marca.
- Não use texto branco sobre o laranja: use `#0D0D0D`.
- Não use laranja `#FF5E00` como texto sobre creme (contraste baixo): use `#C23500` ou `#B33100`.
- Não use gradientes chamativos em áreas grandes. Gradiente só em ícones, barras e cards quentes.
- Não use cantos retos em botões: são sempre pílula.
- Não use o verde WhatsApp fora do botão de WhatsApp.

---

## 11. Assets e observações

- **Logo/ícone:** `https://tako.ai/icon.svg` é um "O" com uma onda interna, desenhado sobre `#09090B`. Também existem `/apple-icon.png` e `/favicon.ico`.
- **Versão Máquina:** `/pt/machine/` é um índice em texto para LLMs (`/llms-full.pt.md`, `/llms/machine.css`). O toggle "Humano | Máquina" no menu é um detalhe de marca que vale reaproveitar em produtos de IA.
- **Produtos e o acento de cada um:**
  - Payroll: hero com shader creme, mock escuro `#141414` e métricas em rosa `#FE6DF2`.
  - Recruiter: hero com shader **rosa → laranja**, métricas em laranja e foco em WhatsApp.
  - Benefits: shader creme pêssego, cards `#F7F5F2`, laranja profundo `#C23500` e azul.
  - Home: shader branco/pêssego/lilás, com o mock do Otto por cima.
- **Logos de clientes** (BTG Pactual, iFood, Zerezes, Pipo Saúde, Sallve…) aparecem em creme monocromático numa faixa escura, com marquee e o eyebrow "Centenas de empresas confiam na Tako" em laranja.
- **Licença:** PP Eiko e Satoshi são fontes de terceiros. Para uso em produção fora da Tako, confirmar a licença ou usar os fallbacks indicados.
