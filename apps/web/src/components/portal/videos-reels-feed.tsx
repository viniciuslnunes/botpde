'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { Heart, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { Avatar } from './avatar'
import { PostConteudoRich } from './post-conteudo-rich'
import { VideosReelActions } from './videos-reel-actions'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { lightboxBackdrop, springGentle, springSnappy } from '@/lib/motion-presets'
import { resolveVideoPoster, resolveVideoSrc } from '@/lib/videos'
import type { PostSocialItem } from '@/lib/feed'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface VideosReelsFeedProps {
  posts: PostSocialItem[]
  currentUser: CurrentUser
  initialIndex?: number
  onClose?: () => void
  /** Quando true, ocupa a viewport sem chrome da página (modo padrão mobile). */
  immersive?: boolean
}

export function VideosReelsFeed({
  posts,
  currentUser,
  initialIndex = 0,
  onClose,
  immersive = false,
}: VideosReelsFeedProps) {
  const reduceMotion = useReducedMotion()
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, posts.length - 1)),
  )
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [likePulse, setLikePulse] = useState(0)
  const [heartBurst, setHeartBurst] = useState(false)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const lastTapRef = useRef(0)

  const reels = posts.filter((p) => resolveVideoSrc(p) != null)
  const fullscreen = Boolean(onClose) || immersive

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    setActiveIdx(Math.min(Math.max(0, initialIndex), Math.max(0, reels.length - 1)))
  }, [initialIndex, reels.length])

  useEffect(() => {
    setLikePulse(0)
    setHeartBurst(false)
    setPaused(false)
    setProgress(0)
  }, [activeIdx])

  const playActive = useCallback(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === activeIdx && !paused) {
        video.muted = muted
        void video.play().catch(() => {})
      } else {
        video.pause()
        if (idx !== activeIdx) video.currentTime = 0
      }
    })
  }, [activeIdx, muted, paused])

  useEffect(() => {
    playActive()
  }, [playActive])

  useEffect(() => {
    const video = videoRefs.current.get(activeIdx)
    if (!video) return
    function onTime() {
      if (!video || !video.duration) return
      setProgress(video.currentTime / video.duration)
    }
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [activeIdx])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.idx)
            if (!Number.isNaN(idx)) {
              setActiveIdx(idx)
              setPaused(false)
              setProgress(0)
            }
          }
        }
      },
      { root: container, threshold: [0.6] },
    )

    container.querySelectorAll('[data-idx]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [reels.length, mounted])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        scrollToIndex(Math.min(activeIdx + 1, reels.length - 1))
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        scrollToIndex(Math.max(activeIdx - 1, 0))
      }
      if (e.key === 'm') setMuted((v) => !v)
      if (e.key === ' ') {
        e.preventDefault()
        setPaused((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    if (fullscreen) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      if (fullscreen) document.body.style.overflow = ''
    }
  }, [onClose, activeIdx, reels.length, fullscreen])

  function scrollToIndex(idx: number) {
    const el = containerRef.current?.querySelector(`[data-idx="${idx}"]`)
    el?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  function onVideoTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0
      setLikePulse((n) => n + 1)
      setHeartBurst(true)
      window.setTimeout(() => setHeartBurst(false), 700)
      return
    }
    lastTapRef.current = now
    const tapId = now
    window.setTimeout(() => {
      if (lastTapRef.current === tapId) {
        setPaused((v) => !v)
      }
    }, 280)
  }

  if (reels.length === 0) {
    return (
      <MotionEmptyState
        className="py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
        title="Nenhum vídeo para exibir."
      />
    )
  }

  const feed = (
    <div
      ref={containerRef}
      className={[
        'snap-y snap-mandatory overflow-y-auto overscroll-y-contain',
        fullscreen
          ? 'fixed inset-0 z-50 bg-black'
          : 'h-[min(78vh,720px)] rounded-2xl bg-black',
      ].join(' ')}
    >
      {fullscreen && onClose && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/70 to-transparent">
          <span className="pointer-events-auto text-sm font-semibold text-white">Vídeos</span>
          <div className="pointer-events-auto flex items-center gap-1">
            <m.button
              type="button"
              onClick={() => setMuted((v) => !v)}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              className="rounded-full p-2 text-white/90 hover:bg-white/10"
              aria-label={muted ? 'Ativar som' : 'Silenciar'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </m.button>
            <m.button
              type="button"
              onClick={onClose}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              className="rounded-full p-2 text-white/90 hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </m.button>
          </div>
        </div>
      )}

      {reels.map((post, idx) => {
        const src = resolveVideoSrc(post)
        if (!src) return null
        const isActive = idx === activeIdx
        const poster = resolveVideoPoster(post)
        const tenantLabel = post.tenant.nome
        const sedeLabel = post.autor.sedeNome

        return (
          <section
            key={post.id}
            data-idx={idx}
            className="relative flex h-full min-h-full w-full snap-start snap-always items-stretch justify-center"
            style={{ height: fullscreen ? '100dvh' : '100%' }}
          >
            <button
              type="button"
              className="absolute inset-0 z-[1] cursor-pointer"
              aria-label={paused ? 'Reproduzir' : 'Pausar'}
              onClick={onVideoTap}
            />

            <video
              ref={(el) => {
                if (el) videoRefs.current.set(idx, el)
                else videoRefs.current.delete(idx)
              }}
              src={isActive || Math.abs(idx - activeIdx) <= 1 ? src : undefined}
              poster={poster ?? undefined}
              playsInline
              loop
              muted={muted}
              preload={isActive ? 'auto' : 'metadata'}
              className="h-full w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/80 via-transparent to-black/25" />

            {/* Progresso */}
            {isActive && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-0.5 bg-white/20">
                <div
                  className="h-full bg-white transition-[width] duration-150 ease-linear"
                  style={{ width: `${Math.min(100, progress * 100)}%` }}
                />
              </div>
            )}

            {/* Pause indicator */}
            <AnimatePresence>
              {isActive && paused && (
                <m.div
                  key="pause"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={springSnappy}
                  className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                    <Pause className="h-7 w-7 fill-white" />
                  </span>
                </m.div>
              )}
            </AnimatePresence>

            {/* Double-tap heart */}
            <AnimatePresence>
              {isActive && heartBurst && (
                <m.div
                  key="heart-burst"
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1.15 }}
                  exit={{ opacity: 0, scale: 1.4 }}
                  transition={springGentle}
                  className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center"
                >
                  <Heart className="h-24 w-24 fill-white text-white drop-shadow-lg" />
                </m.div>
              )}
            </AnimatePresence>

            {/* Meta + rail */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex items-end gap-3 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16">
              <div className="pointer-events-auto min-w-0 flex-1 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Link
                    href={`/portal/comunidade/perfil/${post.autorId}`}
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Avatar nome={post.autor.nome} avatarUrl={post.autor.avatarUrl} size="sm" />
                  </Link>
                  <div className="min-w-0">
                    <Link
                      href={`/portal/comunidade/perfil/${post.autorId}`}
                      className="block truncate text-sm font-semibold text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {post.autor.nome ?? 'Membro'}
                    </Link>
                    <p className="truncate text-[11px] text-white/70">
                      {[tenantLabel, sedeLabel].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                {post.conteudo.trim() && (
                  <PostConteudoRich
                    conteudo={post.conteudo}
                    className="line-clamp-3 text-sm leading-snug text-white/95"
                  />
                )}
                {post.evento && (
                  <p className="text-[11px] font-medium text-white/75">
                    {post.evento.titulo}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {!fullscreen && (
                    <button
                      type="button"
                      onClick={() => setMuted((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/80"
                    >
                      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      {muted ? 'Som' : 'Mudo'}
                    </button>
                  )}
                  <Link
                    href={linkPostComunidade(post.id)}
                    className="text-[11px] font-medium text-white/55 hover:text-white/90"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Abrir publicação
                  </Link>
                </div>
              </div>

              {isActive && (
                <div className="pointer-events-auto shrink-0 pb-1">
                  <VideosReelActions
                    postId={post.id}
                    totalReacoes={post.totalReacoes}
                    totalComentarios={post.totalComentarios}
                    minhaReacao={post.minhaReacao}
                    currentUser={currentUser}
                    likePulse={likePulse}
                  />
                </div>
              )}
            </div>

            {/* Contador / play hint no canto (só inline) */}
            {!fullscreen && isActive && (
              <div className="pointer-events-none absolute right-3 top-3 z-[5] flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                {paused ? <Play className="h-3 w-3 fill-white" /> : null}
                {idx + 1}/{reels.length}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )

  if (onClose && mounted) {
    return createPortal(
      <AnimatePresence>
        <m.div
          key="reels-fullscreen"
          variants={lightboxBackdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50"
        >
          {feed}
        </m.div>
      </AnimatePresence>,
      document.body,
    )
  }

  return feed
}
