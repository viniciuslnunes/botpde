import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getGruposPublicos } from '@/lib/feed'
import { GruposClient } from './grupos-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Grupos — Comunidade' }

export default async function GruposPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const grupos = await getGruposPublicos(tenant.id, session.user.id)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade"
        className="inline-flex items-center text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Grupos</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Grupos temáticos abertos da {tenant.nome}
        </p>
      </header>

      <GruposClient gruposIniciais={grupos} />
    </div>
  )
}
