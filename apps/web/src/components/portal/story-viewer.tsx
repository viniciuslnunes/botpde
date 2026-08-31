'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { isVideoUrl } from '@/lib/comunidade-social'
import type { StoryRingItem } from '@/lib/stories'
import { springGentle, springSnappy, storySlideVariants } from '@/lib/motion-presets'

interface StoryViewerProps {
  rings: StoryRingItem[]
  initialRingIndex?: number
  onClose: () => void
}

const STORY_DURATION_MS = 5000

export function StoryViewer({ rings, initialRingIndex = 0, onClose }: StoryViewerProps) {
  const [mounted, setMounted] = useState(false)
  const [ringIdx, setRingIdx] = useState(initialRingIndex)
  const [momentoIdx, setMomentoIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [slideDir, setSlideDir] = useState(1)
  const videoRef = useRef<HTMLVideoElement>(null)

  const ring = rings[ringIdx]
  const momentos = ring?.momentos ?? []
  const momento = momentos[momentoIdx]
  const isVideo = momento ? isVideoUrl(momento.midiaUrl) : false
  const storyKey = `${ringIdx}-${momentoIdx}`

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const avancar = useCallback(() => {
    if (!ring) return
    setSlideDir(1)
    if (momentoIdx < momentos.length - 1) {
      setMomentoIdx((i) => i + 1)
      setProgress(0)
    } else if (ringIdx < rings.length - 1) {
      setRingIdx((i) => i + 1)
      setMomentoIdx(0)
      setProgress(0)
    } else {
      onClose()
    }
  }, [momentoIdx, momentos.length, onClose, ring, ringIdx, rings.length])

  const voltar = useCallback(() => {
    setSlideDir(-1)
    if (momentoIdx > 0) {
      setMomentoIdx((i) => i - 1)
      setProgress(0)
    } else if (ringIdx > 0) {
      const prev = rings[ringIdx - 1]
      setRingIdx((i) => i - 1)
      setMomentoIdx(Math.max(0, (prev?.momentos.length ?? 1) - 1))
      setProgress(0)
    }
  }, [momentoIdx, ringIdx, rings])

  useEffect(() => {
    if (!momento || isVideo) return
    const start = Date.now()
    const tick = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / STORY_DURATION_MS) * 100)
      setProgress(pct)
      if (pct >= 100) avancar()
    }, 50)
    return () => window.clearInterval(tick)
  }, [avancar, isVideo, momento, storyKey])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideo) return
    void video.play().catch(() => {})
    const onEnded = () => avancar()
    video.addEventListener('ended', onEnded)
    return () => video.removeEventListener('ended', onEnded)
  }, [avancar, isVideo, momento?.id, storyKey])

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
  }, [avancar, voltar, onClose])

  if (!ring || !momento || !mounted) return null

  const viewer = (
    <AnimatePresence>
      <m.div
        key="story-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex flex-col bg-black/95"
      >
        <div className="flex items-center gap-1 px-3 pt-3">
          {momentos.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <m.div
                className="h-full bg-white"
                initial={false}
                animate={{
                  width: i < momentoIdx ? '100%' : i === momentoIdx ? `${progress}%` : '0%',
                }}
                transition={
                  i === momentoIdx
                    ? { type: 'tween', duration: 0.08, ease: 'linear' }
                    : springSnappy
                }
              />
            </div>
          ))}
        </div>

        <header className="flex items-center justify-between px-4 py-3">
          <m.div
            layout
            className="flex items-center gap-2"
            transition={springGentle}
          >
            <Avatar nome={ring.nome} avatarUrl={ring.avatarUrl} size="sm" />
            <p className="text-sm font-semibold text-white">{ring.nome ?? 'Membro'}</p>
          </m.div>
          <m.button
            type="button"
            onClick={onClose}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            aria-label="Fechar"
            className="rounded-full p-2 text-white/80 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </m.button>
        </header>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-6">
          <m.button
            type="button"
            aria-label="Anterior"
            onClick={voltar}
            disabled={ringIdx === 0 && momentoIdx === 0}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="h-8 w-8" />
          </m.button>

          <AnimatePresence mode="wait" custom={slideDir}>
            <m.div
              key={storyKey}
              custom={slideDir}
              variants={storySlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex max-h-[75dvh] w-full max-w-sm flex-col items-center gap-4"
            >
              {isVideo ? (
                <video
                  ref={videoRef}
                  src={momento.midiaUrl}
                  playsInline
                  className="max-h-[65dvh] w-full rounded-2xl object-contain"
                />
              ) : (
                <m.img
                  src={momento.midiaUrl}
                  alt=""
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={springGentle}
                  className="max-h-[65dvh] w-full rounded-2xl object-contain"
                />
              )}
              {momento.conteudo && (
                <m.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springGentle, delay: 0.08 }}
                  className="text-center text-sm text-white/90"
                >
                  {momento.conteudo}
                </m.p>
              )}
            </m.div>
          </AnimatePresence>

          <m.button
            type="button"
            aria-label="Próximo"
            onClick={avancar}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10"
          >
            <ChevronRight className="h-8 w-8" />
          </m.button>
        </div>
      </m.div>
    </AnimatePresence>
  )

  return createPortal(viewer, document.body)
}
