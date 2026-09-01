/**
 * Helpers puros de badge de autor — seguros para Client Components.
 * Não importar `@torcida/db` / `./feed` aqui (quebra o bundle do browser).
 */

import { formatUnidadeLabel, nomeUnidadeEhSede, nomesEquivalentes } from './torcida-labels'

/**
 * Pill de quem ainda não é sócio de torcida real — a identidade pública dele é
 * "torcedor do clube", não a torcida por onde entrou. Constante única para o
 * feed (`enriquecerPostsComBadges`), o preview pós-publicação (`previewDoPost`)
 * e o composer da Comunidade Nacional não divergirem.
 */
export const CARGO_TORCEDOR = 'Torcedor'

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
 * Unidade ao lado do nome no feed. Subsede/PDE que identifica um lugar próprio
 * entra com o nome; cadastrado direto na torcida (Sede raiz, ou sem unidade)
 * vira "Sede". Unidade promovida a tenant próprio (Caso B — nome = tenant,
 * tipo SUBSEDE/PDE) continua oculta: não é a Sede da torcida.
 */
export function formatAutorUnidadeBadge(
  sedeNome: string | null | undefined,
  torcidaNome: string | null | undefined,
  opts?: { tipo?: string | null },
): string | null {
  const label = formatUnidadeLabel({ nome: sedeNome, tipo: opts?.tipo, torcidaNome })
  if (label) return label
  if (opts?.tipo === 'SUBSEDE' || opts?.tipo === 'PONTO_ENCONTRO') return null
  if (opts?.tipo === 'SEDE' || nomeUnidadeEhSede(sedeNome) || !sedeNome?.trim()) {
    return 'Sede'
  }
  return null
}

/**
 * Segunda linha do card no feed misto (CN, rede, outra torcida): o nome da
 * torcida em texto. Some quando o nome é o da comunidade já aberta
 * (ex.: TIMÃO no feed do clube).
 */
export function formatTorcidaNoFeed(
  tenantNome: string | null | undefined,
  contextoNome?: string | null,
): string | null {
  const nome = tenantNome?.trim() || null
  if (!nome) return null
  if (contextoNome && nomesEquivalentes(nome, contextoNome)) return null
  return nome
}
