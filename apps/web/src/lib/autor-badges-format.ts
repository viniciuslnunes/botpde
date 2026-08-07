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

/** Nº a partir de `SaasMembro.numeroAssociado` (ficha) quando não há carteirinha. */
export function parseNumeroAssociado(
  raw: string | null | undefined,
): number | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Sócio com nº conhecido: acrescenta " - Nº N" a qualquer badge de cargo
 * (Sócio, Membro · área, Presidente, Administrador, …). Torcedor nunca.
 * Aceita o badge já combinado (`Membro · Bateria`).
 */
export function formatCargoComNumeroSocio(
  cargoNome: string | null,
  opts: { numeroSocio: number | null | undefined; exibir: boolean },
): string | null {
  const cargo = cargoNome?.trim() || null
  if (!cargo) return null
  if (!opts.exibir || opts.numeroSocio == null || !Number.isFinite(opts.numeroSocio)) {
    return cargo
  }
  // Idempotente se o Nº já veio embutido (ex.: cargoNome pré-formatado).
  if (/\s-\sNº\s+\d+/.test(cargo)) return cargo
  // Torcedor não tem carteirinha/nº de associado.
  if (cargo === 'Torcedor' || cargo.startsWith('Torcedor ')) return cargo
  return `${cargo} - Nº ${opts.numeroSocio}`
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
