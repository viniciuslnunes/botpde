import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Painel Admin',
}

export default async function AdminPage() {
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const [totalMembros, pendentes, totalSocios, totalProdutos] = await Promise.all([
    db.saasMembro.count({ where: { tenantId: tenant.id, status: 'APROVADO' } }),
    db.saasMembro.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } }),
    db.saasSocio.count({ where: { tenantId: tenant.id } }),
    db.saasProduto.count({ where: { tenantId: tenant.id, ativo: true } }),
  ])

  const metricas = [
    {
      titulo: 'Membros Aprovados',
      valor: totalMembros,
      cor: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950',
      border: 'border-green-200 dark:border-green-900',
    },
    {
      titulo: 'Aguardando Aprovação',
      valor: pendentes,
      cor: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-950',
      border: 'border-yellow-200 dark:border-yellow-900',
      href: '/admin/membros?status=PENDENTE',
    },
    {
      titulo: 'Sócios com Carteirinha',
      valor: totalSocios,
      cor: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950',
      border: 'border-blue-200 dark:border-blue-900',
    },
    {
      titulo: 'Produtos na Loja',
      valor: totalProdutos,
      cor: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950',
      border: 'border-purple-200 dark:border-purple-900',
    },
  ]

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Dashboard</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricas.map((m) => (
          <div
            key={m.titulo}
            className={`rounded-xl border ${m.border} ${m.bg} p-5 transition-shadow hover:shadow-sm`}
          >
            {m.href ? (
              <Link href={m.href} className="block">
                <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  {m.titulo}
                </p>
                <p className={`mt-2 text-3xl font-bold ${m.cor}`}>{m.valor}</p>
              </Link>
            ) : (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  {m.titulo}
                </p>
                <p className={`mt-2 text-3xl font-bold ${m.cor}`}>{m.valor}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {pendentes > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {pendentes} {pendentes === 1 ? 'membro aguarda' : 'membros aguardam'} aprovação.{' '}
            <Link href="/admin/membros?status=PENDENTE" className="underline hover:no-underline">
              Revisar agora →
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
