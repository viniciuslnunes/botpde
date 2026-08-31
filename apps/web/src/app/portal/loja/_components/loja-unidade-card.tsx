import Link from 'next/link'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import { LogoImage } from '@/components/media/logo-image'
import { labelTipoUnidade } from '@/lib/canais-shared'
import type { LojaResumo } from '@/lib/loja-lojas'
import { LojaCapaControles, LojaCapaMidia } from './loja-capa'

const CLIP =
  '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]'

export function LojaUnidadeCard({
  loja,
  podeGerir,
}: {
  loja: LojaResumo
  podeGerir: boolean
}) {
  const href = `/portal/loja/${loja.tenantId}`

  return (
    <article
      className={`group relative flex flex-col overflow-hidden bg-[rgb(var(--surface))] transition-colors hover:bg-[rgb(var(--background-subtle))] ${CLIP}`}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[rgb(var(--background-subtle))]">
        <Link href={href} className="absolute inset-0" tabIndex={-1} aria-hidden>
          <LojaCapaMidia src={loja.capaUrl} alt="" corPrimaria={loja.corPrimaria} />
        </Link>
        {podeGerir ? (
          <LojaCapaControles
            tenantId={loja.tenantId}
            capaUrl={loja.capaUrl}
            capaCustom={loja.capaCustom}
          />
        ) : null}
      </div>

      <Link href={href} className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          {loja.logoUrl ? (
            <LogoImage
              src={loja.logoUrl}
              alt={loja.nome}
              size={48}
              unoptimized
              className="h-12 w-12 shrink-0 object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <ShoppingBag className="h-6 w-6" style={{ color: loja.corPrimaria }} />
            </div>
          )}
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
      </Link>
    </article>
  )
}
