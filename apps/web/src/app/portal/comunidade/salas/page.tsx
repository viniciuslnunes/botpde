import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import { listSalasAtivas, listSalasNacionais } from '@/lib/salas'
import { CriarSalaForm } from '@/components/portal/criar-sala-form'
import { CriarSalaNacionalForm } from '@/components/portal/criar-sala-nacional-form'
import { SalasListAnimated } from '@/components/portal/salas-list-animated'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission, MENSAGEM_CAPACIDADE_CONFIANCA } from '@torcida/types'
import { temCapacidadeConfianca } from '@/lib/confianca'
import { db } from '@torcida/db'

export const metadata: Metadata = { title: 'Salas de vídeo' }

export default async function SalasPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) redirect('/portal')

  const escopoDesejado = resolverEscopoComunidade(ctx, params.escopo)
  const escopo = escopoDesejado === 'nacional' && !ctx.afiliacao ? 'torcida' : escopoDesejado
  const voltarHref = escopo === 'nacional' ? '/portal/comunidade?escopo=nacional' : '/portal/comunidade'

  if (escopo === 'nacional' && ctx.afiliacao) {
    const nomeClube = ctx.afiliacao.apelido || ctx.afiliacao.nome
    const salas = await listSalasNacionais(ctx.afiliacao.id)

    return (
      <div className="space-y-6">
        <div>
          <Link
            href={voltarHref}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar à comunidade
          </Link>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Salas ao vivo</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Encontros abertos a qualquer torcedor de {nomeClube} na plataforma
          </p>
        </div>

        <CriarSalaNacionalForm />

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            {salas.length > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            )}
            {salas.length > 0
              ? `${salas.length} sala${salas.length === 1 ? '' : 's'} abertas`
              : 'Salas ativas'}
          </h2>

          <SalasListAnimated salas={salas} canHost />
        </section>
      </div>
    )
  }

  if (ctx.modo !== 'torcida') redirect('/portal/comunidade/salas?escopo=nacional')

  const tenant = ctx.tenant

  const [salas, eventos] = await Promise.all([
    listSalasAtivas(tenant.id),
    db.evento.findMany({
      where: { tenantId: tenant.id, data: { gte: new Date() } },
      select: { id: true, titulo: true },
      orderBy: { data: 'asc' },
      take: 30,
    }) as Promise<{ id: string; titulo: string }[]>,
  ])

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effectivePermissions: string[] = calculateEffectivePermissions(rolePermissions, overrides)
  const canHost = hasPermission(effectivePermissions, PERMISSIONS.MEETINGS_HOST)
  const podeCriarSala =
    canHost && (await temCapacidadeConfianca(session.user.id, tenant.id, 'sala:hospedar'))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={voltarHref}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar à comunidade
        </Link>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Salas ao vivo</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Encontros em tempo real com áudio, vídeo, chat e compartilhamento de tela
        </p>
      </div>

      {podeCriarSala && <CriarSalaForm eventos={eventos} />}
      {canHost && !podeCriarSala ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {MENSAGEM_CAPACIDADE_CONFIANCA['sala:hospedar']}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          {salas.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          {salas.length > 0 ? `${salas.length} sala${salas.length === 1 ? '' : 's'} abertas` : 'Salas ativas'}
        </h2>

        <SalasListAnimated salas={salas} canHost={canHost} />
      </section>
    </div>
  )
}
