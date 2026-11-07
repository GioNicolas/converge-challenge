"use client";

// Espaço reservado da janela de chamada (estilo Meet, no canto da tela).
// A versão completa (câmera local, mic, minimizar em pílula, arrastar) vem no bloco das 13h.
export default function JanelaChamada() {
  return (
    <div className="pointer-events-auto flex h-[180px] w-[280px] flex-col justify-between overflow-hidden rounded-padrao bg-vidro-escuro p-4 text-texto-claro shadow-flutuante backdrop-blur-xl">
      <span className="text-xs font-medium text-texto-claro/70">Entrevistador</span>
      <span className="text-sm text-texto-claro/70">Janela de chamada</span>
    </div>
  );
}
