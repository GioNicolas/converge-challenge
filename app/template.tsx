// Entre páginas, o conteúdo chega subindo um pouco (480ms, "entrar na tela"). O template remonta a cada
// navegação, então a animação roda sempre. Termina em transform:none: não cria contexto para filhos fixos.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="anim-subir" style={{ animationDuration: "0.5s" }}>
      {children}
    </div>
  );
}
