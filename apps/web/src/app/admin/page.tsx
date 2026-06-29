import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Painel Admin',
}

export default async function AdminPage() {
  const tenant = await getTenantFromHost()

  if (!tenant) redirect('/')

  const [totalMembros, pendentes, totalSocios, totalProdutos] = await Promise.all([
    db.membro.count({ where: { tenantId: tenant.id, status: 'APROVADO' } }),
    db.membro.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } }),
    db.socio.count({ where: { tenantId: tenant.id } }),
    db.produto.count({ where: { tenantId: tenant.id, ativo: true } }),
  ])

  const metricas = [
    { titulo: 'Membros Aprovados', valor: totalMembros, cor: 'text-green-600 dark:text-green-400' },
    { titulo: 'Aguardando Aprovação', valor: pendentes, cor: 'text-yellow-600 dark:text-yellow-400' },
    { titulo: 'Sócios com Carteirinha', valor: totalSocios, cor: 'text-blue-600 dark:text-blue-400' },
    { titulo: 'Produtos na Loja', valor: totalProdutos, cor: 'text-purple-600 dark:text-purple-400' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Painel Administrativo</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricas.map((m) => (
          <div
            key={m.titulo}
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              {m.titulo}
            </p>
            <p className={`mt-2 text-3xl font-bold ${m.cor}`}>{m.valor}</p>
          </div>
        ))}
      </div>

      {pendentes > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {pendentes} {pendentes === 1 ? 'membro aguarda' : 'membros aguardam'} aprovação.{' '}
            <a href="/admin/membros" className="underline hover:no-underline">
              Revisar agora →
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
