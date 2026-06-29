import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { redirect } from 'next/navigation'
import { SetupForm } from './setup-form'
import { Building2 } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Setup — Criar Torcida' }

export default async function SetupPage() {
  const session = await auth()

  if (!session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    redirect('/')
  }

  const tenants = await db.tenant.findMany({
    select: { id: true, slug: true, nome: true, plano: true, ativo: true },
    orderBy: { criadoEm: 'desc' },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Setup — Torcidas</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Crie uma nova torcida (tenant) e configure as roles de sistema.
        </p>
      </div>

      {/* Lista de tenants existentes */}
      {tenants.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Torcidas existentes
          </h2>
          <div className="space-y-2">
            {tenants.map((t: Pick<Tenant, 'id' | 'slug' | 'nome' | 'plano' | 'ativo'>) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-zinc-500" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{t.nome}</p>
                    <p className="text-xs text-zinc-500">slug: {t.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      t.ativo
                        ? 'bg-emerald-900 text-emerald-300'
                        : 'bg-zinc-800 text-zinc-400',
                    ].join(' ')}
                  >
                    {t.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    {t.plano}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário de criação */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-5 text-base font-semibold text-zinc-100">Criar nova torcida</h2>
        <SetupForm />
      </div>

      {/* Instrução de variável de ambiente */}
      <div className="rounded-xl border border-blue-900 bg-blue-950/50 p-4 text-sm text-blue-300">
        <p className="font-semibold text-blue-200">Próximo passo após criar</p>
        <p className="mt-1">
          Defina a variável de ambiente <code className="font-mono text-blue-100">TENANT_SLUG</code>{' '}
          com o slug da torcida criada (ex: <code className="font-mono text-blue-100">pde</code>) no Railway para que a
          resolução de tenant funcione enquanto não há domínio próprio com subdomínio.
        </p>
      </div>
    </div>
  )
}
