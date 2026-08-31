'use server'

import { auth } from '@/lib/auth'
import { z } from 'zod'
import { getTorcidasPorAfiliacao, type TorcidaOnboarding } from '@/lib/onboarding'

const uuid = z.string().uuid()

/** Vitrine nacional: lista torcidas de qualquer clube. Não autoriza associação. */
export async function listarTorcidasVitrineNacional(
  afiliacaoId: string,
): Promise<TorcidaOnboarding[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  if (!uuid.safeParse(afiliacaoId).success) return []
  return getTorcidasPorAfiliacao(afiliacaoId)
}
