import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Handshake } from 'lucide-react'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { listAliancasForTenant, listRecomendacoesForTenant } from '@/lib/aliancas'
import { reconciliarPropostasAliancaPendentes } from '@/lib/notificacoes'
import { AliancaForms } from '@/components/admin/alianca-forms'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { PERMISSIONS } from '@torcida/types'

export const metadata: Metadata = { title: 'Alianças — Admin' }

interface TenantOption {
  id: string
  nome: string
  slug: string
  logoUrl: string | null
  afiliacaoId: string | null
  afiliacao: {
    nome: string
    apelido: string | null
    cidade: string | null
    estado: string | null
  } | null
}

export default async function AdminAliancasPage() {
  const authz = await assertPermission(PERMISSIONS.ALLIANCES_MANAGE).catch(() => null)
  if (!authz) {
    redirect('/admin')
  }

  await reconciliarPropostasAliancaPendentes(authz.tenant.id)

  const [aliancas, recomendacoes, tenantsRaw]: [
    Awaited<ReturnType<typeof listAliancasForTenant>>,
    Awaited<ReturnType<typeof listRecomendacoesForTenant>>,
    Array<{
      id: string
      nome: string
      slug: string
      logoUrl: string | null
      afiliacaoId: string | null
      torcidaConhecida: { logoUrl: string | null } | null
      afiliacao: {
        nome: string
        apelido: string | null
        cidade: string | null
        estado: string | null
      } | null
    }>,
  ] = await Promise.all([
    listAliancasForTenant(authz.tenant.id),
    listRecomendacoesForTenant(authz.tenant.id),
    db.tenant.findMany({
      where: { ativo: true, sintetico: false, id: { not: authz.tenant.id } },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        slug: true,
        logoUrl: true,
        afiliacaoId: true,
        torcidaConhecida: { select: { logoUrl: true } },
        afiliacao: {
          select: { nome: true, apelido: true, cidade: true, estado: true },
        },
      },
    }),
  ])

  const tenantOptions: TenantOption[] = tenantsRaw.map((t) => ({
    id: t.id,
    nome: t.nome,
    slug: t.slug,
    logoUrl: t.torcidaConhecida?.logoUrl ?? t.logoUrl,
    afiliacaoId: t.afiliacaoId,
    afiliacao: t.afiliacao,
  }))

  // Client Component: Dates → ISO (Flight aceita Date, mas o restante do admin
  // serializa explicitamente — evita regressão opaca em produção).
  const aliancasSerializadas = aliancas.map((a) => ({
    ...a,
    criadoEm: a.criadoEm.toISOString(),
    confirmadaEm: a.confirmadaEm?.toISOString() ?? null,
  }))
  const recomendacoesSerializadas = recomendacoes.map((r) => ({
    ...r,
    criadoEm: r.criadoEm.toISOString(),
  }))

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <Handshake className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Alianças</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Aliança formal só entre times distintos. Co-irmãs e PDEs herdam o vínculo da sede.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container">
          <MotionReveal>
            <AliancaForms
              tenantId={authz.tenant.id}
              afiliacaoId={authz.tenant.afiliacaoId ?? null}
              aliancas={aliancasSerializadas}
              recomendacoes={recomendacoesSerializadas}
              tenants={tenantOptions}
            />
          </MotionReveal>
        </div>
      </div>
    </div>
  )
}
