import Link from 'next/link'
import { ArrowRight, Tag } from 'lucide-react'
import { LogoImage } from '@/components/media/logo-image'
import { labelTipoUnidade } from '@/lib/canais-shared'
import { MotionReveal } from '@/components/motion/motion-reveal'

export type LojaHeroDestaque = {
  id: string
  nome: string
  precoLabel: string
  imagemUrl: string | null
  href: string
}

export function LojaHero({
  nome,
  tipo,
  cidade,
  principal,
  logoUrl,
  totalProdutos,
  capaUrl,
  cupom,
  destaque,
}: {
  nome: string
  tipo: string
  cidade: string | null
  principal: boolean
  logoUrl: string | null
  totalProdutos: number
  capaUrl: string | null
  cupom: { codigo: string; texto: string } | null
  destaque: LojaHeroDestaque | null
}) {
  const metaParts = [
    principal ? 'PRINCIPAL' : labelTipoUnidade(tipo).toUpperCase(),
    cidade?.toUpperCase() ?? null,
    `${totalProdutos} SKU`,
  ].filter(Boolean)

  return (
    <MotionReveal>
      <section className="relative isolate min-h-[min(72vw,420px)] overflow-hidden bg-[rgb(var(--background-subtle))] sm:min-h-[380px] lg:min-h-[440px]">
        {capaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capaUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-105 object-cover object-center"
          />
        ) : (
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgb(var(--color-primary)_/_0.45),transparent_55%),linear-gradient(160deg,rgb(var(--color-primary)_/_0.35),rgb(var(--background))_70%)]"
            aria-hidden
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--background)_/_0.97)] via-[rgb(var(--background)_/_0.55)] to-[rgb(var(--background)_/_0.2)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[rgb(var(--background)_/_0.85)] via-transparent to-transparent"
          aria-hidden
        />

        <div className="relative flex h-full min-h-[inherit] flex-col justify-end gap-8 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12 lg:p-10">
          <div className="min-w-0 max-w-2xl space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[rgb(var(--foreground)_/_0.7)]">
              [ {metaParts.join(' · ')} ]
            </p>

            <div className="flex items-end gap-4">
              {logoUrl ? (
                <div className="hidden h-16 w-16 shrink-0 overflow-hidden bg-[rgb(var(--surface)_/_0.55)] ring-1 ring-[rgb(var(--foreground)_/_0.12)] backdrop-blur-sm sm:block">
                  <LogoImage src={logoUrl} alt={nome} size={64} className="h-16 w-16 object-cover" />
                </div>
              ) : null}
              <h1 className="text-balance text-[clamp(2rem,6vw,3.75rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-[rgb(var(--foreground))]">
                {nome}
              </h1>
            </div>

            <p className="max-w-md text-sm leading-relaxed text-[rgb(var(--foreground)_/_0.75)] sm:text-[15px]">
              Catálogo oficial desta unidade — estoque e pedidos isolados.
            </p>

            {cupom ? (
              <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--color-primary-fg))]">
                <Tag className="h-3.5 w-3.5" />
                Cupom {cupom.codigo} · {cupom.texto}
              </p>
            ) : null}
          </div>

          {destaque ? (
            <div className="w-full shrink-0 border border-[rgb(var(--foreground)_/_0.14)] bg-[rgb(var(--surface)_/_0.55)] p-4 backdrop-blur-md sm:w-72">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
                [ Em destaque ]
              </p>
              <p className="mt-3 line-clamp-2 text-base font-bold uppercase tracking-tight text-[rgb(var(--foreground))]">
                {destaque.nome}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgb(var(--foreground)_/_0.1)] pt-3">
                <span className="font-mono text-lg tabular-nums text-[rgb(var(--color-primary-fg))]">
                  {destaque.precoLabel}
                </span>
                <Link
                  href={destaque.href}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--foreground))] transition-colors hover:text-[rgb(var(--color-primary-fg))]"
                >
                  Ver
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </MotionReveal>
  )
}
