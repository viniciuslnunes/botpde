'use server'

import { revalidatePath } from 'next/cache'
import { bootstrapAcessoTenant, db, ensureCanaisDepartamentosTenant } from '@torcida/db'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { vincularMembroCanaisAposAprovacao } from '@/lib/canais'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { ExpectedError } from '@/lib/expected-error'
import { invalidateHierarchyCache } from '@/lib/hierarquia'
import { invalidatePermissionsCache } from '@/lib/tenant'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '@torcida/types'

/**
 * Promove uma unidade (Sede SUBSEDE/PDE, Caso A) a portal próprio (Caso B):
 * cria o Tenant da unidade + cargos de sistema (sem vice) + departamentos/perfis
 * canônicos, aponta `Sede.tenantId` ao novo tenant (mantendo `sedeId` = árvore) e,
 * opcionalmente, atribui o owner à liderança local. NÃO migra membros (ficam na
 * torcida-mãe — decisão MVP). Reusa a lógica de
 * `scripts/promover-subsede-para-tenant.js`. Só super-admin.
 */

export type PromoverState = { success?: boolean; message?: string }

const ROLES = [
  { nome: SYSTEM_ROLES.OWNER, cor: '#2563eb', ordem: 0 },
  { nome: SYSTEM_ROLES.ADMIN, cor: '#0891b2', ordem: 1 },
  { nome: SYSTEM_ROLES.MEMBER, cor: '#6b7280', ordem: 2 },
] as const

function slugify(s: string): string {
  const base = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return base || 'unidade'
}

async function slugUnico(base: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const slug = i === 0 ? base : `${base}-${i}`
    const existe: { id: string } | null = await db.tenant.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!existe) return slug
  }
  return `${base}-${Date.now()}`
}

const schema = z.object({
  sedeId: z.string().min(1, 'Unidade inválida'),
  ownerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v && v.length ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: 'E-mail do owner inválido',
    }),
})

export async function promoverUnidadeAPortal(
  _prev: PromoverState,
  formData: FormData,
): Promise<PromoverState> {
  const session = await auth()
  if (!session?.user?.id || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const parsed = schema.safeParse({
    sedeId: String(formData.get('sedeId') ?? ''),
    ownerEmail: String(formData.get('ownerEmail') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const sede: {
      id: string
      nome: string
      tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
      tenantId: string | null
      cidade: string | null
      sedeId: string | null
      fotoUrl: string | null
      canalConversaId: string | null
      tenant: { corPrimaria: string } | null
    } | null = await db.sede.findUnique({
      where: { id: parsed.data.sedeId },
      select: {
        id: true,
        nome: true,
        tipo: true,
        tenantId: true,
        cidade: true,
        sedeId: true,
        fotoUrl: true,
        canalConversaId: true,
        tenant: { select: { corPrimaria: true } },
      },
    })
    if (!sede) throw new ExpectedError('Unidade não encontrada.')
    if (sede.tipo === 'SEDE') {
      throw new ExpectedError('Uma Sede raiz não é promovida — já é o portal da torcida.')
    }
    if (!sede.tenantId) throw new ExpectedError('Unidade sem torcida-mãe.')

    // Já promovida? A unidade já é Caso B se seu tenant difere do tenant da sede-mãe.
    if (sede.sedeId) {
      const mae: { tenantId: string | null } | null = await db.sede.findUnique({
        where: { id: sede.sedeId },
        select: { tenantId: true },
      })
      if (mae && mae.tenantId && mae.tenantId !== sede.tenantId) {
        throw new ExpectedError('Esta unidade já tem portal próprio.')
      }
    }

    let ownerUserId: string | null = null
    if (parsed.data.ownerEmail) {
      const u: { id: string } | null = await db.user.findUnique({
        where: { email: parsed.data.ownerEmail },
        select: { id: true },
      })
      if (!u) {
        throw new ExpectedError(
          'Usuário do owner não encontrado — a pessoa precisa criar conta (login) antes.',
        )
      }
      ownerUserId = u.id
    }

    const tenantMaeId = sede.tenantId
    const slug = await slugUnico(slugify(`${sede.nome}${sede.cidade ? `-${sede.cidade}` : ''}`))

    const novoTenant: { id: string; slug: string } = await db.tenant.create({
      data: {
        slug,
        nome: sede.nome,
        plano: 'FREE',
        corPrimaria: sede.tenant?.corPrimaria ?? '#2563eb',
        ...(sede.fotoUrl ? { logoUrl: sede.fotoUrl } : {}),
      },
      select: { id: true, slug: true },
    })

    for (const r of ROLES) {
      await db.role.create({
        data: {
          tenantId: novoTenant.id,
          nome: r.nome,
          isSystem: true,
          permissions: SYSTEM_ROLE_PERMISSIONS[r.nome],
          cor: r.cor,
          ordem: r.ordem,
        },
      })
    }

    await bootstrapAcessoTenant(db, novoTenant.id, { incluirVice: false })

    await db.sede.update({ where: { id: sede.id }, data: { tenantId: novoTenant.id } })

    if (sede.canalConversaId && sede.fotoUrl) {
      await db.conversa.updateMany({
        where: { id: sede.canalConversaId, OR: [{ avatarUrl: null }, { avatarUrl: '' }] },
        data: { avatarUrl: sede.fotoUrl },
      })
    }

    if (ownerUserId) {
      const ownerRole: { id: string } | null = await db.role.findFirst({
        where: { tenantId: novoTenant.id, nome: SYSTEM_ROLES.OWNER, isSystem: true },
        select: { id: true },
      })
      if (ownerRole) {
        await db.userRole.create({
          data: { tenantId: novoTenant.id, userId: ownerUserId, roleId: ownerRole.id },
        })
        invalidatePermissionsCache(ownerUserId, novoTenant.id)

        // Sem SaasMembro no tenant novo, o owner não é resolvido como "tenant
        // casa" no pós-login (resolveUserTenantSlugForUser exige SaasMembro
        // APROVADO/SOCIO) e o auto-vínculo ao canal oficial (que só roda em
        // aprovarMembro) nunca dispara. Espelha aprovarMembro aqui — só a
        // unidade promovida (a única do tenant novo) + o canal principal.
        const ownerUser: { nome: string | null } | null = await db.user.findUnique({
          where: { id: ownerUserId },
          select: { nome: true },
        })
        await db.saasMembro.upsert({
          where: { tenantId_userId: { tenantId: novoTenant.id, userId: ownerUserId } },
          create: {
            tenantId: novoTenant.id,
            userId: ownerUserId,
            sedeId: sede.id,
            tipo: 'SOCIO',
            nome: ownerUser?.nome ?? sede.nome,
            status: 'APROVADO',
            aprovadoPorId: session.user.id,
            aprovadoPorNome: session.user.name ?? 'Super-admin',
            aprovadoEm: new Date(),
          },
          update: { sedeId: sede.id },
        })

        await vincularMembroCanaisAposAprovacao({
          tenantId: novoTenant.id,
          userId: ownerUserId,
          sedeId: sede.id,
          fallbackCriadoPorId: ownerUserId,
        })
      }
    }

    await ensureCanaisDepartamentosTenant(db, novoTenant.id, {
      criadoPorId: ownerUserId ?? session.user.id,
    })

    await db.auditLog.create({
      data: {
        tenantId: novoTenant.id,
        atorId: session.user.id,
        acao: 'UNIDADE_PROMOVIDA_A_PORTAL',
        entidade: 'Tenant',
        entidadeId: novoTenant.id,
        detalhes: {
          sedeId: sede.id,
          nome: sede.nome,
          tenantMaeId,
          ownerEmail: parsed.data.ownerEmail,
        },
      },
    })

    invalidateHierarchyCache(tenantMaeId)
    invalidateHierarchyCache(novoTenant.id)
revalidatePath('/super-admin/afiliacoes')
  revalidatePath('/admin/afiliacoes')
  revalidatePath('/admin/torcida')

    return {
      success: true,
      message: `"${sede.nome}" agora tem portal próprio${ownerUserId ? ' com owner atribuído' : ' (owner a atribuir)'}.`,
    }
  } catch (error) {
    if (error instanceof ExpectedError) return { message: error.message }
    throw error
  }
}
