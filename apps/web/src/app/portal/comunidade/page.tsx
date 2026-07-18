import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { ComunidadeFeedShell } from './_components/comunidade-feed-shell'
import { ComunidadeNacionalShell } from './_components/comunidade-nacional-shell'
import { getSolicitacaoSocioPendente } from '@/lib/onboarding'
import { listSalasAtivas } from '@/lib/salas'

export const metadata: Metadata = { title: 'Comunidade' }

/**
 * Page do feed: contexto + salas (cacheadas). Composer/card e posts
 * carregam sob Suspense — voltar de Buscar/Classificação pinta o shell cedo.
 */
export default async function ComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; filtro?: string }>
}) {
  const params = await searchParams
  const filtro = params.filtro === 'seguindo' ? 'seguindo' : 'descobrir'
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) redirect('/')

  if (ctx.modo === 'nacional') {
    const solicitacaoPendente = await getSolicitacaoSocioPendente(session.user.id)
    return (
      <ComunidadeNacionalShell
        afiliacao={ctx.afiliacao}
        currentUser={{
          id: session.user.id,
          nome: session.user.name ?? null,
          avatarUrl: session.user.image ?? null,
        }}
        solicitacaoPendente={solicitacaoPendente}
      />
    )
  }

  const tenant = ctx.tenant
  const salasAtivas = await listSalasAtivas(tenant.id)
  const currentUser = {
    id: session.user.id,
    nome: session.user.name ?? null,
    avatarUrl: session.user.image ?? null,
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ComunidadeFeedShell
        tenant={{ id: tenant.id, nome: tenant.nome, afiliacaoId: tenant.afiliacaoId }}
        currentUser={currentUser}
        cursor={params.cursor}
        filtro={filtro}
        clubeNacional={ctx.afiliacao}
        salasAtivas={salasAtivas}
      />
    </div>
  )
}
