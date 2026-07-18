import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Palette } from 'lucide-react'
import { db } from '@torcida/db'
import { resolveTenantDesign } from '@torcida/types'
import type { TenantDesign } from '@torcida/ui'
import { getTenantFromHost } from '@/lib/tenant'
import { auth } from '@/lib/auth'
import { DesignForm } from '@/components/admin/design-form'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'

export const metadata: Metadata = { title: 'Design — Admin' }

export default async function DesignPage() {
  await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant || !session?.user?.id) redirect('/')

  type AfiliacaoRow = {
    nome: string
    apelido: string | null
    escudoUrl: string | null
  }
  type TorcidaLogo = { logoUrl: string | null }

  const [afiliacao, torcidaConhecida]: [
    AfiliacaoRow | null,
    TorcidaLogo | null,
  ] = await Promise.all([
    tenant.afiliacaoId
      ? db.afiliacao.findUnique({
          where: { id: tenant.afiliacaoId },
          select: { nome: true, apelido: true, escudoUrl: true },
        })
      : Promise.resolve(null),
    tenant.torcidaConhecidaId
      ? db.torcidaConhecida.findUnique({
          where: { id: tenant.torcidaConhecidaId },
          select: { logoUrl: true },
        })
      : Promise.resolve(null),
  ])

  const design = resolveTenantDesign(tenant.design, tenant.corPrimaria) as TenantDesign

  const imagemUrls = [
    tenant.logoUrl,
    torcidaConhecida?.logoUrl ?? null,
    afiliacao?.escudoUrl ?? null,
  ].filter((u): u is string => Boolean(u))

  return (
    <div className="flex min-h-0 flex-col xl:h-[calc(100dvh-3.5rem)] xl:overflow-hidden">
      <div className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-4 sm:py-5">
        <div className="flex items-center gap-3">
          <Palette className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Design</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Estúdio visual · passe o mouse nos controles e veja na prévia ·{' '}
              {tenant.nome}
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:py-5 xl:overflow-hidden">
        <DesignForm
          initialDesign={design}
          corPrimaria={tenant.corPrimaria}
          tenantNome={tenant.nome}
          tenantSlug={tenant.slug}
          clubeNome={afiliacao?.nome ?? null}
          clubeApelido={afiliacao?.apelido ?? null}
          imagemUrls={imagemUrls}
        />
      </div>
    </div>
  )
}
