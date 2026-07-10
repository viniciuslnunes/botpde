import { db } from '@torcida/db'

import { getTenantFromHost } from '@/lib/tenant'

import { resolveVisibility } from '@/lib/hierarquia'

import { notFound, redirect } from 'next/navigation'

import Link from 'next/link'

import { auth } from '@/lib/auth'

import { AdicionarSacolaForm } from './adicionar-sacola-form'

import { ArrowLeft, Tag } from 'lucide-react'

import { ProdutoGaleria } from '@/components/portal/produto-galeria'

import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'

import { percentualDesconto } from '@torcida/types'

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



  const produto = await db.saasProduto.findFirst({

    where: { id, ativo: true },

    include: { tenant: { select: { nome: true } }, categoria: { select: { nome: true } } },

  })



  if (!produto) notFound()

  if (produto.tenantId !== tenant.id) {

    const visivel = await resolveVisibility(tenant.id, produto.tenantId, 'loja')

    if (!visivel) notFound()

  }



  const estoque = (produto.estoque ?? {}) as Record<string, number>

  const off = percentualDesconto(produto.precoOriginal, produto.preco)

  const emPromo = off > 0



  const relacionados = produto.categoriaId

    ? await db.saasProduto.findMany({

        where: { categoriaId: produto.categoriaId, ativo: true, id: { not: produto.id } },

        take: 4,

        orderBy: { criadoEm: 'desc' },

      })

    : []



  return (

    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

      <Link

        href="/portal/loja"

        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"

      >

        <ArrowLeft className="h-4 w-4" />

        Voltar à loja

      </Link>



      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">

        <div className="lg:sticky lg:top-8">

          <ProdutoGaleria imagensUrl={produto.imagensUrl} nome={produto.nome} />

        </div>



        <div className="space-y-6">

          <div className="space-y-3">

            <div className="flex flex-wrap items-center gap-2">

              {produto.categoria && (

                <span className="rounded-full border border-[rgb(var(--foreground-muted)_/_0.35)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">

                  {produto.categoria.nome}

                </span>

              )}

              {produto.tenantId !== tenant.id && (

                <span className="rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">

                  {produto.tenant.nome}

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

              <span className="text-3xl font-bold text-[rgb(var(--primary))]">

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

        </div>

      </div>



      {relacionados.length > 0 && (

        <section className="mt-16 border-t border-[rgb(var(--border))] pt-10">

          <h2 className="mb-5 text-lg font-semibold">Você também pode gostar</h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {relacionados.map((r: (typeof relacionados)[number]) => (

              <Link

                key={r.id}

                href={`/portal/loja/${r.id}`}

                className="group overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:shadow-md"

              >

                <ProdutoCardImagem imagensUrl={r.imagensUrl} alt={r.nome} />

                <div className="p-3">

                  <p className="text-sm font-medium line-clamp-2 group-hover:text-[rgb(var(--primary))]">{r.nome}</p>

                  <p className="mt-1 text-sm font-bold text-[rgb(var(--primary))]">{formatarPreco(r.preco)}</p>

                </div>

              </Link>

            ))}

          </div>

        </section>

      )}

    </div>

  )

}

