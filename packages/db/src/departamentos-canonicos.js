/**
 * Lista canônica de departamentos + upsert idempotente por (tenantId, slug).
 * Usado pelo script seed:departamentos, pelo setup de tenant e pelo seed.js.
 *
 * Política membro vs gestor:
 *   permissions        → o que o membro da equipe ganha (ver / agir leve)
 *   permissionsGestor  → o que o gestor ganha a mais (gerir a área)
 */
import {
  PERMISSIONS,
  applyPermissionCascade,
  slugifyDepartamento,
} from '../../types/src/permissions.js'

/** Slugs legados que não são departamentos (são tipos de membro). */
export const DEPARTAMENTOS_SLUGS_LEGADOS = ['socio', 'torcedor']

/**
 * Slugs dos 10 departamentos canônicos — útil para badge "padrão" na UI.
 * @type {readonly string[]}
 */
export const DEPARTAMENTOS_CANONICOS_SLUGS = [
  'diretoria',
  'financeiro',
  'social-e-eventos',
  'materiais-loja',
  'comunicacao',
  'patrimonio',
  'batucada',
  'caravanas',
  'feminino',
  'carnaval',
]

/**
 * Lista canônica — Diretoria e Patrimônio ficam sem permissões de propósito:
 * a visão ampla da Diretoria vem do perfil (Presidente/Vice), não do
 * departamento; Patrimônio é stub até o módulo existir.
 *
 * @type {ReadonlyArray<{
 *   nome: string,
 *   cor: string,
 *   moduloPortal: string | null,
 *   permissions: string[],
 *   permissionsGestor: string[],
 * }>}
 */
export const DEPARTAMENTOS_CANONICOS = [
  {
    nome: 'Diretoria',
    cor: '#1f2937',
    moduloPortal: null,
    permissions: [],
    permissionsGestor: [],
  },
  {
    nome: 'Financeiro',
    cor: '#047857',
    moduloPortal: 'financeiro',
    permissions: [PERMISSIONS.REPORTS_VIEW],
    permissionsGestor: [],
  },
  {
    nome: 'Social e eventos',
    cor: '#7c3aed',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
  {
    nome: 'Materiais / Loja',
    cor: '#b45309',
    moduloPortal: 'loja',
    permissions: [PERMISSIONS.STORE_VIEW_ORDERS],
    permissionsGestor: [PERMISSIONS.STORE_MANAGE],
  },
  {
    nome: 'Comunicação',
    cor: '#0369a1',
    moduloPortal: 'comunidade',
    permissions: [PERMISSIONS.COMMUNITY_POST, PERMISSIONS.ANNOUNCEMENTS_PUBLISH],
    permissionsGestor: [PERMISSIONS.COMMUNITY_MANAGE, PERMISSIONS.NEWS_CURATE],
  },
  {
    nome: 'Patrimônio',
    cor: '#57534e',
    moduloPortal: 'patrimonio',
    permissions: [],
    permissionsGestor: [],
  },
  {
    nome: 'Batucada',
    cor: '#be123c',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
  {
    nome: 'Caravanas',
    cor: '#c2410c',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
  {
    nome: 'Feminino',
    cor: '#db2777',
    moduloPortal: 'comunidade',
    permissions: [PERMISSIONS.COMMUNITY_POST],
    permissionsGestor: [],
  },
  {
    nome: 'Carnaval',
    cor: '#4d7c0f',
    moduloPortal: 'eventos',
    permissions: [PERMISSIONS.EVENTS_CREATE],
    permissionsGestor: [PERMISSIONS.EVENTS_MANAGE],
  },
]

/**
 * @param {string} slug
 * @returns {boolean}
 */
export function isDepartamentoCanonico(slug) {
  return DEPARTAMENTOS_CANONICOS_SLUGS.includes(slug)
}

/**
 * Upsert dos 10 departamentos canônicos no tenant. Idempotente.
 * Também remove departamentos legados socio/torcedor.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @returns {Promise<{ upserted: number, removedLegacy: number }>}
 */
export async function upsertDepartamentosCanonicos(client, tenantId) {
  const removed = await client.departamento.deleteMany({
    where: { tenantId, slug: { in: DEPARTAMENTOS_SLUGS_LEGADOS } },
  })

  let ordem = 0
  for (const canonico of DEPARTAMENTOS_CANONICOS) {
    const slug = slugifyDepartamento(canonico.nome)
    const permissions = applyPermissionCascade([], canonico.permissions)
    const permissionsGestor = applyPermissionCascade(
      permissions,
      [...permissions, ...canonico.permissionsGestor],
    ).filter((p) => !permissions.includes(p))

    await client.departamento.upsert({
      where: { tenantId_slug: { tenantId, slug } },
      create: {
        tenantId,
        nome: canonico.nome,
        slug,
        cor: canonico.cor,
        moduloPortal: canonico.moduloPortal,
        permissions,
        permissionsGestor,
        ordem,
      },
      update: {
        cor: canonico.cor,
        moduloPortal: canonico.moduloPortal,
        permissions,
        permissionsGestor,
        ordem,
      },
    })
    ordem += 1
  }

  return {
    upserted: DEPARTAMENTOS_CANONICOS.length,
    removedLegacy: removed.count,
  }
}
