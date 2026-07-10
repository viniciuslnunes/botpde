'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ShoppingBag, X, ZoomIn } from 'lucide-react'
import { resolveProdutoImagens, rotuloImagemProduto } from '@/lib/produto-imagem'

interface ProdutoGaleriaProps {
  imagensUrl: string[]
  nome: string
}

export function ProdutoGaleria({ imagensUrl, nome }: ProdutoGaleriaProps) {
  const imagens = resolveProdutoImagens(imagensUrl)
  const [selected, setSelected] = useState(0)
  const [zooming, setZooming] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })
  const [lightbox, setLightbox] = useState(false)
  const [failed, setFailed] = useState<Set<number>>(() => new Set())

  const atual = imagens[selected]
  const total = imagens.length

  const prev = useCallback(() => {
    setSelected((i) => (i <= 0 ? imagens.length - 1 : i - 1))
  }, [imagens.length])

  const next = useCallback(() => {
    setSelected((i) => (i >= imagens.length - 1 ? 0 : i + 1))
  }, [imagens.length])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, prev, next])

  if (!atual || failed.has(selected)) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
        <ShoppingBag className="h-16 w-16 text-[rgb(var(--foreground-muted))]" />
      </div>
    )
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setZoomPos({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    })
  }

  return (
    <>
      <div className="space-y-3">
        <div
          className="group relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl border border-[rgb(var(--foreground-muted)_/_0.25)] bg-[#ececec]"
          onMouseEnter={() => setZooming(true)}
          onMouseLeave={() => setZooming(false)}
          onMouseMove={handleMouseMove}
          onClick={() => setLightbox(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setLightbox(true)
            }
          }}
          aria-label="Ampliar imagem do produto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={atual}
            src={atual}
            alt={nome}
            className={[
              'h-full w-full object-cover object-[center_18%] transition-transform duration-150 ease-out',
              zooming ? 'scale-[2.2]' : 'scale-100',
            ].join(' ')}
            style={{ transformOrigin: `${zoomPos.x}% ${zoomPos.y}%` }}
            referrerPolicy="no-referrer"
            decoding="async"
            onError={() => setFailed((s) => new Set(s).add(selected))}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/50 to-transparent pb-3 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-4 w-4 text-white" />
            <span className="text-xs font-medium text-white">Clique para ampliar</span>
          </div>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prev() }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                aria-label="Imagem anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); next() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                aria-label="Próxima imagem"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {total > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {imagens.map((url, i) => {
              if (failed.has(i)) return null
              const ativo = i === selected
              const rotulo = rotuloImagemProduto(i, total)
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSelected(i)}
                  className="group/thumb flex shrink-0 flex-col items-center gap-1.5"
                  aria-label={rotulo}
                  aria-pressed={ativo}
                >
                  <div
                    className={[
                      'h-20 w-20 overflow-hidden rounded-xl border-2 bg-[#ececec] transition-colors',
                      ativo
                        ? 'border-[rgb(var(--primary))]'
                        : 'border-[rgb(var(--foreground-muted)_/_0.35)] group-hover/thumb:border-[rgb(var(--primary)_/_0.6)]',
                    ].join(' ')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full object-cover object-[center_18%]"
                      referrerPolicy="no-referrer"
                      onError={() => setFailed((s) => new Set(s).add(i))}
                    />
                  </div>
                  <span
                    className={[
                      'text-xs font-medium',
                      ativo ? 'text-[rgb(var(--primary))]' : 'text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {rotulo}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Galeria: ${nome}`}
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(false)}
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); prev() }}
                aria-label="Anterior"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); next() }}
                aria-label="Próxima"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}

          <div className="flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={atual}
              alt={nome}
              className="max-h-[80vh] max-w-full object-contain"
              referrerPolicy="no-referrer"
            />
            {total > 1 && (
              <p className="text-sm text-white/70">
                {rotuloImagemProduto(selected, total)} · {selected + 1}/{total}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
