import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ShoppingBag, Package } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Loja' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function estoqueTotal(estoque: unknown): number {
  const e = (estoque ?? {}) as Record<string, number>
  return Object.values(e).reduce((a, b) => a + b, 0)
}

export default async function PortalLojaPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  // Loja é recurso PUBLICO na hierarquia — produtos da sede-mãe cascadeiam
  // pras telas de subsedes/PDEs, na mesma direção já aplicada em
  // comunidade/eventos (institucional/centralizado desce, local não sobe).
  const tenantIds = await getVisibleTenantIds(tenant.id, 'loja')

  const [produtos, meusPedidos] = await Promise.all([
    db.saasProduto.findMany({
      where: { tenantId: { in: tenantIds }, ativo: true },
      orderBy: { criadoEm: 'desc' },
      include: { tenant: { select: { nome: true } } },
    }),
    db.saasPedido.count({
      where: { tenantId: { in: tenantIds }, userId: session.user.id, status: { in: ['PENDENTE', 'CONFIRMADO'] } },
    }),
  ])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Loja</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            {produtos.length} produto{produtos.length !== 1 ? 's' : ''} disponíve{produtos.length !== 1 ? 'is' : 'l'}
          </p>
        </div>
        <Link
          href="/portal/loja/pedidos"
          className="relative flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
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

      {/* Grade de produtos */}
      {produtos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-20 text-center">
          <ShoppingBag className="mb-3 h-12 w-12 text-[rgb(var(--foreground-muted))]" />
          <h3 className="font-semibold text-[rgb(var(--foreground))]">Loja em breve</h3>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">Novos produtos serão adicionados em breve.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {produtos.map((p: (typeof produtos)[number]) => {
            const sem = estoqueTotal(p.estoque)
            return (
              <Link
                key={p.id}
                href={`/portal/loja/${p.id}`}
                className="group block rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden transition-all hover:shadow-md hover:scale-[1.01]"
              >
                <ProdutoImagem src={firstProdutoImagemUrl(p.imagensUrl)} alt={p.nome} variant="card" />
                <div className="p-4 space-y-2">
                  {p.tenantId !== tenant.id && (
                    <span className="inline-flex rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                      {p.tenant.nome}
                    </span>
                  )}
                  <h3 className="font-semibold text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--primary))] transition-colors line-clamp-1">
                    {p.nome}
                  </h3>
                  {p.descricao && (
                    <p className="text-xs text-[rgb(var(--foreground-muted))] line-clamp-2">{p.descricao}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[rgb(var(--primary))]">{formatarPreco(p.preco)}</span>
                    {sem === 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                        Esgotado
                      </span>
                    ) : p.tamanhos.length > 0 ? (
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        {p.tamanhos.join(' · ')}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
