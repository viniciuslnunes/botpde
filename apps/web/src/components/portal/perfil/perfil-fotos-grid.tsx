'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { AnimatePresence, m, type PanInfo } from 'motion/react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { lightboxBackdrop, lightboxContent, springSnappy, storySlideVariants } from '@/lib/motion-presets'
import type { FotoPerfilItem } from '@/lib/perfil-social'

interface PerfilFotosGridProps {
  fotos: FotoPerfilItem[]
}

const SWIPE_THRESHOLD = 72

export function PerfilFotosGrid({ fotos }: PerfilFotosGridProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [slideDir, setSlideDir] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const fechar = useCallback(() => setLightboxIdx(null), [])

  const avancar = useCallback(() => {
    if (lightboxIdx == null) return
    setSlideDir(1)
    if (lightboxIdx < fotos.length - 1) setLightboxIdx((i) => (i ?? 0) + 1)
    else fechar()
  }, [fechar, fotos.length, lightboxIdx])

  const voltar = useCallback(() => {
    if (lightboxIdx == null) return
    setSlideDir(-1)
    if (lightboxIdx > 0) setLightboxIdx((i) => (i ?? 0) - 1)
  }, [lightboxIdx])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_THRESHOLD) avancar()
    else if (info.offset.x > SWIPE_THRESHOLD) voltar()
  }

  useEffect(() => {
    if (lightboxIdx == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar()
      if (e.key === 'ArrowRight') avancar()
      if (e.key === 'ArrowLeft') voltar()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [avancar, fechar, lightboxIdx, voltar])

  if (fotos.length === 0) {
    return (
      <MotionEmptyState
        className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
        title="Nenhuma foto publicada ainda."
      />
    )
  }

  const fotoAtual = lightboxIdx != null ? fotos[lightboxIdx] : null

  const lightbox =
    lightboxIdx != null && fotoAtual && mounted ? (
      <AnimatePresence>
        <m.div
          key="fotos-lightbox"
          variants={lightboxBackdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={fechar}
          role="dialog"
          aria-modal
        >
          <m.button
            type="button"
            onClick={fechar}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/80 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </m.button>

          {lightboxIdx > 0 && (
            <m.button
              type="button"
              aria-label="Anterior"
              onClick={(e) => {
                e.stopPropagation()
                voltar()
              }}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 sm:left-4"
            >
              <ChevronLeft className="h-8 w-8" />
            </m.button>
          )}

          <AnimatePresence mode="wait" custom={slideDir}>
            <m.div
              key={fotoAtual.url}
              custom={slideDir}
              variants={storySlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={onDragEnd}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90dvh] max-w-full cursor-grab active:cursor-grabbing"
            >
              <m.div variants={lightboxContent} initial="hidden" animate="show" exit="exit" transition={springSnappy}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoAtual.url}
                  alt=""
                  className="max-h-[90dvh] max-w-full rounded-lg object-contain"
                  draggable={false}
                />
              </m.div>
            </m.div>
          </AnimatePresence>

          {lightboxIdx < fotos.length - 1 && (
            <m.button
              type="button"
              aria-label="Próximo"
              onClick={(e) => {
                e.stopPropagation()
                avancar()
              }}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 sm:right-4"
            >
              <ChevronRight className="h-8 w-8" />
            </m.button>
          )}

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
            {lightboxIdx + 1} / {fotos.length}
          </p>
        </m.div>
      </AnimatePresence>
    ) : null

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fotos.map((foto, i) => (
          <m.button
            key={`${foto.postId}-${i}`}
            type="button"
            onClick={() => {
              setSlideDir(1)
              setLightboxIdx(i)
            }}
            whileTap={{ scale: 0.97 }}
            transition={springSnappy}
            className="relative aspect-square overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))]"
          >
            {canOptimizeImageUrl(foto.url) ? (
              <Image
                src={foto.url}
                alt=""
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover transition-transform hover:scale-105"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={foto.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform hover:scale-105"
              />
            )}
          </m.button>
        ))}
      </div>
      {lightbox && createPortal(lightbox, document.body)}
    </>
  )
}
