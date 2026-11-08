"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { iniciarNavegador, reconhecimentoDisponivel } from "./navegador";
import { erroMicrofone, type EstadoTranscricao, type EventosTranscricao, type SessaoTranscricao } from "./tipos";
import { focoAudio } from "../audio/foco";

type CapturaAtual = { controlador: AbortController; sessao?: SessaoTranscricao; liberar?: () => void };

export function useTranscricao({ aoTexto, bloqueada = false, obterStream, liberarStream }: {
  aoTexto: (texto: string) => void;
  bloqueada?: boolean;
  obterStream?: () => Promise<MediaStream>;
  liberarStream?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoTranscricao>("inativa");
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [provedor, setProvedor] = useState<"elevenlabs" | "navegador" | null>(null);
  const referencia = useRef<CapturaAtual | null>(null);
  const receber = useRef(aoTexto);
  receber.current = aoTexto;
  const liberar = useRef(liberarStream);
  liberar.current = liberarStream;

  const cancelar = useCallback(() => {
    const atual = referencia.current;
    referencia.current = null;
    atual?.controlador.abort();
    atual?.sessao?.cancelar();
    if (atual) liberar.current?.();
    atual?.liberar?.();
    setParcial("");
    setEstado("inativa");
  }, []);

  const iniciar = useCallback(async () => {
    if (bloqueada || referencia.current) return;
    const atual: CapturaAtual = { controlador: new AbortController() };
    referencia.current = atual;
    atual.liberar = focoAudio.assumir("entrada", cancelar);
    const vigente = () => referencia.current === atual;
    let falhou = false;
    setErro(null);
    setParcial("");
    setEstado("conectando");
    const eventos: EventosTranscricao = {
      aoTexto: (texto) => { if (vigente()) receber.current(texto); },
      aoParcial: (texto) => { if (vigente()) setParcial(texto); },
      aoErro: (e) => {
        if (!vigente()) return;
        falhou = true;
        setErro(e.message);
        setEstado("erro");
      },
      aoEncerrar: () => {
        if (!vigente()) return;
        referencia.current = null;
        liberar.current?.();
        atual.liberar?.();
        setParcial("");
        setEstado(falhou ? "erro" : "inativa");
      },
    };
    try {
      if (!window.isSecureContext) throw new Error("Abra o projeto por HTTPS ou localhost para usar o microfone.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não oferece acesso ao microfone.");
      const resposta = await fetch("/api/transcricao/sessao", {
        method: "POST", signal: atual.controlador.signal, cache: "no-store",
      });
      const dados = await resposta.json() as { provedor?: string; token?: string; erro?: string };
      if (!vigente()) return;
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui iniciar a transcrição.");
      if (dados.provedor === "elevenlabs" && dados.token) {
        setProvedor("elevenlabs");
        const { iniciarScribe } = await import("./scribe");
        atual.controlador.signal.throwIfAborted();
        const stream = await obterStream?.();
        atual.controlador.signal.throwIfAborted();
        atual.sessao = await iniciarScribe({ token: dados.token, stream, signal: atual.controlador.signal, eventos });
      } else if (dados.provedor === "navegador") {
        const Construtor = reconhecimentoDisponivel();
        if (!Construtor) throw new Error("Este navegador não oferece reconhecimento de voz. Use Chrome ou configure a transcrição com ElevenLabs.");
        setProvedor("navegador");
        atual.sessao = iniciarNavegador(Construtor, eventos);
      } else {
        throw new Error("Configuração de transcrição inválida.");
      }
      if (!vigente()) { atual.sessao.cancelar(); return; }
      setEstado("ouvindo");
    } catch (e) {
      if (!vigente()) return;
      eventos.aoErro(erroMicrofone(e));
      atual.controlador.abort();
      atual.sessao?.cancelar();
      eventos.aoEncerrar();
    }
  }, [bloqueada, cancelar, obterStream]);

  const parar = useCallback(async () => {
    const atual = referencia.current;
    if (!atual) return;
    if (!atual.sessao) { cancelar(); return; }
    setEstado("finalizando");
    try {
      await atual.sessao.parar();
    } catch (e) {
      // Sem isso o estado ficaria preso em "finalizando" e o envio, bloqueado.
      if (referencia.current !== atual) return;
      setErro(erroMicrofone(e).message);
      cancelar();
    }
  }, [cancelar]);

  useEffect(() => {
    if (bloqueada) cancelar();
  }, [bloqueada, cancelar]);

  useEffect(() => {
    const aoOcultar = () => { if (document.hidden) cancelar(); };
    document.addEventListener("visibilitychange", aoOcultar);
    return () => {
      document.removeEventListener("visibilitychange", aoOcultar);
      cancelar();
    };
  }, [cancelar]);

  const ativa = estado === "conectando" || estado === "ouvindo" || estado === "finalizando";
  return { estado, ativa, parcial, erro, provedor, iniciar, parar, cancelar };
}

export type Transcricao = ReturnType<typeof useTranscricao>;
