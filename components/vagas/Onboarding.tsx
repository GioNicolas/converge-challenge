"use client";

// Boas-vindas da recrutadora: a primeira tela antes do painel de vagas.
// "Cole a vaga. O Totti entrevista. Você decide." Um palco escuro mostra o agente trabalhando de verdade
// (digita, lê uma linha, pergunta, fecha uma nota); abaixo, o caminho de uma vaga e o rastro do que o
// Totti faz quando você não está olhando. Todo movimento corresponde a um evento (ver globals.css).
// Ao abrir, grava um cookie: a partir daí a raiz do site vai direto para /vagas (ver app/page.tsx).
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { COOKIE_ONBOARDING } from "@/lib/vagas/onboarding";
import Perola, { BarrasDeVoz } from "@/components/totti/Perola";
import Revelar from "@/components/totti/Revelar";
import TituloRevelado from "@/components/totti/TituloRevelado";
import Marca from "./Marca";

const FONTE: [string, "forte" | "normal" | "claro"][] = [
  ["export class LimitadorDeTaxa {", "forte"],
  ["  private janelas = new Map<string, Janela>();", "normal"],
  ["", "normal"],
  ["  permitir(cliente: string, agora = Date.now()) {", "forte"],
  ["    const j = this.janelas.get(cliente);", "normal"],
  ["    if (!j || agora - j.inicio >= this.ms) {", "normal"],
  ["      this.janelas.set(cliente, { inicio: agora, pedidos: 1 });", "normal"],
  ["      return true;", "claro"],
  ["    }", "normal"],
  ["    j.pedidos++;", "forte"],
];
const COR = { forte: "#F5F0E8", normal: "#C9C2B6", claro: "#FFFFFF" } as const;
const LINHA = 26;

const PERGUNTA = "E se dois pedidos chegarem no mesmo milissegundo, na virada da janela?";
const RESPOSTA = "Aí passa o dobro… dá pra trocar por janela deslizante.";

const PASSOS = [
  { titulo: "Vaga", texto: "Cole a descrição. O Totti lê, extrai os requisitos e diz quais decidem a vaga." },
  { titulo: "Conversa", texto: "Por voz, ele confirma formato e nível e pergunta o que reprova direto." },
  { titulo: "Entrevista", texto: "Live coding ou system design, com o agente lendo, desenhando e perguntando." },
  { titulo: "Relatório", texto: "Nota por critério, com o minuto exato de cada evidência. Você decide." },
];

const FEED = [
  { icone: "✓", titulo: "Plano aprovado", sub: "Backend Pleno — Pagamentos · live coding, 45 min", cheio: true },
  { icone: "→", titulo: "12 convites enviados", sub: "Agendaram 8 · lembrete sai 1h antes", cheio: false },
  { icone: "●", titulo: "Entrevistando Marina Albuquerque", sub: "minuto 23 · fez 4 perguntas, 2 anotações", cheio: false },
  { icone: "…", titulo: "Gerando o relatório de Caio Menezes", sub: "cruzando 18 evidências com os critérios", cheio: false },
  { icone: "+", titulo: "Nova regra aprendida", sub: "“Sem testes no fim reprova” · veio da sua decisão de ontem", cheio: false },
];
const QUANDOS = ["agora", "2 min", "9 min", "14 min", "ontem"];

/** Um tique a cada `ms`; parado com "reduzir movimento" (mostra o quadro final, sem animar). */
function useTique(ms: number) {
  const [t, setT] = useState(0);
  const [parado, setParado] = useState(false);
  useEffect(() => {
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setParado(reduz);
    if (reduz) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return { t, parado };
}

export default function Onboarding() {
  useEffect(() => {
    document.cookie = `${COOKIE_ONBOARDING}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);

  return (
    <div className="min-h-dvh bg-fundo text-texto">
      <nav className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-6">
        <Marca href="/boas-vindas" />
        <div className="flex flex-wrap items-center gap-2">
          <a href="#como" className="px-3.5 py-2.5 text-texto-suave transition-colors hover:text-texto">
            Como funciona
          </a>
          <Link
            href="/vagas"
            className="rounded-full px-4 py-2.5 text-texto shadow-[inset_0_0_0_1px_rgb(28_24_18/0.18)] transition-colors hover:bg-superficie"
          >
            Entrar no painel
          </Link>
        </div>
      </nav>

      <Heroi />
      <Passos />
      <Rastro />

      <footer className="border-t border-borda px-6 py-7">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 text-[13.5px] text-texto-suave">
          <span>Totti · Converge Challenge, Porto Digital, Recife</span>
          <span>A câmera do candidato nunca sai do computador dele.</span>
        </div>
      </footer>
    </div>
  );
}

/** Texto e palco lado a lado: o palco é o agente trabalhando. */
function Heroi() {
  const { t, parado } = useTique(55);
  // 260 tiques ≈ 14s por volta: digita, lê, pergunta, escuta, fecha a nota.
  const c = parado ? 240 : t % 260;
  let restante = Math.max(0, c) * 4;
  const codigo = FONTE.map(([txt, tom], i) => {
    const visivel = txt.slice(0, Math.max(0, Math.min(txt.length, restante)));
    restante -= txt.length + 1;
    return { n: i + 1, txt: visivel || " ", cor: COR[tom] };
  });
  const alvo = c < 110 ? null : c < 170 ? 9 : 5;
  const faixaY = 22 + (alvo ?? 9) * LINHA;
  const pq = Math.max(0, Math.min(PERGUNTA.length, (c - 115) * 2));
  const pr = Math.max(0, Math.min(RESPOSTA.length, (c - 180) * 2));
  const prog = Math.max(0, Math.min(1, (c - 215) / 18));
  const ease = 1 - Math.pow(1 - prog, 4);
  const seg = 754 + Math.floor(t / 18);
  const relogio = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;
  const aoVivo = 3 + (Math.floor(t / 120) % 3);
  const falando = pq > 0 && pq < PERGUNTA.length;

  return (
    <section className="mx-auto grid max-w-[1240px] items-center gap-14 px-6 pt-10 pb-20 [grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr))]">
      <div className="anim-subir flex flex-col gap-6" style={{ animationDuration: ".8s" }}>
        <span className="inline-flex h-8 items-center gap-2 self-start rounded-full bg-superficie pr-3.5 pl-2.5 text-[13.5px] text-texto-suave shadow-padrao">
          <span aria-hidden className="size-2 rounded-full bg-texto anim-pulso" />
          {aoVivo} entrevistas acontecendo agora
        </span>
        <h1 className="titulo-display text-[clamp(44px,6vw,80px)] leading-[0.98]">
          <TituloRevelado texto="Cole a vaga." atraso={0.1} />
          <br />
          <TituloRevelado texto="O Totti entrevista." atraso={0.3} />
          <br />
          <em className="italic text-texto [font-variation-settings:'SOFT'_100,'WONK'_1]">Você decide.</em>
        </h1>
        <p className="max-w-[520px] text-[19px] text-texto-suave">
          Um entrevistador técnico por voz que acompanha o código e o desenho do candidato em tempo real, pergunta no momento certo e
          entrega a nota com a evidência de cada critério.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/vagas/nova"
            className="group inline-flex h-[52px] items-center gap-2 rounded-full bg-texto px-6 text-[16px] font-semibold text-texto-claro shadow-[0_14px_40px_-16px_rgb(28_24_18/0.6)] transition-transform duration-rapida hover:-translate-y-px active:scale-[0.98]"
          >
            Começar com o Totti
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/vagas"
            className="inline-flex h-[52px] items-center rounded-full bg-superficie px-[22px] text-[16px] font-medium text-texto shadow-[inset_0_0_0_1px_rgb(28_24_18/0.16)] transition-colors hover:bg-superficie-2"
          >
            Ver minhas vagas
          </Link>
        </div>
      </div>

      <div className="anim-subir relative" style={{ animationDuration: ".9s", animationDelay: ".15s" }} aria-hidden>
        <div className="overflow-hidden rounded-[28px] bg-[#13110e] text-[#f5f0e8] shadow-[0_50px_90px_-40px_rgb(28_24_18/0.7)]">
          <div className="flex items-center justify-between border-b border-[#f5f0e8]/8 px-[18px] py-3.5">
            <span className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2.5 rounded-full bg-[#27231d]" />
              ))}
            </span>
            <span className="font-mono text-[12.5px] text-[#f5f0e8]/70">limitador.ts · Live Coding</span>
            <span className="font-mono text-[12.5px]">● {relogio}</span>
          </div>

          <div className="relative min-h-[300px] pt-[22px] pb-[26px] font-mono text-[14px]" style={{ lineHeight: `${LINHA}px` }}>
            <div
              className="absolute inset-x-0 transition-[top,opacity] duration-[900ms] ease-viagem"
              style={{
                top: faixaY,
                height: LINHA,
                opacity: alvo === null ? 0 : 1,
                background: "rgb(245 240 232 / 0.12)",
                boxShadow: "inset 3px 0 0 #F5F0E8",
              }}
            />
            {codigo.map((l) => (
              <div key={l.n} className="relative flex whitespace-pre">
                <span className="w-11 pr-4 text-right text-[#f5f0e8]/30">{l.n}</span>
                <span style={{ color: l.cor }}>{l.txt}</span>
              </div>
            ))}
            {/* o cursor do Totti viaja até a linha que ele está lendo */}
            <div
              className="pointer-events-none absolute transition-[left,top] duration-[900ms] ease-viagem"
              style={{ left: alvo === null ? 380 : alvo === 9 ? 170 : 300, top: alvo === null ? 12 : faixaY + 14 }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20">
                <path d="M3 2 L17 9 L10 11 L7 18 Z" fill="#F5F0E8" stroke="#13110E" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span className="absolute top-4 left-4 rounded-full bg-[#f5f0e8] px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap text-[#1c1812] font-sans">
                Totti
              </span>
            </div>
          </div>

          <div className="flex min-h-[92px] flex-col gap-2.5 border-t border-[#f5f0e8]/8 px-[18px] pt-4 pb-5">
            {pq > 0 && (
              <div className="flex items-start gap-2.5">
                <BarrasDeVoz ativo={falando} n={3} altura={16} largura={3} className="mt-[3px] shrink-0 !gap-0.5 text-[#f5f0e8]" />
                <span className="text-[15px]">
                  <b>Totti</b> {PERGUNTA.slice(0, pq)}
                </span>
              </div>
            )}
            {pr > 0 && (
              <div className="flex items-start gap-2.5">
                <span className="mt-[7px] size-2 shrink-0 rounded-full bg-[#f5f0e8]" />
                <span className="text-[15px] text-[#d9d1c4]">
                  <b className="text-[#f5f0e8]">Marina</b> {RESPOSTA.slice(0, pr)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div
          className="absolute -right-3 -bottom-7 flex items-center gap-3.5 rounded-[18px] bg-superficie px-[18px] py-3.5 shadow-[0_24px_50px_-20px_rgb(28_24_18/0.45)] transition-[opacity,transform] duration-[600ms] ease-saida"
          style={{ opacity: prog > 0 ? 1 : 0, transform: `translateY(${prog > 0 ? 0 : 14}px)` }}
        >
          <span className="flex flex-col">
            <span className="text-[12.5px] text-texto-suave">Modelagem de dados</span>
            <span className="font-mono text-[12px] text-texto-suave">evidência · min 12:40</span>
          </span>
          <span className="titulo-display text-[30px]">{(3.5 * ease).toFixed(1).replace(".", ",")}</span>
        </div>
      </div>
    </section>
  );
}

/** O caminho de uma vaga: títulos grandes à esquerda (o ativo se acende e a linha enche), a cena do passo à direita. */
function Passos() {
  const [ativo, setAtivo] = useState(0);
  const [parado, setParado] = useState(false);
  useEffect(() => {
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setParado(reduz);
    if (reduz) return;
    const id = setInterval(() => setAtivo((a) => (a + 1) % PASSOS.length), 5200);
    return () => clearInterval(id);
  }, [ativo]);

  return (
    <section id="como" className="scroll-mt-4 bg-superficie px-6 py-[96px]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-14">
        <Revelar className="flex max-w-[640px] flex-col gap-2.5">
          <span className="font-mono text-[13px] text-texto-suave">como funciona</span>
          <h2 className="titulo-display text-[clamp(32px,4vw,48px)] leading-[1.05]">Da descrição da vaga ao relatório, sem você montar nada.</h2>
        </Revelar>

        <Revelar atraso={0.08} className="grid items-stretch gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
          <ol className="flex flex-col">
            {PASSOS.map((p, i) => {
              const on = i === ativo;
              return (
                <li key={p.titulo} className="relative">
                  {/* a linha que enche enquanto o passo está ativo */}
                  <span aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-borda" />
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 left-0 w-[2px] origin-top bg-texto"
                    style={{
                      transform: `scaleY(${on ? 1 : i < ativo ? 1 : 0})`,
                      opacity: on ? 1 : i < ativo ? 0.25 : 0,
                      transition: on && !parado ? "transform 5.2s linear, opacity .3s" : "opacity .5s",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setAtivo(i)}
                    aria-pressed={on}
                    className="group flex w-full flex-col gap-2 py-5 pl-7 text-left"
                  >
                    <span
                      className="titulo-display text-[clamp(28px,3.4vw,40px)] leading-[1.05] transition-[color,transform] duration-[480ms] ease-saida group-hover:translate-x-1"
                      style={{ color: on ? "var(--texto)" : "var(--pedra)", transform: on ? "translateX(4px)" : undefined }}
                    >
                      {p.titulo}
                    </span>
                    <span
                      className="grid transition-[grid-template-rows,opacity] duration-[480ms] ease-saida"
                      style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0 }}
                    >
                      <span className="overflow-hidden text-[16px] text-texto-suave">{p.texto}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="relative min-h-[320px] overflow-hidden rounded-[28px] bg-[#13110e] text-[#f5f0e8]" aria-hidden>
            <CenaDoPasso key={ativo} passo={ativo} />
          </div>
        </Revelar>
      </div>
    </section>
  );
}

/** A cena de cada passo, no palco escuro. Tudo entra em cascata ao trocar de passo. */
function CenaDoPasso({ passo }: { passo: number }) {
  const linha = "h-2.5 rounded-full bg-[#f5f0e8]/15";
  const entra = (i: number) => ({ animation: `subir .6s var(--curva-saida) ${0.12 * i}s both` });
  if (passo === 0)
    return (
      <div className="flex h-full flex-col justify-center gap-4 p-9">
        {[88, 100, 72, 94, 60].map((w, i) => (
          <span key={i} className={linha} style={{ width: `${w}%`, ...entra(i) }} />
        ))}
        <div className="mt-3 flex flex-wrap gap-2">
          {["Node + TypeScript", "Concorrência", "PostgreSQL", "Testes"].map((c, i) => (
            <span key={c} className="rounded-full bg-[#f5f0e8] px-3 py-1 text-[13px] font-semibold text-[#1c1812]" style={entra(i + 5)}>
              {c}
            </span>
          ))}
        </div>
        <span className="font-mono text-[12.5px] text-[#f5f0e8]/70" style={entra(9)}>
          › 7 requisitos extraídos, 3 decidem a vaga
        </span>
      </div>
    );
  if (passo === 1)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-9">
        <Perola estado="falando" tamanho={84} brilho />
        <p className="max-w-[340px] text-center text-[17px] leading-[1.45]" style={entra(1)}>
          “Vou propor live coding de 45 minutos. O que reprova direto?”
        </p>
        <p className="max-w-[340px] text-center text-[15px] text-[#d9d1c4]" style={entra(3)}>
          Se a pessoa não escrever nenhum teste, nem continuo.
        </p>
      </div>
    );
  if (passo === 2)
    return (
      <div className="flex h-full flex-col justify-center gap-6 py-9">
        {/* a faixa fica na própria linha (e não num `top` fixo), então acompanha o código em qualquer altura do palco */}
        <div className="font-mono text-[14px] leading-[26px]">
          {["permitir(cliente) {", "  const j = this.janelas.get(cliente);", "  if (agora - j.inicio >= this.ms) {", "    j.pedidos++;", "  }", "}"].map((l, i) => {
            const lendo = i === 2;
            return (
              <div
                key={i}
                className={`flex whitespace-pre pr-6 ${lendo ? "bg-[#f5f0e8]/12 text-[#f5f0e8] shadow-[inset_3px_0_0_#f5f0e8]" : "text-[#c9c2b6]"}`}
                style={entra(i)}
              >
                <span className="w-12 shrink-0 pr-4 text-right text-[#f5f0e8]/30">{i + 1}</span>
                {l}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5 px-9" style={entra(7)}>
          <span className="font-mono text-[12.5px] text-[#f5f0e8]/70">› Totti leu a linha 3 e pergunta:</span>
          <span className="text-[16px] leading-[1.45]">“Por que &gt;= e não &gt;? O que acontece na virada da janela?”</span>
        </div>
      </div>
    );
  return (
    <div className="flex h-full flex-col justify-center gap-5 p-9">
      <span className="font-mono text-[12.5px] text-[#f5f0e8]/70" style={entra(0)}>
        modelagem de dados · min 12:40
      </span>
      <p className="max-w-[420px] text-[19px] leading-[1.55]" style={entra(1)}>
        “Eu usaria janela deslizante{" "}
        {/* a evidência: um traço que corre por baixo do trecho, linha a linha quando ele quebra */}
        <span
          className="bg-no-repeat [background-position:0_100%] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
          style={{ backgroundImage: "linear-gradient(#f5f0e8, #f5f0e8)", backgroundSize: "100% 2px", animation: "sublinhar 1s var(--curva-saida) .9s both" }}
        >
          porque a fixa deixa passar o dobro
        </span>
        .”
      </p>
      <div className="h-2 max-w-[360px] overflow-hidden rounded-full bg-[#f5f0e8]/15" style={entra(3)}>
        <div className="h-full rounded-full bg-[#f5f0e8]" style={{ width: "88%", transformOrigin: "left", animation: "crescer 1s var(--curva-saida) .7s both" }} />
      </div>
      <span className="titulo-display text-[44px]" style={entra(4)}>
        3,5<span className="text-[20px] text-[#f5f0e8]/60"> / 4</span>
      </span>
    </div>
  );
}

/** "Enquanto você não olha": o feed do que o Totti fez, uma linha acesa por vez. */
function Rastro() {
  const { t, parado } = useTique(55);
  const ativo = parado ? 2 : Math.floor(t / 40) % FEED.length;
  return (
    <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-[88px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
      <Revelar className="flex flex-col gap-3.5">
        <span className="font-mono text-[13px] text-texto-suave">enquanto você não olha</span>
        <h2 className="titulo-display text-[clamp(32px,4vw,48px)] leading-[1.05]">O Totti continua trabalhando — e mostra o que fez.</h2>
        <p className="max-w-[480px] text-[17px] text-texto-suave">
          Cada ação vira uma linha no rastro do agente. As decisões que você toma no painel viram regras que as próximas entrevistas já usam.
        </p>
      </Revelar>
      <Revelar como="ul" atraso={0.1} className="flex flex-col rounded-[24px] bg-superficie p-3 shadow-[0_1px_2px_rgb(28_24_18/0.06),0_24px_50px_-28px_rgb(28_24_18/0.35)]">
        {FEED.map((f, i) => (
          <li
            key={f.titulo}
            className="grid items-center gap-3 rounded-[14px] p-3 transition-colors duration-[600ms] [grid-template-columns:36px_minmax(0,1fr)_auto]"
            style={{ background: i === ativo ? "var(--fundo)" : "var(--superficie)" }}
          >
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-xl font-mono text-[13px] font-medium"
              style={{ background: f.cheio ? "var(--texto)" : i === 0 || i === 1 ? "var(--fundo)" : "var(--superficie-2)", color: f.cheio ? "var(--texto-claro)" : "var(--texto)" }}
            >
              {f.icone}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{f.titulo}</span>
              <span className="text-[13px] text-texto-suave">{f.sub}</span>
            </span>
            <span className="font-mono text-[12px] text-texto-suave">{QUANDOS[(i - ativo + FEED.length) % FEED.length]}</span>
          </li>
        ))}
      </Revelar>
    </section>
  );
}
