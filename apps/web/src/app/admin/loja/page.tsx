import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CriarProdutoForm, ToggleProdutoButton } from '@/components/admin/produto-forms'
import { ShoppingBag, Package, Pencil } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Loja — Admin' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarEstoque(estoque: unknown, tamanhos: string[]): string {
  const e = (estoque ?? {}) as Record<string, number>
  if (!Object.keys(e).length) return 'Sem estoque cadastrado'
  if (tamanhos.length === 0) return `${e['UN'] ?? 0} un.`
  return tamanhos
    .filter((t) => e[t] !== undefined)
    .map((t) => `${t}: ${e[t]}`)
    .join(' | ')
}

export default async function AdminLojaPage() {
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const [produtos, totalPedidos] = await Promise.all([
    db.saasProduto.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }],
      include: { _count: { select: { pedidos: true } } },
    }),
    db.saasPedido.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } }),
  ])

  type Produto = (typeof produtos)[number]
  const ativos = produtos.filter((p: Produto) => p.ativo)
  const inativos = produtos.filter((p: Produto) => !p.ativo)

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Loja</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            {ativos.length} produto{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/loja/pedidos"
            className="relative flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <Package className="h-4 w-4" />
            Pedidos
            {totalPedidos > 0 && (
              <span className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-xs font-bold text-white">
                {totalPedidos}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Criar produto */}
      <CriarProdutoForm />

      {/* Produtos ativos */}
      {ativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Ativos ({ativos.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ativos.map((p: Produto) => (
              <div key={p.id} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden">
                {p.imagensUrl[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagensUrl[0]} alt={p.nome} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-[rgb(var(--background-subtle))]">
                    <ShoppingBag className="h-10 w-10 text-[rgb(var(--foreground-muted))]" />
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-[rgb(var(--foreground))]">{p.nome}</h3>
                    {p.descricao && (
                      <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))] line-clamp-2">{p.descricao}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[rgb(var(--primary))]">{formatarPreco(p.preco)}</span>
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">{p._count.pedidos} pedido{p._count.pedidos !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    Estoque: {formatarEstoque(p.estoque, p.tamanhos)}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/admin/loja/${p.id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Link>
                    <ToggleProdutoButton id={p.id} ativo={p.ativo} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Produtos inativos */}
      {inativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Inativos ({inativos.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inativos.map((p: Produto) => (
              <div key={p.id} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70 overflow-hidden">
                <div className="flex h-32 items-center justify-center bg-[rgb(var(--background))]">
                  <ShoppingBag className="h-8 w-8 text-[rgb(var(--foreground-muted))]" />
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="font-medium text-[rgb(var(--foreground))]">{p.nome}</h3>
                  <p className="text-sm font-semibold text-[rgb(var(--foreground-muted))]">{formatarPreco(p.preco)}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/admin/loja/${p.id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Link>
                    <ToggleProdutoButton id={p.id} ativo={p.ativo} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vazio */}
      {produtos.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center">
          <ShoppingBag className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
          <h3 className="font-semibold text-[rgb(var(--foreground))]">Nenhum produto cadastrado</h3>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">Crie o primeiro produto da loja acima.</p>
        </div>
      )}
    </div>
  )
}
