import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { Badge } from '@torcida/ui'
import { superAdminEmails } from '@/lib/env'
import { redirect } from 'next/navigation'
import { SetupForm } from './setup-form'
import { AtribuirOwnerButton } from './setup-form'
import { TenantAtivoToggle } from './tenant-ativo-toggle'
import { TenantPlanoSelect } from './tenant-plano-select'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { Building2, PlusCircle } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Setup — Criar Torcida' }

export default async function SetupPage() {
  const session = await auth()

  if (!session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    redirect('/')
  }

  const userId = session.user.id

  const [tenants, minhasRoles] = await Promise.all([
    db.tenant.findMany({
      select: { id: true, slug: true, nome: true, plano: true, ativo: true },
      orderBy: { criadoEm: 'desc' },
    }),
    db.userRole.findMany({
      where: { userId, role: { nome: 'owner', isSystem: true } },
      select: { tenantId: true },
    }),
  ])

  const souOwnerDe = new Set(minhasRoles.map((r: { tenantId: string }) => r.tenantId))

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Setup — Torcidas"
        description="Crie uma nova torcida (tenant) e configure as roles de sistema."
        icon={<PlusCircle className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 space-y-8 py-5 sm:py-8">
        {/* Lista de tenants existentes */}
        {tenants.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Torcidas existentes
            </h2>
            <div className="space-y-2">
              {tenants.map((t: Pick<Tenant, 'id' | 'slug' | 'nome' | 'plano' | 'ativo'>) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                    <div>
                      <p className="text-sm font-medium text-[rgb(var(--foreground))]">{t.nome}</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">slug: {t.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TenantAtivoToggle tenantId={t.id} nome={t.nome} ativo={t.ativo} />
                    <TenantPlanoSelect tenantId={t.id} plano={t.plano} />
                    {souOwnerDe.has(t.id) ? (
                      <Badge variant="info">owner ✓</Badge>
                    ) : (
                      <AtribuirOwnerButton tenantId={t.id} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulário de criação */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <h2 className="mb-5 text-base font-semibold text-[rgb(var(--foreground))]">
            Criar nova torcida
          </h2>
          <SetupForm />
        </div>

        {/* Instrução de variável de ambiente */}
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
          <p className="font-semibold text-blue-900 dark:text-blue-200">Multi-tenant em produção</p>
          <p className="mt-1">
            Configure <code className="font-mono">ROOT_DOMAIN</code> + DNS wildcard no Railway para
            cada torcida ter portal próprio. Modo legado: <code className="font-mono">TENANT_SLUG</code>{' '}
            fixo.
          </p>
          <p className="mt-2 text-xs opacity-90">
            Runbook completo: <code className="font-mono">docs/ops/deploy-multi-tenant.md</code>
          </p>
        </div>
      </div>
    </div>
  )
}
