/**
 * Registry de capacidades por departamento canônico.
 * Fonte de navegação portal × operação admin — NÃO duplica RBAC.
 * Ver docs/data/proposta-departamentos-portal-admin.md.
 */

import { DEPARTAMENTO_MODULO_ADMIN_ROTA, DEPARTAMENTO_MODULO_ROTA } from './permissions.js'

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

/**
 * @param {string} slug
 * @returns {DepartamentoCapability | null}
 */
export function capabilityPorSlug(slug) {
  return BY_SLUG.get(slug) ?? null
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
