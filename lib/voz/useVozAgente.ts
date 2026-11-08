"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { focoAudio } from "../audio/foco";
import { useLiberarAudio } from "../presenca/useLiberarAudio";
import { reproduzirFala, type ProvedorVoz } from "./cliente";
import { criarFilaDeFalas, type EstadoVoz, type FilaDeFalas, type LegendaAgente } from "./filaDeFalas";

export { PAUSA_ENTRE_FALAS_MS } from "./filaDeFalas";
export type FalaAgente = { id: string; texto: string };

export function useVozAgente({ ultimaFala = null, bloqueada = false }: {
  ultimaFala?: FalaAgente | null;
  bloqueada?: boolean;
} = {}) {
  // Sem o destrave, o play() do áudio do ElevenLabs é bloqueado e a fala espera o próximo toque.
  useLiberarAudio();
  const [estado, setEstado] = useState<EstadoVoz>("inativa");
  const [habilitada, setHabilitada] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [provedor, setProvedor] = useState<ProvedorVoz | null>(null);
  const [fala, setFala] = useState<LegendaAgente | null>(null);
  // Uma fala por vez, com pausa entre elas (lib/voz/filaDeFalas.ts). Os setters do React são estáveis.
  const [fila] = useState<FilaDeFalas>(() => criarFilaDeFalas({
    reproduzir: reproduzirFala,
    foco: focoAudio,
    tela: { estado: setEstado, erro: setErro, aviso: setAviso, provedor: setProvedor, fala: setFala },
  }));
  const habilitadaRef = useRef(true);
  const bloqueadaRef = useRef(bloqueada);
  bloqueadaRef.current = bloqueada;
  const montado = useRef(false);
  const ultimaProgramada = useRef<string | null>(null);

  const parar = fila.parar;

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

  /**
   * Uma fala nova não corta a que está tocando: toca depois dela, com uma pausa (ver criarFilaDeFalas).
   * `antesDeTocar`: com o áudio pronto e a vez do agente, espera a pessoa fazer uma pausa; false desiste da fala.
   * Devolve true se a fala tocou até o fim (false: voz desligada, bloqueada, cancelada, substituída ou com erro).
   */
  const falar = useCallback(async (texto: string, opcoes?: { antesDeTocar?: () => Promise<boolean> }): Promise<boolean> => {
    if (!montado.current || document.hidden) return false;
    if (!habilitadaRef.current || bloqueadaRef.current || !texto.trim()) return false;
    return fila.falar(texto, opcoes);
  }, [fila]);

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

  /** Deixa falas curtas prontas (o "uhum" de quando o candidato termina de falar) para tocarem sem espera. */
  const preparar = useCallback((textos: string[]) => {
    if (habilitadaRef.current && !bloqueadaRef.current) reproduzirFala.preparar(textos);
  }, []);

  return { estado, habilitada, erro, aviso, provedor, fala, falar, parar, alternar, preparar, ativa: estado === "preparando" || estado === "falando" };
}

export type VozAgente = ReturnType<typeof useVozAgente>;
