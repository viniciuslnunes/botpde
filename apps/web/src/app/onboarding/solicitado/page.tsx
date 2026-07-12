import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { buildPortalUrl, getTenantFromHost } from '@/lib/tenant'

export default async function SolicitacaoEnviadaPage({
  searchParams,
}: {
  searchParams: Promise<{ torcida?: string }>
}) {
  const [params, session, hostTenant] = await Promise.all([
    searchParams,
    auth(),
    getTenantFromHost(),
  ])
  if (!session?.user?.id) redirect('/entrar')

  const slug = params.torcida?.trim()
  const torcida = slug
    ? await db.tenant.findFirst({
        where: { slug, ativo: true },
        select: { nome: true, slug: true },
      })
    : null

  const portalUrl = torcida ? buildPortalUrl(torcida.slug) : '/portal/comunidade'
  const portalExterno = portalUrl.startsWith('http')

  return (
    <div className="flex flex-1 flex-col justify-center py-12 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
      <h1 className="mt-4 text-2xl font-bold text-[rgb(var(--foreground))]">
        Solicitação enviada
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
        {torcida ? (
          <>
            Sua solicitação foi registrada na <strong>{torcida.nome}</strong>. A liderança vai
            analisar e você recebe acesso ao portal quando for aprovado.
          </>
        ) : (
          <>Sua solicitação foi registrada. A liderança da torcida vai analisar em breve.</>
        )}
      </p>

      {hostTenant && torcida && hostTenant.slug !== torcida.slug && (
        <p className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Este endereço é o portal da <strong>{hostTenant.nome}</strong>. Sua solicitação é na{' '}
          <strong>{torcida.nome}</strong> — o feed e a aprovação ficam no portal da torcida
          escolhida.
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {portalExterno ? (
          <a
            href={portalUrl}
            className="inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Ir para o portal da {torcida?.nome ?? 'torcida'}
          </a>
        ) : (
          <Link
            href={portalUrl}
            className="inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Voltar ao portal
          </Link>
        )}
        <Link
          href="/onboarding"
          className="text-sm font-medium text-[rgb(var(--foreground-muted))] hover:underline"
        >
          Refazer onboarding
        </Link>
      </div>
    </div>
  )
}
