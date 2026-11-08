"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { focoAudio } from "../audio/foco";
import { useLiberarAudio } from "../presenca/useLiberarAudio";
import { reproduzirFala, type ProvedorVoz } from "./cliente";

export type FalaAgente = { id: string; texto: string };
type EstadoVoz = "inativa" | "preparando" | "falando" | "erro";

export function useVozAgente({ ultimaFala = null, bloqueada = false }: {
  ultimaFala?: FalaAgente | null;
  bloqueada?: boolean;
} = {}) {
  // Sem o destrave, o play() do áudio do ElevenLabs é bloqueado e a fala cai na voz do navegador.
  useLiberarAudio();
  const [estado, setEstado] = useState<EstadoVoz>("inativa");
  const [habilitada, setHabilitada] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [provedor, setProvedor] = useState<ProvedorVoz | null>(null);
  const [fala, setFala] = useState<{ quem: "agente"; texto: string; ate: number } | null>(null);
  const atual = useRef<AbortController | null>(null);
  const liberar = useRef<(() => void) | undefined>(undefined);
  const habilitadaRef = useRef(true);
  const bloqueadaRef = useRef(bloqueada);
  bloqueadaRef.current = bloqueada;
  const montado = useRef(false);
  const ultimaProgramada = useRef<string | null>(null);

  const parar = useCallback(() => {
    const anterior = atual.current;
    atual.current = null;
    anterior?.abort();
    liberar.current?.();
    liberar.current = undefined;
    setEstado("inativa");
    setFala(null);
  }, []);

  useEffect(() => {
    montado.current = true;
    const ocultar = () => { if (document.hidden) parar(); };
    document.addEventListener("visibilitychange", ocultar);
    return () => {
      montado.current = false;
      document.removeEventListener("visibilitychange", ocultar);
      ultimaProgramada.current = null;
      parar();
    };
  }, [parar]);

  const falar = useCallback(async (texto: string) => {
    if (!montado.current || document.hidden) return;
    parar();
    if (!habilitadaRef.current || bloqueadaRef.current || !texto.trim()) return;
    const controle = new AbortController();
    atual.current = controle;
    const vigente = () => atual.current === controle && !controle.signal.aborted;
    setErro(null);
    setEstado("preparando");
    setFala({ quem: "agente", texto, ate: 0 });
    let liberarFoco: (() => void) | undefined;
    try {
      await focoAudio.aguardarMicrofone(controle.signal);
      controle.signal.throwIfAborted();
      liberarFoco = focoAudio.assumir("saida", parar);
      liberar.current = liberarFoco;
      await reproduzirFala(texto, controle.signal, {
        aoIniciar: (fonte) => { if (vigente()) { setEstado("falando"); setProvedor(fonte); } },
        aoProgresso: (ate) => { if (vigente()) setFala({ quem: "agente", texto, ate }); },
      });
      if (vigente()) { setEstado("inativa"); setFala(null); }
    } catch (e) {
      if (vigente()) {
        setErro(e instanceof Error ? e.message : "A voz está indisponível. A resposta continua no texto.");
        setEstado("erro");
        setFala(null);
      }
    } finally {
      liberarFoco?.();
      if (atual.current === controle) {
        atual.current = null;
        liberar.current = undefined;
      }
    }
  }, [parar]);

  const alternar = useCallback(() => {
    habilitadaRef.current = !habilitadaRef.current;
    setHabilitada(habilitadaRef.current);
    if (!habilitadaRef.current) parar();
  }, [parar]);

  const id = ultimaFala?.id;
  const texto = ultimaFala?.texto;
  useEffect(() => {
    if (id === undefined || texto === undefined) return;
    const chave = JSON.stringify([id, texto]);
    if (bloqueada || ultimaProgramada.current === chave) return;
    ultimaProgramada.current = chave;
    void falar(texto);
  }, [id, texto, bloqueada, falar]);

  useEffect(() => { if (bloqueada) parar(); }, [bloqueada, parar]);

  return { estado, habilitada, erro, provedor, fala, falar, parar, alternar, ativa: estado === "preparando" || estado === "falando" };
}

export type VozAgente = ReturnType<typeof useVozAgente>;
