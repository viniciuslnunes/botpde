import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { entrarPorConviteGrupo } from '@/app/portal/comunidade/actions'
import { isRedirectError } from '@/lib/toast-action'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Convite — Grupo' }

export default async function GrupoConvitePage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) {
    redirect(
      `/entrar?callbackUrl=${encodeURIComponent(`/portal/comunidade/grupos/convite/${codigo}`)}`,
    )
  }
  if (!tenant) redirect('/portal')

  try {
    const { id } = await entrarPorConviteGrupo(codigo)
    redirect(`/portal/comunidade/grupos/${id}`)
  } catch (e) {
    if (isRedirectError(e)) throw e
    const message = e instanceof Error ? e.message : 'Convite inválido.'
    return (
      <div className="mx-auto max-w-md space-y-4 py-10">
        <Link
          href="/portal/comunidade/grupos"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos grupos
        </Link>
        <div className="card-soft rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center">
          <h1 className="text-lg font-semibold text-[rgb(var(--foreground))]">
            Não foi possível entrar
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">{message}</p>
          <Link
            href="/portal/comunidade/grupos"
            className="mt-4 inline-flex rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-primary-on"
          >
            Ver grupos
          </Link>
        </div>
      </div>
    )
  }
}
