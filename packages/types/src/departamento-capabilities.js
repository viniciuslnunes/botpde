/**
 * Registry de capacidades por departamento canônico.
 * Fonte de navegação portal × operação admin — NÃO duplica RBAC.
 * Ver docs/data/proposta-departamentos-portal-admin.md.
 */

import { DEPARTAMENTO_MODULO_ADMIN_ROTA, DEPARTAMENTO_MODULO_ROTA, DEPARTAMENTO_MODULOS } from './permissions.js'
import { thinCopyPorSlug } from './departamento-thin.js'

/**
 * @typedef {'equipe' | 'modulo' | 'avisos' | 'agenda' | 'caixa' | 'inventario' | 'ensaios'} DepartamentoFeature
 */

/**
 * @typedef {{
 *   slug: string,
 *   moduloPortal: string | null,
 *   features: readonly DepartamentoFeature[],
 *   portalPanel: 'generico' | 'financeiro' | 'patrimonio' | 'bateria' | 'caravanas' | 'diretoria',
 * }} DepartamentoCapability
 */

/** @type {readonly DepartamentoCapability[]} */
export const DEPARTAMENTO_CAPABILITIES = Object.freeze([
  {
    slug: 'diretoria',
    moduloPortal: 'membros',
    features: ['equipe', 'avisos'],
    portalPanel: 'diretoria',
  },
  {
    slug: 'financeiro',
    moduloPortal: 'financeiro',
    features: ['equipe', 'caixa'],
    portalPanel: 'financeiro',
  },
  {
    slug: 'social-e-eventos',
    moduloPortal: 'eventos',
    features: ['equipe', 'modulo', 'agenda'],
    portalPanel: 'generico',
  },
  {
    slug: 'materiais-loja',
    moduloPortal: 'loja',
    features: ['equipe', 'modulo'],
    portalPanel: 'generico',
  },
  {
    slug: 'comunicacao',
    moduloPortal: 'comunidade',
    features: ['equipe', 'modulo', 'avisos'],
    portalPanel: 'generico',
  },
  {
    slug: 'patrimonio',
    moduloPortal: 'patrimonio',
    features: ['equipe', 'inventario'],
    portalPanel: 'patrimonio',
  },
  {
    slug: 'bateria',
    moduloPortal: 'bateria',
    features: ['equipe', 'modulo', 'ensaios', 'agenda'],
    portalPanel: 'bateria',
  },
  {
    slug: 'caravanas',
    moduloPortal: 'caravanas',
    features: ['equipe', 'modulo', 'agenda'],
    portalPanel: 'caravanas',
  },
  {
    slug: 'feminino',
    moduloPortal: 'comunidade',
    features: ['equipe', 'modulo', 'avisos'],
    portalPanel: 'generico',
  },
  {
    slug: 'carnaval',
    moduloPortal: 'eventos',
    features: ['equipe', 'modulo', 'agenda'],
    portalPanel: 'generico',
  },
])

const BY_SLUG = new Map(DEPARTAMENTO_CAPABILITIES.map((c) => [c.slug, c]))

const MODULO_LABEL = new Map(DEPARTAMENTO_MODULOS.map((m) => [m.key, m.label]))

/** Slugs legados (tipo de membro, não área operacional) — não listar no hub. */
export const DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL = Object.freeze(['socio', 'torcedor'])

/**
 * @param {string} slug
 * @returns {DepartamentoCapability | null}
 */
export function capabilityPorSlug(slug) {
  return BY_SLUG.get(slug) ?? null
}

/**
 * `moduloPortal` canônico (registry) com fallback ao valor persistido no banco.
 * Evita rótulos/rotas erradas quando o seed ainda não sincronizou o tenant.
 * @param {string} slug
 * @param {string | null | undefined} moduloPortalDb
 * @returns {string | null}
 */
export function resolverModuloPortalDepartamento(slug, moduloPortalDb) {
  const cap = capabilityPorSlug(slug)
  if (cap) return cap.moduloPortal
  return moduloPortalDb ?? null
}

/**
 * Texto curto do hub: distingue módulo próprio vs thin wrapper que compõe outro.
 * @param {string} slug
 * @param {string | null | undefined} moduloPortalDb
 * @returns {string}
 */
export function rotuloAreaDepartamento(slug, moduloPortalDb) {
  const cap = capabilityPorSlug(slug)
  const modulo = resolverModuloPortalDepartamento(slug, moduloPortalDb)
  const thin = thinCopyPorSlug(slug)

  if (cap?.portalPanel === 'diretoria') return 'Área · Membros e governança'
  if (cap?.portalPanel === 'financeiro') return 'Área · Financeiro e mensalidades'
  if (cap?.portalPanel === 'patrimonio') return 'Área · Inventário'
  if (cap?.portalPanel === 'bateria') return 'Área · Ensaios (Bateria)'
  if (cap?.portalPanel === 'caravanas') return 'Área · Viagens e embarque'

  if (thin && modulo) {
    const dest = MODULO_LABEL.get(modulo) ?? modulo
    return `Compõe · ${dest}`
  }

  if (!modulo) return 'Área da torcida'
  return `Área · ${MODULO_LABEL.get(modulo) ?? modulo}`
}

/**
 * Home da área no portal — destino padrão para membros.
 * @param {string} slug
 */
export function hrefHomeDepartamento(slug) {
  return `/portal/departamentos/${slug}`
}

/**
 * Módulo portal associado (nunca /admin). null = experiência só na home da área.
 * @param {string | null | undefined} moduloPortal
 * @returns {string | null}
 */
export function hrefModuloPortal(moduloPortal) {
  if (!moduloPortal || !(moduloPortal in DEPARTAMENTO_MODULO_ROTA)) return null
  const rota = DEPARTAMENTO_MODULO_ROTA[/** @type {keyof typeof DEPARTAMENTO_MODULO_ROTA} */ (moduloPortal)]
  if (!rota.disponivel || !rota.href) return null
  if (rota.href.startsWith('/admin')) return null
  return rota.href
}

/**
 * Operação admin do domínio — só para gestores.
 * @param {string | null | undefined} moduloPortal
 * @returns {string | null}
 */
export function hrefOperacaoAdmin(moduloPortal) {
  if (!moduloPortal || !(moduloPortal in DEPARTAMENTO_MODULO_ADMIN_ROTA)) return null
  return DEPARTAMENTO_MODULO_ADMIN_ROTA[/** @type {keyof typeof DEPARTAMENTO_MODULO_ADMIN_ROTA} */ (moduloPortal)]
}
