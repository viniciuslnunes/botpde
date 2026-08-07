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
 * Distribuição deliberada (2026-07-30):
 *   bar:* → Financeiro; members:import → Diretoria gestor;
 *   community:post_nacional → Presidência (cargo de sistema) + Comunicação gestor.
 *   Gestores de área operacional não levam finance/store/sedes transversais.
 *
 * Vocabulário real: docs/knowledge/estrutura-governanca.md
 * Matriz de produto: docs/data/modulo-departamentos.md
 */
import {
  PERMISSIONS,
  applyPermissionCascade,
  slugifyDepartamento,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
  PAPEL_DEPARTAMENTO,
  nomePerfilDepartamento,
} from '../../types/src/permissions.js'
import { isDepartamentoLegado } from '../../types/src/departamento-capabilities.js'
import { isMembroElegivelDepartamento } from '../../types/src/departamento-eligibilidade.js'
import {
  ensureCanaisDepartamentosTenant,
  syncCanaisDepartamentosDoUsuario,
} from './departamento-canais.js'

/** Slugs legados que não são departamentos (são tipos de membro). */
export const DEPARTAMENTOS_SLUGS_LEGADOS = ['socio', 'torcedor']

/**
 * Slugs dos departamentos canônicos — útil para badge "padrão" na UI.
 * @type {readonly string[]}
 */
export const DEPARTAMENTOS_CANONICOS_SLUGS = [
  'diretoria',
  'financeiro',
  'social-e-eventos',
  'materiais-loja',
  'comunicacao',
  'patrimonio',
  'bandeiras',
  'bateria',
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
    // Oversight / prancheta: visão admin read-only da unidade + portal.
    // Mutações e decisões ficam no gestor (ou cargos de sistema).
    nome: 'Diretoria',
    cor: '#1f2937',
    moduloPortal: 'diretoria',
    permissions: [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.STORE_VIEW_ORDERS,
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.COMMUNITY_VIEW,
      PERMISSIONS.SEDES_VIEW,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
    ],
    permissionsGestor: [
      PERMISSIONS.MEMBERS_APPROVE,
      PERMISSIONS.MEMBERS_REJECT,
      PERMISSIONS.MEMBERS_WARN,
      PERMISSIONS.MEMBERS_BLOCK,
      PERMISSIONS.MEMBERS_IMPORT,
      PERMISSIONS.MEMBERS_DISMISS,
      PERMISSIONS.MEMBERS_EXPORT_LGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.SEDES_MANAGE,
      PERMISSIONS.FINANCE_MANAGE,
    ],
  },
  {
    // Mensalidades, inadimplência, prestação de contas, caixa + Bar (PDV).
    // Escopo: portal (view / operar PDV); admin financeiro e catálogo do bar = gestor.
    nome: 'Financeiro',
    cor: '#047857',
    moduloPortal: 'financeiro',
    permissions: [
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.BAR_OPERATE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MESSAGES_SEND,
    ],
    permissionsGestor: [
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.BAR_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.GROUPS_CREATE,
    ],
  },
  {
    // Festas, ações beneficentes, churrascos — membro participa no portal.
    nome: 'Social e eventos',
    cor: '#7c3aed',
    moduloPortal: 'social',
    permissions: [
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.GROUPS_CREATE,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.STORE_VIEW_ORDERS,
    ],
  },
  {
    // Camisas, bandeiras, produtos — membro usa a loja no portal.
    nome: 'Materiais / Loja',
    cor: '#b45309',
    moduloPortal: 'loja',
    permissions: [
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.REPORTS_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.STORE_VIEW_ORDERS,
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
    // Mídia, mural, comunicados — membro posta no portal; curadoria = gestor.
    // post_nacional: Presidência (owner/vice via cargo de sistema) E Comunicação.
    nome: 'Comunicação',
    cor: '#0369a1',
    moduloPortal: 'comunidade',
    permissions: [
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.GROUPS_CREATE,
    ],
    permissionsGestor: [
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.COMMUNITY_POST_NACIONAL,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.MESSAGES_MODERATE,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.STORE_VIEW_ORDERS,
    ],
  },
  {
    // Sede, instrumentos, bandeirões — ver no portal; gerir no admin (gestor).
    // Sem loja/sedes territoriais: missão é inventário, não mini-admin.
    nome: 'Patrimônio',
    cor: '#57534e',
    moduloPortal: 'patrimonio',
    permissions: [
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
    ],
    permissionsGestor: [
      PERMISSIONS.PATRIMONY_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.CHANNELS_MANAGE,
    ],
  },
  {
    // Bandeiras — o trapo: acervo, escala de jogo e vistoria de entrada.
    // Colaborador NÃO leva `patrimony:view`: com o Patrimônio virando
    // inventário geral (mesa, cadeira, projetor), quem cuida da bandeira
    // enxerga só a bandeira. `flags:manage` (gestor) escreve apenas em
    // categoria BANDEIRA — a trava é `podeGerirCategoriaPatrimonio`.
    nome: 'Bandeiras',
    cor: '#4338ca',
    moduloPortal: 'bandeiras',
    permissions: [
      PERMISSIONS.FLAGS_VIEW,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.MEETINGS_HOST,
    ],
    permissionsGestor: [
      PERMISSIONS.FLAGS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      // Ver (não gerir) o inventário geral: saber onde a bandeira está
      // guardada junto do resto. Confecção/reforma sai como despesa rateada,
      // por isso `finance:view` — nunca `finance:manage`.
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  {
    // Bateria / ensaios — membro no portal; criar/gerir ensaios = gestor.
    // Instrumentos via patrimony:manage; sem sedes/loja transversais.
    nome: 'Bateria',
    cor: '#be123c',
    moduloPortal: 'bateria',
    permissions: [
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.PATRIMONY_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.PATRIMONY_MANAGE,
    ],
  },
  {
    // Viagens / jogos fora — membro no portal; operação = gestor.
    // Caixa/loja/sedes ficam com Financeiro, Materiais e Diretoria.
    nome: 'Caravanas',
    cor: '#c2410c',
    moduloPortal: 'caravanas',
    permissions: [
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.MEMBERS_WARN,
    ],
  },
  {
    // Organização das mulheres — membro no portal.
    nome: 'Feminino',
    cor: '#db2777',
    moduloPortal: 'feminino',
    permissions: [
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.MEETINGS_HOST,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.MESSAGES_MODERATE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.MEMBERS_WARN,
    ],
  },
  {
    // Escola de samba — membro no portal; operação da festa = gestor.
    // Sem loja/financeiro/patrimônio/sedes: missão é eventos e comunicação.
    nome: 'Carnaval',
    cor: '#4d7c0f',
    moduloPortal: 'carnaval',
    permissions: [
      PERMISSIONS.COMMUNITY_POST,
      PERMISSIONS.MESSAGES_SEND,
      PERMISSIONS.MEETINGS_HOST,
      PERMISSIONS.GROUPS_CREATE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.PATRIMONY_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
    permissionsGestor: [
      PERMISSIONS.EVENTS_CREATE,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.COMMUNITY_MODERATE,
      PERMISSIONS.NEWS_CURATE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.MESSAGES_MODERATE,
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
 * Renomes de slug canônico já semeados (legado → atual).
 * Evita duplicar departamento ao mudar o nome/slug da lista canônica.
 */
const DEPARTAMENTO_RENAMES = [
  { fromSlug: 'batucada', toNome: 'Bateria', fromNome: 'Batucada' },
]

/**
 * Move atribuições de um cargo para outro e apaga o origem.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @param {string} fromRoleId
 * @param {string} toRoleId
 */
async function migrarUserRolesEDeletarRole(client, tenantId, fromRoleId, toRoleId) {
  if (fromRoleId === toRoleId) return
  const links = await client.userRole.findMany({
    where: { tenantId, roleId: fromRoleId },
    select: { id: true, userId: true },
  })
  for (const link of links) {
    const jaTem = await client.userRole.findFirst({
      where: { userId: link.userId, tenantId, roleId: toRoleId },
      select: { id: true },
    })
    if (jaTem) await client.userRole.delete({ where: { id: link.id } })
    else {
      await client.userRole.update({
        where: { id: link.id },
        data: { roleId: toRoleId },
      })
    }
  }
  await client.role.delete({ where: { id: fromRoleId } })
}

/**
 * Renomeia cargo legado ou, se o destino já existe, funde (userRoles → destino, apaga origem).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @param {string} fromNome
 * @param {string} toNome
 * @param {string | null} departamentoId
 */
async function fundirOuRenomearRole(client, tenantId, fromNome, toNome, departamentoId) {
  const fromRoles = await client.role.findMany({
    where: { tenantId, nome: fromNome },
    select: { id: true },
  })
  if (fromRoles.length === 0) return

  const toRole = await client.role.findFirst({
    where: { tenantId, nome: toNome },
    select: { id: true },
  })

  if (!toRole) {
    const [primeiro, ...extras] = fromRoles
    await client.role.update({
      where: { id: primeiro.id },
      data: {
        nome: toNome,
        ...(departamentoId ? { departamentoId } : {}),
      },
    })
    for (const extra of extras) {
      await migrarUserRolesEDeletarRole(client, tenantId, extra.id, primeiro.id)
    }
    return
  }

  for (const from of fromRoles) {
    await migrarUserRolesEDeletarRole(client, tenantId, from.id, toRole.id)
  }
  if (departamentoId) {
    await client.role.update({
      where: { id: toRole.id },
      data: { departamentoId },
    })
  }
}

/**
 * Executa tarefas em série (seguro em interactive transaction) ou em paralelo.
 * @param {boolean} concurrent
 * @param {Array<() => Promise<unknown>>} tasks
 */
async function runTasks(concurrent, tasks) {
  if (concurrent) {
    await Promise.all(tasks.map((task) => task()))
    return
  }
  for (const task of tasks) await task()
}

/**
 * Upsert dos departamentos canônicos no tenant. Idempotente.
 * Também remove departamentos legados socio/torcedor.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @param {{ concurrent?: boolean }} [opts] `concurrent: true` só fora de `$transaction`
 * @returns {Promise<{ upserted: number, removedLegacy: number }>}
 */
export async function upsertDepartamentosCanonicos(client, tenantId, opts = {}) {
  const concurrent = opts.concurrent === true
  // Remove por slug canônico legado e por nome (dados antigos com slug fora do padrão).
  const candidatosLegados = await client.departamento.findMany({
    where: { tenantId },
    select: { id: true, slug: true, nome: true },
  })
  const legadoIds = candidatosLegados
    .filter((d) => isDepartamentoLegado(d))
    .map((d) => d.id)
  const removed =
    legadoIds.length > 0
      ? await client.departamento.deleteMany({ where: { id: { in: legadoIds } } })
      : { count: 0 }

  // Fast-path: a maioria dos tenants não tem rename legado — 2 queries em vez de ~6+.
  if (DEPARTAMENTO_RENAMES.length > 0) {
    const fromSlugs = DEPARTAMENTO_RENAMES.map((r) => r.fromSlug)
    const fromNomes = DEPARTAMENTO_RENAMES.flatMap((r) =>
      [PAPEL_DEPARTAMENTO.MEMBRO, PAPEL_DEPARTAMENTO.GESTOR].map((papel) =>
        nomePerfilDepartamento(r.fromNome, papel),
      ),
    )
    // Sequencial: este helper também roda dentro de `$transaction` interativo.
    const deptosLegados = await client.departamento.findMany({
      where: { tenantId, slug: { in: fromSlugs } },
      select: { id: true, slug: true },
    })
    const rolesLegados = await client.role.findMany({
      where: { tenantId, nome: { in: fromNomes } },
      select: { id: true, nome: true },
    })

    if (deptosLegados.length > 0 || rolesLegados.length > 0) {
      const legadoBySlug = new Map(deptosLegados.map((d) => [d.slug, d]))
      const roleNomesLegados = new Set(rolesLegados.map((r) => r.nome))

      for (const rename of DEPARTAMENTO_RENAMES) {
        const toSlug = slugifyDepartamento(rename.toNome)
        const legado = legadoBySlug.get(rename.fromSlug) ?? null
        const destino = await client.departamento.findFirst({
          where: { tenantId, slug: toSlug },
          select: { id: true },
        })

        /** @type {string | null} */
        let deptoId = destino?.id ?? legado?.id ?? null

        if (legado) {
          if (destino) {
            deptoId = destino.id
            await client.role.updateMany({
              where: { tenantId, departamentoId: legado.id },
              data: { departamentoId: destino.id },
            })
            const membrosLegado = await client.userDepartamento.findMany({
              where: { tenantId, departamentoId: legado.id },
              select: { id: true, userId: true },
            })
            for (const m of membrosLegado) {
              const jaTem = await client.userDepartamento.findFirst({
                where: { userId: m.userId, tenantId, departamentoId: destino.id },
                select: { id: true },
              })
              if (jaTem) await client.userDepartamento.delete({ where: { id: m.id } })
              else {
                await client.userDepartamento.update({
                  where: { id: m.id },
                  data: { departamentoId: destino.id },
                })
              }
            }
            const gestoresLegado = await client.departamentoGestor.findMany({
              where: { departamentoId: legado.id },
              select: { id: true, userId: true },
            })
            for (const g of gestoresLegado) {
              const jaTem = await client.departamentoGestor.findFirst({
                where: { userId: g.userId, departamentoId: destino.id },
                select: { id: true },
              })
              if (jaTem) await client.departamentoGestor.delete({ where: { id: g.id } })
              else {
                await client.departamentoGestor.update({
                  where: { id: g.id },
                  data: { departamentoId: destino.id },
                })
              }
            }
            await client.departamento.delete({ where: { id: legado.id } })
          } else {
            await client.departamento.update({
              where: { id: legado.id },
              data: { nome: rename.toNome, slug: toSlug },
            })
            deptoId = legado.id
          }
        }

        for (const papel of [PAPEL_DEPARTAMENTO.MEMBRO, PAPEL_DEPARTAMENTO.GESTOR]) {
          const fromNome = nomePerfilDepartamento(rename.fromNome, papel)
          if (!roleNomesLegados.has(fromNome)) continue
          await fundirOuRenomearRole(
            client,
            tenantId,
            fromNome,
            nomePerfilDepartamento(rename.toNome, papel),
            deptoId,
          )
        }
      }
    }
  }

  await runTasks(
    concurrent,
    DEPARTAMENTOS_CANONICOS.map((canonico, ordem) => async () => {
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
          nome: canonico.nome,
          cor: canonico.cor,
          moduloPortal: canonico.moduloPortal,
          permissions,
          permissionsGestor,
          ordem,
        },
      })
    }),
  )

  return {
    upserted: DEPARTAMENTOS_CANONICOS.length,
    removedLegacy: removed.count,
  }
}

const SYSTEM_ROLE_DEFAULTS = {
  [SYSTEM_ROLES.OWNER]: { cor: '#7c3aed', ordem: 0 },
  [SYSTEM_ROLES.VICE]: { cor: '#0ea5e9', ordem: 1 },
  [SYSTEM_ROLES.ADMIN]: { cor: '#2563eb', ordem: 2 },
  [SYSTEM_ROLES.MEMBER]: { cor: '#6b7280', ordem: 99 },
}

/**
 * Garante perfis canônicos por departamento (Membro · X / Gestor · X) e
 * vincula owner/vice/admin à Diretoria como GESTOR com extras de governança.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @param {{ incluirVice?: boolean, concurrent?: boolean }} [opts]
 */
export async function upsertPerfisDepartamentoCanonicos(client, tenantId, opts = {}) {
  const incluirVice = opts.incluirVice !== false
  const concurrent = opts.concurrent === true
  const deptos = await client.departamento.findMany({
    where: { tenantId },
    select: {
      id: true,
      nome: true,
      slug: true,
      cor: true,
      ordem: true,
      permissions: true,
      permissionsGestor: true,
    },
  })
  const bySlug = new Map(deptos.map((d) => [d.slug, d]))
  const diretoria = bySlug.get('diretoria') ?? null

  /** @type {Array<() => Promise<unknown>>} */
  const perfilTasks = []
  for (const depto of deptos) {
    for (const papel of [PAPEL_DEPARTAMENTO.MEMBRO, PAPEL_DEPARTAMENTO.GESTOR]) {
      const nome = nomePerfilDepartamento(depto.nome, papel)
      const ordem = depto.ordem * 2 + (papel === PAPEL_DEPARTAMENTO.GESTOR ? 1 : 0) + 10
      perfilTasks.push(async () => {
        await client.role.upsert({
          where: { tenantId_nome: { tenantId, nome } },
          create: {
            tenantId,
            nome,
            cor: depto.cor,
            ordem,
            isSystem: false,
            permissions: [],
            permissionsExtras: [],
            departamentoId: depto.id,
            papelNoDepartamento: papel,
          },
          update: {
            cor: depto.cor,
            ordem,
            departamentoId: depto.id,
            papelNoDepartamento: papel,
          },
        })
      })
    }
  }
  await runTasks(concurrent, perfilTasks)
  const perfisArea = perfilTasks.length

  // Sistema: owner/admin/vice → Diretoria GESTOR; member → transversal
  const systemSpecs = [
    {
      nome: SYSTEM_ROLES.OWNER,
      departamentoId: diretoria?.id ?? null,
      papelNoDepartamento: diretoria ? PAPEL_DEPARTAMENTO.GESTOR : null,
      permissions: [],
      permissionsExtras: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER],
      ...SYSTEM_ROLE_DEFAULTS[SYSTEM_ROLES.OWNER],
    },
    {
      nome: SYSTEM_ROLES.ADMIN,
      departamentoId: diretoria?.id ?? null,
      papelNoDepartamento: diretoria ? PAPEL_DEPARTAMENTO.GESTOR : null,
      permissions: [],
      permissionsExtras: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN],
      ...SYSTEM_ROLE_DEFAULTS[SYSTEM_ROLES.ADMIN],
    },
    {
      nome: SYSTEM_ROLES.VICE,
      departamentoId: diretoria?.id ?? null,
      papelNoDepartamento: diretoria ? PAPEL_DEPARTAMENTO.GESTOR : null,
      permissions: [],
      permissionsExtras: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE],
      ...SYSTEM_ROLE_DEFAULTS[SYSTEM_ROLES.VICE],
    },
    {
      nome: SYSTEM_ROLES.MEMBER,
      departamentoId: null,
      papelNoDepartamento: null,
      permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER],
      permissionsExtras: [],
      ...SYSTEM_ROLE_DEFAULTS[SYSTEM_ROLES.MEMBER],
    },
  ]

  const systemTasks = systemSpecs
    .filter((spec) => !(spec.nome === SYSTEM_ROLES.VICE && !incluirVice))
    .map((spec) => async () => {
      await client.role.upsert({
        where: { tenantId_nome: { tenantId, nome: spec.nome } },
        create: {
          tenantId,
          nome: spec.nome,
          isSystem: true,
          cor: spec.cor,
          ordem: spec.ordem,
          permissions: spec.permissions,
          permissionsExtras: spec.permissionsExtras,
          departamentoId: spec.departamentoId,
          papelNoDepartamento: spec.papelNoDepartamento,
        },
        update: {
          isSystem: true,
          cor: spec.cor,
          ordem: spec.ordem,
          permissions: spec.permissions,
          permissionsExtras: spec.permissionsExtras,
          departamentoId: spec.departamentoId,
          papelNoDepartamento: spec.papelNoDepartamento,
        },
      })
    })
  await runTasks(concurrent, systemTasks)

  return { perfisArea, systemUpserted: systemTasks.length }
}

/**
 * Sincroniza UserDepartamento / DepartamentoGestor a partir dos roles do usuário
 * que têm departamento vinculado (projeção do perfil → área).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {{ userId: string, tenantId: string }} args
 */
export async function syncMembershipFromRoles(client, { userId, tenantId }) {
  const membro = await client.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: {
      tenantId: true,
      tipo: true,
      status: true,
      desligadoEm: true,
      espelhado: true,
      membroOrigemId: true,
    },
  })
  const elegivel = isMembroElegivelDepartamento(membro, tenantId)

  // Não removemos UserRole aqui: alguns chamadores fazem bootstrap de perfis
  // globais vinculados à Diretoria antes de criar o SaasMembro. Sem
  // elegibilidade, porém, nenhuma projeção departamental pode sobreviver.
  const userRoles = elegivel
    ? await client.userRole.findMany({
        where: { userId, tenantId },
        include: {
          role: {
            select: {
              departamentoId: true,
              papelNoDepartamento: true,
            },
          },
        },
      })
    : []

  /** @type {Map<string, 'MEMBRO' | 'GESTOR'>} */
  const desired = new Map()
  for (const ur of userRoles) {
    const deptoId = ur.role.departamentoId
    if (!deptoId) continue
    const papel = ur.role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
      ? PAPEL_DEPARTAMENTO.GESTOR
      : PAPEL_DEPARTAMENTO.MEMBRO
    const atual = desired.get(deptoId)
    if (!atual || (papel === PAPEL_DEPARTAMENTO.GESTOR && atual === PAPEL_DEPARTAMENTO.MEMBRO)) {
      desired.set(deptoId, papel)
    }
  }

  const atuaisMembros = await client.userDepartamento.findMany({
    where: { userId, tenantId },
    select: { departamentoId: true },
  })
  const atuaisGestores = await client.departamentoGestor.findMany({
    where: { userId, departamento: { tenantId } },
    select: { departamentoId: true },
  })

  const membroSet = new Set(atuaisMembros.map((m) => m.departamentoId))
  const gestorSet = new Set(atuaisGestores.map((g) => g.departamentoId))
  const desiredIds = new Set(desired.keys())

  for (const [departamentoId, papel] of desired) {
    if (!membroSet.has(departamentoId)) {
      await client.userDepartamento.create({
        data: { userId, tenantId, departamentoId },
      })
    }
    if (papel === PAPEL_DEPARTAMENTO.GESTOR && !gestorSet.has(departamentoId)) {
      await client.departamentoGestor.create({
        data: { userId, departamentoId },
      })
    }
    if (papel === PAPEL_DEPARTAMENTO.MEMBRO && gestorSet.has(departamentoId)) {
      await client.departamentoGestor.deleteMany({
        where: { userId, departamentoId },
      })
    }
  }

  for (const departamentoId of membroSet) {
    if (!desiredIds.has(departamentoId)) {
      await client.userDepartamento.deleteMany({
        where: { userId, tenantId, departamentoId },
      })
    }
  }
  for (const departamentoId of gestorSet) {
    if (!desiredIds.has(departamentoId) || desired.get(departamentoId) !== PAPEL_DEPARTAMENTO.GESTOR) {
      await client.departamentoGestor.deleteMany({
        where: { userId, departamentoId },
      })
    }
  }

  // Canais internos de depto/área acompanham a projeção (entrar/sair).
  await syncCanaisDepartamentosDoUsuario(client, { userId, tenantId })
}

/**
 * Bootstrap completo: departamentos canônicos + perfis de área/sistema.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @param {{ incluirVice?: boolean, concurrent?: boolean }} [opts]
 */
export async function bootstrapAcessoTenant(client, tenantId, opts = {}) {
  const deptos = await upsertDepartamentosCanonicos(client, tenantId, opts)
  const perfis = await upsertPerfisDepartamentoCanonicos(client, tenantId, opts)
  // Canais internos: só cria se já houver User (criadoPorId). Setup/repair
  // chamam `ensureCanaisDepartamentosTenant` de novo depois do owner.
  const canais = await ensureCanaisDepartamentosTenant(client, tenantId, {
    criadoPorId: opts.criadoPorId ?? null,
  })
  return { ...deptos, ...perfis, canais }
}
