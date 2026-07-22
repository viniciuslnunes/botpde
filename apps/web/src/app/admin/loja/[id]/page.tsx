import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { EditarProdutoForm } from '@/components/admin/produto-forms'
import { StatusBadge } from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
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

  try {
    await assertPermission(PERMISSIONS.STORE_MANAGE)
  } catch {
    redirect('/admin')
  }

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const [produto, categorias, pedidoItens] = await Promise.all([
    db.saasProduto.findFirst({ where: { id, tenantId: tenant.id } }),
    db.saasCategoria.findMany({ where: { tenantId: tenant.id }, orderBy: { ordem: 'asc' } }),
    db.saasPedidoItem.findMany({
      where: { produtoId: id },
      orderBy: { pedido: { criadoEm: 'desc' } },
      take: 20,
      include: { pedido: { include: { user: { select: { nome: true, email: true } } } } },
    }),
  ])

  if (!produto) notFound()

  const estoque = (produto.estoque ?? {}) as Record<string, number>

  return (
    <div className="app-container space-y-8 py-8">
      <MotionReveal>
        <div className="flex items-center gap-3">
          <Link href="/admin/loja" className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]">
            <ArrowLeft className="h-4 w-4" /> Loja
          </Link>
          <div>
            <h1 className="text-xl font-bold">{produto.nome}</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">{produto.ativo ? '● Ativo' : '● Inativo'}</p>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <h2 className="mb-4 font-semibold">Dados do produto</h2>
        <EditarProdutoForm
          id={id}
          categorias={categorias.map((c: (typeof categorias)[number]) => ({ id: c.id, nome: c.nome }))}
          defaults={{
            nome: produto.nome,
            descricao: produto.descricao,
            preco: Number(produto.preco),
            precoOriginal: produto.precoOriginal ? Number(produto.precoOriginal) : undefined,
            marca: produto.marca ?? '',
            categoriaId: produto.categoriaId ?? '',
            destaque: produto.destaque,
            imagensUrl: produto.imagensUrl,
            tamanhos: produto.tamanhos,
            estoque,
          }}
        />
      </div>
      </MotionReveal>

      {pedidoItens.length > 0 && (
        <MotionReveal index={2}>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <h2 className="mb-4 font-semibold">Pedidos recentes ({pedidoItens.length})</h2>
          <div className="space-y-2">
            {pedidoItens.map((item: (typeof pedidoItens)[number]) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.pedido.user.nome ?? item.pedido.user.email ?? '—'}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {item.tamanho ? `Tam. ${item.tamanho} · ` : ''}{item.quantidade} un. · {formatarPreco(item.total)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge dominio="pedido" status={item.pedido.status} />
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">{formatarData(item.pedido.criadoEm)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </MotionReveal>
      )}
    </div>
  )
}
