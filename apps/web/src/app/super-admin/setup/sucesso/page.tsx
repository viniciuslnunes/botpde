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
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-emerald-800 bg-emerald-950/50 p-6">
        <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-400" />
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Torcida criada!</h1>
          <p className="mt-1 text-sm text-zinc-400">
            O tenant foi criado com as roles de sistema (owner, admin, member) e você já foi
            atribuído como <strong className="text-zinc-200">owner</strong>.
          </p>
        </div>
      </div>

      {tenantId && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Dados do tenant
          </p>
          <div className="space-y-1 font-mono text-xs text-zinc-300">
            <p>
              <span className="text-zinc-500">id: </span>
              {tenantId}
            </p>
            {slug && (
              <p>
                <span className="text-zinc-500">slug: </span>
                {slug}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-900 bg-blue-950/50 p-4 text-sm text-blue-300">
        <p className="font-semibold text-blue-200">Configure a variável de ambiente no Railway</p>
        <div className="mt-2 rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
          <p>
            <span className="text-zinc-500">Variável: </span>TENANT_SLUG
          </p>
          <p>
            <span className="text-zinc-500">Valor: </span>
            <span className="text-emerald-400">{slug ?? 'seu-slug'}</span>
          </p>
        </div>
        <p className="mt-2 text-xs text-blue-400">
          Após definir essa variável e fazer redeploy, o sistema resolve o tenant corretamente em
          qualquer domínio que não seja subdomínio do seu domínio principal.
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/admin"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Settings className="h-4 w-4" />
          Acessar painel admin
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/super-admin/setup"
          className="rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Criar outra
        </Link>
      </div>
    </div>
  )
}
