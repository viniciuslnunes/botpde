/**
 * Helpers puros de badge de autor — seguros para Client Components.
 * Não importar `@torcida/db` / `./feed` aqui (quebra o bundle do browser).
 */

/** Texto único do badge cargo + área (evita duplicar se o perfil já traz a área). */
export function formatAutorCargoBadge(
  cargoNome: string | null,
  departamentoNome: string | null,
): string | null {
  const cargo = cargoNome?.trim() || null
  const depto = departamentoNome?.trim() || null
  if (cargo && depto) {
    if (cargo === depto || cargo.includes(depto)) return cargo
    return `${cargo} · ${depto}`
  }
  return cargo ?? depto
}
