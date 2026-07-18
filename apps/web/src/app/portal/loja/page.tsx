import { Suspense } from 'react'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { Package, Tag } from 'lucide-react'
import { SacolaBadge } from '@/components/portal/loja-ui'
import type { Metadata } from 'next'
import {
  LojaCatalogoFallback,
  LojaCatalogoSection,
} from './_components/loja-catalogo-section'

export const metadata: Metadata = { title: 'Loja' }

type SearchParams = {
  q?: string
  categoria?: string
  tamanho?: string
  ordenar?: string
  precoMin?: string
  precoMax?: string
  page?: string
}

export default async function PortalLojaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [session, tenant, params] = await Promise.all([auth(), getTenantFromHost(), searchParams])

  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  const tenantIds = await getVisibleTenantIds(tenant.id, 'loja')

  const [totalProdutos, meusPedidos, sacolaCount] = await Promise.all([
    db.saasProduto.count({
      where: { tenantId: { in: tenantIds }, ativo: true },
    }),
    db.saasPedido.count({
      where: {
        tenantId: { in: tenantIds },
        userId: session.user.id,
        status: { in: ['PENDENTE', 'CONFIRMADO'] },
      },
    }),
    db.saasCarrinhoItem.aggregate({
      where: { userId: session.user.id },
      _sum: { quantidade: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-br from-[rgb(var(--primary)_/_0.15)] to-transparent p-6">
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Loja oficial da torcida</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Produtos exclusivos dos Gaviões da Fiel
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-primary)_/_0.12)] px-3 py-1 text-xs font-medium text-[rgb(var(--color-primary-fg))]">
          <Tag className="h-3.5 w-3.5" />
          Primeira compra: cupom <strong>EUSOUGAVIAO</strong> (10% off)
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {totalProdutos} produto{totalProdutos !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <SacolaBadge count={sacolaCount._sum.quantidade ?? 0} />
          <Link
            href="/portal/loja/pedidos"
            className="relative flex items-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <Package className="h-4 w-4" />
            Meus pedidos
            {meusPedidos > 0 && (
              <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-white">
                {meusPedidos}
              </span>
            )}
          </Link>
        </div>
      </div>

      <Suspense fallback={<LojaCatalogoFallback />}>
        <LojaCatalogoSection
          tenantId={tenant.id}
          tenantIds={tenantIds}
          searchParams={params}
        />
      </Suspense>
    </div>
  )
}
