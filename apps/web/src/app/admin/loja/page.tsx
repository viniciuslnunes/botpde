import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CriarProdutoForm, ToggleProdutoButton } from '@/components/admin/produto-forms'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { ShoppingBag, Package, Pencil, Tags, Ticket } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Loja — Admin' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarEstoque(estoque: unknown, tamanhos: string[]): string {
  const e = (estoque ?? {}) as Record<string, number>
  if (!Object.keys(e).length) return 'Sem estoque cadastrado'
  if (tamanhos.length === 0) return `${e['UN'] ?? 0} un.`
  return tamanhos.filter((t) => e[t] !== undefined).map((t) => `${t}: ${e[t]}`).join(' | ')
}

export default async function AdminLojaPage() {
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const [produtos, categorias, totalPedidos] = await Promise.all([
    db.saasProduto.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }],
      include: { _count: { select: { pedidoItens: true } }, categoria: { select: { nome: true } } },
    }),
    db.saasCategoria.findMany({ where: { tenantId: tenant.id }, orderBy: { ordem: 'asc' } }),
    db.saasPedido.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } }),
  ])

  type Produto = (typeof produtos)[number]
  const ativos = produtos.filter((p: Produto) => p.ativo)
  const inativos = produtos.filter((p: Produto) => !p.ativo)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Loja</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            {ativos.length} produto{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/loja/categorias" className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]">
            <Tags className="h-4 w-4" /> Categorias
          </Link>
          <Link href="/admin/loja/cupons" className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]">
            <Ticket className="h-4 w-4" /> Cupons
          </Link>
          <Link href="/admin/loja/pedidos" className="relative flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]">
            <Package className="h-4 w-4" /> Pedidos
            {totalPedidos > 0 && <span className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-xs font-bold text-white">{totalPedidos}</span>}
          </Link>
        </div>
      </div>

      <CriarProdutoForm categorias={categorias.map((c: (typeof categorias)[number]) => ({ id: c.id, nome: c.nome }))} />

      {ativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Ativos ({ativos.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ativos.map((p: Produto) => (
              <div key={p.id} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden">
                <ProdutoImagem src={firstProdutoImagemUrl(p.imagensUrl)} alt={p.nome} variant="admin" />
                <div className="p-4 space-y-3">
                  <div>
                    {p.destaque && <span className="text-xs font-medium text-amber-600">★ Destaque</span>}
                    <h3 className="font-semibold">{p.nome}</h3>
                    {p.categoria && <p className="text-xs text-[rgb(var(--foreground-muted))]">{p.categoria.nome}</p>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[rgb(var(--primary))]">{formatarPreco(p.preco)}</span>
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">{p._count.pedidoItens} itens vendidos</span>
                  </div>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">Estoque: {formatarEstoque(p.estoque, p.tamanhos)}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Link href={`/admin/loja/${p.id}`} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]">
                      <Pencil className="h-3 w-3" /> Editar
                    </Link>
                    <ToggleProdutoButton id={p.id} ativo={p.ativo} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {inativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Inativos ({inativos.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inativos.map((p: Produto) => (
              <div key={p.id} className="rounded-2xl border bg-[rgb(var(--background-subtle))] opacity-70 overflow-hidden">
                <ProdutoImagem src={firstProdutoImagemUrl(p.imagensUrl)} alt={p.nome} variant="admin" className="h-32" />
                <div className="p-4 space-y-2">
                  <h3 className="font-medium">{p.nome}</h3>
                  <p className="text-sm font-semibold text-[rgb(var(--foreground-muted))]">{formatarPreco(p.preco)}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Link href={`/admin/loja/${p.id}`} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"><Pencil className="h-3 w-3" /> Editar</Link>
                    <ToggleProdutoButton id={p.id} ativo={p.ativo} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {produtos.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center">
          <ShoppingBag className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
          <h3 className="font-semibold">Nenhum produto cadastrado</h3>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">Crie o primeiro produto ou rode o seed Gaviões.</p>
        </div>
      )}
    </div>
  )
}
