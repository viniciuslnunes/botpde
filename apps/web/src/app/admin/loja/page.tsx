import { Suspense } from 'react'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { assertPermission } from '@/lib/authz'
import { formatarMoedaBRL, PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CriarProdutoForm } from '@/components/admin/produto-forms'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import {
  listarMaisVendidosLoja,
  resumirUsoCupons,
  resumirVendasLoja,
  type LojaCupomUso,
  type LojaMaisVendido,
  type LojaVendasResumo,
} from '@/lib/loja-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AdminLojaProdutosGrid, type AdminProdutoItem } from './admin-loja-produtos-grid'
import { Package, Tags, Ticket } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Loja — Admin' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarEstoque(estoque: unknown, tamanhos: string[]): string {
  const e = (estoque ?? {}) as Record<string, number>
  if (!Object.keys(e).length) return 'Sem estoque cadastrado'
  if (tamanhos.length === 0) return `${e['UN'] ?? 0} un.`
  return tamanhos.filter((t) => e[t] !== undefined).map((t) => `${t}: ${e[t]}`).join(' | ')
}

function serializarProduto(p: {
  id: string
  nome: string
  preco: unknown
  estoque: unknown
  tamanhos: string[]
  destaque: boolean
  ativo: boolean
  imagensUrl: unknown
  _count: { pedidoItens: number }
  categoria: { nome: string } | null
}): AdminProdutoItem {
  return {
    id: p.id,
    nome: p.nome,
    categoriaNome: p.categoria?.nome ?? null,
    precoLabel: formatarPreco(p.preco),
    estoqueLabel: formatarEstoque(p.estoque, p.tamanhos),
    vendidos: p._count.pedidoItens,
    destaque: p.destaque,
    ativo: p.ativo,
    imagemUrl: firstProdutoImagemUrl(p.imagensUrl as string[] | null | undefined),
  }
}

function LojaInsightsSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 w-44 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}

async function LojaInsights({ tenantId }: { tenantId: string }) {
  const [resumo, maisVendidos, cupons]: [LojaVendasResumo, LojaMaisVendido[], LojaCupomUso[]] =
    await Promise.all([
      resumirVendasLoja(tenantId, '30d'),
      listarMaisVendidosLoja(tenantId, '30d'),
      resumirUsoCupons(tenantId, '30d'),
    ])

  const semMovimento =
    resumo.atual.pedidos === 0 &&
    resumo.anterior.pedidos === 0 &&
    Object.keys(resumo.porStatus).length === 0
  if (semMovimento) return null

  const pendentes = resumo.porStatus.PENDENTE ?? 0

  return (
    <InsightSection
      title="Últimos 30 dias"
      description="Pedidos confirmados/entregues vs período anterior."
    >
      <StatCard
        label="Vendido no período"
        value={formatarMoedaBRL(resumo.atual.receita)}
        tone="success"
        delta={{ atual: resumo.atual.receita, anterior: resumo.anterior.receita }}
        href="/admin/loja/pedidos"
      />
      <StatCard
        label="Pedidos pendentes"
        value={pendentes}
        tone={pendentes > 0 ? 'warning' : 'default'}
        href="/admin/loja/pedidos?status=PENDENTE"
      />
      <StatCard
        label="Ticket médio"
        value={formatarMoedaBRL(resumo.atual.ticketMedio)}
        delta={{ atual: resumo.atual.ticketMedio, anterior: resumo.anterior.ticketMedio }}
      />

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Mais vendidos
        </h3>
        {maisVendidos.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem itens no período.</p>
        ) : (
          <MiniBarChart
            height={90}
            data={maisVendidos.map((p) => ({ rotulo: p.produtoNome, valor: p.quantidade }))}
            formato="unidades"
          />
        )}
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Cupons usados
        </h3>
        {cupons.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum cupom usado no período.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {cupons.map((c) => (
              <li key={c.codigo} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-mono font-semibold text-[rgb(var(--foreground))]">
                  {c.codigo}
                </span>
                <span className="shrink-0 text-[rgb(var(--foreground-muted))]">
                  {c.usos} uso{c.usos === 1 ? '' : 's'} ·{' '}
                  <span className="tabular-nums">−{formatarMoedaBRL(c.descontoTotal)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </InsightSection>
  )
}

export default async function AdminLojaPage() {
  try {
    await assertPermission(PERMISSIONS.STORE_MANAGE)
  } catch {
    redirect('/admin')
  }

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const [produtos, categorias, totalPedidos] = await Promise.all([
    db.saasProduto.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'desc' }],
      include: { _count: { select: { pedidoItens: true } }, categoria: { select: { nome: true } } },
    }),
    db.saasCategoria.findMany({ where: { tenantId: tenant.id }, orderBy: { ordem: 'asc' } }),
    db.saasPedido.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } }),
  ])

  type Produto = (typeof produtos)[number]
  const ativos = produtos.filter((p: Produto) => p.ativo)
  const inativos = produtos.filter((p: Produto) => !p.ativo)

  return (
    <div className="app-container space-y-6 py-8">
      <MotionReveal>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Loja</h1>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              {ativos.length} produto{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/loja/categorias" className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]">
              <Tags className="h-4 w-4" /> Categorias
            </Link>
            <Link href="/admin/loja/cupons" className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]">
              <Ticket className="h-4 w-4" /> Cupons
            </Link>
            <Link href="/admin/loja/pedidos" className="relative flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]">
              <Package className="h-4 w-4" /> Pedidos
              {totalPedidos > 0 && <span className="rounded-full bg-[rgb(var(--color-warning))] px-1.5 py-0.5 text-xs font-bold text-white">{totalPedidos}</span>}
            </Link>
          </div>
        </div>
      </MotionReveal>

      <Suspense fallback={<LojaInsightsSkeleton />}>
        <LojaInsights tenantId={tenant.id} />
      </Suspense>

      <MotionReveal index={1}>
        <CriarProdutoForm categorias={categorias.map((c: (typeof categorias)[number]) => ({ id: c.id, nome: c.nome }))} />
      </MotionReveal>

      <AdminLojaProdutosGrid
        ativos={ativos.map(serializarProduto)}
        inativos={inativos.map(serializarProduto)}
      />
    </div>
  )
}
