/**
 * Provisiona e sincroniza canais internos de Departamento e DepartamentoArea.
 *
 * Idempotente. `criadoPorId` só satisfaz a FK da Conversa (owner → admin →
 * sócio → fallback). Roster:
 *   - dept: UserDepartamento + DepartamentoGestor (ADMIN) + liderança
 *     (owner/admin/vice do tenant → ADMIN em todos os deptos)
 *   - área: DepartamentoAreaMembro + gestores do dept pai (ADMIN) + liderança
 */
import {
  filtrarLiderancaOperadorPlataforma,
  nomeCanalArea,
  rosterCanalArea,
  rosterCanalDepartamento,
} from '../../types/src/departamento-canal.js'
import { SYSTEM_ROLES } from '../../types/src/permissions.js'

const NOMES_LIDERANCA_SISTEMA = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.VICE,
]

/** Allowlist de plataforma — mesma env do web (`SUPER_ADMIN_EMAILS`). */
function emailsSuperAdmin() {
  const raw = process.env.SUPER_ADMIN_EMAILS
  if (!raw) return []
  return raw.split(',').map((e) => e.trim()).filter(Boolean)
}

/**
 * Presidente / Admin / Vice / owner de unidade (Caso B) no tenant do canal.
 * Super-admin sem `SaasMembro` local (modo operador) **não** entra — oversight
 * é via `leituraSuperAdmin`, sem gravar `MembroConversa`.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @returns {Promise<string[]>}
 */
export async function idsLiderancaTenant(client, tenantId) {
  /** @type {Array<{ userId: string }>} */
  const rows = await client.userRole.findMany({
    where: {
      tenantId,
      role: { isSystem: true, nome: { in: [...NOMES_LIDERANCA_SISTEMA] } },
    },
    select: { userId: true },
  })
  const liderancaIds = [...new Set(rows.map((r) => r.userId))]
  const saEmails = emailsSuperAdmin()
  if (saEmails.length === 0 || liderancaIds.length === 0) return liderancaIds

  /** @type {Array<{ id: string }>} */
  const saUsers = await client.user.findMany({
    where: { id: { in: liderancaIds }, email: { in: saEmails } },
    select: { id: true },
  })
  if (saUsers.length === 0) return liderancaIds

  const superAdminUserIds = saUsers.map((u) => u.id)
  /** @type {Array<{ userId: string }>} */
  const vinculos = await client.saasMembro.findMany({
    where: {
      tenantId,
      userId: { in: superAdminUserIds },
      status: 'APROVADO',
      espelhado: false,
    },
    select: { userId: true },
  })

  return filtrarLiderancaOperadorPlataforma({
    liderancaIds,
    superAdminUserIds,
    userIdsComVinculoLocal: vinculos.map((v) => v.userId),
  })
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @param {string | null | undefined} fallbackUserId
 */
async function resolverCriadoPorId(client, tenantId, fallbackUserId) {
  const owner = await client.userRole.findFirst({
    where: { tenantId, role: { nome: 'owner', isSystem: true } },
    select: { userId: true },
  })
  if (owner) return owner.userId

  const admin = await client.userRole.findFirst({
    where: { tenantId, role: { nome: 'admin', isSystem: true } },
    select: { userId: true },
  })
  if (admin) return admin.userId

  const membro = await client.saasMembro.findFirst({
    where: { tenantId, status: 'APROVADO' },
    select: { userId: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (membro) return membro.userId
  return fallbackUserId ?? null
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} conversaId
 * @param {Map<string, 'ADMIN' | 'MEMBRO'>} desired
 */
export async function aplicarRosterCanal(client, conversaId, desired) {
  /** @type {Array<{ userId: string, papel: string, saiuEm: Date | null, status: string }>} */
  const atuais = await client.membroConversa.findMany({
    where: { conversaId },
    select: { userId: true, papel: true, saiuEm: true, status: true },
  })
  const atualMap = new Map(atuais.map((m) => [m.userId, m]))
  const agora = new Date()

  for (const [userId, papel] of desired) {
    const atual = atualMap.get(userId)
    if (!atual) {
      await client.membroConversa.create({
        data: {
          conversaId,
          userId,
          papel,
          status: 'ATIVO',
        },
      })
      continue
    }
    const precisaReativar = atual.saiuEm != null || atual.status !== 'ATIVO'
    const papelDiferente = atual.papel !== papel
    if (precisaReativar || papelDiferente) {
      await client.membroConversa.update({
        where: { conversaId_userId: { conversaId, userId } },
        data: {
          saiuEm: null,
          status: 'ATIVO',
          ...(papelDiferente ? { papel } : {}),
        },
      })
    }
  }

  for (const atual of atuais) {
    if (desired.has(atual.userId)) continue
    if (atual.saiuEm != null) continue
    await client.membroConversa.update({
      where: { conversaId_userId: { conversaId, userId: atual.userId } },
      data: { saiuEm: agora },
    })
  }
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {{
 *   tenantId: string,
 *   nome: string,
 *   descricao: string,
 *   criadoPorId: string,
 * }} opts
 */
async function criarCanalInterno(client, opts) {
  return client.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: opts.tenantId,
      nome: opts.nome,
      descricao: opts.descricao,
      institucional: true,
      canalOficial: false,
      visibilidadeCanal: 'TENANT',
      somenteAdminPublica: false,
      publica: false,
      criadoPorId: opts.criadoPorId,
    },
    select: { id: true },
  })
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} departamentoId
 */
export async function syncMembrosCanalDepartamento(client, departamentoId) {
  const depto = await client.departamento.findUnique({
    where: { id: departamentoId },
    select: { id: true, tenantId: true, canalConversaId: true },
  })
  if (!depto?.canalConversaId) return { synced: false }

  const [membros, gestores, lideranca] = await Promise.all([
    client.userDepartamento.findMany({
      where: { departamentoId },
      select: { userId: true },
    }),
    client.departamentoGestor.findMany({
      where: { departamentoId },
      select: { userId: true },
    }),
    idsLiderancaTenant(client, depto.tenantId),
  ])

  const desired = rosterCanalDepartamento({
    membros: membros.map((m) => m.userId),
    gestores: gestores.map((g) => g.userId),
    lideranca,
  })
  await aplicarRosterCanal(client, depto.canalConversaId, desired)
  return { synced: true, membros: desired.size }
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} areaId
 */
export async function syncMembrosCanalArea(client, areaId) {
  const area = await client.departamentoArea.findUnique({
    where: { id: areaId },
    select: {
      id: true,
      tenantId: true,
      canalConversaId: true,
      departamentoId: true,
    },
  })
  if (!area?.canalConversaId) return { synced: false }

  const [membrosArea, gestores, lideranca] = await Promise.all([
    client.departamentoAreaMembro.findMany({
      where: { areaId },
      select: { userId: true },
    }),
    client.departamentoGestor.findMany({
      where: { departamentoId: area.departamentoId },
      select: { userId: true },
    }),
    idsLiderancaTenant(client, area.tenantId),
  ])

  const desired = rosterCanalArea({
    membrosArea: membrosArea.map((m) => m.userId),
    gestoresDepartamento: gestores.map((g) => g.userId),
    lideranca,
  })
  await aplicarRosterCanal(client, area.canalConversaId, desired)
  return { synced: true, membros: desired.size }
}

/**
 * Cria o canal do departamento se faltar e sincroniza roster.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} departamentoId
 * @param {{ criadoPorId?: string | null }} [opts]
 */
export async function ensureCanalDepartamento(client, departamentoId, opts = {}) {
  const depto = await client.departamento.findUnique({
    where: { id: departamentoId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      canalConversaId: true,
    },
  })
  if (!depto) return { status: 'nao_encontrado', canalId: null }

  if (!depto.canalConversaId) {
    const criadoPorId =
      opts.criadoPorId ?? (await resolverCriadoPorId(client, depto.tenantId, null))
    if (!criadoPorId) return { status: 'sem_user', canalId: null }

    const canal = await criarCanalInterno(client, {
      tenantId: depto.tenantId,
      nome: depto.nome,
      descricao: 'Canal interno da equipe do departamento',
      criadoPorId,
    })
    await client.departamento.update({
      where: { id: depto.id },
      data: { canalConversaId: canal.id },
    })
    await syncMembrosCanalDepartamento(client, depto.id)
    return { status: 'criado', canalId: canal.id }
  }

  await syncMembrosCanalDepartamento(client, depto.id)
  return { status: 'sincronizado', canalId: depto.canalConversaId }
}

/**
 * Cria o canal da área se faltar e sincroniza roster.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} areaId
 * @param {{ criadoPorId?: string | null }} [opts]
 */
export async function ensureCanalArea(client, areaId, opts = {}) {
  const area = await client.departamentoArea.findUnique({
    where: { id: areaId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      canalConversaId: true,
      departamento: { select: { nome: true } },
    },
  })
  if (!area) return { status: 'nao_encontrado', canalId: null }

  if (!area.canalConversaId) {
    const criadoPorId =
      opts.criadoPorId ?? (await resolverCriadoPorId(client, area.tenantId, null))
    if (!criadoPorId) return { status: 'sem_user', canalId: null }

    const canal = await criarCanalInterno(client, {
      tenantId: area.tenantId,
      nome: nomeCanalArea(area.departamento.nome, area.nome),
      descricao: 'Canal interno da frente de trabalho',
      criadoPorId,
    })
    await client.departamentoArea.update({
      where: { id: area.id },
      data: { canalConversaId: canal.id },
    })
    await syncMembrosCanalArea(client, area.id)
    return { status: 'criado', canalId: canal.id }
  }

  await syncMembrosCanalArea(client, area.id)
  return { status: 'sincronizado', canalId: area.canalConversaId }
}

/**
 * Provisiona canais de todos os departamentos e áreas do tenant + sync roster.
 * Cria em paralelo (lote) e só sincroniza membros quando o tenant tem equipe
 * em algum depto/área — catalógo nacional (sem user local) fica barato.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} tenantId
 * @param {{ criadoPorId?: string | null }} [opts]
 */
export async function ensureCanaisDepartamentosTenant(client, tenantId, opts = {}) {
  const criadoPorId =
    opts.criadoPorId ?? (await resolverCriadoPorId(client, tenantId, null))

  /** @type {Array<{ id: string, nome: string, canalConversaId: string | null }>} */
  const deptos = await client.departamento.findMany({
    where: { tenantId },
    select: { id: true, nome: true, canalConversaId: true },
  })
  /** @type {Array<{ id: string, nome: string, canalConversaId: string | null, departamento: { nome: string } }>} */
  const areas = await client.departamentoArea.findMany({
    where: { tenantId },
    select: {
      id: true,
      nome: true,
      canalConversaId: true,
      departamento: { select: { nome: true } },
    },
  })

  const deptosSem = deptos.filter((d) => !d.canalConversaId)
  const areasSem = areas.filter((a) => !a.canalConversaId)

  if (!criadoPorId) {
    return {
      deptos: {
        total: deptos.length,
        criados: 0,
        sincronizados: deptos.length - deptosSem.length,
        semUser: deptosSem.length,
      },
      areas: {
        total: areas.length,
        criadas: 0,
        sincronizadas: areas.length - areasSem.length,
        semUser: areasSem.length,
      },
    }
  }

  /** @param {Array<T>} items @param {number} concurrency @param {(item: T) => Promise<void>} fn @template T */
  async function mapPool(items, concurrency, fn) {
    let i = 0
    async function worker() {
      while (i < items.length) {
        const idx = i++
        await fn(items[idx])
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()),
    )
  }

  await mapPool(deptosSem, 8, async (d) => {
    const canal = await criarCanalInterno(client, {
      tenantId,
      nome: d.nome,
      descricao: 'Canal interno da equipe do departamento',
      criadoPorId,
    })
    await client.departamento.update({
      where: { id: d.id },
      data: { canalConversaId: canal.id },
    })
    d.canalConversaId = canal.id
  })

  await mapPool(areasSem, 8, async (a) => {
    const canal = await criarCanalInterno(client, {
      tenantId,
      nome: nomeCanalArea(a.departamento.nome, a.nome),
      descricao: 'Canal interno da frente de trabalho',
      criadoPorId,
    })
    await client.departamentoArea.update({
      where: { id: a.id },
      data: { canalConversaId: canal.id },
    })
    a.canalConversaId = canal.id
  })

  const [temEquipe, temGestor, temArea, lideranca] = await Promise.all([
    client.userDepartamento.findFirst({ where: { tenantId }, select: { id: true } }),
    client.departamentoGestor.findFirst({
      where: { departamento: { tenantId } },
      select: { id: true },
    }),
    client.departamentoAreaMembro.findFirst({
      where: { area: { tenantId } },
      select: { id: true },
    }),
    idsLiderancaTenant(client, tenantId),
  ])

  if (temEquipe || temGestor || temArea || lideranca.length > 0) {
    const deptosComCanal = deptos.filter((d) => d.canalConversaId)
    const areasComCanal = areas.filter((a) => a.canalConversaId)
    await mapPool(deptosComCanal, 4, async (d) => {
      await syncMembrosCanalDepartamento(client, d.id)
    })
    await mapPool(areasComCanal, 4, async (a) => {
      await syncMembrosCanalArea(client, a.id)
    })
  }

  return {
    deptos: {
      total: deptos.length,
      criados: deptosSem.length,
      sincronizados: deptos.length - deptosSem.length,
      semUser: 0,
    },
    areas: {
      total: areas.length,
      criadas: areasSem.length,
      sincronizadas: areas.length - areasSem.length,
      semUser: 0,
    },
  }
}

/**
 * Após mudar UD/DG (ou sair do depto e perder áreas), alinha o usuário nos
 * canais de depto/área do tenant.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {{ userId: string, tenantId: string }} args
 */
export async function syncCanaisDepartamentosDoUsuario(client, { userId, tenantId }) {
  const [uds, gestores, areaMembros, liderancaIds] = await Promise.all([
    client.userDepartamento.findMany({
      where: { userId, tenantId },
      select: { departamentoId: true },
    }),
    client.departamentoGestor.findMany({
      where: { userId, departamento: { tenantId } },
      select: { departamentoId: true },
    }),
    client.departamentoAreaMembro.findMany({
      where: { userId, area: { tenantId } },
      select: { areaId: true, area: { select: { departamentoId: true } } },
    }),
    idsLiderancaTenant(client, tenantId),
  ])

  const ehLideranca = liderancaIds.includes(userId)

  const deptoIds = new Set([
    ...uds.map((u) => u.departamentoId),
    ...gestores.map((g) => g.departamentoId),
  ])
  const gestorDeptoIds = new Set(gestores.map((g) => g.departamentoId))
  const areaIds = new Set(areaMembros.map((m) => m.areaId))

  // Gestores também entram nos canais de todas as áreas do dept.
  if (gestorDeptoIds.size > 0) {
    const areasDosGestores = await client.departamentoArea.findMany({
      where: { departamentoId: { in: [...gestorDeptoIds] }, canalConversaId: { not: null } },
      select: { id: true },
    })
    for (const a of areasDosGestores) areaIds.add(a.id)
  }

  const [deptosComCanal, areasComCanal] = await Promise.all([
    client.departamento.findMany({
      where: { tenantId, canalConversaId: { not: null } },
      select: { id: true, canalConversaId: true },
    }),
    client.departamentoArea.findMany({
      where: { tenantId, canalConversaId: { not: null } },
      select: { id: true, canalConversaId: true, departamentoId: true },
    }),
  ])

  const agora = new Date()

  for (const depto of deptosComCanal) {
    if (!depto.canalConversaId) continue
    if (ehLideranca || deptoIds.has(depto.id)) {
      const papel =
        ehLideranca || gestorDeptoIds.has(depto.id) ? 'ADMIN' : 'MEMBRO'
      await client.membroConversa.upsert({
        where: { conversaId_userId: { conversaId: depto.canalConversaId, userId } },
        create: { conversaId: depto.canalConversaId, userId, papel, status: 'ATIVO' },
        update: { saiuEm: null, status: 'ATIVO', papel },
      })
    } else {
      await client.membroConversa.updateMany({
        where: {
          conversaId: depto.canalConversaId,
          userId,
          saiuEm: null,
        },
        data: { saiuEm: agora },
      })
    }
  }

  for (const area of areasComCanal) {
    if (!area.canalConversaId) continue
    const deveEstar =
      ehLideranca ||
      areaIds.has(area.id) ||
      gestorDeptoIds.has(area.departamentoId)
    if (deveEstar) {
      const papel =
        ehLideranca || gestorDeptoIds.has(area.departamentoId) ? 'ADMIN' : 'MEMBRO'
      await client.membroConversa.upsert({
        where: { conversaId_userId: { conversaId: area.canalConversaId, userId } },
        create: { conversaId: area.canalConversaId, userId, papel, status: 'ATIVO' },
        update: { saiuEm: null, status: 'ATIVO', papel },
      })
    } else {
      await client.membroConversa.updateMany({
        where: {
          conversaId: area.canalConversaId,
          userId,
          saiuEm: null,
        },
        data: { saiuEm: agora },
      })
    }
  }
}
