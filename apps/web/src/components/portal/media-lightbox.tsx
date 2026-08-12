'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m, type PanInfo } from 'motion/react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { lightboxBackdrop, lightboxContent, springSnappy, storySlideVariants } from '@/lib/motion-presets'
import { PostConteudoRich } from '@/components/portal/post-conteudo-rich'

const SWIPE_THRESHOLD = 72

interface MediaLightboxProps {
  urls: string[]
  index: number
  caption?: string | null
  onClose: () => void
  onIndexChange: (index: number) => void
}

export function MediaLightbox({ urls, index, caption, onClose, onIndexChange }: MediaLightboxProps) {
  const [mounted, setMounted] = useState(false)
  const [slideDir, setSlideDir] = useState(1)
  const [captionVisible, setCaptionVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const avancar = useCallback(() => {
    if (index >= urls.length - 1) return
    setSlideDir(1)
    onIndexChange(index + 1)
  }, [index, onIndexChange, urls.length])

  const voltar = useCallback(() => {
    if (index <= 0) return
    setSlideDir(-1)
    onIndexChange(index - 1)
  }, [index, onIndexChange])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_THRESHOLD) avancar()
    else if (info.offset.x > SWIPE_THRESHOLD) voltar()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') avancar()
      if (e.key === 'ArrowLeft') voltar()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [avancar, onClose, voltar])

  // Trocar de mídia reabre a legenda — no render, senão ela fica um frame
  // escondida sobre a imagem nova.
  const [indexSincronizado, setIndexSincronizado] = useState(index)
  if (index !== indexSincronizado) {
    setIndexSincronizado(index)
    setCaptionVisible(true)
  }

  if (!mounted || urls.length === 0) return null

  const url = urls[index]
  const trimmedCaption = caption?.trim() ?? ''
  const showCaption = trimmedCaption.length > 0

  return createPortal(
    <AnimatePresence>
      <m.div
        key="media-lightbox"
        variants={lightboxBackdrop}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal
        aria-label="Visualizador de imagem"
      >
        <m.button
          type="button"
          onClick={onClose}
          whileTap={{ scale: 0.9 }}
          transition={springSnappy}
          aria-label="Fechar"
          className="absolute right-4 top-4 z-20 rounded-full p-2 text-white/80 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </m.button>

        {index > 0 && (
          <m.button
            type="button"
            aria-label="Anterior"
            onClick={(e) => {
              e.stopPropagation()
              voltar()
            }}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 sm:left-4"
          >
            <ChevronLeft className="h-8 w-8" />
          </m.button>
        )}

        <AnimatePresence mode="wait" custom={slideDir}>
          <m.div
            key={url}
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
            onMouseEnter={() => setCaptionVisible(false)}
            onMouseLeave={() => setCaptionVisible(true)}
            className="relative max-h-[90vh] max-w-full cursor-grab active:cursor-grabbing"
          >
            <m.div variants={lightboxContent} initial="hidden" animate="show" exit="exit" transition={springSnappy}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="max-h-[90vh] max-w-full rounded-lg object-contain select-none"
                draggable={false}
              />
            </m.div>

            {showCaption && (
              <div
                className={[
                  'pointer-events-none absolute bottom-3 left-3 right-3 max-w-md rounded-xl bg-black/65 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-opacity duration-200 sm:right-auto',
                  captionVisible ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
                aria-hidden={!captionVisible}
              >
                <PostConteudoRich
                  conteudo={trimmedCaption}
                  className="line-clamp-6 text-white [&_a]:text-white [&_a]:underline"
                />
              </div>
            )}
          </m.div>
        </AnimatePresence>

        {index < urls.length - 1 && (
          <m.button
            type="button"
            aria-label="Próximo"
            onClick={(e) => {
              e.stopPropagation()
              avancar()
            }}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 sm:right-4"
          >
            <ChevronRight className="h-8 w-8" />
          </m.button>
        )}

        {urls.length > 1 && (
          <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 text-xs text-white/50">
            {index + 1} / {urls.length}
          </p>
        )}
      </m.div>
    </AnimatePresence>,
    document.body,
  )
}
