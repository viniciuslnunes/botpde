import {
  db,
  upsertDepartamentosCanonicos,
  upsertPerfisDepartamentoCanonicos,
  type Prisma,
} from '@torcida/db'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '@torcida/types'
import { invalidateHierarchyCache } from '@/lib/hierarquia'

const SYSTEM_ROLE_DEFAULTS: Record<string, { cor: string; ordem: number }> = {
  [SYSTEM_ROLES.OWNER]: { cor: '#2563eb', ordem: 0 },
  [SYSTEM_ROLES.ADMIN]: { cor: '#0891b2', ordem: 1 },
  [SYSTEM_ROLES.MEMBER]: { cor: '#6b7280', ordem: 2 },
}

function slugifyTenantNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

async function slugTenantUnico(base: string): Promise<string> {
  const slug = base || 'unidade'
  let n = 0
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`
    const exists = await db.tenant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!exists) return candidate
    n += 1
  }
}

export type PromoverSedeResult =
  | {
      ok: true
      novoTenantId: string
      novoSlug: string
      membrosMigrados: number
      filhosMovidos: number
      ownerUserId: string
    }
  | { ok: false; error: string }

/**
 * Promove SUBSEDE/PDE do tenant mãe a Tenant próprio (Caso B).
 * Mantém Sede.sedeId → mãe; migra filhos territoriais e membros da unidade.
 */
export async function promoverSedeParaTenant(params: {
  sedeId: string
  tenantMaeId: string
  atorId: string
}): Promise<PromoverSedeResult> {
  const { sedeId, tenantMaeId, atorId } = params

  const sede = await db.sede.findUnique({
    where: { id: sedeId },
    select: {
      id: true,
      nome: true,
      tipo: true,
      ativa: true,
      tenantId: true,
      sedeId: true,
      responsavelUserId: true,
      canalConversaId: true,
      fotoUrl: true,
    },
  })

  if (!sede || sede.tenantId !== tenantMaeId) {
    return { ok: false, error: 'Unidade não encontrada neste tenant.' }
  }
  if (!sede.ativa) {
    return { ok: false, error: 'Só é possível promover unidades ativas.' }
  }
  if (sede.tipo !== 'SUBSEDE' && sede.tipo !== 'PONTO_ENCONTRO') {
    return { ok: false, error: 'Apenas Subsede ou Ponto de encontro podem ser promovidos.' }
  }
  if (!sede.sedeId) {
    return { ok: false, error: 'A unidade precisa estar ligada a uma Sede mãe antes da promoção.' }
  }

  const tenantMae = await db.tenant.findUnique({
    where: { id: tenantMaeId },
    select: { id: true, afiliacaoId: true, corPrimaria: true },
  })
  if (!tenantMae) return { ok: false, error: 'Tenant mãe não encontrado.' }

  const ownerMae = await db.userRole.findFirst({
    where: {
      tenantId: tenantMaeId,
      role: { isSystem: true, nome: SYSTEM_ROLES.OWNER },
    },
    select: { userId: true },
  })
  if (!ownerMae) {
    return { ok: false, error: 'Tenant mãe não tem owner — não é possível promover.' }
  }

  let ownerUserId = ownerMae.userId
  if (sede.responsavelUserId) {
    const lider = await db.saasMembro.findFirst({
      where: {
        tenantId: tenantMaeId,
        userId: sede.responsavelUserId,
        status: 'APROVADO',
      },
      select: { userId: true },
    })
    if (lider) ownerUserId = lider.userId
  }

  const slug = await slugTenantUnico(slugifyTenantNome(sede.nome))

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const novoTenant = await tx.tenant.create({
      data: {
        slug,
        nome: sede.nome,
        plano: 'FREE',
        corPrimaria: tenantMae.corPrimaria,
        afiliacaoId: tenantMae.afiliacaoId,
        // Foto da unidade vira logo do portal — senão o header herda o da mãe.
        ...(sede.fotoUrl ? { logoUrl: sede.fotoUrl } : {}),
      },
    })

    // Filhos territoriais (PDEs sob a unidade) no mesmo tenant mãe
    const filhos: { id: string }[] = await tx.sede.findMany({
      where: { tenantId: tenantMaeId, sedeId: sede.id },
      select: { id: true },
    })
    const sedeIdsMovidos = [sede.id, ...filhos.map((f) => f.id)]

    await tx.sede.update({
      where: { id: sede.id },
      data: { tenantId: novoTenant.id },
    })
    if (filhos.length > 0) {
      await tx.sede.updateMany({
        where: { id: { in: filhos.map((f) => f.id) } },
        data: { tenantId: novoTenant.id },
      })
    }

    // Canal oficial da unidade: garante avatar = foto da unidade (canais
    // criados antes do fix nascem sem avatarUrl e caíam no logo da mãe).
    if (sede.canalConversaId && sede.fotoUrl) {
      await tx.conversa.updateMany({
        where: { id: sede.canalConversaId, OR: [{ avatarUrl: null }, { avatarUrl: '' }] },
        data: { avatarUrl: sede.fotoUrl },
      })
    }

    for (const nomeRole of [SYSTEM_ROLES.OWNER, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MEMBER] as const) {
      await tx.role.upsert({
        where: { tenantId_nome: { tenantId: novoTenant.id, nome: nomeRole } },
        update: {},
        create: {
          tenantId: novoTenant.id,
          nome: nomeRole,
          isSystem: true,
          permissions: SYSTEM_ROLE_PERMISSIONS[nomeRole],
          ...SYSTEM_ROLE_DEFAULTS[nomeRole],
        },
      })
    }

    await upsertDepartamentosCanonicos(tx, novoTenant.id)
    await upsertPerfisDepartamentoCanonicos(tx, novoTenant.id, { incluirVice: false })

    const ownerRole = await tx.role.findUnique({
      where: { tenantId_nome: { tenantId: novoTenant.id, nome: SYSTEM_ROLES.OWNER } },
      select: { id: true },
    })
    if (!ownerRole) throw new Error('Falha ao criar role owner no novo tenant.')

    await tx.userRole.upsert({
      where: {
        userId_tenantId_roleId: {
          userId: ownerUserId,
          tenantId: novoTenant.id,
          roleId: ownerRole.id,
        },
      },
      update: {},
      create: {
        userId: ownerUserId,
        tenantId: novoTenant.id,
        roleId: ownerRole.id,
      },
    })

    // Migra membros cuja unidade está entre as movidas
    const membros: { id: string; userId: string; sedeId: string | null }[] =
      await tx.saasMembro.findMany({
        where: {
          tenantId: tenantMaeId,
          sedeId: { in: sedeIdsMovidos },
        },
        select: { id: true, userId: true, sedeId: true },
      })

    let membrosMigrados = 0
    for (const m of membros) {
      const jaExiste = await tx.saasMembro.findUnique({
        where: {
          tenantId_userId: { tenantId: novoTenant.id, userId: m.userId },
        },
        select: { id: true },
      })
      if (jaExiste) {
        // Já tem vínculo no filho — remove do mãe para não duplicar operação
        await tx.saasMembro.delete({ where: { id: m.id } })
        continue
      }
      await tx.saasMembro.update({
        where: { id: m.id },
        // Preferência aponta para Departamento do tenant mãe e não pode
        // atravessar a promoção da unidade.
        data: { tenantId: novoTenant.id, departamentoId: null },
      })
      membrosMigrados += 1
    }

    // Garante SaasMembro APROVADO do owner no novo tenant
    const ownerMembroMae = await tx.saasMembro.findUnique({
      where: {
        tenantId_userId: { tenantId: tenantMaeId, userId: ownerUserId },
      },
      select: {
        nome: true,
        tipo: true,
        telefone: true,
        cidade: true,
        sedeId: true,
      },
    })
    await tx.saasMembro.upsert({
      where: {
        tenantId_userId: { tenantId: novoTenant.id, userId: ownerUserId },
      },
      update: { status: 'APROVADO', departamentoId: null },
      create: {
        tenantId: novoTenant.id,
        userId: ownerUserId,
        nome: ownerMembroMae?.nome ?? 'Owner',
        tipo: ownerMembroMae?.tipo ?? 'SOCIO',
        status: 'APROVADO',
        telefone: ownerMembroMae?.telefone,
        cidade: ownerMembroMae?.cidade,
        sedeId: sede.id,
      },
    })

    // Owner do novo tenant é dono da própria unidade — sem isso ele ficava de
    // fora do canal oficial dela até pedir entrada manualmente (mesmo bug do
    // FIEL CUBATÃO em promoverUnidadeAPortal / vincularMembroCanaisAposAprovacao).
    if (sede.canalConversaId) {
      await tx.membroConversa.upsert({
        where: { conversaId_userId: { conversaId: sede.canalConversaId, userId: ownerUserId } },
        create: { conversaId: sede.canalConversaId, userId: ownerUserId, papel: 'ADMIN' },
        update: { papel: 'ADMIN', saiuEm: null },
      })
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenantMaeId,
        atorId,
        acao: 'SEDE_PROMOVIDA_TENANT',
        entidade: 'Sede',
        entidadeId: sede.id,
        detalhes: {
          novoTenantId: novoTenant.id,
          novoSlug: novoTenant.slug,
          membrosMigrados,
          filhosMovidos: filhos.length,
          ownerUserId,
        },
      },
    })

    return {
      ok: true as const,
      novoTenantId: novoTenant.id,
      novoSlug: novoTenant.slug,
      membrosMigrados,
      filhosMovidos: filhos.length,
      ownerUserId,
    }
  })

  invalidateHierarchyCache(tenantMaeId)
  invalidateHierarchyCache(result.novoTenantId)
  return result
}
