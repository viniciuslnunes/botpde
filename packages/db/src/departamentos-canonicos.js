/**
 * Lista canônica de departamentos + upsert idempotente por (tenantId, slug).
 * Usado pelo script seed:departamentos, pelo setup de tenant e pelo seed.js.
 *
 * Política membro vs gestor:
 *   permissions        → colaborador: ver / operar o dia a dia da área
 *   permissionsGestor  → gestor: a mais para gerir a área (+ staffing via DepartamentoGestor)
 *
 * Fora do escopo de departamento (só Presidência / owner):
 *   settings:manage, roles:manage, torcida:global_view, alliances:manage
 *
 * Vocabulário real: docs/knowledge/estrutura-governanca.md
 * Matriz de produto: docs/data/modulo-departamentos.md
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
 * Matriz canônica — cada área ganha um pacote operacional distinto.
 * Novas permissões de domínio (`finance:*`, `patrimony:*`) já entram no seed
 * mesmo com módulo ainda "em breve", para a UI e o RBAC ficarem prontos.
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
    // Prancheta / conselho operacional — visão ampla SEM poderes de Presidência
    nome: 'Diretoria',
    cor: '#1f2937',
    moduloPortal: 'membros',
    permissions: [
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.STORE_VIEW_ORDERS,
    ],
    permissionsGestor: [
      PERMISSIONS.MEMBERS_APPROVE,
      PERMISSIONS.MEMBERS_REJECT,
      PERMISSIONS.MEMBERS_WARN,
      PERMISSIONS.MEMBERS_BLOCK,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.FINANCE_MANAGE,
    ],
  },
  {
    // Mensalidades, inadimplência, prestação de contas, caixa de eventos/loja
    nome: 'Financeiro',
    cor: '#047857',
    moduloPortal: 'financeiro',
    permissions: [
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.STORE_VIEW_ORDERS,
      PERMISSIONS.MESSAGES_SEND,
    ],
    permissionsGestor: [
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.MEMBERS_IMPORT,
      PERMISSIONS.STORE_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.GROUPS_CREATE,
    ],
  },
  {
    // Festas, ações beneficentes, churrascos — mobilização social da sede
    nome: 'Social e eventos',
    cor: '#7c3aed',
    moduloPortal: 'eventos',
    permissions: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.STORE_VIEW_ORDERS,
      PERMISSIONS.NEWS_CURATE,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    // Camisas, bandeiras, produtos — operação de estoque e pedidos
    nome: 'Materiais / Loja',
    cor: '#b45309',
    moduloPortal: 'loja',
    permissions: [
      PERMISSIONS.STORE_VIEW_ORDERS,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MEMBERS_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.STORE_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.PATRIMONY_VIEW,
    ],
  },
  {
    // Mídia, mural, comunicados, notícias, canais — voz institucional
    nome: 'Comunicação',
    cor: '#0369a1',
    moduloPortal: 'comunidade',
    permissions: [
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.MEMBERS_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.MESSAGES_MODERATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.STORE_VIEW_ORDERS,
    ],
  },
  {
    // Sede, instrumentos, bandeirões, espaços físicos
    nome: 'Patrimônio',
    cor: '#57534e',
    moduloPortal: 'patrimonio',
    permissions: [
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.STORE_VIEW_ORDERS,
      PERMISSIONS.MEMBERS_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.PATRIMONY_MANAGE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.STORE_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.CHANNELS_MANAGE,
    ],
  },
  {
    // Bateria / ensaios — ritmo, ensaio, coordenação do núcleo musical
    nome: 'Batucada',
    cor: '#be123c',
    moduloPortal: 'eventos',
    permissions: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.NEWS_CURATE,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.PATRIMONY_MANAGE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.STORE_VIEW_ORDERS,
    ],
  },
  {
    // Viagens / jogos fora — listas de embarque, custo, logística
    nome: 'Caravanas',
    cor: '#c2410c',
    moduloPortal: 'eventos',
    permissions: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.STORE_VIEW_ORDERS,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.REPORTS_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.STORE_MANAGE,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.MEMBERS_WARN,
    ],
  },
  {
    // Organização das mulheres — mobilização, eventos e voz própria
    nome: 'Feminino',
    cor: '#db2777',
    moduloPortal: 'comunidade',
    permissions: [
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.STORE_VIEW_ORDERS,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.MESSAGES_MODERATE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MEMBERS_WARN,
    ],
  },
  {
    // Escola de samba / operação paralela — eventos + loja + finanças + patrimônio
    nome: 'Carnaval',
    cor: '#4d7c0f',
    moduloPortal: 'eventos',
    permissions: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.STORE_VIEW_ORDERS,
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.NEWS_CURATE,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.MESSAGES_MODERATE,
      PERMISSIONS.STORE_MANAGE,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.PATRIMONY_MANAGE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.MEMBERS_WARN,
    ],
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
