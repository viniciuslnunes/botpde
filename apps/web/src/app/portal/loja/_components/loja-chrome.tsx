import Link from 'next/link'
import { Suspense } from 'react'
import { Package } from 'lucide-react'
import { SacolaBadge } from '@/components/portal/loja-ui'
import { LojaStoreSwitcher, type LojaSwitcherItem } from './loja-store-switcher'
import { LojaChromeNav, type LojaNavCategoria } from './loja-chrome-nav'
import { LojaChromeSearch } from './loja-chrome-search'

export function LojaChrome({
  atual,
  lojas,
  categorias,
  sacolaCount,
  sacolaLojasCount,
  pedidosCount,
}: {
  atual: LojaSwitcherItem
  lojas: LojaSwitcherItem[]
  categorias: LojaNavCategoria[]
  sacolaCount: number
  sacolaLojasCount?: number
  pedidosCount: number
}) {
  return (
    <header className="sticky top-0 z-30 -mx-1 border-b border-[rgb(var(--border)_/_0.55)] bg-[rgb(var(--background)_/_0.78)] px-1 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-[rgb(var(--background)_/_0.65)] sm:-mx-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LojaStoreSwitcher atual={atual} lojas={lojas} />
        <Suspense fallback={null}>
          <LojaChromeSearch tenantId={atual.tenantId} />
        </Suspense>
        <div className="flex shrink-0 items-center gap-1.5">
          <SacolaBadge count={sacolaCount} lojasCount={sacolaLojasCount} variant="minimal" />
          <Link
            href="/portal/loja/pedidos"
            aria-label={pedidosCount > 0 ? `Pedidos (${pedidosCount})` : 'Pedidos'}
            className="relative inline-flex h-9 w-9 items-center justify-center text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] sm:h-9 sm:w-auto sm:gap-2 sm:px-2"
          >
            <Package className="h-4 w-4 shrink-0" />
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:inline">
              Pedidos
            </span>
            {pedidosCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center bg-[rgb(var(--primary))] px-1 font-mono text-[9px] font-bold text-[rgb(var(--color-primary-on))] sm:static sm:ml-0.5">
                {pedidosCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        <LojaChromeNav tenantId={atual.tenantId} categorias={categorias} />
      </Suspense>
    </header>
  )
}
