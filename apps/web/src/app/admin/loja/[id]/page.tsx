import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { EditarProdutoForm } from '@/components/admin/produto-forms'
import { StatusPedidoBadge } from '@/components/admin/produto-forms'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar Produto — Admin' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data))
}

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const produto = await db.saasProduto.findFirst({
    where: { id, tenantId: tenant.id },
    include: {
      pedidos: {
        orderBy: { criadoEm: 'desc' },
        take: 20,
        include: { user: { select: { nome: true, email: true } } },
      },
    },
  })

  if (!produto) notFound()

  const estoque = (produto.estoque ?? {}) as Record<string, number>
  const imagemUrl = firstProdutoImagemUrl(produto.imagensUrl) ?? ''

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/loja"
          className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Loja
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{produto.nome}</h1>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            {produto.ativo ? (
              <span className="text-emerald-600 dark:text-emerald-400">● Ativo</span>
            ) : (
              <span className="text-red-500">● Inativo</span>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <h2 className="mb-4 font-semibold text-[rgb(var(--foreground))]">Dados do produto</h2>
        <EditarProdutoForm
          id={id}
          defaults={{
            nome: produto.nome,
            descricao: produto.descricao,
            preco: Number(produto.preco),
            imagemUrl,
            tamanhos: produto.tamanhos,
            estoque,
          }}
        />
      </div>

      {/* Pedidos do produto */}
      {produto.pedidos.length > 0 && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <h2 className="mb-4 font-semibold text-[rgb(var(--foreground))]">Pedidos ({produto.pedidos.length})</h2>
          <div className="space-y-2">
            {produto.pedidos.map((pedido: (typeof produto.pedidos)[number]) => (
              <div
                key={pedido.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[rgb(var(--foreground))]">
                    {pedido.user.nome ?? pedido.user.email ?? '—'}
                  </p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {pedido.tamanho ? `Tamanho ${pedido.tamanho} · ` : ''}
                    {pedido.quantidade} un. · {formatarPreco(pedido.total)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPedidoBadge status={pedido.status} />
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">{formatarData(pedido.criadoEm)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
