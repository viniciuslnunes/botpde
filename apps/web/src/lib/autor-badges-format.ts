/**
 * Helpers puros de badge de autor — seguros para Client Components.
 * Não importar `@torcida/db` / `./feed` aqui (quebra o bundle do browser).
 */

import { formatUnidadeLabel } from './torcida-labels'

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

/**
 * Unidade do autor (`SaasMembro.sede`) só acrescenta informação quando difere
 * da torcida do post: unidade promovida a tenant próprio (Caso B) tem o mesmo
 * nome do tenant, e a Sede raiz costuma ser "Sede — <Torcida>". Regra única em
 * `unidadeRepeteTorcida` — compare sempre com o nome da torcida do post, mesmo
 * quando o badge de torcida está oculto (na própria torcida a repetição é a
 * mesma).
 */
export function formatAutorUnidadeBadge(
  sedeNome: string | null | undefined,
  torcidaNome: string | null | undefined,
): string | null {
  return formatUnidadeLabel({ nome: sedeNome, torcidaNome })
}
