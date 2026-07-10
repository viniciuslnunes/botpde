import { db } from '@torcida/db'
import { Prisma } from '@torcida/db'
import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { LojaProdutoGridSkeleton } from '@/components/portal/loja-produto-skeleton'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import { PromoBadge, LojaCarrossel } from '@/components/portal/loja-ui'
import { LojaFiltros } from '@/components/portal/loja-filtros'
import { toLojaProdutoCard } from '@/lib/loja-serialize'
import { estoqueTotal, percentualDesconto, ordenarTamanhos } from '@torcida/types'

const PAGE_SIZE = 48

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
  page?: string
}

interface LojaCatalogoSectionProps {
  tenantId: string
  tenantIds: string[]
  searchParams: SearchParams
}

function buildLojaPageUrl(sp: SearchParams, page: number): string {
  const params = new URLSearchParams()
  if (sp.q?.trim()) params.set('q', sp.q.trim())
  if (sp.categoria?.trim()) params.set('categoria', sp.categoria.trim())
  if (sp.tamanho?.trim()) params.set('tamanho', sp.tamanho.trim())
  if (sp.ordenar?.trim()) params.set('ordenar', sp.ordenar.trim())
  if (sp.precoMin?.trim()) params.set('precoMin', sp.precoMin.trim())
  if (sp.precoMax?.trim()) params.set('precoMax', sp.precoMax.trim())
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/portal/loja?${qs}` : '/portal/loja'
}

export async function LojaCatalogoSection({
  tenantId,
  tenantIds,
  searchParams: sp,
}: LojaCatalogoSectionProps) {
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
      case 'preco-asc':
        return [{ preco: 'asc' }]
      case 'preco-desc':
        return [{ preco: 'desc' }]
      case 'nome-asc':
        return [{ nome: 'asc' }]
      case 'nome-desc':
        return [{ nome: 'desc' }]
      default:
        return [{ destaque: 'desc' }, { criadoEm: 'desc' }]
    }
  })()

  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)
  const skip = (page - 1) * PAGE_SIZE

  const [produtos, totalProdutos, categorias, destaques, tamanhoRows, faixaPrecoAgg] =
    await Promise.all([
      db.saasProduto.findMany({
        where,
        orderBy,
        skip,
        take: PAGE_SIZE,
        include: {
          tenant: { select: { nome: true } },
          categoria: { select: { nome: true, slug: true } },
        },
      }),
      db.saasProduto.count({ where }),
      db.saasCategoria.findMany({
        where: { tenantId: { in: tenantIds } },
        orderBy: { ordem: 'asc' },
        select: { slug: true, nome: true },
      }),
      db.saasProduto.findMany({
        where: { tenantId: { in: tenantIds }, ativo: true, destaque: true },
        take: 8,
        orderBy: { ordem: 'asc' },
      }),
      tenantIds.length > 0
        ? db.$queryRaw<{ tamanho: string }[]>`
          SELECT DISTINCT unnest(tamanhos) AS tamanho
          FROM saas_produtos
          WHERE tenant_id IN (${Prisma.join(tenantIds)})
            AND ativo = true
        `
        : Promise.resolve([]),
      db.saasProduto.aggregate({
        where: { tenantId: { in: tenantIds }, ativo: true },
        _min: { preco: true },
        _max: { preco: true },
      }),
    ])

  const tamanhosDisponiveis = ordenarTamanhos(tamanhoRows.map((r: { tamanho: string }) => r.tamanho))
  const totalPages = Math.max(1, Math.ceil(totalProdutos / PAGE_SIZE))
  const faixaPreco = {
    min: Math.floor(Number(faixaPrecoAgg._min.preco ?? 0)),
    max: Math.ceil(Number(faixaPrecoAgg._max.preco ?? 0)),
  }

  type CategoriaLite = (typeof categorias)[number]
  type ProdutoLite = (typeof produtos)[number]
  type DestaqueLite = (typeof destaques)[number]

  return (
    <>
      <LojaCarrossel produtos={destaques.map((p: DestaqueLite) => toLojaProdutoCard(p))} />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/portal/loja"
          className={`rounded-full px-3 py-1 text-sm font-medium border ${!sp.categoria ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]' : 'border-[rgb(var(--foreground-muted)_/_0.35)] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--primary)_/_0.5)]'}`}
        >
          Todos
        </Link>
        {categorias.map((c: CategoriaLite) => (
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
          <div className="space-y-4">
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {produtos.map((p: ProdutoLite) => {
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
                      {p.tenantId !== tenantId && (
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
                          <span className="text-lg font-bold text-[rgb(var(--primary))]">
                            {formatarPreco(p.preco)}
                          </span>
                        </div>
                        {sem === 0 ? (
                          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                            Esgotado
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                {page > 1 && (
                  <Link
                    href={buildLojaPageUrl(sp, page - 1)}
                    className="rounded-full border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                  >
                    Anterior
                  </Link>
                )}
                <span className="text-sm text-[rgb(var(--foreground-muted))]">
                  Página {page} de {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={buildLojaPageUrl(sp, page + 1)}
                    className="rounded-full border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                  >
                    Próxima
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

export function LojaCatalogoFallback() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-40 rounded-2xl bg-[rgb(var(--border)_/_0.5)]" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-[rgb(var(--border))]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="hidden h-64 rounded-2xl bg-[rgb(var(--border)_/_0.45)] lg:block" />
        <LojaProdutoGridSkeleton count={6} />
      </div>
    </div>
  )
}
