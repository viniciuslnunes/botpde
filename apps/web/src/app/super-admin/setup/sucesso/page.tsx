import Link from 'next/link'
import { CheckCircle2, ArrowRight, Settings } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Torcida criada com sucesso' }

export default async function SucessoPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; slug?: string }>
}) {
  const { tenant: tenantId, slug } = await searchParams

  return (
    <div className="app-container max-w-2xl space-y-6 py-8">
      <div className="flex items-start gap-4 rounded-2xl border alert-success">
        <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-success" />
        <div className="space-y-3">
          <h1 className="portal-display text-xl text-[rgb(var(--foreground))]">Torcida criada!</h1>
          <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
            O tenant foi criado com as roles de sistema (owner, admin, member) e você já foi
            atribuído como <strong className="text-[rgb(var(--foreground))]">owner</strong>.
          </p>
        </div>
      </div>

      {tenantId && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Dados do tenant
          </p>
          <div className="space-y-1 font-mono text-xs text-[rgb(var(--foreground))]">
            <p>
              <span className="text-[rgb(var(--foreground-muted))]">id: </span>
              {tenantId}
            </p>
            {slug && (
              <p>
                <span className="text-[rgb(var(--foreground-muted))]">slug: </span>
                {slug}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
        <p className="font-semibold text-blue-900 dark:text-blue-200">
          Próximo passo: multi-tenant ou single-tenant
        </p>
        <p className="mt-2 text-xs opacity-90">
          Com <code className="font-mono">ROOT_DOMAIN</code> (recomendado), cada torcida fica em{' '}
          <code className="font-mono">{slug ?? 'slug'}.seudominio.com</code>. Sem domínio próprio, use{' '}
          <code className="font-mono">TENANT_SLUG={slug ?? 'seu-slug'}</code> no Railway (modo
          legado). Ver <code className="font-mono">docs/ops/deploy-multi-tenant.md</code>.
        </p>
        <p className="mt-2 text-xs opacity-90">
          Transfira a propriedade para o presidente em{' '}
          <Link href="/super-admin/torcidas" className="underline">
            Torcidas da plataforma
          </Link>
          .
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/admin"
          className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
        >
          <Settings className="h-4 w-4" />
          Acessar painel admin
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/super-admin/setup"
          className="rounded-xl border border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          Criar outra
        </Link>
      </div>
    </div>
  )
}
