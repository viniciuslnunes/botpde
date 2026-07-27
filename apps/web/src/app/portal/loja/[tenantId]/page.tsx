import { Suspense } from 'react'
import { db } from '@torcida/db'
import { tenantsPermitidosLoja } from '@/lib/loja-lojas'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ArrowLeft, Package, Tag } from 'lucide-react'
import { SacolaBadge } from '@/components/portal/loja-ui'
import { formatNomeTorcida } from '@torcida/types'
import type { Metadata } from 'next'
import {
  LojaCatalogoFallback,
  LojaCatalogoSection,
} from '../_components/loja-catalogo-section'

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

export default async function PortalLojaTenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<SearchParams>
}) {
  const [session, { tenantId }, sp] = await Promise.all([auth(), params, searchParams])

  if (!session?.user?.id) redirect('/entrar')

  const permitidos = await tenantsPermitidosLoja(session.user.id)
  if (!permitidos.has(tenantId)) notFound()

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId, ativo: true },
    select: { nome: true },
  })
  if (!tenant) notFound()

  const [totalProdutos, meusPedidos, sacolaCount, cupomDestaque]: [
    number,
    number,
    { _sum: { quantidade: number | null } },
    { codigo: string; tipo: string; valor: unknown } | null,
  ] = await Promise.all([
    db.saasProduto.count({ where: { tenantId, ativo: true } }),
    db.saasPedido.count({
      where: { tenantId, userId: session.user.id, status: { in: ['PENDENTE', 'CONFIRMADO'] } },
    }),
    db.saasCarrinhoItem.aggregate({
      where: { userId: session.user.id },
      _sum: { quantidade: true },
    }),
    db.saasCupom.findFirst({
      where: {
        tenantId,
        ativo: true,
        primeiraCompra: true,
        OR: [{ validoAte: null }, { validoAte: { gte: new Date() } }],
      },
      orderBy: { criadoEm: 'desc' },
      select: { codigo: true, tipo: true, valor: true },
    }),
  ])

  const textoCupom = cupomDestaque
    ? cupomDestaque.tipo === 'PERCENTUAL'
      ? `${Number(cupomDestaque.valor)}% off`
      : `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cupomDestaque.valor))} off`
    : null

  return (
    <div className="space-y-6">
      <Link
        href="/portal/loja"
        className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Todas as lojas
      </Link>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-br from-[rgb(var(--primary)_/_0.15)] to-transparent p-4 sm:p-6">
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))] sm:text-2xl">Loja oficial da torcida</h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Produtos exclusivos da {formatNomeTorcida(tenant.nome)}
        </p>
        {cupomDestaque && textoCupom && (
          <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-[rgb(var(--color-primary)_/_0.12)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--color-primary-fg))]">
            <Tag className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">Cupom <strong className="tracking-wide">{cupomDestaque.codigo}</strong> · {textoCupom}</span>
            <span className="hidden sm:inline">
              Primeira compra: cupom <strong className="tracking-wide">{cupomDestaque.codigo}</strong> ({textoCupom})
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          {totalProdutos} produto{totalProdutos !== 1 ? 's' : ''}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <SacolaBadge count={sacolaCount._sum.quantidade ?? 0} />
          <Link
            href="/portal/loja/pedidos"
            className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))] sm:px-4"
          >
            <Package className="h-4 w-4 shrink-0" />
            <span className="truncate">Pedidos</span>
            {meusPedidos > 0 && (
              <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-white">
                {meusPedidos}
              </span>
            )}
          </Link>
        </div>
      </div>

      <Suspense fallback={<LojaCatalogoFallback />}>
        <LojaCatalogoSection tenantId={tenantId} searchParams={sp} />
      </Suspense>
    </div>
  )
}
