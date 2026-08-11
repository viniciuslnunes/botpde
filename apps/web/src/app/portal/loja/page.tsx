import { db } from '@torcida/db'
import { getActiveTenant, resolveTenantLogoUrl } from '@/lib/tenant'
import { listLojasDoSocio, tenantsPermitidosLoja, podeVerLojaTenant, type LojaResumo } from '@/lib/loja-lojas'
import { labelTipoUnidade } from '@/lib/canais-shared'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ArrowRight, Package, ShoppingBag, Store } from 'lucide-react'
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

  // Super-admin em modo operador não tem SaasMembro na torcida ativa — inclui
  // a loja do contexto (cookie/seletor) para não cair em 404 ao clicar Loja.
  {
    const tenant = await getActiveTenant(userId, session.user.email)
    if (
      tenant &&
      !lojas.some((l) => l.tenantId === tenant.id) &&
      (await podeVerLojaTenant(userId, tenant.id, session.user.email))
    ) {
      const logoUrl = await resolveTenantLogoUrl(tenant.id, tenant.logoUrl ?? null)
      lojas = [
        {
          tenantId: tenant.id,
          nome: tenant.nome,
          tipo: 'SEDE',
          cidade: null,
          logoUrl,
          corPrimaria: tenant.corPrimaria ?? '#7c3aed',
          principal: true,
          totalProdutos: await db.saasProduto.count({
            where: { tenantId: tenant.id, ativo: true },
          }),
        },
        ...lojas,
      ]
    }
  }

  if (lojas.length === 1) {
    redirect(`/portal/loja/${lojas[0].tenantId}`)
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

  const [meusPedidos, sacolaCount, sacolaPorTenant, destaques]: [
    number,
    { _sum: { quantidade: number | null } },
    Array<{ tenantId: string }>,
    DestaqueLite[],
  ] = await Promise.all([
    db.saasPedido.count({
      where: { userId, status: { in: ['PENDENTE', 'CONFIRMADO'] } },
    }),
    db.saasCarrinhoItem.aggregate({
      where: { userId },
      _sum: { quantidade: true },
    }),
    db.saasCarrinhoItem.groupBy({
      by: ['tenantId'],
      where: { userId },
      _count: { _all: true },
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

  const sacolaLojasCount = sacolaPorTenant.length

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-[rgb(var(--border))] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            [ Selecione a unidade ]
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-4xl">
            Lojas
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[rgb(var(--foreground-muted))]">
            Cada unidade tem catálogo e estoque próprios. Escolha a loja para comprar.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <SacolaBadge
            count={sacolaCount._sum.quantidade ?? 0}
            lojasCount={sacolaLojasCount > 1 ? sacolaLojasCount : undefined}
          />
          <Link
            href="/portal/loja/pedidos"
            className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))] sm:px-4"
          >
            <Package className="h-4 w-4 shrink-0" />
            <span className="truncate">Pedidos</span>
            {meusPedidos > 0 && (
              <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-[rgb(var(--color-primary-on))]">
                {meusPedidos}
              </span>
            )}
          </Link>
        </div>
      </div>

      {lojas.length === 0 ? (
        <MotionEmptyState
          icon={<Store className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhuma loja disponível"
          description="Você ainda não tem um vínculo aprovado com uma torcida. Assim que entrar por convite ou for aprovado, a loja aparece aqui."
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lojas.map((loja) => (
            <Link
              key={loja.tenantId}
              href={`/portal/loja/${loja.tenantId}`}
              className="group relative flex flex-col overflow-hidden bg-[rgb(var(--surface))] transition-colors hover:bg-[rgb(var(--background-subtle))] [clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]"
            >
              <div
                className="h-1 w-full"
                style={{ backgroundColor: loja.corPrimaria }}
                aria-hidden
              />
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-[rgb(var(--background-subtle))]">
                    {loja.logoUrl ? (
                      <LogoImage
                        src={loja.logoUrl}
                        alt={loja.nome}
                        size={48}
                        className="h-12 w-12 object-cover"
                      />
                    ) : (
                      <ShoppingBag className="h-6 w-6" style={{ color: loja.corPrimaria }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-bold uppercase tracking-wide text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))]">
                      {loja.nome}
                    </h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
                      {loja.principal ? 'Torcida principal' : labelTipoUnidade(loja.tipo)}
                      {loja.cidade ? ` · ${loja.cidade}` : ''}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-[rgb(var(--border)_/_0.6)] pt-3">
                  <p className="font-mono text-[11px] text-[rgb(var(--foreground-muted))]">
                    {loja.totalProdutos} produto{loja.totalProdutos !== 1 ? 's' : ''}
                  </p>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--color-primary-fg))]">
                    Abrir
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {destaqueItems.length > 0 && (
        <section className="space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
              [ Cross-loja ]
            </p>
            <h2 className="mt-1 text-lg font-bold uppercase tracking-tight text-[rgb(var(--foreground))]">
              Em destaque
            </h2>
          </div>
          <LojaProdutoGridAnimated produtos={destaqueItems} />
        </section>
      )}
    </div>
  )
}
