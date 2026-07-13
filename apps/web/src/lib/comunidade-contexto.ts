import { cache } from 'react'
import { db } from '@torcida/db'
import { getActiveTenant } from '@/lib/tenant'

export type AfiliacaoComunidade = {
  id: string
  nome: string
  apelido: string | null
}

export type ContextoComunidadePortal =
  | {
      modo: 'torcida'
      tenant: { id: string; nome: string; afiliacaoId: string | null }
      afiliacao: AfiliacaoComunidade | null
    }
  | {
      modo: 'nacional'
      tenant: null
      afiliacao: AfiliacaoComunidade
    }

/**
 * Resolve tenant ativo ou modo comunidade nacional (torcedor global sem torcida
 * na plataforma, mas com clube no PerfilTorcedor).
 */
export const resolverContextoComunidade = cache(
  async (userId: string, email?: string | null): Promise<ContextoComunidadePortal | null> => {
    const tenant = await getActiveTenant(userId, email)
    if (tenant) {
      let afiliacao: AfiliacaoComunidade | null = null
      if (tenant.afiliacaoId) {
        afiliacao = await db.afiliacao.findUnique({
          where: { id: tenant.afiliacaoId },
          select: { id: true, nome: true, apelido: true },
        })
      }
      return {
        modo: 'torcida',
        tenant: { id: tenant.id, nome: tenant.nome, afiliacaoId: tenant.afiliacaoId },
        afiliacao,
      }
    }

    const perfil: {
      onboardingConcluidoEm: Date | null
      afiliacaoId: string | null
    } | null = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true, afiliacaoId: true },
    })
    if (!perfil?.onboardingConcluidoEm || !perfil.afiliacaoId) return null

    const afiliacao: AfiliacaoComunidade | null = await db.afiliacao.findUnique({
      where: { id: perfil.afiliacaoId },
      select: { id: true, nome: true, apelido: true },
    })
    if (!afiliacao) return null

    return { modo: 'nacional', tenant: null, afiliacao }
  },
)

/** IDs de tenants ativos do mesmo clube (feed nacional agregado). */
export const getTenantIdsPorAfiliacao = cache(async (afiliacaoId: string): Promise<string[]> => {
  const tenants: { id: string }[] = await db.tenant.findMany({
    where: { afiliacaoId, ativo: true },
    select: { id: true },
    orderBy: { nome: 'asc' },
  })
  return tenants.map((t) => t.id)
})
