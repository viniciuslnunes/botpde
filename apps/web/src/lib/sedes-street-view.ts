/**
 * Qual sede o Street View do portal deve mostrar.
 *
 * Selecionada com coordenadas ganha. Sem seleção, só assume quando há um
 * único local com coords (o caso típico de torcida com uma sede).
 * Com vários pins e nenhum escolhido, devolve null — a aba fica desabilitada.
 */
export function resolverSedeStreetView<
  T extends { lat: number | null; lng: number | null },
>(selected: T | null, candidatas: T[]): T | null {
  if (selected?.lat != null && selected.lng != null) return selected
  const comCoords = candidatas.filter((s) => s.lat != null && s.lng != null)
  if (comCoords.length === 1) return comCoords[0] ?? null
  return null
}
