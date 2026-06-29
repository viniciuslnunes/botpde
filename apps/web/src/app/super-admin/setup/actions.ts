'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z.object({
  slug: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífens'),
  nome: z.string().min(3).max(100),
  corPrimaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .optional()
    .default('#7c3aed'),
})

export type SetupState = {
  errors?: Record<string, string[]>
  message?: string
  tenantId?: string
}

export async function criarTenantInicial(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const session = await auth()

  if (!session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const raw = {
    slug: formData.get('slug') as string,
    nome: formData.get('nome') as string,
    corPrimaria: (formData.get('corPrimaria') as string) || '#7c3aed',
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { slug, nome, corPrimaria } = parsed.data

  const existing = await db.tenant.findUnique({ where: { slug } })
  if (existing) {
    return { errors: { slug: ['Este slug já está em uso.'] } }
  }

  // Cria o tenant + roles de sistema + atribui owner ao usuário logado
  const tenant = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = await tx.tenant.create({
      data: { slug, nome, corPrimaria },
    })

    // Cria roles de sistema
    const [ownerRole] = await Promise.all([
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: 'owner',
          cor: '#7c3aed',
          ordem: 0,
          permissions: ['*'],
          isSystem: true,
        },
      }),
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: 'admin',
          cor: '#2563eb',
          ordem: 1,
          permissions: [
            'membros:ler',
            'membros:aprovar',
            'socios:ler',
            'socios:emitir',
            'socios:renovar',
            'sedes:ler',
            'sedes:editar',
            'eventos:ler',
            'eventos:editar',
          ],
          isSystem: true,
        },
      }),
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: 'member',
          cor: '#6b7280',
          ordem: 2,
          permissions: ['portal:acessar'],
          isSystem: true,
        },
      }),
    ])

    // Atribui owner ao usuário logado
    if (session.user.id) {
      await tx.userRole.create({
        data: {
          tenantId: t.id,
          userId: session.user.id,
          roleId: ownerRole.id,
        },
      })
    }

    return t
  })

  redirect(`/super-admin/setup/sucesso?tenant=${tenant.id}&slug=${tenant.slug}`)
}
