import Link from 'next/link'
import { ArrowRight, Recycle } from 'lucide-react'
import { LogoImage } from '@/components/media/logo-image'
import { LojaCapaMidia } from './loja-capa'
import { BrechoCapaControles } from '../brecho/_components/brecho-capa'
import { BrechoConfiancaMarca } from '../brecho/_components/brecho-confianca'

const CLIP =
  '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]'

export function BrechoHubCard({
  nome,
  anunciosAtivos,
  subtitulo,
  logoUrl,
  capaUrl,
  capaExibicao,
  corPrimaria,
  href = '/portal/loja/brecho',
  podeGerir = false,
  confianca,
}: {
  nome: string
  anunciosAtivos: number
  subtitulo: string
  logoUrl?: string | null
  capaUrl?: string | null
  /** Foto na 16:9 — capa gravada ou, se vazia, primeiro anúncio. */
  capaExibicao?: string | null
  corPrimaria?: string
  href?: string
  /** Dono da vitrine P2P — overlay de capa (não a praça da torcida). */
  podeGerir?: boolean
  confianca?: { estrelas: number; trocas: number } | null
}) {
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden bg-[rgb(var(--surface))] transition-colors hover:bg-[rgb(var(--background-subtle))] ${CLIP}`}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[rgb(var(--background-subtle))]">
        <Link href={href} className="absolute inset-0" tabIndex={-1} aria-hidden>
          <LojaCapaMidia src={capaExibicao ?? capaUrl ?? null} alt="" corPrimaria={corPrimaria} />
        </Link>
        {podeGerir ? <BrechoCapaControles capaUrl={capaUrl ?? null} /> : null}
      </div>

      <Link href={href} className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <LogoImage
              src={logoUrl}
              alt={nome}
              size={48}
              unoptimized
              className="h-12 w-12 shrink-0 object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Recycle className="h-6 w-6" style={corPrimaria ? { color: corPrimaria } : undefined} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold uppercase tracking-wide text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--color-primary-fg))]">
              {nome}
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
              {subtitulo}
            </p>
            {confianca ? (
              <div className="mt-1">
                <BrechoConfiancaMarca estrelas={confianca.estrelas} trocas={confianca.trocas} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[rgb(var(--border)_/_0.6)] pt-3">
          <p className="font-mono text-[11px] text-[rgb(var(--foreground-muted))]">
            {anunciosAtivos} anúncio{anunciosAtivos !== 1 ? 's' : ''}
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
