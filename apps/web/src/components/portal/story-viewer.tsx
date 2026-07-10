'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { isVideoUrl } from '@/lib/comunidade-social'
import type { StoryRingItem } from '@/lib/stories'

interface StoryViewerProps {
  rings: StoryRingItem[]
  initialRingIndex?: number
  onClose: () => void
}

const STORY_DURATION_MS = 5000

export function StoryViewer({ rings, initialRingIndex = 0, onClose }: StoryViewerProps) {
  const [ringIdx, setRingIdx] = useState(initialRingIndex)
  const [momentoIdx, setMomentoIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const ring = rings[ringIdx]
  const momentos = ring?.momentos ?? []
  const momento = momentos[momentoIdx]
  const isVideo = momento ? isVideoUrl(momento.midiaUrl) : false

  const avancar = useCallback(() => {
    if (!ring) return
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
  }, [avancar, isVideo, momento])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isVideo) return
    void video.play().catch(() => {})
    const onEnded = () => avancar()
    video.addEventListener('ended', onEnded)
    return () => video.removeEventListener('ended', onEnded)
  }, [avancar, isVideo, momento?.id])

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

  if (!ring || !momento) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center gap-1 px-3 pt-3">
        {momentos.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full bg-white transition-all duration-100"
              style={{
                width: i < momentoIdx ? '100%' : i === momentoIdx ? `${progress}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Avatar nome={ring.nome} avatarUrl={ring.avatarUrl} size="sm" />
          <p className="text-sm font-semibold text-white">{ring.nome ?? 'Membro'}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-full p-2 text-white/80 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
        <button
          type="button"
          aria-label="Anterior"
          onClick={voltar}
          disabled={ringIdx === 0 && momentoIdx === 0}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        <div className="flex max-h-[75vh] w-full max-w-sm flex-col items-center gap-4">
          {isVideo ? (
            <video
              ref={videoRef}
              src={momento.midiaUrl}
              playsInline
              className="max-h-[65vh] w-full rounded-2xl object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={momento.midiaUrl}
              alt=""
              className="max-h-[65vh] w-full rounded-2xl object-contain"
            />
          )}
          {momento.conteudo && (
            <p className="text-center text-sm text-white/90">{momento.conteudo}</p>
          )}
        </div>

        <button
          type="button"
          aria-label="Próximo"
          onClick={avancar}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>
    </div>
  )
}
