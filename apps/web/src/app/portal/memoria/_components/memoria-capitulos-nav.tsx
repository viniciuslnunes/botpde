'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { BookMarked } from 'lucide-react'
import type { MemoriaEscopo } from '@torcida/types'
import type { MemoriaCapituloResumo } from '../_lib/memoria-capitulos'

type Props = {
  capitulos: MemoriaCapituloResumo[]
  capituloAtivo: MemoriaCapituloResumo | null
  escopo: MemoriaEscopo
}

export function MemoriaCapitulosNav({ capitulos, capituloAtivo, escopo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  if (capitulos.length === 0) return null

  function ir(slug: string | null) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('escopo', escopo)
    if (slug) p.set('cap', slug)
    else p.delete('cap')
    router.replace(`/portal/memoria?${p.toString()}`, { scroll: false })
  }

  return (
    <div className="mb-3">
      <p className="portal-kicker mb-2 flex items-center gap-1.5 text-[rgb(var(--foreground-muted))]">
        <BookMarked className="h-3.5 w-3.5" aria-hidden />
        Capítulos
      </p>
      <div className="app-scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => ir(null)}
          aria-pressed={!capituloAtivo}
          className={[
            'app-touch-target shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors',
            !capituloAtivo
              ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
              : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          Linha inteira
        </button>
        {capitulos.map((c) => {
          const ativo = capituloAtivo?.id === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => ir(c.slug)}
              aria-pressed={ativo}
              title={c.descricao ?? undefined}
              className={[
                'app-touch-target max-w-[11rem] shrink-0 truncate rounded-full border px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors',
                ativo
                  ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                  : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {c.titulo}
            </button>
          )
        })}
      </div>
      {capituloAtivo && (
        <p className="mt-2 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {capituloAtivo.descricao ||
            `${capituloAtivo.dias.length} ${capituloAtivo.dias.length === 1 ? 'dia' : 'dias'} neste capítulo.`}
        </p>
      )}
    </div>
  )
}
