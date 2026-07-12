import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CriarProdutoForm } from '@/components/admin/produto-forms'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { AdminLojaProdutosGrid, type AdminProdutoItem } from './admin-loja-produtos-grid'
import { Package, Tags, Ticket } from 'lucide-react'
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

function serializarProduto(p: {
  id: string
  nome: string
  preco: unknown
  estoque: unknown
  tamanhos: string[]
  destaque: boolean
  ativo: boolean
  imagensUrl: unknown
  _count: { pedidoItens: number }
  categoria: { nome: string } | null
}): AdminProdutoItem {
  return {
    id: p.id,
    nome: p.nome,
    categoriaNome: p.categoria?.nome ?? null,
    precoLabel: formatarPreco(p.preco),
    estoqueLabel: formatarEstoque(p.estoque, p.tamanhos),
    vendidos: p._count.pedidoItens,
    destaque: p.destaque,
    ativo: p.ativo,
    imagemUrl: firstProdutoImagemUrl(p.imagensUrl as string[] | null | undefined),
  }
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
    <div className="app-container space-y-6 py-8">
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

      <AdminLojaProdutosGrid
        ativos={ativos.map(serializarProduto)}
        inativos={inativos.map(serializarProduto)}
      />
    </div>
  )
}
