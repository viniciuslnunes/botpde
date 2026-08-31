/**
 * Registry de capacidades por departamento canônico.
 * Fonte de navegação portal × operação admin — NÃO duplica RBAC.
 * Ver docs/data/proposta-departamentos-portal-admin.md (Fase 5).
 */

import { DEPARTAMENTO_MODULO_ADMIN_ROTA, DEPARTAMENTO_MODULO_ROTA, DEPARTAMENTO_MODULOS } from './permissions.js'
import { thinCopyPorSlug } from './departamento-thin.js'

/**
 * @typedef {'equipe' | 'modulo' | 'avisos' | 'agenda' | 'caixa' | 'inventario' | 'ensaios' | 'embarque' | 'mensalidades' | 'pedidos' | 'moderacao' | 'barracao' | 'canal' | 'acervo' | 'vistoria'} DepartamentoFeature
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   feature: DepartamentoFeature,
 *   href?: string | null,
 * }} DepartamentoSubarea
 */

/**
 * @typedef {{
 *   slug: string,
 *   moduloPortal: string | null,
 *   features: readonly DepartamentoFeature[],
 *   portalPanel: 'generico' | 'financeiro' | 'patrimonio' | 'bandeiras' | 'bateria' | 'caravanas' | 'diretoria' | 'carnaval',
 *   kind: 'plugin' | 'thin',
 *   mission: string,
 *   subareas: readonly DepartamentoSubarea[],
 * }} DepartamentoCapability
 */

/** @type {readonly DepartamentoCapability[]} */
export const DEPARTAMENTO_CAPABILITIES = Object.freeze([
  {
    slug: 'diretoria',
    moduloPortal: 'diretoria',
    features: ['equipe', 'avisos'],
    portalPanel: 'diretoria',
    kind: 'plugin',
    mission: 'Governança e admissão: fila de sócios, equipe da prancheta e visão dos demais departamentos.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'fila', label: 'Fila de membros', feature: 'avisos' },
      { id: 'dominio', label: 'Painel', feature: 'avisos' },
    ],
  },
  {
    slug: 'financeiro',
    moduloPortal: 'financeiro',
    features: ['equipe', 'caixa', 'mensalidades'],
    portalPanel: 'financeiro',
    kind: 'plugin',
    mission: 'Caixa da torcida, planos de associação e mensalidades — prestação de contas no portal.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'caixa', label: 'Caixa', feature: 'caixa', href: '/portal/financeiro' },
      { id: 'mensalidades', label: 'Mensalidades', feature: 'mensalidades', href: '/portal/cobrancas' },
    ],
  },
  {
    slug: 'social-e-eventos',
    moduloPortal: 'social',
    features: ['equipe', 'modulo', 'agenda'],
    portalPanel: 'generico',
    kind: 'thin',
    mission: 'Festas, churrascos e ações na sede — agenda no módulo de Eventos.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'agenda', label: 'Agenda', feature: 'agenda', href: '/portal/eventos' },
      { id: 'dominio', label: 'Sobre', feature: 'modulo' },
    ],
  },
  {
    slug: 'materiais-loja',
    moduloPortal: 'loja',
    features: ['equipe', 'modulo', 'pedidos'],
    portalPanel: 'generico',
    kind: 'thin',
    mission: 'Camisas, bandeiras e pedidos — catálogo e sacola na Loja do portal.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'pedidos', label: 'Pedidos', feature: 'pedidos', href: '/admin/loja/pedidos' },
      { id: 'dominio', label: 'Loja', feature: 'modulo', href: '/portal/loja' },
    ],
  },
  {
    slug: 'comunicacao',
    moduloPortal: 'comunidade',
    features: ['equipe', 'modulo', 'avisos', 'moderacao'],
    portalPanel: 'generico',
    kind: 'thin',
    mission: 'Mural, comunicados e conversa da torcida — Comunidade no dia a dia; moderação no admin.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'avisos', label: 'Comunicados', feature: 'avisos' },
      { id: 'dominio', label: 'Comunidade', feature: 'modulo', href: '/portal/comunidade' },
    ],
  },
  {
    slug: 'patrimonio',
    moduloPortal: 'patrimonio',
    features: ['equipe', 'inventario'],
    portalPanel: 'patrimonio',
    kind: 'plugin',
    mission: 'Instrumentos, bandeirões e bens da sede — inventário com status e responsáveis.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'inventario', label: 'Inventário', feature: 'inventario', href: '/portal/patrimonio' },
      { id: 'dominio', label: 'Resumo', feature: 'inventario' },
    ],
  },
  {
    // Bandeirão e faixa são patrimônio, mas com dia a dia próprio: guarda,
    // escala de quem leva ao jogo e vistoria de entrada. Reusa o inventário
    // (categoria BANDEIRA) e a Agenda — sem módulo paralelo.
    slug: 'bandeiras',
    moduloPortal: 'bandeiras',
    features: ['equipe', 'acervo', 'agenda', 'vistoria'],
    portalPanel: 'bandeiras',
    kind: 'plugin',
    mission:
      'O trapo da torcida: guarda e conservação do acervo, escala de quem leva no jogo e vistoria de entrada no estádio.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      {
        id: 'acervo',
        label: 'Acervo',
        feature: 'acervo',
        href: '/portal/patrimonio?categoria=BANDEIRA',
      },
      { id: 'escala', label: 'Escala', feature: 'agenda', href: '/portal/eventos' },
      { id: 'dominio', label: 'Vistoria', feature: 'vistoria' },
    ],
  },
  {
    slug: 'bateria',
    moduloPortal: 'bateria',
    features: ['equipe', 'modulo', 'ensaios', 'agenda'],
    portalPanel: 'bateria',
    kind: 'plugin',
    mission: 'Ritmo na arquibancada: ensaios, presença e escala — sem misturar com festa genérica.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'ensaios', label: 'Ensaios', feature: 'ensaios', href: '/portal/eventos?tipo=ENSAIO' },
      { id: 'dominio', label: 'Presença', feature: 'ensaios' },
    ],
  },
  {
    slug: 'caravanas',
    moduloPortal: 'caravanas',
    features: ['equipe', 'modulo', 'agenda', 'embarque'],
    portalPanel: 'caravanas',
    kind: 'plugin',
    mission: 'Viagens para jogos fora: RSVP, lista de embarque e check-in no dia.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'agenda', label: 'Agenda', feature: 'agenda', href: '/portal/eventos?tipo=CARAVANA' },
      { id: 'embarque', label: 'Embarque', feature: 'embarque' },
    ],
  },
  {
    slug: 'feminino',
    moduloPortal: 'feminino',
    features: ['equipe', 'modulo', 'avisos', 'agenda'],
    portalPanel: 'generico',
    kind: 'thin',
    mission: 'Organização das mulheres na torcida — equipe do departamento e presença na Comunidade.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'agenda', label: 'Ações', feature: 'agenda', href: '/portal/eventos' },
      { id: 'dominio', label: 'Comunidade', feature: 'modulo', href: '/portal/comunidade' },
    ],
  },
  {
    slug: 'carnaval',
    moduloPortal: 'carnaval',
    features: ['equipe', 'modulo', 'agenda', 'barracao'],
    portalPanel: 'carnaval',
    kind: 'plugin',
    mission:
      'Concentração e ensaios de rua em Eventos; checklist do barracão no departamento — sem ERP de escola.',
    subareas: [
      { id: 'equipe', label: 'Equipe', feature: 'equipe' },
      { id: 'agenda', label: 'Cronograma', feature: 'agenda', href: '/portal/eventos' },
      { id: 'barracao', label: 'Barracão', feature: 'barracao' },
      { id: 'dominio', label: 'Eventos', feature: 'modulo', href: '/portal/eventos' },
    ],
  },
])

const BY_SLUG = new Map(DEPARTAMENTO_CAPABILITIES.map((c) => [c.slug, c]))

const MODULO_LABEL = new Map(DEPARTAMENTO_MODULOS.map((m) => [m.key, m.label]))

/** Slugs legados (tipo de membro, não área operacional) — não listar no hub. */
export const DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL = Object.freeze(['socio', 'torcedor'])

const SLUGS_LEGADOS = new Set(DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL)

/** Nomes legados (case-insensitive) — cobre dados antigos com slug fora do padrão. */
const DEPARTAMENTOS_NOMES_LEGADOS = new Set(['socio', 'sócio', 'torcedor'])

/**
 * Torcedor / Sócio são tipos de membro (`TipoMembro`), não departamentos.
 * Aceita slug solto ou `{ slug, nome }` — use em listagens e gates de rota.
 *
 * @param {string | { slug?: string | null, nome?: string | null } | null | undefined} slugOrDept
 * @param {string | null | undefined} [nome]
 * @returns {boolean}
 */
export function isDepartamentoLegado(slugOrDept, nome) {
  const slug =
    typeof slugOrDept === 'string' || slugOrDept == null
      ? slugOrDept
      : slugOrDept.slug
  const nomeResolvido =
    typeof slugOrDept === 'object' && slugOrDept != null
      ? (slugOrDept.nome ?? nome)
      : nome

  const slugNorm = typeof slug === 'string' ? slug.trim().toLowerCase() : ''
  if (SLUGS_LEGADOS.has(slugNorm)) return true

  const nomeNorm =
    typeof nomeResolvido === 'string' ? nomeResolvido.trim().toLowerCase() : ''
  return DEPARTAMENTOS_NOMES_LEGADOS.has(nomeNorm)
}

/**
 * @param {string} slug
 * @returns {DepartamentoCapability | null}
 */
export function capabilityPorSlug(slug) {
  return BY_SLUG.get(slug) ?? null
}

/**
 * @param {string} slug
 * @returns {'plugin' | 'thin'}
 */
export function kindDepartamento(slug) {
  return capabilityPorSlug(slug)?.kind ?? 'thin'
}

/**
 * @param {string} slug
 * @returns {string}
 */
export function missionDepartamento(slug) {
  const cap = capabilityPorSlug(slug)
  if (cap?.mission) return cap.mission
  const thin = thinCopyPorSlug(slug)
  return thin?.descricao ?? 'Departamento operacional da torcida.'
}

/**
 * @param {string} slug
 * @returns {readonly DepartamentoSubarea[]}
 */
export function subareasDepartamento(slug) {
  return capabilityPorSlug(slug)?.subareas ?? [
    { id: 'equipe', label: 'Equipe', feature: 'equipe' },
    { id: 'dominio', label: 'Sobre', feature: 'modulo' },
  ]
}

/**
 * `moduloPortal` canônico (registry) com fallback ao valor persistido no banco.
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

  if (cap?.portalPanel === 'diretoria') return 'Departamento · Membros e governança'
  if (cap?.portalPanel === 'financeiro') return 'Departamento · Financeiro e mensalidades'
  if (cap?.portalPanel === 'patrimonio') return 'Departamento · Inventário'
  if (cap?.portalPanel === 'bandeiras') return 'Departamento · Acervo e escala de bandeiras'
  if (cap?.portalPanel === 'bateria') return 'Departamento · Ensaios (Bateria)'
  if (cap?.portalPanel === 'caravanas') return 'Departamento · Viagens e embarque'
  if (cap?.portalPanel === 'carnaval') return 'Departamento · Cronograma e barracão'

  if (thin && modulo) {
    const dest = MODULO_LABEL.get(modulo) ?? modulo
    return `Via ${dest}`
  }

  if (!modulo) return 'Departamento da torcida'
  return `Departamento · ${MODULO_LABEL.get(modulo) ?? modulo}`
}

/**
 * Deep-link para uma área, projeto ou pessoa no cockpit. Se a aba não veio,
 * a query escolhe a aba correspondente (`areas` / `projetos` / `equipe`).
 *
 * @typedef {{
 *   area?: string | null,
 *   projeto?: string | null,
 *   pessoa?: string | null,
 * }} FocoDepartamento
 */

/**
 * Home do departamento no portal. `tab` opcional vira `?tab=` — o painel
 * (aba inicial) omite a query para a URL ficar estável. `foco` aponta para
 * o card certo; a gestão continua no cockpit, não numa ficha paralela.
 *
 * @param {string} slug
 * @param {string | null | undefined} [tab]
 * @param {FocoDepartamento | null | undefined} [foco]
 */
export function hrefHomeDepartamento(slug, tab, foco) {
  const base = `/portal/departamentos/${slug}`
  const area = foco?.area || null
  const projeto = foco?.projeto || null
  const pessoa = foco?.pessoa || null

  let aba = tab && tab !== 'painel' ? tab : ''
  if (!aba) {
    if (area) aba = 'areas'
    else if (projeto) aba = 'projetos'
    else if (pessoa) aba = 'equipe'
  }

  const params = new URLSearchParams()
  if (aba) params.set('tab', aba)
  if (area) params.set('area', area)
  if (projeto) params.set('projeto', projeto)
  if (pessoa) params.set('pessoa', pessoa)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/**
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
 * @param {string | null | undefined} moduloPortal
 * @returns {string | null}
 */
export function hrefOperacaoAdmin(moduloPortal) {
  if (!moduloPortal || !(moduloPortal in DEPARTAMENTO_MODULO_ADMIN_ROTA)) return null
  return DEPARTAMENTO_MODULO_ADMIN_ROTA[/** @type {keyof typeof DEPARTAMENTO_MODULO_ADMIN_ROTA} */ (moduloPortal)]
}
