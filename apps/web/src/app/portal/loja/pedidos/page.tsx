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

const STATUS_DESC: Record<string, string> = {
  PENDENTE: 'Aguardando confirmação da administração.',
  CONFIRMADO: 'Pedido confirmado! Aguarde a entrega.',
  ENTREGUE: 'Entregue.',
  CANCELADO: 'Este pedido foi cancelado.',
}

export default async function MeusPedidosPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  // Pedido é gravado no tenant dono do produto (ver portal/loja/actions.ts)
  // — se o produto era de um tenant ancestral, o pedido também está lá.
  // É histórico pessoal do próprio usuário, sempre visível independente da
  // classificação de sensibilidade do recurso.
  const ancestrais = await getAncestorTenantIds(tenant.id)
  const pedidos = await db.saasPedido.findMany({
    where: { tenantId: { in: [tenant.id, ...ancestrais] }, userId: session.user.id },
    orderBy: { criadoEm: 'desc' },
    include: { produto: { select: { imagensUrl: true, ativo: true } } },
  })

  type Pedido = (typeof pedidos)[number]
  const ativos = pedidos.filter((p: Pedido) => !['ENTREGUE', 'CANCELADO'].includes(p.status))
  const historico = pedidos.filter((p: Pedido) => ['ENTREGUE', 'CANCELADO'].includes(p.status))

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/portal/loja"
          className="flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Loja
        </Link>
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Meus pedidos</h1>
      </div>

      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
          <h3 className="font-semibold text-[rgb(var(--foreground))]">Nenhum pedido ainda</h3>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">Seus pedidos aparecerão aqui.</p>
          <Link
            href="/portal/loja"
            className="mt-4 rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Ir à loja
          </Link>
        </div>
      ) : (
        <>
          {/* Pedidos ativos */}
          {ativos.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Em andamento ({ativos.length})
              </h2>
              <div className="space-y-3">
                {ativos.map((pedido: Pedido) => (
                  <div
                    key={pedido.id}
                    className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
                  >
                    <div className="flex items-start gap-4">
                      <ProdutoImagem
                        src={firstProdutoImagemUrl(pedido.produto.imagensUrl)}
                        alt={pedido.produtoNome}
                        variant="thumb"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-[rgb(var(--foreground))]">{pedido.produtoNome}</h3>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COR[pedido.status] ?? ''}`}>
                            {STATUS_LABEL[pedido.status] ?? pedido.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                          {pedido.tamanho ? `Tamanho ${pedido.tamanho} · ` : ''}
                          {pedido.quantidade} un. · {formatarPreco(pedido.total)}
                        </p>
                        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                          {STATUS_DESC[pedido.status]}
                        </p>
                        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                          Pedido em {formatarData(pedido.criadoEm)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Histórico */}
          {historico.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Histórico ({historico.length})
              </h2>
              <div className="space-y-2">
                {historico.map((pedido: Pedido) => (
                  <div
                    key={pedido.id}
                    className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 opacity-70"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[rgb(var(--foreground))] truncate">{pedido.produtoNome}</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {pedido.tamanho ? `${pedido.tamanho} · ` : ''}
                        {pedido.quantidade} un. · {formatarPreco(pedido.total)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COR[pedido.status] ?? ''}`}>
                        {STATUS_LABEL[pedido.status] ?? pedido.status}
                      </span>
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(pedido.criadoEm))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
