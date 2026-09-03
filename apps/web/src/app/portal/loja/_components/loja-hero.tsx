import Link from 'next/link'
import { ArrowRight, Tag } from 'lucide-react'
import { LogoImage } from '@/components/media/logo-image'
import { labelTipoUnidade } from '@/lib/canais-shared'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { LojaCapaControles, LojaCapaMidia } from './loja-capa'

export type LojaHeroDestaque = {
  id: string
  nome: string
  precoLabel: string
  imagemUrl: string | null
  href: string
}

export function LojaHero({
  tenantId,
  nome,
  tipo,
  cidade,
  principal,
  logoUrl,
  totalProdutos,
  capaUrl,
  capaCustom,
  podeGerir,
  cupom,
  destaque,
}: {
  tenantId: string
  nome: string
  tipo: string
  cidade: string | null
  principal: boolean
  logoUrl: string | null
  totalProdutos: number
  capaUrl: string | null
  capaCustom: boolean
  podeGerir: boolean
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
      <section className="group relative isolate -mx-4 min-h-[13.5rem] overflow-hidden bg-[rgb(var(--background-subtle))] sm:-mx-6 sm:min-h-[20rem] lg:-mx-8 lg:min-h-[24rem]">
        <LojaCapaMidia
          src={capaUrl}
          alt=""
          logoUrl={!capaCustom ? logoUrl : null}
          logoAlt={nome}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--background)_/_0.88)] from-0% via-[rgb(var(--background)_/_0.28)] via-45% to-transparent to-75%"
          aria-hidden
        />

        {podeGerir ? (
          <LojaCapaControles tenantId={tenantId} capaUrl={capaUrl} capaCustom={capaCustom} />
        ) : null}

        <div className="relative z-[1] flex min-h-[13.5rem] flex-col justify-end gap-6 p-5 sm:min-h-[20rem] sm:p-8 lg:min-h-[24rem] lg:flex-row lg:items-end lg:justify-between lg:gap-12 lg:p-10">
          <div className="min-w-0 max-w-2xl space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[rgb(var(--foreground)_/_0.78)]">
              [ {metaParts.join(' · ')} ]
            </p>

            <div className="flex items-end gap-4">
              {logoUrl ? (
                <LogoImage
                  src={logoUrl}
                  alt={nome}
                  size={64}
                  unoptimized
                  className="hidden h-16 w-16 shrink-0 object-contain sm:block"
                />
              ) : null}
              <h1 className="text-balance text-[clamp(2rem,6vw,3.75rem)] font-black uppercase leading-[0.9] tracking-[-0.03em] text-[rgb(var(--foreground))]">
                {nome}
              </h1>
            </div>

            <p className="max-w-md text-sm leading-relaxed text-[rgb(var(--foreground)_/_0.8)] sm:text-[15px]">
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
            <Link
              href={destaque.href}
              className="w-full shrink-0 overflow-hidden border border-[rgb(var(--foreground)_/_0.14)] bg-[rgb(var(--surface)_/_0.62)] backdrop-blur-md transition-colors hover:border-[rgb(var(--foreground)_/_0.28)] sm:w-72"
            >
              {destaque.imagemUrl ? (
                <div className="relative aspect-[16/10] overflow-hidden bg-[rgb(var(--background-subtle))]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={destaque.imagemUrl}
                    alt=""
                    className="h-full w-full object-cover object-[center_18%]"
                    decoding="async"
                  />
                </div>
              ) : null}
              <div className="p-4">
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
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--foreground))]">
                    Ver
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          ) : null}
        </div>
      </section>
    </MotionReveal>
  )
}
