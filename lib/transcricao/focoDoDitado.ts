/**
 * Se o clique no microfone deve devolver o foco ao campo. Com mouse ou teclado sim: senão o foco fica no botão e o
 * Enter seguinte religaria o microfone. Com toque não: focar o campo abriria o teclado virtual por cima do ditado.
 * `pointerType` vazio ou ausente é clique por teclado (ou navegador sem PointerEvent no click).
 */
export function deveFocarCampo(pointerType: string | undefined): boolean {
  return pointerType !== "touch";
}
