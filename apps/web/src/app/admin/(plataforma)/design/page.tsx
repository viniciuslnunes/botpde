import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
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
    // Estúdio: as duas colunas rolam por dentro, então o container precisa de
    // altura limitada. Sob o shell de tabs ela não pode mais ser a viewport
    // inteira — `70dvh` com piso evita depender da altura do header/tabs.
    <div className="flex min-h-0 flex-col xl:h-[70dvh] xl:min-h-[34rem] xl:overflow-hidden">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Estúdio visual · passe o mouse nos controles e veja na prévia.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col xl:overflow-hidden">
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
