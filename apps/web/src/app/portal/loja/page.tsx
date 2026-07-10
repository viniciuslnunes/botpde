import { db } from '@torcida/db'

import { getTenantFromHost } from '@/lib/tenant'

import { getVisibleTenantIds } from '@/lib/hierarquia'

import { redirect } from 'next/navigation'

import Link from 'next/link'

import { auth } from '@/lib/auth'

import { ShoppingBag, Package, Tag } from 'lucide-react'

import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'

import { SacolaBadge, PromoBadge, LojaCarrossel } from '@/components/portal/loja-ui'
import { LojaFiltros } from '@/components/portal/loja-filtros'
import { toLojaProdutoCard } from '@/lib/loja-serialize'
import { estoqueTotal, percentualDesconto, ordenarTamanhos } from '@torcida/types'

import type { Metadata } from 'next'

import type { Prisma } from '@torcida/db'



export const metadata: Metadata = { title: 'Loja' }



function formatarPreco(preco: unknown) {

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))

}



type SearchParams = {

  q?: string

  categoria?: string

  tamanho?: string

  ordenar?: string

  precoMin?: string

  precoMax?: string

}



export default async function PortalLojaPage({

  searchParams,

}: {

  searchParams: Promise<SearchParams>

}) {

  const [session, tenant, params] = await Promise.all([auth(), getTenantFromHost(), searchParams])

  if (!tenant) redirect('/')

  if (!session?.user?.id) redirect('/entrar')



  const tenantIds = await getVisibleTenantIds(tenant.id, 'loja')

  const sp = params



  const where: Prisma.SaasProdutoWhereInput = {

    tenantId: { in: tenantIds },

    ativo: true,

  }



  if (sp.q?.trim()) where.nome = { contains: sp.q.trim(), mode: 'insensitive' }

  if (sp.categoria?.trim()) {

    where.categoria = { slug: sp.categoria.trim(), tenantId: { in: tenantIds } }

  }

  if (sp.tamanho?.trim()) where.tamanhos = { has: sp.tamanho.trim().toUpperCase() }

  if (sp.precoMin || sp.precoMax) {

    where.preco = {}

    if (sp.precoMin) where.preco.gte = Number(sp.precoMin)

    if (sp.precoMax) where.preco.lte = Number(sp.precoMax)

  }



  const orderBy: Prisma.SaasProdutoOrderByWithRelationInput[] = (() => {

    switch (sp.ordenar) {

      case 'preco-asc': return [{ preco: 'asc' }]

      case 'preco-desc': return [{ preco: 'desc' }]

      case 'nome-asc': return [{ nome: 'asc' }]

      case 'nome-desc': return [{ nome: 'desc' }]

      default: return [{ destaque: 'desc' }, { criadoEm: 'desc' }]

    }

  })()



  const [produtos, categorias, meusPedidos, sacolaCount, destaques, tamanhosRows, faixaPrecoAgg] = await Promise.all([

    db.saasProduto.findMany({

      where,

      orderBy,

      include: { tenant: { select: { nome: true } }, categoria: { select: { nome: true, slug: true } } },

    }),

    db.saasCategoria.findMany({

      where: { tenantId: { in: tenantIds } },

      orderBy: { ordem: 'asc' },

      select: { slug: true, nome: true },

    }),

    db.saasPedido.count({

      where: { tenantId: { in: tenantIds }, userId: session.user.id, status: { in: ['PENDENTE', 'CONFIRMADO'] } },

    }),

    db.saasCarrinhoItem.aggregate({ where: { userId: session.user.id }, _sum: { quantidade: true } }),

    db.saasProduto.findMany({

      where: { tenantId: { in: tenantIds }, ativo: true, destaque: true },

      take: 8,

      orderBy: { ordem: 'asc' },

    }),

    db.saasProduto.findMany({

      where: { tenantId: { in: tenantIds }, ativo: true },

      select: { tamanhos: true },

    }),

    db.saasProduto.aggregate({

      where: { tenantId: { in: tenantIds }, ativo: true },

      _min: { preco: true },

      _max: { preco: true },

    }),

  ])



  const tamanhosDisponiveis = ordenarTamanhos(

    tamanhosRows.flatMap((r: (typeof tamanhosRows)[number]) => r.tamanhos),

  )

  const faixaPreco = {

    min: Math.floor(Number(faixaPrecoAgg._min.preco ?? 0)),

    max: Math.ceil(Number(faixaPrecoAgg._max.preco ?? 0)),

  }



  return (

    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">

      <div className="rounded-2xl bg-gradient-to-br from-[rgb(var(--primary)_/_0.15)] to-transparent border border-[rgb(var(--border))] p-6">

        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Loja oficial da torcida</h1>

        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">

          Produtos exclusivos dos Gaviões da Fiel

        </p>

        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--primary)_/_0.12)] px-3 py-1 text-xs font-medium text-[rgb(var(--primary))]">

          <Tag className="h-3.5 w-3.5" />

          Primeira compra: cupom <strong>EUSOUGAVIAO</strong> (10% off)

        </div>

      </div>



      <div className="flex items-start justify-between gap-4">

        <p className="text-sm text-[rgb(var(--foreground-muted))]">

          {produtos.length} produto{produtos.length !== 1 ? 's' : ''}

        </p>

        <div className="flex items-center gap-2">

          <SacolaBadge count={sacolaCount._sum.quantidade ?? 0} />

          <Link

            href="/portal/loja/pedidos"

            className="relative flex items-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))]"

          >

            <Package className="h-4 w-4" />

            Meus pedidos

            {meusPedidos > 0 && (

              <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-white">{meusPedidos}</span>

            )}

          </Link>

        </div>

      </div>



      <LojaCarrossel produtos={destaques.map((p: (typeof destaques)[number]) => toLojaProdutoCard(p))} />



      <div className="flex flex-wrap gap-2">

        <Link

          href="/portal/loja"

          className={`rounded-full px-3 py-1 text-sm font-medium border ${!sp.categoria ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]' : 'border-[rgb(var(--foreground-muted)_/_0.35)] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--primary)_/_0.5)]'}`}

        >

          Todos

        </Link>

        {categorias.map((c: (typeof categorias)[number]) => (

          <Link

            key={c.slug}

            href={`/portal/loja?categoria=${c.slug}`}

            className={`rounded-full px-3 py-1 text-sm font-medium border ${sp.categoria === c.slug ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]' : 'border-[rgb(var(--foreground-muted)_/_0.35)] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--primary)_/_0.5)]'}`}

          >

            {c.nome}

          </Link>

        ))}

      </div>



      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">

        <LojaFiltros
          categorias={categorias}
          tamanhosDisponiveis={tamanhosDisponiveis}
          faixaPreco={faixaPreco}
          searchParams={sp}
        />



        {produtos.length === 0 ? (

          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-20 text-center">

            <ShoppingBag className="mb-3 h-12 w-12 text-[rgb(var(--foreground-muted))]" />

            <h3 className="font-semibold">Nenhum produto encontrado</h3>

            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">Tente outros filtros.</p>

          </div>

        ) : (

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">

            {produtos.map((p: (typeof produtos)[number]) => {

              const sem = estoqueTotal(p.estoque as Record<string, number>)

              const off = percentualDesconto(p.precoOriginal, p.preco)

              return (

                <Link

                  key={p.id}

                  href={`/portal/loja/${p.id}`}

                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-all hover:shadow-md"

                >

                  <div className="relative shrink-0">

                    <PromoBadge percentual={off} />

                    <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} />

                  </div>

                  <div className="flex flex-1 flex-col p-4">

                    {p.tenantId !== tenant.id && (

                      <span className="mb-1 inline-flex w-fit rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">

                        {p.tenant.nome}

                      </span>

                    )}

                    <h3 className="flex-1 font-semibold leading-snug line-clamp-2 group-hover:text-[rgb(var(--primary))]">

                      {p.nome}

                    </h3>

                    <div className="mt-3 flex items-end justify-between gap-2">

                      <div className="min-w-0">

                        {p.precoOriginal && Number(p.precoOriginal) > Number(p.preco) && (

                          <span className="block text-sm text-[rgb(var(--foreground-muted))] line-through">

                            {formatarPreco(p.precoOriginal)}

                          </span>

                        )}

                        <span className="text-lg font-bold text-[rgb(var(--primary))]">{formatarPreco(p.preco)}</span>

                      </div>

                      {sem === 0 ? (

                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">Esgotado</span>

                      ) : null}

                    </div>

                  </div>

                </Link>

              )

            })}

          </div>

        )}

      </div>

    </div>

  )

}

