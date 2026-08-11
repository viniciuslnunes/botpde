import { db } from '@torcida/db'
import { podeVerLojaTenant } from '@/lib/loja-lojas'
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

  if (!(await podeVerLojaTenant(session.user.id, tenantId, session.user.email))) notFound()

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
  const precoLabel = formatarPreco(produto.preco)

  return (
    <div className="space-y-8">
      <Link
        href={`/portal/loja/${tenantId}`}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)] lg:items-start lg:gap-14">
        <div className="lg:sticky lg:top-24">
          <div className="overflow-hidden bg-[rgb(var(--color-primary)_/_0.05)] [clip-path:polygon(0_0,calc(100%-18px)_0,100%_18px,100%_100%,18px_100%,0_calc(100%-18px))]">
            <ProdutoGaleria imagensUrl={produto.imagensUrl} nome={produto.nome} />
          </div>
        </div>

        <ProdutoDetailCol>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {produto.categoria && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
                  [ {produto.categoria.nome} ]
                </span>
              )}
              {emPromo && (
                <span className="inline-flex items-center gap-1 bg-red-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                  <Tag className="h-3 w-3" />
                  −{off}%
                </span>
              )}
              {produto.marca ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[rgb(var(--foreground-muted))]">
                  Series · {produto.marca}
                </span>
              ) : null}
            </div>

            <h1 className="text-balance text-3xl font-black uppercase leading-[0.95] tracking-tight sm:text-4xl">
              {produto.nome}
            </h1>

            {produto.descricao && (
              <p className="max-w-prose text-sm leading-relaxed text-[rgb(var(--foreground-muted))] sm:text-[15px]">
                {produto.descricao}
              </p>
            )}
          </div>

          <AdicionarSacolaForm
            produto={{
              id: produto.id,
              tamanhos: produto.tamanhos,
              estoque,
              precoLabel,
              precoOriginalLabel:
                produto.precoOriginal && Number(produto.precoOriginal) > Number(produto.preco)
                  ? formatarPreco(produto.precoOriginal)
                  : null,
            }}
          />
        </ProdutoDetailCol>
      </div>

      {relacionados.length > 0 && (
        <section className="border-t border-[rgb(var(--border)_/_0.65)] pt-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
            [ Relacionados ]
          </p>
          <h2 className="mt-1 mb-6 text-xl font-black uppercase tracking-tight">Você também pode gostar</h2>

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
