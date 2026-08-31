import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { carregarPaginaAssocieSe } from '@/lib/associe-se'
import { AssocieSeExplorer } from '@/components/portal/associe-se-explorer'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Associe-se' }

const torcidaParam = z.string().uuid()

export default async function AssocieSePage({
  searchParams,
}: {
  searchParams: Promise<{ torcida?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const pagina = await carregarPaginaAssocieSe(session.user.id)
  if (!pagina) redirect('/onboarding')

  const { torcida: torcidaRaw } = await searchParams
  const parsed = torcidaRaw ? torcidaParam.safeParse(torcidaRaw) : null
  const torcidaInicialId =
    parsed?.success && pagina.torcidas.some((t) => t.id === parsed.data)
      ? parsed.data
      : null

  return <AssocieSeExplorer pagina={pagina} torcidaInicialId={torcidaInicialId} />
}
