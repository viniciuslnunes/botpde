import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { Package, ArrowLeft } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Pedidos' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data))
}

const STATUS_COR: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  CONFIRMADO: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ENTREGUE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  CANCELADO: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

export default async function MeusPedidosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  const ancestrais = await getAncestorTenantIds(tenant.id)
  const pedidos = await db.saasPedido.findMany({
    where: { tenantId: { in: [tenant.id, ...ancestrais] }, userId: session.user.id },
    orderBy: { criadoEm: 'desc' },
    include: { itens: { include: { produto: { select: { imagensUrl: true } } } } },
  })

  const ativos = pedidos.filter((p: (typeof pedidos)[number]) => !['ENTREGUE', 'CANCELADO'].includes(p.status))
  const historico = pedidos.filter((p: (typeof pedidos)[number]) => ['ENTREGUE', 'CANCELADO'].includes(p.status))

  function PedidoCard({ pedido }: { pedido: (typeof pedidos)[number] }) {
    const primeiraImagem = pedido.itens[0]?.produto.imagensUrl
    const titulo = pedido.itens.length === 1
      ? pedido.itens[0].produtoNome
      : `Pedido com ${pedido.itens.length} itens`

    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <div className="flex items-start gap-4">
          <ProdutoImagem src={firstProdutoImagemUrl(primeiraImagem)} alt={titulo} variant="thumb" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{titulo}</h3>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COR[pedido.status] ?? ''}`}>
                {STATUS_LABEL[pedido.status] ?? pedido.status}
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-[rgb(var(--foreground-muted))]">
              {pedido.itens.map((item: (typeof pedido.itens)[number]) => (
                <li key={item.id}>
                  {item.produtoNome}{item.tamanho ? ` · ${item.tamanho}` : ''} × {item.quantidade}
                </li>
              ))}
            </ul>
            <p className="mt-2 font-semibold text-[rgb(var(--foreground))]">{formatarPreco(pedido.total)}</p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              {pedido.modalidadeEntrega === 'RETIRADA' ? 'Retirada na sede' : 'Envio'} · {formatarData(pedido.criadoEm)}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/portal/loja" className="flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
          <ArrowLeft className="h-4 w-4" /> Loja
        </Link>
        <h1 className="text-xl font-bold">Meus pedidos</h1>
      </div>

      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
          <h3 className="font-semibold">Nenhum pedido ainda</h3>
          <Link href="/portal/loja" className="mt-4 rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm text-white">Ir à loja</Link>
        </div>
      ) : (
        <>
          {ativos.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase text-[rgb(var(--foreground-muted))]">Em andamento ({ativos.length})</h2>
              <div className="space-y-3">{ativos.map((p: (typeof pedidos)[number]) => <PedidoCard key={p.id} pedido={p} />)}</div>
            </section>
          )}
          {historico.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase text-[rgb(var(--foreground-muted))]">Histórico ({historico.length})</h2>
              <div className="space-y-3">{historico.map((p: (typeof pedidos)[number]) => <PedidoCard key={p.id} pedido={p} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
