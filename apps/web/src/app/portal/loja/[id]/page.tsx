import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { resolveVisibility } from '@/lib/hierarquia'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ComprarForm } from './comprar-form'
import { ArrowLeft } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produto' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

export default async function ProdutoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')

  // Produto pode pertencer a um tenant ancestral (loja da sede-mãe cascadeia
  // pra subsedes/PDEs) — busca sem restringir por tenant, valida depois.
  const produto = await db.saasProduto.findFirst({
    where: { id, ativo: true },
    include: { tenant: { select: { nome: true } } },
  })

  if (!produto) notFound()
  if (produto.tenantId !== tenant.id) {
    const visivel = await resolveVisibility(tenant.id, produto.tenantId, 'loja')
    if (!visivel) notFound()
  }

  const estoque = (produto.estoque ?? {}) as Record<string, number>

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/portal/loja"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar à loja
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Imagem */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))]">
          <ProdutoImagem
            src={firstProdutoImagemUrl(produto.imagensUrl)}
            alt={produto.nome}
            variant="detail"
          />
        </div>

        {/* Info + Compra */}
        <div className="space-y-6">
          <div>
            {produto.tenantId !== tenant.id && (
              <span className="mb-2 inline-flex rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                {produto.tenant.nome}
              </span>
            )}
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{produto.nome}</h1>
            {produto.descricao && (
              <p className="mt-2 text-[rgb(var(--foreground-muted))]">{produto.descricao}</p>
            )}
            <p className="mt-4 text-3xl font-bold text-[rgb(var(--primary))]">{formatarPreco(produto.preco)}</p>
          </div>

          {/* Disponibilidade por tamanho */}
          {produto.tamanhos.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[rgb(var(--foreground))]">Disponibilidade</h3>
              <div className="flex flex-wrap gap-2">
                {produto.tamanhos.map((t: string) => {
                  const qtd = estoque[t] ?? 0
                  return (
                    <div
                      key={t}
                      className={[
                        'rounded-lg border px-3 py-1.5 text-center text-sm',
                        qtd > 0
                          ? 'border-[rgb(var(--border))] text-[rgb(var(--foreground))]'
                          : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] opacity-50 line-through',
                      ].join(' ')}
                    >
                      <span className="font-medium">{t}</span>
                      <span className="ml-1 text-xs text-[rgb(var(--foreground-muted))]">({qtd})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Formulário de compra */}
          <ComprarForm produto={{ id: produto.id, tamanhos: produto.tamanhos, estoque }} />
        </div>
      </div>
    </div>
  )
}
