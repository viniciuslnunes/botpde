import { db } from '@torcida/db'
import { getActiveTenant, resolveTenantLogoUrl } from '@/lib/tenant'
import { listLojasDoSocio, tenantsPermitidosLoja, type LojaResumo } from '@/lib/loja-lojas'
import { labelTipoUnidade } from '@/lib/canais-shared'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { Package, ShoppingBag, Store } from 'lucide-react'
import { SacolaBadge } from '@/components/portal/loja-ui'
import {
  LojaProdutoGridAnimated,
  type LojaProdutoGridItem,
} from '@/components/portal/loja-produto-grid-animated'
import { estoqueTotal, percentualDesconto } from '@torcida/types'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { LogoImage } from '@/components/media/logo-image'
import type { Metadata } from 'next'

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

export const metadata: Metadata = { title: 'Loja' }

export default async function PortalLojaListagemPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const userId = session.user.id

  let lojas: LojaResumo[] = await listLojasDoSocio(userId)

  // Fallback de borda — usuário em transição (ainda sem SaasMembro aprovado
  // refletido) não pode ficar sem nenhuma loja: usa a torcida ativa atual.
  if (lojas.length === 0) {
    const tenant = await getActiveTenant(userId, session.user.email)
    if (tenant) {
      const logoUrl = await resolveTenantLogoUrl(tenant.id, tenant.logoUrl ?? null)
      lojas = [
        {
          tenantId: tenant.id,
          nome: tenant.nome,
          tipo: 'SEDE',
          cidade: null,
          logoUrl,
          corPrimaria: tenant.corPrimaria ?? '220 90% 50%',
          principal: true,
          totalProdutos: await db.saasProduto.count({
            where: { tenantId: tenant.id, ativo: true },
          }),
        },
      ]
    }
  }

  const tenantIdsComLoja = [...(await tenantsPermitidosLoja(userId))]

  type DestaqueLite = {
    id: string
    nome: string
    preco: unknown
    precoOriginal: unknown | null
    imagensUrl: string[]
    estoque: unknown
    tenantId: string
  }

  const [meusPedidos, sacolaCount, destaques]: [number, { _sum: { quantidade: number | null } }, DestaqueLite[]] =
    await Promise.all([
      db.saasPedido.count({
        where: { userId, status: { in: ['PENDENTE', 'CONFIRMADO'] } },
      }),
      db.saasCarrinhoItem.aggregate({
        where: { userId },
        _sum: { quantidade: true },
      }),
      tenantIdsComLoja.length > 0
        ? db.saasProduto.findMany({
            where: { tenantId: { in: tenantIdsComLoja }, ativo: true, destaque: true },
            orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
            take: 8,
            select: {
              id: true,
              nome: true,
              preco: true,
              precoOriginal: true,
              imagensUrl: true,
              estoque: true,
              tenantId: true,
            },
          })
        : Promise.resolve([]),
    ])

  const destaqueItems: LojaProdutoGridItem[] = destaques.map((p) => {
    const sem = estoqueTotal(p.estoque as Record<string, number>)
    const off = percentualDesconto(p.precoOriginal, p.preco)
    return {
      id: p.id,
      nome: p.nome,
      href: `/portal/loja/${p.tenantId}/${p.id}`,
      precoLabel: formatarPreco(p.preco),
      precoOriginalLabel:
        p.precoOriginal && Number(p.precoOriginal) > Number(p.preco) ? formatarPreco(p.precoOriginal) : null,
      imagensUrl: p.imagensUrl,
      esgotado: sem === 0,
      descontoPct: off,
    }
  })

  const lojaUnica = lojas.length === 1 ? lojas[0] : null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-br from-[rgb(var(--primary)_/_0.15)] to-transparent p-4 sm:p-6">
        {lojaUnica ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[rgb(var(--background-subtle))]">
                {lojaUnica.logoUrl ? (
                  <LogoImage
                    src={lojaUnica.logoUrl}
                    alt={lojaUnica.nome}
                    size={56}
                    className="h-14 w-14 object-cover"
                  />
                ) : (
                  <ShoppingBag className="h-7 w-7 text-[rgb(var(--foreground-muted))]" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-[rgb(var(--foreground))] sm:text-2xl">
                  {lojaUnica.nome}
                </h1>
                <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                  {lojaUnica.totalProdutos} produto{lojaUnica.totalProdutos !== 1 ? 's' : ''}
                  {' · '}
                  {lojaUnica.principal ? 'Torcida principal' : labelTipoUnidade(lojaUnica.tipo)}
                  {lojaUnica.cidade ? ` · ${lojaUnica.cidade}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SacolaBadge count={sacolaCount._sum.quantidade ?? 0} />
              <Link
                href="/portal/loja/pedidos"
                className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))] sm:px-4"
              >
                <Package className="h-4 w-4 shrink-0" />
                <span className="truncate">Pedidos</span>
                {meusPedidos > 0 && (
                  <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-white">
                    {meusPedidos}
                  </span>
                )}
              </Link>
              <Link
                href={`/portal/loja/${lojaUnica.tenantId}`}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--primary))] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Ver catálogo completo
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))] sm:text-2xl">Lojas</h1>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Escolha a loja da sua torcida para ver o catálogo.
            </p>
          </>
        )}
      </div>

      {!lojaUnica && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            {lojas.length} loja{lojas.length !== 1 ? 's' : ''} disponíve{lojas.length !== 1 ? 'is' : 'l'}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <SacolaBadge count={sacolaCount._sum.quantidade ?? 0} />
            <Link
              href="/portal/loja/pedidos"
              className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))] sm:px-4"
            >
              <Package className="h-4 w-4 shrink-0" />
              <span className="truncate">Pedidos</span>
              {meusPedidos > 0 && (
                <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-white">
                  {meusPedidos}
                </span>
              )}
            </Link>
          </div>
        </div>
      )}

      {lojas.length === 0 ? (
        <MotionEmptyState
          icon={<Store className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhuma loja disponível"
          description="Você ainda não tem um vínculo aprovado com uma torcida. Assim que entrar por convite ou for aprovado, a loja aparece aqui."
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
        />
      ) : lojaUnica ? null : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lojas.map((loja) => (
            <Link
              key={loja.tenantId}
              href={`/portal/loja/${loja.tenantId}`}
              className="group flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))]">
                  {loja.logoUrl ? (
                    <LogoImage
                      src={loja.logoUrl}
                      alt={loja.nome}
                      size={48}
                      className="h-12 w-12 object-cover"
                    />
                  ) : (
                    <ShoppingBag className="h-6 w-6 text-[rgb(var(--foreground-muted))]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))]">
                    {loja.nome}
                  </h2>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {loja.principal ? 'Torcida principal' : labelTipoUnidade(loja.tipo)}
                    {loja.cidade ? ` · ${loja.cidade}` : ''}
                  </p>
                </div>
              </div>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                {loja.totalProdutos} produto{loja.totalProdutos !== 1 ? 's' : ''}
              </p>
            </Link>
          ))}
        </div>
      )}

      {destaqueItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Em destaque
          </h2>
          <LojaProdutoGridAnimated produtos={destaqueItems} />
        </section>
      )}
    </div>
  )
}
