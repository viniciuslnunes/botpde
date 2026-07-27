import { db } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { LojaProdutoGridSkeleton } from '@/components/portal/loja-produto-skeleton'
import { LojaProdutoGridAnimated, type LojaProdutoGridItem } from '@/components/portal/loja-produto-grid-animated'
import { LojaCarrossel } from '@/components/portal/loja-ui'
import { LojaCategoriaChips, LojaPaginacao } from '@/components/portal/loja-catalogo-motion'
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
  searchParams: SearchParams
}

function buildLojaPageUrl(tenantId: string, sp: SearchParams, page: number): string {
  const params = new URLSearchParams()
  if (sp.q?.trim()) params.set('q', sp.q.trim())
  if (sp.categoria?.trim()) params.set('categoria', sp.categoria.trim())
  if (sp.tamanho?.trim()) params.set('tamanho', sp.tamanho.trim())
  if (sp.ordenar?.trim()) params.set('ordenar', sp.ordenar.trim())
  if (sp.precoMin?.trim()) params.set('precoMin', sp.precoMin.trim())
  if (sp.precoMax?.trim()) params.set('precoMax', sp.precoMax.trim())
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  const base = `/portal/loja/${tenantId}`
  return qs ? `${base}?${qs}` : base
}

export async function LojaCatalogoSection({
  tenantId,
  searchParams: sp,
}: LojaCatalogoSectionProps) {
  const where: Prisma.SaasProdutoWhereInput = {
    tenantId,
    ativo: true,
  }

  if (sp.q?.trim()) where.nome = { contains: sp.q.trim(), mode: 'insensitive' }
  if (sp.categoria?.trim()) {
    where.categoria = { slug: sp.categoria.trim(), tenantId }
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
          categoria: { select: { nome: true, slug: true } },
        },
      }),
      db.saasProduto.count({ where }),
      db.saasCategoria.findMany({
        where: { tenantId },
        orderBy: { ordem: 'asc' },
        select: { slug: true, nome: true },
      }),
      db.saasProduto.findMany({
        where: { tenantId, ativo: true, destaque: true },
        take: 8,
        orderBy: { ordem: 'asc' },
      }),
      db.$queryRaw<{ tamanho: string }[]>`
          SELECT DISTINCT unnest(tamanhos) AS tamanho
          FROM saas_produtos
          WHERE tenant_id = ${tenantId}
            AND ativo = true
        `,
      db.saasProduto.aggregate({
        where: { tenantId, ativo: true },
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

  const gridItems: LojaProdutoGridItem[] = produtos.map((p: ProdutoLite) => {
    const sem = estoqueTotal(p.estoque as Record<string, number>)
    const off = percentualDesconto(p.precoOriginal, p.preco)
    return {
      id: p.id,
      nome: p.nome,
      href: `/portal/loja/${tenantId}/${p.id}`,
      precoLabel: formatarPreco(p.preco),
      precoOriginalLabel:
        p.precoOriginal && Number(p.precoOriginal) > Number(p.preco)
          ? formatarPreco(p.precoOriginal)
          : null,
      imagensUrl: p.imagensUrl,
      esgotado: sem === 0,
      descontoPct: off,
    }
  })

  return (
    <>
      <LojaCarrossel produtos={destaques.map((p: DestaqueLite) => toLojaProdutoCard(p, tenantId))} />

      <LojaCategoriaChips
        chips={[
          { slug: 'todos', nome: 'Todos', href: `/portal/loja/${tenantId}`, active: !sp.categoria },
          ...categorias.map((c: CategoriaLite) => ({
            slug: c.slug,
            nome: c.nome,
            href: `/portal/loja/${tenantId}?categoria=${c.slug}`,
            active: sp.categoria === c.slug,
          })),
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <LojaFiltros
          categorias={categorias}
          tamanhosDisponiveis={tamanhosDisponiveis}
          faixaPreco={faixaPreco}
          searchParams={sp}
        />

        <div className="space-y-4">
          <LojaProdutoGridAnimated produtos={gridItems} />

          <LojaPaginacao
            page={page}
            totalPages={totalPages}
            prevHref={page > 1 ? buildLojaPageUrl(tenantId, sp, page - 1) : null}
            nextHref={page < totalPages ? buildLojaPageUrl(tenantId, sp, page + 1) : null}
          />
        </div>
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
