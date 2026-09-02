'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react'
import { NoticiasCapaThumb } from './noticias-capa-thumb'
import {
  capaNoticia,
  formatDuracaoVideo,
  hrefNoticiaPraca,
  rotuloCategoriaNoticia,
} from '@/lib/noticias-feed-layout'
import type { NoticiaPracaItem } from '@/lib/praca'

export function NoticiasVideosCurtos({
  itens,
  sufixo,
  podeEnviar = false,
  hrefEnviar,
}: {
  itens: NoticiaPracaItem[]
  sufixo: string
  podeEnviar?: boolean
  hrefEnviar?: string
}) {
  const trilhoRef = useRef<HTMLDivElement>(null)
  if (itens.length === 0 && !podeEnviar) return null

  function rolar(delta: number) {
    trilhoRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <section aria-label="Vídeos curtos" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Vídeos curtos da torcida
        </h2>
        <div className="flex items-center gap-2">
          {podeEnviar && hrefEnviar ? (
            <Link
              href={hrefEnviar}
              className="app-action inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--color-primary)_/_0.45)] sm:hidden"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Enviar
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => rolar(-200)}
            aria-label="Vídeos anteriores"
            className="app-action flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rolar(200)}
            aria-label="Próximos vídeos"
            className="app-action flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={trilhoRef}
        className="app-scrollbar-none -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
      >
        {podeEnviar && hrefEnviar ? (
          <Link
            href={hrefEnviar}
            className="group relative w-[8.5rem] shrink-0 snap-start sm:w-[9.5rem]"
            aria-label="Enviar vídeo curto"
          >
            <div className="flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.5)] transition-colors group-hover:border-[rgb(var(--color-primary)_/_0.55)] group-hover:bg-[rgb(var(--background-subtle))]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--color-primary-fg))] shadow-sm transition-transform group-hover:scale-105">
                <Plus className="h-5 w-5" aria-hidden />
              </span>
              <span className="px-2 text-center text-xs font-semibold leading-snug text-[rgb(var(--foreground-muted))] group-hover:text-[rgb(var(--foreground))]">
                Enviar vídeo curto
              </span>
            </div>
          </Link>
        ) : null}

        {itens.map((item) => {
          const capa = capaNoticia(item)
          const duracao = formatDuracaoVideo(item.duracaoSegundos)
          return (
            <Link
              key={`${item.kind}-${item.id}`}
              href={hrefNoticiaPraca(item.id, sufixo)}
              className="group relative w-[8.5rem] shrink-0 snap-start sm:w-[9.5rem]"
            >
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                <NoticiasCapaThumb
                  url={capa}
                  alt=""
                  fill
                  sizes="150px"
                  className="transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
                <div className="absolute left-2 top-2 flex items-center gap-1">
                  {duracao ? (
                    <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                      {duracao}
                    </span>
                  ) : null}
                </div>
                <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                  <Play className="h-4 w-4 fill-current" aria-hidden />
                </span>
                <p className="absolute inset-x-0 bottom-0 line-clamp-3 p-2.5 text-xs font-semibold leading-snug text-white">
                  {item.titulo}
                </p>
              </div>
              <p className="mt-1 truncate text-[10px] lowercase text-[rgb(var(--foreground-muted))]">
                {rotuloCategoriaNoticia(item)}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
