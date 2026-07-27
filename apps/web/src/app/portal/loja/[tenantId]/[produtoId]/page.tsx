import { db } from '@torcida/db'
import { tenantsPermitidosLoja } from '@/lib/loja-lojas'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { AdicionarSacolaForm } from './adicionar-sacola-form'
import { ArrowLeft, Tag } from 'lucide-react'
import { ProdutoGaleria } from '@/components/portal/produto-galeria'
import { ProdutoRelacionadosGrid } from '@/components/portal/produto-relacionados-grid'
import { ProdutoDetailCol } from '@/components/portal/produto-detail-col'
import { percentualDesconto } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produto' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

export default async function ProdutoDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string; produtoId: string }>
}) {
  const { tenantId, produtoId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const permitidos = await tenantsPermitidosLoja(session.user.id)
  if (!permitidos.has(tenantId)) notFound()

  const produto = await db.saasProduto.findFirst({
    where: { id: produtoId, tenantId, ativo: true },
    include: { categoria: { select: { nome: true } } },
  })

  if (!produto) notFound()

  const relacionados = produto.categoriaId
    ? await db.saasProduto.findMany({
        where: { categoriaId: produto.categoriaId, ativo: true, id: { not: produto.id } },
        take: 4,
        orderBy: { criadoEm: 'desc' },
      })
    : []

  const estoque = (produto.estoque ?? {}) as Record<string, number>

  const off = percentualDesconto(produto.precoOriginal, produto.preco)

  const emPromo = off > 0

  return (
    <div className="space-y-6">
      <Link
        href={`/portal/loja/${tenantId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar à loja
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <ProdutoGaleria imagensUrl={produto.imagensUrl} nome={produto.nome} />
        </div>

        <ProdutoDetailCol>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {produto.categoria && (
                <span className="rounded-full border border-[rgb(var(--foreground-muted)_/_0.35)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  {produto.categoria.nome}
                </span>
              )}
              {emPromo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  <Tag className="h-3 w-3" />
                  {off}% OFF
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{produto.nome}</h1>

            {produto.descricao && (
              <p className="text-[rgb(var(--foreground-muted))] leading-relaxed">{produto.descricao}</p>
            )}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {produto.precoOriginal && Number(produto.precoOriginal) > Number(produto.preco) && (
              <span className="text-lg text-[rgb(var(--foreground-muted))] line-through">
                {formatarPreco(produto.precoOriginal)}
              </span>
            )}
            <span className="text-3xl font-bold text-[rgb(var(--color-primary-fg))]">
              {formatarPreco(produto.preco)}
            </span>
          </div>

          {produto.tamanhos.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Tamanhos disponíveis
              </h3>
              <div className="flex flex-wrap gap-2">
                {produto.tamanhos.map((t: string) => {
                  const qtd = estoque[t] ?? 0
                  return (
                    <div
                      key={t}
                      className={[
                        'rounded-xl border px-4 py-2 text-sm',
                        qtd > 0
                          ? 'border-[rgb(var(--foreground-muted)_/_0.35)] bg-[rgb(var(--background-subtle))]'
                          : 'border-[rgb(var(--foreground-muted)_/_0.2)] opacity-40 line-through',
                      ].join(' ')}
                    >
                      <span className="font-semibold">{t}</span>
                      <span className="ml-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                        {qtd > 0 ? `${qtd} un.` : 'Esgotado'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <AdicionarSacolaForm produto={{ id: produto.id, tamanhos: produto.tamanhos, estoque }} />
        </ProdutoDetailCol>
      </div>

      {relacionados.length > 0 && (
        <section className="mt-16 border-t border-[rgb(var(--border))] pt-10">
          <h2 className="mb-5 text-lg font-semibold">Você também pode gostar</h2>

          <ProdutoRelacionadosGrid
            produtos={relacionados.map((r: (typeof relacionados)[number]) => ({
              id: r.id,
              nome: r.nome,
              precoLabel: formatarPreco(r.preco),
              imagensUrl: (r.imagensUrl ?? []) as string[],
              href: `/portal/loja/${tenantId}/${r.id}`,
            }))}
          />
        </section>
      )}
    </div>
  )
}
